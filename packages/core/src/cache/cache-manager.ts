import { EventEmitter } from 'events';
import { RedisCache } from './redis-cache';
import { MemoryCache } from './memory-cache';

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

export enum CacheStrategy {
    LRU = 'lru',
    LFU = 'lfu',
    FIFO = 'fifo',
    TTL = 'ttl'
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

export class CacheManager extends EventEmitter {
    private memoryCache: MemoryCache;
    private redisCache: RedisCache;
    private config: CacheConfig;
    private stats: Map<string, CacheStats> = new Map();

    constructor(config: CacheConfig) {
        super();
        this.config = config;
        this.memoryCache = new MemoryCache({
            maxSize: config.maxSize,
            strategy: config.strategy,
            defaultTTL: config.defaultTTL
        });
        
        if (config.provider === 'redis' || config.provider === 'hybrid') {
            this.redisCache = new RedisCache(config.redis);
        }
    }

    async initialize(): Promise<void> {
        await this.memoryCache.initialize();
        
        if (this.redisCache) {
            await this.redisCache.initialize();
        }

        this.emit('initialized');
    }

    // ============ Core Operations ============

    async get<T = any>(key: string, options?: CacheOptions): Promise<T | null> {
        let value: T | null = null;
        let source: 'memory' | 'redis' | null = null;

        // Try memory cache first
        value = await this.memoryCache.get<T>(key);
        if (value !== null) {
            source = 'memory';
            this.recordHit(key, 'memory');
        }

        // Try Redis if not found in memory and using hybrid/redis
        if (value === null && this.redisCache) {
            value = await this.redisCache.get<T>(key);
            if (value !== null) {
                source = 'redis';
                this.recordHit(key, 'redis');
                
                // Store in memory for future access
                if (this.config.provider === 'hybrid') {
                    await this.memoryCache.set(key, value, options);
                }
            }
        }

        if (value === null) {
            this.recordMiss(key);
        }

        return value;
    }

    async set<T = any>(key: string, value: T, options?: CacheOptions): Promise<void> {
        const ttl = options?.ttl || this.config.defaultTTL;

        // Set in memory cache
        await this.memoryCache.set(key, value, {
            ttl,
            tags: options?.tags,
            priority: options?.priority
        });

        // Set in Redis if configured
        if (this.redisCache) {
            await this.redisCache.set(key, value, {
                ttl,
                tags: options?.tags
            });
        }

        this.recordSet(key);
        this.emit('set', { key, options });
    }

    async delete(key: string): Promise<boolean> {
        const memoryDeleted = await this.memoryCache.delete(key);
        let redisDeleted = false;

        if (this.redisCache) {
            redisDeleted = await this.redisCache.delete(key);
        }

        this.recordDelete(key);
        this.emit('delete', { key });

        return memoryDeleted || redisDeleted;
    }

    async has(key: string): Promise<boolean> {
        const inMemory = await this.memoryCache.has(key);
        if (inMemory) return true;

        if (this.redisCache) {
            return this.redisCache.has(key);
        }

        return false;
    }

    async clear(): Promise<void> {
        await this.memoryCache.clear();
        
        if (this.redisCache) {
            await this.redisCache.clear();
        }

        this.emit('cleared');
    }

    // ============ Batch Operations ============

    async getMany<T = any>(keys: string[]): Promise<(T | null)[]> {
        return Promise.all(keys.map(key => this.get<T>(key)));
    }

    async setMany<T = any>(entries: Array<{ key: string; value: T; options?: CacheOptions }>): Promise<void> {
        await Promise.all(entries.map(({ key, value, options }) => 
            this.set(key, value, options)
        ));
    }

    async deleteMany(keys: string[]): Promise<number> {
        const results = await Promise.all(keys.map(key => this.delete(key)));
        return results.filter(Boolean).length;
    }

    // ============ Tag Operations ============

    async getByTag(tag: string): Promise<string[]> {
        const memoryKeys = await this.memoryCache.getByTag(tag);
        
        if (this.redisCache) {
            const redisKeys = await this.redisCache.getByTag(tag);
            return [...new Set([...memoryKeys, ...redisKeys])];
        }

        return memoryKeys;
    }

    async invalidateTag(tag: string): Promise<number> {
        const memoryCount = await this.memoryCache.invalidateTag(tag);
        let redisCount = 0;

        if (this.redisCache) {
            redisCount = await this.redisCache.invalidateTag(tag);
        }

        this.emit('tagInvalidated', { tag, count: memoryCount + redisCount });
        
        return memoryCount + redisCount;
    }

    async invalidateTags(tags: string[]): Promise<number> {
        const results = await Promise.all(tags.map(tag => this.invalidateTag(tag)));
        return results.reduce((sum, count) => sum + count, 0);
    }

    // ============ Pattern Operations ============

    async deletePattern(pattern: string): Promise<number> {
        const memoryCount = await this.memoryCache.deletePattern(pattern);
        let redisCount = 0;

        if (this.redisCache) {
            redisCount = await this.redisCache.deletePattern(pattern);
        }

        this.emit('patternDeleted', { pattern, count: memoryCount + redisCount });
        
        return memoryCount + redisCount;
    }

    async keys(pattern: string = '*'): Promise<string[]> {
        const memoryKeys = await this.memoryCache.keys(pattern);
        
        if (this.redisCache) {
            const redisKeys = await this.redisCache.keys(pattern);
            return [...new Set([...memoryKeys, ...redisKeys])];
        }

        return memoryKeys;
    }

    // ============ Statistics ============

    private recordHit(key: string, source: 'memory' | 'redis'): void {
        const stats = this.getStats(source);
        stats.hits++;
        stats.hitRate = stats.hits / (stats.hits + stats.misses);
        stats.missRate = stats.misses / (stats.hits + stats.misses);
    }

    private recordMiss(key: string): void {
        const stats = this.getStats('memory');
        stats.misses++;
        stats.hitRate = stats.hits / (stats.hits + stats.misses);
        stats.missRate = stats.misses / (stats.hits + stats.misses);
    }

    private recordSet(key: string): void {
        const stats = this.getStats('memory');
        stats.sets++;
        stats.itemCount = this.memoryCache.size();
    }

    private recordDelete(key: string): void {
        const stats = this.getStats('memory');
        stats.deletes++;
        stats.itemCount = this.memoryCache.size();
    }

    private getStats(source: 'memory' | 'redis'): CacheStats {
        if (!this.stats.has(source)) {
            this.stats.set(source, {
                hits: 0,
                misses: 0,
                sets: 0,
                deletes: 0,
                evictions: 0,
                hitRate: 0,
                missRate: 0,
                memoryUsage: 0,
                itemCount: 0
            });
        }
        return this.stats.get(source)!;
    }

    async getStats(source?: 'memory' | 'redis'): Promise<Map<string, CacheStats>> {
        if (source) {
            const stats = this.getStats(source);
            
            // Update dynamic stats
            if (source === 'memory') {
                stats.memoryUsage = this.memoryCache.memoryUsage();
                stats.itemCount = this.memoryCache.size();
            } else if (source === 'redis' && this.redisCache) {
                const redisStats = await this.redisCache.info();
                stats.memoryUsage = redisStats.used_memory;
                stats.itemCount = redisStats.db_keys;
            }
            
            return new Map([[source, stats]]);
        }

        const allStats = new Map(this.stats);
        
        // Update all stats
        const memoryStats = allStats.get('memory');
        if (memoryStats) {
            memoryStats.memoryUsage = this.memoryCache.memoryUsage();
            memoryStats.itemCount = this.memoryCache.size();
        }

        if (this.redisCache) {
            const redisStats = await this.redisCache.info();
            const redisCacheStats = allStats.get('redis') || this.getStats('redis');
            redisCacheStats.memoryUsage = redisStats.used_memory;
            redisCacheStats.itemCount = redisStats.db_keys;
            allStats.set('redis', redisCacheStats);
        }

        return allStats;
    }

    async resetStats(): Promise<void> {
        this.stats.clear();
    }

    // ============ Configuration ============

    updateConfig(config: Partial<CacheConfig>): void {
        Object.assign(this.config, config);
        
        // Update memory cache config
        this.memoryCache.updateConfig({
            maxSize: config.maxSize,
            strategy: config.strategy,
            defaultTTL: config.defaultTTL
        });

        this.emit('configUpdated', this.config);
    }

    getConfig(): CacheConfig {
        return { ...this.config };
    }

    // ============ Health Check ============

    async healthCheck(): Promise<HealthStatus> {
        const statuses: HealthStatus[] = [];

        // Check memory cache
        try {
            await this.memoryCache.set('health:check', true, { ttl: 1 });
            const value = await this.memoryCache.get('health:check');
            
            statuses.push({
                component: 'memory-cache',
                status: value === true ? 'healthy' : 'unhealthy',
                timestamp: new Date()
            });
        } catch (error) {
            statuses.push({
                component: 'memory-cache',
                status: 'unhealthy',
                error: error.message,
                timestamp: new Date()
            });
        }

        // Check Redis cache if configured
        if (this.redisCache) {
            try {
                const isHealthy = await this.redisCache.healthCheck();
                statuses.push({
                    component: 'redis-cache',
                    status: isHealthy ? 'healthy' : 'unhealthy',
                    timestamp: new Date()
                });
            } catch (error) {
                statuses.push({
                    component: 'redis-cache',
                    status: 'unhealthy',
                    error: error.message,
                    timestamp: new Date()
                });
            }
        }

        const hasUnhealthy = statuses.some(s => s.status === 'unhealthy');
        const overallStatus = hasUnhealthy ? 'unhealthy' : 'healthy';

        return {
            component: 'cache-manager',
            status: overallStatus,
            checks: statuses,
            timestamp: new Date()
        };
    }

    // ============ Cleanup ============

    async dispose(): Promise<void> {
        await this.memoryCache.clear();
        
        if (this.redisCache) {
            await this.redisCache.disconnect();
        }

        this.emit('disposed');
    }
}

export interface HealthStatus {
    component: string;
    status: 'healthy' | 'unhealthy' | 'degraded';
    error?: string;
    checks?: HealthStatus[];
    timestamp: Date;
}