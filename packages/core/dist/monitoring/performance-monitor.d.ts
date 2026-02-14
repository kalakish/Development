/// <reference types="node" />
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
export declare class PerformanceMonitor extends EventEmitter {
    private metricsCollector;
    private healthChecker;
    private thresholds;
    private alerts;
    private samples;
    private maxSamples;
    private monitoring;
    private interval;
    constructor(metricsCollector: MetricsCollector, healthChecker: HealthChecker);
    private registerDefaultThresholds;
    startMonitoring(interval?: number): void;
    stopMonitoring(): void;
    collectPerformanceSample(): Promise<PerformanceSample>;
    private getCPUPercent;
    private getEventLoopLag;
    registerThreshold(threshold: PerformanceThreshold): void;
    unregisterThreshold(metric: string): void;
    getThreshold(metric: string): PerformanceThreshold | undefined;
    getThresholds(): PerformanceThreshold[];
    private checkThresholds;
    private getMetricValue;
    private createAlert;
    private executeAlertAction;
    analyzePerformance(duration?: number): PerformanceAnalysis;
    private calculateTrend;
    generatePerformanceReport(duration?: number): Promise<string>;
    getSamples(limit?: number): PerformanceSample[];
    getAlerts(limit?: number): PerformanceAlert[];
    isMonitoring(): boolean;
    cleanup(): Promise<void>;
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
//# sourceMappingURL=performance-monitor.d.ts.map