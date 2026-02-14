import { ConnectionPool } from 'mssql';
import { SQLServerPoolManager } from './sqlserver-pool';
import { SQLServerMetrics } from './sqlserver-metrics';

export interface HealthCheckResult {
    status: 'healthy' | 'unhealthy' | 'degraded';
    timestamp: Date;
    duration: number;
    checks: HealthCheck[];
    metrics?: Partial<SQLServerMetrics>;
    error?: string;
}

export interface HealthCheck {
    name: string;
    status: 'passed' | 'failed' | 'warning';
    message?: string;
    duration: number;
    metadata?: Record<string, any>;
}

export interface HealthThresholds {
    maxQueryTime?: number;
    maxConnectionWait?: number;
    maxDeadlockRate?: number;
    maxErrorRate?: number;
    minAvailableConnections?: number;
    maxCpuUsage?: number;
    maxMemoryUsage?: number;
    maxDiskUsage?: number;
}

export class SQLServerHealth {
    private poolManager: SQLServerPoolManager;
    private thresholds: Required<HealthThresholds>;

    constructor(poolManager: SQLServerPoolManager, thresholds?: HealthThresholds) {
        this.poolManager = poolManager;
        this.thresholds = {
            maxQueryTime: thresholds?.maxQueryTime || 1000,
            maxConnectionWait: thresholds?.maxConnectionWait || 100,
            maxDeadlockRate: thresholds?.maxDeadlockRate || 0.01,
            maxErrorRate: thresholds?.maxErrorRate || 0.05,
            minAvailableConnections: thresholds?.minAvailableConnections || 1,
            maxCpuUsage: thresholds?.maxCpuUsage || 80,
            maxMemoryUsage: thresholds?.maxMemoryUsage || 80,
            maxDiskUsage: thresholds?.maxDiskUsage || 90
        };
    }

    // ============ Comprehensive Health Check ============

    async healthCheck(poolName?: string): Promise<HealthCheckResult> {
        const startTime = Date.now();
        const checks: HealthCheck[] = [];

        try {
            if (poolName) {
                // Check specific pool
                await this.checkPool(poolName, checks);
            } else {
                // Check all pools
                const poolNames = this.poolManager.getPoolNames();
                for (const name of poolNames) {
                    await this.checkPool(name, checks);
                }
            }

            // Check system health
            await this.checkSystemHealth(checks);

            // Determine overall status
            const status = this.determineOverallStatus(checks);
            
            return {
                status,
                timestamp: new Date(),
                duration: Date.now() - startTime,
                checks
            };

        } catch (error) {
            return {
                status: 'unhealthy',
                timestamp: new Date(),
                duration: Date.now() - startTime,
                checks,
                error: error.message
            };
        }
    }

    private async checkPool(name: string, checks: HealthCheck[]): Promise<void> {
        const startTime = Date.now();

        try {
            // Check if pool exists
            if (!this.poolManager.poolExists(name)) {
                checks.push({
                    name: `pool.${name}.exists`,
                    status: 'failed',
                    message: `Pool ${name} does not exist`,
                    duration: Date.now() - startTime
                });
                return;
            }

            // Get pool stats
            const stats = await this.poolManager.getPoolStats(name);
            const metrics = this.poolManager.getPoolMetrics(name);

            // Check connectivity
            await this.checkConnectivity(name, checks);

            // Check pool size
            if (stats.idle < this.thresholds.minAvailableConnections) {
                checks.push({
                    name: `pool.${name}.connections`,
                    status: 'warning',
                    message: `Low available connections: ${stats.idle} < ${this.thresholds.minAvailableConnections}`,
                    duration: Date.now() - startTime,
                    metadata: { idle: stats.idle, threshold: this.thresholds.minAvailableConnections }
                });
            } else {
                checks.push({
                    name: `pool.${name}.connections`,
                    status: 'passed',
                    duration: Date.now() - startTime,
                    metadata: { idle: stats.idle, total: stats.total }
                });
            }

            // Check query performance
            if (metrics.averageQueryTime > this.thresholds.maxQueryTime) {
                checks.push({
                    name: `pool.${name}.queryTime`,
                    status: 'warning',
                    message: `High average query time: ${metrics.averageQueryTime.toFixed(2)}ms > ${this.thresholds.maxQueryTime}ms`,
                    duration: Date.now() - startTime,
                    metadata: { averageQueryTime: metrics.averageQueryTime, threshold: this.thresholds.maxQueryTime }
                });
            }

            // Check deadlock rate
            const totalQueries = metrics.totalQueries || 1;
            const deadlockRate = metrics.deadlocks / totalQueries;
            if (deadlockRate > this.thresholds.maxDeadlockRate) {
                checks.push({
                    name: `pool.${name}.deadlocks`,
                    status: 'warning',
                    message: `High deadlock rate: ${(deadlockRate * 100).toFixed(2)}%`,
                    duration: Date.now() - startTime,
                    metadata: { deadlocks: metrics.deadlocks, rate: deadlockRate, threshold: this.thresholds.maxDeadlockRate }
                });
            }

            // Check error rate
            const errorRate = metrics.connectionErrors / totalQueries;
            if (errorRate > this.thresholds.maxErrorRate) {
                checks.push({
                    name: `pool.${name}.errors`,
                    status: 'warning',
                    message: `High error rate: ${(errorRate * 100).toFixed(2)}%`,
                    duration: Date.now() - startTime,
                    metadata: { errors: metrics.connectionErrors, rate: errorRate, threshold: this.thresholds.maxErrorRate }
                });
            }

            // Check connection wait time
            if (metrics.averageAcquireTime > this.thresholds.maxConnectionWait) {
                checks.push({
                    name: `pool.${name}.connectionWait`,
                    status: 'warning',
                    message: `High connection wait time: ${metrics.averageAcquireTime.toFixed(2)}ms > ${this.thresholds.maxConnectionWait}ms`,
                    duration: Date.now() - startTime,
                    metadata: { averageAcquireTime: metrics.averageAcquireTime, threshold: this.thresholds.maxConnectionWait }
                });
            }

        } catch (error) {
            checks.push({
                name: `pool.${name}.check`,
                status: 'failed',
                message: error.message,
                duration: Date.now() - startTime
            });
        }
    }

    private async checkConnectivity(name: string, checks: HealthCheck[]): Promise<void> {
        const startTime = Date.now();

        try {
            await this.poolManager.executeOnPool(name, async (pool) => {
                const request = pool.request();
                await request.query('SELECT 1');
            });

            checks.push({
                name: `pool.${name}.connectivity`,
                status: 'passed',
                duration: Date.now() - startTime
            });
        } catch (error) {
            checks.push({
                name: `pool.${name}.connectivity`,
                status: 'failed',
                message: error.message,
                duration: Date.now() - startTime
            });
        }
    }

    private async checkSystemHealth(checks: HealthCheck[]): Promise<void> {
        const startTime = Date.now();

        try {
            // Get system metrics
            const metrics = await this.getSystemMetrics();

            // Check CPU usage
            if (metrics.cpuUsage > this.thresholds.maxCpuUsage) {
                checks.push({
                    name: 'system.cpu',
                    status: 'warning',
                    message: `High CPU usage: ${metrics.cpuUsage}% > ${this.thresholds.maxCpuUsage}%`,
                    duration: Date.now() - startTime,
                    metadata: { cpuUsage: metrics.cpuUsage, threshold: this.thresholds.maxCpuUsage }
                });
            } else {
                checks.push({
                    name: 'system.cpu',
                    status: 'passed',
                    duration: Date.now() - startTime,
                    metadata: { cpuUsage: metrics.cpuUsage }
                });
            }

            // Check memory usage
            if (metrics.memoryUsage > this.thresholds.maxMemoryUsage) {
                checks.push({
                    name: 'system.memory',
                    status: 'warning',
                    message: `High memory usage: ${metrics.memoryUsage}% > ${this.thresholds.maxMemoryUsage}%`,
                    duration: Date.now() - startTime,
                    metadata: { memoryUsage: metrics.memoryUsage, threshold: this.thresholds.maxMemoryUsage }
                });
            }

            // Check disk space
            if (metrics.diskUsage > this.thresholds.maxDiskUsage) {
                checks.push({
                    name: 'system.disk',
                    status: 'warning',
                    message: `Low disk space: ${metrics.diskUsage}% used > ${this.thresholds.maxDiskUsage}%`,
                    duration: Date.now() - startTime,
                    metadata: { diskUsage: metrics.diskUsage, threshold: this.thresholds.maxDiskUsage }
                });
            }

        } catch (error) {
            checks.push({
                name: 'system.health',
                status: 'failed',
                message: error.message,
                duration: Date.now() - startTime
            });
        }
    }

    private async getSystemMetrics(): Promise<SystemMetrics> {
        // In a real implementation, this would query SQL Server for system metrics
        // For now, return mock data
        return {
            cpuUsage: 45,
            memoryUsage: 60,
            diskUsage: 55,
            uptime: 3600,
            connections: 10,
            databaseSize: 1024 * 1024 * 1024
        };
    }

    private determineOverallStatus(checks: HealthCheck[]): 'healthy' | 'unhealthy' | 'degraded' {
        let hasFailed = false;
        let hasWarning = false;

        for (const check of checks) {
            if (check.status === 'failed') {
                hasFailed = true;
            } else if (check.status === 'warning') {
                hasWarning = true;
            }
        }

        if (hasFailed) {
            return 'unhealthy';
        } else if (hasWarning) {
            return 'degraded';
        } else {
            return 'healthy';
        }
    }

    // ============ Specific Health Checks ============

    async checkConnectivity(poolName: string): Promise<HealthCheck> {
        const startTime = Date.now();

        try {
            await this.poolManager.executeOnPool(poolName, async (pool) => {
                const request = pool.request();
                await request.query('SELECT 1');
            });

            return {
                name: 'connectivity',
                status: 'passed',
                duration: Date.now() - startTime
            };
        } catch (error) {
            return {
                name: 'connectivity',
                status: 'failed',
                message: error.message,
                duration: Date.now() - startTime
            };
        }
    }

    async checkLatency(poolName: string): Promise<HealthCheck> {
        const startTime = Date.now();

        try {
            await this.poolManager.executeOnPool(poolName, async (pool) => {
                const request = pool.request();
                await request.query('SELECT 1');
            });

            const latency = Date.now() - startTime;
            const status = latency < 100 ? 'passed' : latency < 500 ? 'warning' : 'failed';

            return {
                name: 'latency',
                status,
                message: `Response time: ${latency}ms`,
                duration: latency,
                metadata: { latency }
            };
        } catch (error) {
            return {
                name: 'latency',
                status: 'failed',
                message: error.message,
                duration: Date.now() - startTime
            };
        }
    }

    async checkPoolHealth(poolName: string): Promise<HealthCheck> {
        const startTime = Date.now();

        try {
            const stats = await this.poolManager.getPoolStats(poolName);
            const metrics = this.poolManager.getPoolMetrics(poolName);

            let status: 'passed' | 'warning' | 'failed' = 'passed';
            const issues: string[] = [];

            if (stats.idle < this.thresholds.minAvailableConnections) {
                status = 'warning';
                issues.push(`Low available connections: ${stats.idle}`);
            }

            if (metrics.averageQueryTime > this.thresholds.maxQueryTime) {
                status = 'warning';
                issues.push(`High query time: ${metrics.averageQueryTime.toFixed(2)}ms`);
            }

            const errorRate = metrics.connectionErrors / (metrics.totalQueries || 1);
            if (errorRate > this.thresholds.maxErrorRate) {
                status = 'warning';
                issues.push(`High error rate: ${(errorRate * 100).toFixed(2)}%`);
            }

            return {
                name: 'pool.health',
                status,
                message: issues.join(', ') || 'Pool is healthy',
                duration: Date.now() - startTime,
                metadata: { stats, metrics: metrics.toJSON() }
            };
        } catch (error) {
            return {
                name: 'pool.health',
                status: 'failed',
                message: error.message,
                duration: Date.now() - startTime
            };
        }
    }

    // ============ Health Report ============

    async generateHealthReport(poolName?: string): Promise<string> {
        const result = await this.healthCheck(poolName);
        
        let report = `# SQL Server Health Report\n\n`;
        report += `**Generated:** ${result.timestamp.toISOString()}\n`;
        report += `**Status:** ${result.status.toUpperCase()}\n`;
        report += `**Duration:** ${result.duration}ms\n\n`;

        report += `## Health Checks\n\n`;
        
        const groupedChecks = this.groupChecksByStatus(result.checks);
        
        if (groupedChecks.failed.length > 0) {
            report += `### ❌ Failed Checks (${groupedChecks.failed.length})\n\n`;
            groupedChecks.failed.forEach(check => {
                report += `- **${check.name}**: ${check.message || 'No message'}\n`;
            });
            report += '\n';
        }

        if (groupedChecks.warning.length > 0) {
            report += `### ⚠️ Warning Checks (${groupedChecks.warning.length})\n\n`;
            groupedChecks.warning.forEach(check => {
                report += `- **${check.name}**: ${check.message || 'No message'}\n`;
            });
            report += '\n';
        }

        if (groupedChecks.passed.length > 0) {
            report += `### ✅ Passed Checks (${groupedChecks.passed.length})\n\n`;
            groupedChecks.passed.forEach(check => {
                report += `- **${check.name}**: ${check.duration}ms\n`;
            });
            report += '\n';
        }

        if (result.error) {
            report += `## Error\n\n`;
            report += `${result.error}\n\n`;
        }

        if (result.metrics) {
            report += `## Metrics\n\n`;
            report += '```json\n';
            report += JSON.stringify(result.metrics, null, 2);
            report += '\n```\n';
        }

        return report;
    }

    private groupChecksByStatus(checks: HealthCheck[]): Record<string, HealthCheck[]> {
        const grouped: Record<string, HealthCheck[]> = {
            passed: [],
            warning: [],
            failed: []
        };

        checks.forEach(check => {
            grouped[check.status].push(check);
        });

        return grouped;
    }

    // ============ Threshold Management ============

    updateThresholds(thresholds: Partial<HealthThresholds>): void {
        Object.assign(this.thresholds, thresholds);
    }

    getThresholds(): HealthThresholds {
        return { ...this.thresholds };
    }

    resetThresholds(): void {
        this.thresholds = {
            maxQueryTime: 1000,
            maxConnectionWait: 100,
            maxDeadlockRate: 0.01,
            maxErrorRate: 0.05,
            minAvailableConnections: 1,
            maxCpuUsage: 80,
            maxMemoryUsage: 80,
            maxDiskUsage: 90
        };
    }
}

export interface SystemMetrics {
    cpuUsage: number;
    memoryUsage: number;
    diskUsage: number;
    uptime: number;
    connections: number;
    databaseSize: number;
}