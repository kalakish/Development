/// <reference types="node" />
import { EventEmitter } from 'events';
export interface CacheConfig {
    defaultTTL: number;
    maxSize: number;
    strategy: CacheStrategy;
    provider: 'memory' | 'redis' | 'hybrid';
    redis?: {
        host: string;
        port: number;
        password?: string;
        db?: number;
    };
}
export declare enum CacheStrategy {
    LRU = "lru",
    LFU = "lfu",
    FIFO = "fifo",
    TTL = "ttl"
}
export interface CacheOptions {
    ttl?: number;
    tags?: string[];
    priority?: number;
    compressed?: boolean;
}
export interface CacheStats {
    hits: number;
    misses: number;
    sets: number;
    deletes: number;
    evictions: number;
    hitRate: number;
    missRate: number;
    memoryUsage: number;
    itemCount: number;
}
export declare class CacheManager extends EventEmitter {
    private memoryCache;
    private redisCache;
    private config;
    private stats;
    constructor(config: CacheConfig);
    initialize(): Promise<void>;
    get<T = any>(key: string, options?: CacheOptions): Promise<T | null>;
    set<T = any>(key: string, value: T, options?: CacheOptions): Promise<void>;
    delete(key: string): Promise<boolean>;
    has(key: string): Promise<boolean>;
    clear(): Promise<void>;
    getMany<T = any>(keys: string[]): Promise<(T | null)[]>;
    setMany<T = any>(entries: Array<{
        key: string;
        value: T;
        options?: CacheOptions;
    }>): Promise<void>;
    deleteMany(keys: string[]): Promise<number>;
    getByTag(tag: string): Promise<string[]>;
    invalidateTag(tag: string): Promise<number>;
    invalidateTags(tags: string[]): Promise<number>;
    deletePattern(pattern: string): Promise<number>;
    keys(pattern?: string): Promise<string[]>;
    private recordHit;
    private recordMiss;
    private recordSet;
    private recordDelete;
    private getStats;
    resetStats(): Promise<void>;
    updateConfig(config: Partial<CacheConfig>): void;
    getConfig(): CacheConfig;
    healthCheck(): Promise<HealthStatus>;
    dispose(): Promise<void>;
}
export interface HealthStatus {
    component: string;
    status: 'healthy' | 'unhealthy' | 'degraded';
    error?: string;
    checks?: HealthStatus[];
    timestamp: Date;
}
//# sourceMappingURL=cache-manager.d.ts.map