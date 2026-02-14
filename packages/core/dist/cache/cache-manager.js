"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CacheManager = exports.CacheStrategy = void 0;
const events_1 = require("events");
const redis_cache_1 = require("./redis-cache");
const memory_cache_1 = require("./memory-cache");
var CacheStrategy;
(function (CacheStrategy) {
    CacheStrategy["LRU"] = "lru";
    CacheStrategy["LFU"] = "lfu";
    CacheStrategy["FIFO"] = "fifo";
    CacheStrategy["TTL"] = "ttl";
})(CacheStrategy || (exports.CacheStrategy = CacheStrategy = {}));
class CacheManager extends events_1.EventEmitter {
    memoryCache;
    redisCache;
    config;
    stats = new Map();
    constructor(config) {
        super();
        this.config = config;
        this.memoryCache = new memory_cache_1.MemoryCache({
            maxSize: config.maxSize,
            strategy: config.strategy,
            defaultTTL: config.defaultTTL
        });
        if (config.provider === 'redis' || config.provider === 'hybrid') {
            this.redisCache = new redis_cache_1.RedisCache(config.redis);
        }
    }
    async initialize() {
        await this.memoryCache.initialize();
        if (this.redisCache) {
            await this.redisCache.initialize();
        }
        this.emit('initialized');
    }
    // ============ Core Operations ============
    async get(key, options) {
        let value = null;
        let source = null;
        // Try memory cache first
        value = await this.memoryCache.get(key);
        if (value !== null) {
            source = 'memory';
            this.recordHit(key, 'memory');
        }
        // Try Redis if not found in memory and using hybrid/redis
        if (value === null && this.redisCache) {
            value = await this.redisCache.get(key);
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
    async set(key, value, options) {
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
    async delete(key) {
        const memoryDeleted = await this.memoryCache.delete(key);
        let redisDeleted = false;
        if (this.redisCache) {
            redisDeleted = await this.redisCache.delete(key);
        }
        this.recordDelete(key);
        this.emit('delete', { key });
        return memoryDeleted || redisDeleted;
    }
    async has(key) {
        const inMemory = await this.memoryCache.has(key);
        if (inMemory)
            return true;
        if (this.redisCache) {
            return this.redisCache.has(key);
        }
        return false;
    }
    async clear() {
        await this.memoryCache.clear();
        if (this.redisCache) {
            await this.redisCache.clear();
        }
        this.emit('cleared');
    }
    // ============ Batch Operations ============
    async getMany(keys) {
        return Promise.all(keys.map(key => this.get(key)));
    }
    async setMany(entries) {
        await Promise.all(entries.map(({ key, value, options }) => this.set(key, value, options)));
    }
    async deleteMany(keys) {
        const results = await Promise.all(keys.map(key => this.delete(key)));
        return results.filter(Boolean).length;
    }
    // ============ Tag Operations ============
    async getByTag(tag) {
        const memoryKeys = await this.memoryCache.getByTag(tag);
        if (this.redisCache) {
            const redisKeys = await this.redisCache.getByTag(tag);
            return [...new Set([...memoryKeys, ...redisKeys])];
        }
        return memoryKeys;
    }
    async invalidateTag(tag) {
        const memoryCount = await this.memoryCache.invalidateTag(tag);
        let redisCount = 0;
        if (this.redisCache) {
            redisCount = await this.redisCache.invalidateTag(tag);
        }
        this.emit('tagInvalidated', { tag, count: memoryCount + redisCount });
        return memoryCount + redisCount;
    }
    async invalidateTags(tags) {
        const results = await Promise.all(tags.map(tag => this.invalidateTag(tag)));
        return results.reduce((sum, count) => sum + count, 0);
    }
    // ============ Pattern Operations ============
    async deletePattern(pattern) {
        const memoryCount = await this.memoryCache.deletePattern(pattern);
        let redisCount = 0;
        if (this.redisCache) {
            redisCount = await this.redisCache.deletePattern(pattern);
        }
        this.emit('patternDeleted', { pattern, count: memoryCount + redisCount });
        return memoryCount + redisCount;
    }
    async keys(pattern = '*') {
        const memoryKeys = await this.memoryCache.keys(pattern);
        if (this.redisCache) {
            const redisKeys = await this.redisCache.keys(pattern);
            return [...new Set([...memoryKeys, ...redisKeys])];
        }
        return memoryKeys;
    }
    // ============ Statistics ============
    recordHit(key, source) {
        const stats = this.getStats(source);
        stats.hits++;
        stats.hitRate = stats.hits / (stats.hits + stats.misses);
        stats.missRate = stats.misses / (stats.hits + stats.misses);
    }
    recordMiss(key) {
        const stats = this.getStats('memory');
        stats.misses++;
        stats.hitRate = stats.hits / (stats.hits + stats.misses);
        stats.missRate = stats.misses / (stats.hits + stats.misses);
    }
    recordSet(key) {
        const stats = this.getStats('memory');
        stats.sets++;
        stats.itemCount = this.memoryCache.size();
    }
    recordDelete(key) {
        const stats = this.getStats('memory');
        stats.deletes++;
        stats.itemCount = this.memoryCache.size();
    }
    getStats(source) {
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
        return this.stats.get(source);
    }
    async getStats(source) {
        if (source) {
            const stats = this.getStats(source);
            // Update dynamic stats
            if (source === 'memory') {
                stats.memoryUsage = this.memoryCache.memoryUsage();
                stats.itemCount = this.memoryCache.size();
            }
            else if (source === 'redis' && this.redisCache) {
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
    async resetStats() {
        this.stats.clear();
    }
    // ============ Configuration ============
    updateConfig(config) {
        Object.assign(this.config, config);
        // Update memory cache config
        this.memoryCache.updateConfig({
            maxSize: config.maxSize,
            strategy: config.strategy,
            defaultTTL: config.defaultTTL
        });
        this.emit('configUpdated', this.config);
    }
    getConfig() {
        return { ...this.config };
    }
    // ============ Health Check ============
    async healthCheck() {
        const statuses = [];
        // Check memory cache
        try {
            await this.memoryCache.set('health:check', true, { ttl: 1 });
            const value = await this.memoryCache.get('health:check');
            statuses.push({
                component: 'memory-cache',
                status: value === true ? 'healthy' : 'unhealthy',
                timestamp: new Date()
            });
        }
        catch (error) {
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
            }
            catch (error) {
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
    async dispose() {
        await this.memoryCache.clear();
        if (this.redisCache) {
            await this.redisCache.disconnect();
        }
        this.emit('disposed');
    }
}
exports.CacheManager = CacheManager;
//# sourceMappingURL=cache-manager.js.map