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

export class MemoryCache extends EventEmitter {
    private cache: Map<string, CacheEntry> = new Map();
    private tags: Map<string, Set<string>> = new Map();
    private config: MemoryCacheConfig;
    private hitCount: number = 0;
    private missCount: number = 0;
    private evictionCount: number = 0;

    constructor(config: Partial<MemoryCacheConfig> = {}) {
        super();
        this.config = {
            maxSize: config.maxSize || 10000,
            strategy: config.strategy || CacheStrategy.LRU,
            defaultTTL: config.defaultTTL || 3600
        };
    }

    async initialize(): Promise<void> {
        this.cache.clear();
        this.tags.clear();
        this.emit('initialized');
    }

    // ============ Core Operations ============

    async get<T = any>(key: string): Promise<T | null> {
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

        return entry.value as T;
    }

    async set<T = any>(key: string, value: T, options?: {
        ttl?: number;
        tags?: string[];
        priority?: number;
    }): Promise<void> {
        // Check if we need to evict
        if (this.cache.size >= this.config.maxSize) {
            await this.evict();
        }

        const now = Date.now();
        const ttl = options?.ttl !== undefined ? options.ttl : this.config.defaultTTL;

        const entry: CacheEntry<T> = {
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
                this.tags.get(tag)!.add(key);
            }
        }

        this.emit('set', { key, ttl, tags: options?.tags });
    }

    async delete(key: string): Promise<boolean> {
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

    async has(key: string): Promise<boolean> {
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

    async clear(): Promise<void> {
        this.cache.clear();
        this.tags.clear();
        this.hitCount = 0;
        this.missCount = 0;
        this.evictionCount = 0;
        this.emit('cleared');
    }

    // ============ Eviction Strategies ============

    private async evict(): Promise<void> {
        if (this.cache.size === 0) return;

        let keyToEvict: string | null = null;

        switch (this.config.strategy) {
            case CacheStrategy.LRU:
                keyToEvict = this.findLRUKey();
                break;
            case CacheStrategy.LFU:
                keyToEvict = this.findLFUKey();
                break;
            case CacheStrategy.FIFO:
                keyToEvict = this.findFIFOKey();
                break;
            case CacheStrategy.TTL:
                keyToEvict = this.findExpiringKey();
                break;
        }

        if (keyToEvict) {
            await this.delete(keyToEvict);
            this.evictionCount++;
            this.emit('evicted', { key: keyToEvict });
        }
    }

    private findLRUKey(): string | null {
        let oldest: { key: string; time: number } | null = null;

        for (const [key, entry] of this.cache) {
            if (!oldest || entry.accessedAt < oldest.time) {
                oldest = { key, time: entry.accessedAt };
            }
        }

        return oldest?.key || null;
    }

    private findLFUKey(): string | null {
        let leastUsed: { key: string; count: number } | null = null;

        for (const [key, entry] of this.cache) {
            if (!leastUsed || entry.accessCount < leastUsed.count) {
                leastUsed = { key, count: entry.accessCount };
            }
        }

        return leastUsed?.key || null;
    }

    private findFIFOKey(): string | null {
        let oldest: { key: string; time: number } | null = null;

        for (const [key, entry] of this.cache) {
            if (!oldest || entry.createdAt < oldest.time) {
                oldest = { key, time: entry.createdAt };
            }
        }

        return oldest?.key || null;
    }

    private findExpiringKey(): string | null {
        let soonest: { key: string; time: number } | null = null;

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

    async getByTag(tag: string): Promise<string[]> {
        const keys = this.tags.get(tag);
        return keys ? Array.from(keys) : [];
    }

    async invalidateTag(tag: string): Promise<number> {
        const keys = await this.getByTag(tag);
        
        for (const key of keys) {
            await this.delete(key);
        }

        this.tags.delete(tag);
        this.emit('tagInvalidated', { tag, count: keys.length });

        return keys.length;
    }

    // ============ Pattern Operations ============

    async keys(pattern: string = '*'): Promise<string[]> {
        const regex = this.patternToRegex(pattern);
        const keys: string[] = [];

        for (const key of this.cache.keys()) {
            if (regex.test(key)) {
                keys.push(key);
            }
        }

        return keys;
    }

    async deletePattern(pattern: string): Promise<number> {
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

    private patternToRegex(pattern: string): RegExp {
        const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regexStr = escaped.replace(/\*/g, '.*').replace(/\?/g, '.');
        return new RegExp(`^${regexStr}$`);
    }

    // ============ Configuration ============

    updateConfig(config: Partial<MemoryCacheConfig>): void {
        Object.assign(this.config, config);
        this.emit('configUpdated', this.config);
    }

    getConfig(): MemoryCacheConfig {
        return { ...this.config };
    }

    // ============ Statistics ============

    size(): number {
        return this.cache.size;
    }

    memoryUsage(): number {
        // Approximate memory usage in bytes
        let total = 0;
        
        for (const [key, entry] of this.cache) {
            total += key.length * 2; // Approximate string memory
            total += JSON.stringify(entry.value).length * 2;
            total += 100; // Approximate overhead per entry
        }

        return total;
    }

    getStats(): MemoryCacheStats {
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

    resetStats(): void {
        this.hitCount = 0;
        this.missCount = 0;
        this.evictionCount = 0;
    }

    // ============ Maintenance ============

    async cleanExpired(): Promise<number> {
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

    async export(): Promise<Buffer> {
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

    async import(buffer: Buffer): Promise<void> {
        const data = JSON.parse(buffer.toString());
        
        this.config = data.config;
        this.cache.clear();
        this.tags.clear();

        for (const entryData of data.entries) {
            const entry: CacheEntry = {
                ...entryData,
                value: entryData.value
            };

            this.cache.set(entry.key, entry);

            for (const tag of entry.tags) {
                if (!this.tags.has(tag)) {
                    this.tags.set(tag, new Set());
                }
                this.tags.get(tag)!.add(entry.key);
            }
        }

        this.emit('imported', { count: this.cache.size });
    }
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