/// <reference types="node" />
/// <reference types="node" />
/// <reference types="node" />
import { EventEmitter } from 'events';
import { CacheStrategy } from './cache-manager';
export interface MemoryCacheConfig {
    maxSize: number;
    strategy: CacheStrategy;
    defaultTTL: number;
}
export interface CacheEntry<T = any> {
    key: string;
    value: T;
    expiresAt: number;
    createdAt: number;
    accessedAt: number;
    accessCount: number;
    tags: string[];
    priority: number;
}
export declare class MemoryCache extends EventEmitter {
    private cache;
    private tags;
    private config;
    private hitCount;
    private missCount;
    private evictionCount;
    constructor(config?: Partial<MemoryCacheConfig>);
    initialize(): Promise<void>;
    get<T = any>(key: string): Promise<T | null>;
    set<T = any>(key: string, value: T, options?: {
        ttl?: number;
        tags?: string[];
        priority?: number;
    }): Promise<void>;
    delete(key: string): Promise<boolean>;
    has(key: string): Promise<boolean>;
    clear(): Promise<void>;
    private evict;
    private findLRUKey;
    private findLFUKey;
    private findFIFOKey;
    private findExpiringKey;
    getByTag(tag: string): Promise<string[]>;
    invalidateTag(tag: string): Promise<number>;
    keys(pattern?: string): Promise<string[]>;
    deletePattern(pattern: string): Promise<number>;
    private patternToRegex;
    updateConfig(config: Partial<MemoryCacheConfig>): void;
    getConfig(): MemoryCacheConfig;
    size(): number;
    memoryUsage(): number;
    getStats(): MemoryCacheStats;
    resetStats(): void;
    cleanExpired(): Promise<number>;
    export(): Promise<Buffer>;
    import(buffer: Buffer): Promise<void>;
}
export interface MemoryCacheStats {
    size: number;
    maxSize: number;
    hits: number;
    misses: number;
    evictions: number;
    hitRate: number;
    missRate: number;
    memoryUsage: number;
    tagCount: number;
    strategy: CacheStrategy;
    defaultTTL: number;
}
//# sourceMappingURL=memory-cache.d.ts.map