/// <reference types="node" />
import { EventEmitter } from 'events';
import { SQLServerPoolManager } from '../database/sqlserver-pool';
import { CacheManager } from '../cache/cache-manager';
import { EventDispatcher } from '../events/event-dispatcher';
import { MetricsCollector } from './metrics-collector';
export interface HealthStatus {
    status: 'healthy' | 'unhealthy' | 'degraded';
    checks: HealthCheck[];
    timestamp: Date;
    duration: number;
}
export interface HealthCheck {
    name: string;
    status: 'passed' | 'failed' | 'warning';
    message?: string;
    duration: number;
    metadata?: Record<string, any>;
}
export interface HealthCheckOptions {
    timeout?: number;
    critical?: boolean;
    tags?: string[];
}
export declare class HealthChecker extends EventEmitter {
    private poolManager?;
    private sqlServerHealth?;
    private cacheManager?;
    private eventDispatcher?;
    private metricsCollector?;
    private checks;
    private results;
    private interval;
    constructor();
    initialize(poolManager?: SQLServerPoolManager, cacheManager?: CacheManager, eventDispatcher?: EventDispatcher, metricsCollector?: MetricsCollector): void;
    registerCheck(name: string, check: () => Promise<HealthCheck>, options?: HealthCheckOptions): void;
    unregisterCheck(name: string): void;
    private registerDefaultChecks;
    private registerDatabaseChecks;
    private registerCacheChecks;
    private registerEventChecks;
    runHealthCheck(tags?: string[]): Promise<HealthStatus>;
    runHealthCheckGroup(group: string): Promise<HealthStatus>;
    startMonitoring(interval?: number): void;
    stopMonitoring(): void;
    getLatestHealthStatus(): HealthStatus | undefined;
    getHealthHistory(limit?: number): HealthStatus[];
    getChecks(tags?: string[]): HealthCheckDefinition[];
    getCheck(name: string): HealthCheckDefinition | undefined;
    private tagGroups;
    registerGroup(name: string, tags: string[]): void;
    getTagsForGroup(group: string): string[];
    generateHealthReport(tags?: string[]): Promise<string>;
}
export interface HealthCheckDefinition {
    name: string;
    check: () => Promise<HealthCheck>;
    options: {
        timeout: number;
        critical: boolean;
        tags: string[];
    };
}
//# sourceMappingURL=health-check.d.ts.map