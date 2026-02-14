/// <reference types="node" />
/// <reference types="node" />
/// <reference types="node" />
import { EventEmitter } from 'events';
import { SQLServerPoolManager } from '../database/sqlserver-pool';
import { SQLServerConnection } from '../database/sqlserver-connection';
import { CacheManager } from '../cache/cache-manager';
import { EventDispatcher } from '../events/event-dispatcher';
export interface MetricPoint {
    timestamp: Date;
    value: number;
    labels?: Record<string, string>;
}
export interface MetricSeries {
    name: string;
    points: MetricPoint[];
    unit?: string;
    description?: string;
}
export interface MetricsCollectorOptions {
    interval?: number;
    retention?: number;
    maxPoints?: number;
    enableDatabase?: boolean;
    enableCache?: boolean;
    enableEvent?: boolean;
}
export declare class MetricsCollector extends EventEmitter {
    private metrics;
    private collectors;
    private interval;
    private options;
    private poolManager?;
    private connection?;
    private cacheManager?;
    private eventDispatcher?;
    constructor(options?: MetricsCollectorOptions);
    initialize(poolManager?: SQLServerPoolManager, connection?: SQLServerConnection, cacheManager?: CacheManager, eventDispatcher?: EventDispatcher): void;
    registerCollector(name: string, collector: () => Promise<any>, interval?: number): void;
    unregisterCollector(name: string): void;
    private registerDefaultCollectors;
    private registerDatabaseCollectors;
    private registerCacheCollectors;
    private registerEventCollectors;
    startCollection(): void;
    stopCollection(): void;
    collectAll(): Promise<void>;
    collect(name: string): Promise<void>;
    private recordMetric;
    private enforceRetention;
    getMetric(name: string, duration?: number): MetricSeries | undefined;
    getAllMetrics(): MetricSeries[];
    queryMetrics(options: MetricQuery): MetricSeries[];
    getAggregatedMetric(name: string, window: number, fn?: 'avg' | 'sum' | 'min' | 'max'): number | null;
    getStats(): MetricsStats;
    cleanup(): Promise<void>;
    private inferUnit;
    private inferDescription;
    exportMetrics(): Promise<Buffer>;
    importMetrics(buffer: Buffer): Promise<void>;
}
export interface MetricQuery {
    namePattern?: string;
    from?: Date;
    to?: Date;
    limit?: number;
}
export interface MetricsStats {
    totalMetrics: number;
    totalCollectors: number;
    totalPoints: number;
    collectionInterval: number;
    retentionPeriod: number;
    maxPointsPerMetric: number;
    isRunning: boolean;
}
//# sourceMappingURL=metrics-collector.d.ts.map