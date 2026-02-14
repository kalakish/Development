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
export declare class SQLServerHealth {
    private poolManager;
    private thresholds;
    constructor(poolManager: SQLServerPoolManager, thresholds?: HealthThresholds);
    healthCheck(poolName?: string): Promise<HealthCheckResult>;
    private checkPool;
    private checkSystemHealth;
    private getSystemMetrics;
    private determineOverallStatus;
    checkLatency(poolName: string): Promise<HealthCheck>;
    checkPoolHealth(poolName: string): Promise<HealthCheck>;
    generateHealthReport(poolName?: string): Promise<string>;
    private groupChecksByStatus;
    updateThresholds(thresholds: Partial<HealthThresholds>): void;
    getThresholds(): HealthThresholds;
    resetThresholds(): void;
}
export interface SystemMetrics {
    cpuUsage: number;
    memoryUsage: number;
    diskUsage: number;
    uptime: number;
    connections: number;
    databaseSize: number;
}
//# sourceMappingURL=sqlserver-health.d.ts.map