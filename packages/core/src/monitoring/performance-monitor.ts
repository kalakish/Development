import { EventEmitter } from 'events';
import { MetricsCollector } from './metrics-collector';
import { HealthChecker } from './health-check';

export interface PerformanceSample {
    timestamp: Date;
    cpu: {
        user: number;
        system: number;
        percent: number;
    };
    memory: {
        heapUsed: number;
        heapTotal: number;
        rss: number;
        external: number;
        percent: number;
    };
    eventLoop: {
        lag: number;
    };
    gc?: {
        type: string;
        duration: number;
        timestamp: Date;
    };
}

export interface PerformanceThreshold {
    metric: string;
    warning: number;
    critical: number;
    duration?: number;
    action?: string;
}

export interface PerformanceAlert {
    id: string;
    metric: string;
    value: number;
    threshold: number;
    level: 'warning' | 'critical';
    timestamp: Date;
    message: string;
}

export class PerformanceMonitor extends EventEmitter {
    private metricsCollector: MetricsCollector;
    private healthChecker: HealthChecker;
    private thresholds: Map<string, PerformanceThreshold> = new Map();
    private alerts: PerformanceAlert[] = [];
    private samples: PerformanceSample[] = [];
    private maxSamples: number = 1000;
    private monitoring: boolean = false;
    private interval: NodeJS.Timeout | null = null;

    constructor(
        metricsCollector: MetricsCollector,
        healthChecker: HealthChecker
    ) {
        super();
        this.metricsCollector = metricsCollector;
        this.healthChecker = healthChecker;
        this.registerDefaultThresholds();
    }

    private registerDefaultThresholds(): void {
        this.registerThreshold({
            metric: 'system.cpu.percent',
            warning: 70,
            critical: 90,
            duration: 300000 // 5 minutes
        });

        this.registerThreshold({
            metric: 'system.memory.percent',
            warning: 80,
            critical: 95,
            duration: 300000
        });

        this.registerThreshold({
            metric: 'eventloop.lag',
            warning: 50,
            critical: 100,
            duration: 60000
        });

        this.registerThreshold({
            metric: 'database.connection.latency',
            warning: 100,
            critical: 500,
            duration: 60000
        });
    }

    // ============ Monitoring Control ============

    startMonitoring(interval: number = 10000): void {
        if (this.monitoring) return;

        this.monitoring = true;
        this.interval = setInterval(async () => {
            await this.collectPerformanceSample();
            await this.checkThresholds();
        }, interval);

        this.emit('monitoringStarted', { interval });
    }

    stopMonitoring(): void {
        if (this.interval) {
            clearInterval(this.interval);
            this.interval = null;
        }

        this.monitoring = false;
        this.emit('monitoringStopped');
    }

    // ============ Performance Sampling ============

    async collectPerformanceSample(): Promise<PerformanceSample> {
        const timestamp = new Date();

        // CPU usage
        const cpuUsage = process.cpuUsage();
        const cpuPercent = await this.getCPUPercent();

        // Memory usage
        const memory = process.memoryUsage();
        const memoryPercent = (memory.heapUsed / memory.heapTotal) * 100;

        // Event loop lag
        const eventLoopLag = await this.getEventLoopLag();

        const sample: PerformanceSample = {
            timestamp,
            cpu: {
                user: cpuUsage.user,
                system: cpuUsage.system,
                percent: cpuPercent
            },
            memory: {
                heapUsed: memory.heapUsed,
                heapTotal: memory.heapTotal,
                rss: memory.rss,
                external: memory.external || 0,
                percent: memoryPercent
            },
            eventLoop: {
                lag: eventLoopLag
            }
        };

        this.samples.push(sample);

        // Enforce sample limit
        if (this.samples.length > this.maxSamples) {
            this.samples = this.samples.slice(-this.maxSamples);
        }

        this.emit('sampleCollected', sample);

        return sample;
    }

    private async getCPUPercent(): Promise<number> {
        return new Promise((resolve) => {
            const startUsage = process.cpuUsage();
            const startTime = Date.now();

            setTimeout(() => {
                const endUsage = process.cpuUsage(startUsage);
                const elapsedTime = Date.now() - startTime;
                
                const userPercent = (endUsage.user / 1000) / elapsedTime * 100;
                const systemPercent = (endUsage.system / 1000) / elapsedTime * 100;
                
                resolve(userPercent + systemPercent);
            }, 100);
        });
    }

    private async getEventLoopLag(): Promise<number> {
        return new Promise((resolve) => {
            const start = Date.now();
            setImmediate(() => {
                resolve(Date.now() - start);
            });
        });
    }

    // ============ Threshold Management ============

    registerThreshold(threshold: PerformanceThreshold): void {
        this.thresholds.set(threshold.metric, threshold);
        this.emit('thresholdRegistered', threshold);
    }

    unregisterThreshold(metric: string): void {
        this.thresholds.delete(metric);
        this.emit('thresholdUnregistered', { metric });
    }

    getThreshold(metric: string): PerformanceThreshold | undefined {
        return this.thresholds.get(metric);
    }

    getThresholds(): PerformanceThreshold[] {
        return Array.from(this.thresholds.values());
    }

    // ============ Alert Checking ============

    private async checkThresholds(): Promise<void> {
        for (const [metric, threshold] of this.thresholds) {
            const value = await this.getMetricValue(metric);
            
            if (value === null) continue;

            if (value >= threshold.critical) {
                await this.createAlert(metric, value, threshold, 'critical');
            } else if (value >= threshold.warning) {
                await this.createAlert(metric, value, threshold, 'warning');
            }
        }
    }

    private async getMetricValue(metric: string): Promise<number | null> {
        // Check recent samples
        const recentSamples = this.samples.slice(-10);
        
        if (recentSamples.length === 0) {
            return null;
        }

        // Parse metric path
        const parts = metric.split('.');
        let sum = 0;
        let count = 0;

        for (const sample of recentSamples) {
            let value: any = sample;
            
            for (const part of parts) {
                value = value?.[part];
                if (value === undefined) break;
            }

            if (typeof value === 'number') {
                sum += value;
                count++;
            }
        }

        return count > 0 ? sum / count : null;
    }

    private async createAlert(
        metric: string,
        value: number,
        threshold: PerformanceThreshold,
        level: 'warning' | 'critical'
    ): Promise<void> {
        // Check if similar alert already exists
        const existingAlert = this.alerts.find(a => 
            a.metric === metric && 
            a.level === level &&
            a.timestamp > new Date(Date.now() - 300000) // Last 5 minutes
        );

        if (existingAlert) {
            return;
        }

        const alert: PerformanceAlert = {
            id: `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            metric,
            value,
            threshold: level === 'critical' ? threshold.critical : threshold.warning,
            level,
            timestamp: new Date(),
            message: `${metric} exceeded ${level} threshold: ${value.toFixed(2)} (threshold: ${
                level === 'critical' ? threshold.critical : threshold.warning
            })`
        };

        this.alerts.push(alert);

        // Limit alert history
        if (this.alerts.length > 100) {
            this.alerts = this.alerts.slice(-100);
        }

        this.emit('alert', alert);

        // Execute alert action if defined
        if (threshold.action) {
            try {
                await this.executeAlertAction(alert, threshold.action);
            } catch (error) {
                this.emit('alertActionError', { alert, error });
            }
        }
    }

    private async executeAlertAction(alert: PerformanceAlert, action: string): Promise<void> {
        // Parse and execute alert action
        // This could trigger scaling, notifications, etc.
        this.emit('alertActionExecuted', { alert, action });
    }

    // ============ Performance Analysis ============

    analyzePerformance(duration: number = 3600000): PerformanceAnalysis {
        const cutoff = Date.now() - duration;
        const relevantSamples = this.samples.filter(s => 
            s.timestamp.getTime() > cutoff
        );

        if (relevantSamples.length === 0) {
            return {
                summary: {
                    averageCpu: 0,
                    peakCpu: 0,
                    averageMemory: 0,
                    peakMemory: 0,
                    averageEventLoop: 0,
                    peakEventLoop: 0
                },
                trends: {},
                recommendations: []
            };
        }

        // Calculate averages
        const avgCpu = relevantSamples.reduce((sum, s) => sum + s.cpu.percent, 0) / relevantSamples.length;
        const avgMemory = relevantSamples.reduce((sum, s) => sum + s.memory.percent, 0) / relevantSamples.length;
        const avgEventLoop = relevantSamples.reduce((sum, s) => sum + s.eventLoop.lag, 0) / relevantSamples.length;

        // Find peaks
        const peakCpu = Math.max(...relevantSamples.map(s => s.cpu.percent));
        const peakMemory = Math.max(...relevantSamples.map(s => s.memory.percent));
        const peakEventLoop = Math.max(...relevantSamples.map(s => s.eventLoop.lag));

        // Generate recommendations
        const recommendations: string[] = [];

        if (peakCpu > 90) {
            recommendations.push('CPU usage consistently high - consider scaling up or optimizing code');
        }

        if (peakMemory > 90) {
            recommendations.push('Memory usage critical - check for memory leaks or increase heap size');
        }

        if (peakEventLoop > 100) {
            recommendations.push('Event loop lag detected - optimize synchronous operations');
        }

        const alertsByLevel = this.alerts.filter(a => 
            a.timestamp.getTime() > cutoff
        ).reduce((acc, a) => {
            acc[a.level] = (acc[a.level] || 0) + 1;
            return acc;
        }, {} as Record<string, number>);

        return {
            summary: {
                averageCpu: avgCpu,
                peakCpu,
                averageMemory: avgMemory,
                peakMemory,
                averageEventLoop: avgEventLoop,
                peakEventLoop
            },
            trends: {
                cpu: this.calculateTrend(relevantSamples.map(s => s.cpu.percent)),
                memory: this.calculateTrend(relevantSamples.map(s => s.memory.percent)),
                eventLoop: this.calculateTrend(relevantSamples.map(s => s.eventLoop.lag))
            },
            recommendations,
            alerts: alertsByLevel
        };
    }

    private calculateTrend(values: number[]): 'increasing' | 'decreasing' | 'stable' {
        if (values.length < 2) return 'stable';

        const firstHalf = values.slice(0, Math.floor(values.length / 2));
        const secondHalf = values.slice(Math.floor(values.length / 2));

        const firstAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
        const secondAvg = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;

        const change = ((secondAvg - firstAvg) / firstAvg) * 100;

        if (change > 10) return 'increasing';
        if (change < -10) return 'decreasing';
        return 'stable';
    }

    // ============ Report Generation ============

    async generatePerformanceReport(duration: number = 3600000): Promise<string> {
        const analysis = this.analyzePerformance(duration);
        const recentAlerts = this.alerts.slice(-10);

        let report = `# Performance Analysis Report\n\n`;
        report += `**Period:** Last ${duration / 60000} minutes\n`;
        report += `**Generated:** ${new Date().toISOString()}\n\n`;

        report += `## Summary\n\n`;
        report += `- **Average CPU:** ${analysis.summary.averageCpu.toFixed(2)}%\n`;
        report += `- **Peak CPU:** ${analysis.summary.peakCpu.toFixed(2)}%\n`;
        report += `- **Average Memory:** ${analysis.summary.averageMemory.toFixed(2)}%\n`;
        report += `- **Peak Memory:** ${analysis.summary.peakMemory.toFixed(2)}%\n`;
        report += `- **Average Event Loop:** ${analysis.summary.averageEventLoop.toFixed(2)}ms\n`;
        report += `- **Peak Event Loop:** ${analysis.summary.peakEventLoop.toFixed(2)}ms\n\n`;

        report += `## Trends\n\n`;
        report += `- **CPU Trend:** ${analysis.trends.cpu}\n`;
        report += `- **Memory Trend:** ${analysis.trends.memory}\n`;
        report += `- **Event Loop Trend:** ${analysis.trends.eventLoop}\n\n`;

        if (analysis.alerts && Object.keys(analysis.alerts).length > 0) {
            report += `## Alerts\n\n`;
            report += `- **Critical:** ${analysis.alerts.critical || 0}\n`;
            report += `- **Warning:** ${analysis.alerts.warning || 0}\n\n`;
        }

        if (analysis.recommendations.length > 0) {
            report += `## Recommendations\n\n`;
            analysis.recommendations.forEach((rec, i) => {
                report += `${i + 1}. ${rec}\n`;
            });
            report += '\n';
        }

        if (recentAlerts.length > 0) {
            report += `## Recent Alerts\n\n`;
            recentAlerts.forEach(alert => {
                report += `- **[${alert.level.toUpperCase()}]** ${alert.message}\n`;
                report += `  ${alert.timestamp.toLocaleString()}\n\n`;
            });
        }

        return report;
    }

    // ============ Getters ============

    getSamples(limit?: number): PerformanceSample[] {
        if (limit) {
            return this.samples.slice(-limit);
        }
        return [...this.samples];
    }

    getAlerts(limit?: number): PerformanceAlert[] {
        if (limit) {
            return this.alerts.slice(-limit);
        }
        return [...this.alerts];
    }

    isMonitoring(): boolean {
        return this.monitoring;
    }

    // ============ Cleanup ============

    async cleanup(): Promise<void> {
        this.stopMonitoring();
        this.samples = [];
        this.alerts = [];
        this.thresholds.clear();
        this.emit('cleaned');
    }
}

export interface PerformanceAnalysis {
    summary: {
        averageCpu: number;
        peakCpu: number;
        averageMemory: number;
        peakMemory: number;
        averageEventLoop: number;
        peakEventLoop: number;
    };
    trends: {
        cpu: 'increasing' | 'decreasing' | 'stable';
        memory: 'increasing' | 'decreasing' | 'stable';
        eventLoop: 'increasing' | 'decreasing' | 'stable';
    };
    recommendations: string[];
    alerts?: Record<string, number>;
}