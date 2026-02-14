"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MemoryCache = void 0;
const events_1 = require("events");
const cache_manager_1 = require("./cache-manager");
class MemoryCache extends events_1.EventEmitter {
    cache = new Map();
    tags = new Map();
    config;
    hitCount = 0;
    missCount = 0;
    evictionCount = 0;
    constructor(config = {}) {
        super();
        this.config = {
            maxSize: config.maxSize || 10000,
            strategy: config.strategy || cache_manager_1.CacheStrategy.LRU,
            defaultTTL: config.defaultTTL || 3600
        };
    }
    async initialize() {
        this.cache.clear();
        this.tags.clear();
        this.emit('initialized');
    }
    // ============ Core Operations ============
    async get(key) {
        const entry = this.cache.get(key);
        if (!entry) {
            this.missCount++;
            return null;
        }
        // Check expiration
        if (entry.expiresAt > 0 && entry.expiresAt < Date.now()) {
            await this.delete(key);
            this.missCount++;
            return null;
        }
        // Update access stats
        entry.accessedAt = Date.now();
        entry.accessCount++;
        this.hitCount++;
        this.emit('hit', { key });
        return entry.value;
    }
    async set(key, value, options) {
        // Check if we need to evict
        if (this.cache.size >= this.config.maxSize) {
            await this.evict();
        }
        const now = Date.now();
        const ttl = options?.ttl !== undefined ? options.ttl : this.config.defaultTTL;
        const entry = {
            key,
            value,
            expiresAt: ttl > 0 ? now + (ttl * 1000) : 0,
            createdAt: now,
            accessedAt: now,
            accessCount: 0,
            tags: options?.tags || [],
            priority: options?.priority || 0
        };
        this.cache.set(key, entry);
        // Update tag indexes
        if (options?.tags && options.tags.length > 0) {
            for (const tag of options.tags) {
                if (!this.tags.has(tag)) {
                    this.tags.set(tag, new Set());
                }
                this.tags.get(tag).add(key);
            }
        }
        this.emit('set', { key, ttl, tags: options?.tags });
    }
    async delete(key) {
        const entry = this.cache.get(key);
        if (entry) {
            // Remove from tag indexes
            for (const tag of entry.tags) {
                const tagSet = this.tags.get(tag);
                if (tagSet) {
                    tagSet.delete(key);
                    if (tagSet.size === 0) {
                        this.tags.delete(tag);
                    }
                }
            }
            this.cache.delete(key);
            this.emit('delete', { key });
            return true;
        }
        return false;
    }
    async has(key) {
        const entry = this.cache.get(key);
        if (!entry) {
            return false;
        }
        // Check expiration
        if (entry.expiresAt > 0 && entry.expiresAt < Date.now()) {
            await this.delete(key);
            return false;
        }
        return true;
    }
    async clear() {
        this.cache.clear();
        this.tags.clear();
        this.hitCount = 0;
        this.missCount = 0;
        this.evictionCount = 0;
        this.emit('cleared');
    }
    // ============ Eviction Strategies ============
    async evict() {
        if (this.cache.size === 0)
            return;
        let keyToEvict = null;
        switch (this.config.strategy) {
            case cache_manager_1.CacheStrategy.LRU:
                keyToEvict = this.findLRUKey();
                break;
            case cache_manager_1.CacheStrategy.LFU:
                keyToEvict = this.findLFUKey();
                break;
            case cache_manager_1.CacheStrategy.FIFO:
                keyToEvict = this.findFIFOKey();
                break;
            case cache_manager_1.CacheStrategy.TTL:
                keyToEvict = this.findExpiringKey();
                break;
        }
        if (keyToEvict) {
            await this.delete(keyToEvict);
            this.evictionCount++;
            this.emit('evicted', { key: keyToEvict });
        }
    }
    findLRUKey() {
        let oldest = null;
        for (const [key, entry] of this.cache) {
            if (!oldest || entry.accessedAt < oldest.time) {
                oldest = { key, time: entry.accessedAt };
            }
        }
        return oldest?.key || null;
    }
    findLFUKey() {
        let leastUsed = null;
        for (const [key, entry] of this.cache) {
            if (!leastUsed || entry.accessCount < leastUsed.count) {
                leastUsed = { key, count: entry.accessCount };
            }
        }
        return leastUsed?.key || null;
    }
    findFIFOKey() {
        let oldest = null;
        for (const [key, entry] of this.cache) {
            if (!oldest || entry.createdAt < oldest.time) {
                oldest = { key, time: entry.createdAt };
            }
        }
        return oldest?.key || null;
    }
    findExpiringKey() {
        let soonest = null;
        for (const [key, entry] of this.cache) {
            if (entry.expiresAt > 0) {
                if (!soonest || entry.expiresAt < soonest.time) {
                    soonest = { key, time: entry.expiresAt };
                }
            }
        }
        return soonest?.key || null;
    }
    // ============ Tag Operations ============
    async getByTag(tag) {
        const keys = this.tags.get(tag);
        return keys ? Array.from(keys) : [];
    }
    async invalidateTag(tag) {
        const keys = await this.getByTag(tag);
        for (const key of keys) {
            await this.delete(key);
        }
        this.tags.delete(tag);
        this.emit('tagInvalidated', { tag, count: keys.length });
        return keys.length;
    }
    // ============ Pattern Operations ============
    async keys(pattern = '*') {
        const regex = this.patternToRegex(pattern);
        const keys = [];
        for (const key of this.cache.keys()) {
            if (regex.test(key)) {
                keys.push(key);
            }
        }
        return keys;
    }
    async deletePattern(pattern) {
        const keys = await this.keys(pattern);
        let count = 0;
        for (const key of keys) {
            if (await this.delete(key)) {
                count++;
            }
        }
        this.emit('patternDeleted', { pattern, count });
        return count;
    }
    patternToRegex(pattern) {
        const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regexStr = escaped.replace(/\*/g, '.*').replace(/\?/g, '.');
        return new RegExp(`^${regexStr}$`);
    }
    // ============ Configuration ============
    updateConfig(config) {
        Object.assign(this.config, config);
        this.emit('configUpdated', this.config);
    }
    getConfig() {
        return { ...this.config };
    }
    // ============ Statistics ============
    size() {
        return this.cache.size;
    }
    memoryUsage() {
        // Approximate memory usage in bytes
        let total = 0;
        for (const [key, entry] of this.cache) {
            total += key.length * 2; // Approximate string memory
            total += JSON.stringify(entry.value).length * 2;
            total += 100; // Approximate overhead per entry
        }
        return total;
    }
    getStats() {
        const totalRequests = this.hitCount + this.missCount;
        return {
            size: this.cache.size,
            maxSize: this.config.maxSize,
            hits: this.hitCount,
            misses: this.missCount,
            evictions: this.evictionCount,
            hitRate: totalRequests > 0 ? this.hitCount / totalRequests : 0,
            missRate: totalRequests > 0 ? this.missCount / totalRequests : 0,
            memoryUsage: this.memoryUsage(),
            tagCount: this.tags.size,
            strategy: this.config.strategy,
            defaultTTL: this.config.defaultTTL
        };
    }
    resetStats() {
        this.hitCount = 0;
        this.missCount = 0;
        this.evictionCount = 0;
    }
    // ============ Maintenance ============
    async cleanExpired() {
        let count = 0;
        const now = Date.now();
        for (const [key, entry] of this.cache) {
            if (entry.expiresAt > 0 && entry.expiresAt < now) {
                await this.delete(key);
                count++;
            }
        }
        this.emit('cleaned', { count });
        return count;
    }
    // ============ Export/Import ============
    async export() {
        const data = {
            config: this.config,
            stats: this.getStats(),
            entries: Array.from(this.cache.entries()).map(([key, entry]) => ({
                key,
                value: entry.value,
                expiresAt: entry.expiresAt,
                createdAt: entry.createdAt,
                accessedAt: entry.accessedAt,
                accessCount: entry.accessCount,
                tags: entry.tags,
                priority: entry.priority
            }))
        };
        return Buffer.from(JSON.stringify(data));
    }
    async import(buffer) {
        const data = JSON.parse(buffer.toString());
        this.config = data.config;
        this.cache.clear();
        this.tags.clear();
        for (const entryData of data.entries) {
            const entry = {
                ...entryData,
                value: entryData.value
            };
            this.cache.set(entry.key, entry);
            for (const tag of entry.tags) {
                if (!this.tags.has(tag)) {
                    this.tags.set(tag, new Set());
                }
                this.tags.get(tag).add(entry.key);
            }
        }
        this.emit('imported', { count: this.cache.size });
    }
}
exports.MemoryCache = MemoryCache;
//# sourceMappingURL=memory-cache.js.map