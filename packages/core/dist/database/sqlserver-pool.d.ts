/// <reference types="node" />
import { ConnectionPool, config as SQLConfig } from 'mssql';
import { EventEmitter } from 'events';
import { SQLServerMetrics } from './sqlserver-metrics';
export interface PoolConfig {
    min: number;
    max: number;
    idleTimeout: number;
    acquireTimeout: number;
    reapInterval: number;
    createRetryInterval: number;
    validateConnection: boolean;
}
export interface PoolStats {
    total: number;
    active: number;
    idle: number;
    waiting: number;
    hitRate: number;
    missRate: number;
    averageAcquireTime: number;
    averageIdleTime: number;
}
export declare class SQLServerPoolManager extends EventEmitter {
    private pools;
    private poolConfigs;
    private poolMetrics;
    private poolStats;
    private reapTimer;
    private defaultConfig;
    constructor();
    createPool(name: string, config: SQLConfig, poolConfig?: Partial<PoolConfig>): Promise<ConnectionPool>;
    getPool(name: string): Promise<ConnectionPool>;
    closePool(name: string): Promise<void>;
    closeAllPools(): Promise<void>;
    updatePoolConfig(name: string, config: Partial<PoolConfig>): void;
    private recreatePool;
    private initializeMetrics;
    private initializeStats;
    private updatePoolMetrics;
    private updatePoolStats;
    getPoolStats(name: string): Promise<PoolStats>;
    getAllPoolStats(): Record<string, PoolStats>;
    private startReaper;
    private reapIdleConnections;
    private shrinkPool;
    validatePool(name: string): Promise<boolean>;
    validateAllPools(): Promise<Map<string, boolean>>;
    getPoolMetrics(name: string): SQLServerMetrics;
    getAllPoolMetrics(): Record<string, SQLServerMetrics>;
    executeOnPool<T>(name: string, callback: (pool: ConnectionPool) => Promise<T>): Promise<T>;
    poolExists(name: string): boolean;
    getPoolNames(): string[];
    getPoolCount(): number;
    destroy(): Promise<void>;
}
export declare class SQLServerPool {
    private static instance;
    static getInstance(): SQLServerPoolManager;
}
//# sourceMappingURL=sqlserver-pool.d.ts.map