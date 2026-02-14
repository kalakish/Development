import Redis from 'ioredis';
import { EventEmitter } from 'events';

export interface RedisConfig {
    host: string;
    port: number;
    password?: string;
    db?: number;
    keyPrefix?: string;
    ttl?: number;
}

export interface CacheOptions {
    ttl?: number;
    tags?: string[];
}

export class RedisCache extends EventEmitter {
    private client: Redis.Redis;
    private config: RedisConfig;
    private initialized: boolean = false;
    private defaultTTL: number = 3600;

    constructor(config?: Partial<RedisConfig>) {
        super();
        this.config = {
            host: config?.host || 'localhost',
            port: config?.port || 6379,
            password: config?.password,
            db: config?.db || 0,
            keyPrefix: config?.keyPrefix || 'nova:cache:',
            ttl: config?.ttl || 3600
        };
        this.defaultTTL = this.config.ttl || 3600;
    }

    async initialize(): Promise<void> {
        if (this.initialized) return;

        this.client = new Redis({
            host: this.config.host,
            port: this.config.port,
            password: this.config.password,
            db: this.config.db,
            keyPrefix: this.config.keyPrefix,
            retryStrategy: (times) => {
                const delay = Math.min(times * 50, 2000);
                return delay;
            }
        });

        this.client.on('connect', () => {
            this.emit('connected');
        });

        this.client.on('error', (error) => {
            this.emit('error', error);
        });

        this.client.on('ready', () => {
            this.initialized = true;
            this.emit('ready');
        });

        // Wait for ready state
        await new Promise<void>((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('Redis connection timeout'));
            }, 10000);

            this.client.once('ready', () => {
                clearTimeout(timeout);
                resolve();
            });

            this.client.once('error', (error) => {
                clearTimeout(timeout);
                reject(error);
            });
        });
    }

    // ============ Core Operations ============

    async get<T = any>(key: string): Promise<T | null> {
        const value = await this.client.get(key);
        
        if (!value) {
            return null;
        }

        try {
            return JSON.parse(value);
        } catch {
            return value as any;
        }
    }

    async set<T = any>(key: string, value: T, options?: CacheOptions): Promise<void> {
        const serialized = typeof value === 'string' ? value : JSON.stringify(value);
        const ttl = options?.ttl || this.defaultTTL;

        if (ttl > 0) {
            await this.client.setex(key, ttl, serialized);
        } else {
            await this.client.set(key, serialized);
        }

        // Store tags
        if (options?.tags && options.tags.length > 0) {
            await this.addTags(key, options.tags);
        }
    }

    async delete(key: string): Promise<boolean> {
        const result = await this.client.del(key);
        return result > 0;
    }

    async has(key: string): Promise<boolean> {
        const exists = await this.client.exists(key);
        return exists === 1;
    }

    async clear(): Promise<void> {
        const keys = await this.client.keys(`${this.config.keyPrefix}*`);
        
        if (keys.length > 0) {
            await this.client.del(...keys);
        }
    }

    // ============ Batch Operations ============

    async getMany<T = any>(keys: string[]): Promise<(T | null)[]> {
        if (keys.length === 0) return [];

        const values = await this.client.mget(...keys);
        
        return values.map(value => {
            if (!value) return null;
            try {
                return JSON.parse(value);
            } catch {
                return value as any;
            }
        });
    }

    async setMany<T = any>(entries: Array<{ key: string; value: T; options?: CacheOptions }>): Promise<void> {
        const pipeline = this.client.pipeline();

        for (const { key, value, options } of entries) {
            const serialized = typeof value === 'string' ? value : JSON.stringify(value);
            const ttl = options?.ttl || this.defaultTTL;

            if (ttl > 0) {
                pipeline.setex(key, ttl, serialized);
            } else {
                pipeline.set(key, serialized);
            }

            if (options?.tags && options.tags.length > 0) {
                await this.addTags(key, options.tags);
            }
        }

        await pipeline.exec();
    }

    async deleteMany(keys: string[]): Promise<number> {
        if (keys.length === 0) return 0;

        const result = await this.client.del(...keys);
        return result;
    }

    // ============ Tag Operations ============

    private async addTags(key: string, tags: string[]): Promise<void> {
        const pipeline = this.client.pipeline();

        for (const tag of tags) {
            pipeline.sadd(`tag:${tag}`, key);
            pipeline.expire(`tag:${tag}`, this.defaultTTL);
        }

        pipeline.sadd(`keys:${key}:tags`, ...tags);
        pipeline.expire(`keys:${key}:tags`, this.defaultTTL);

        await pipeline.exec();
    }

    async getByTag(tag: string): Promise<string[]> {
        return this.client.smembers(`tag:${tag}`);
    }

    async invalidateTag(tag: string): Promise<number> {
        const keys = await this.getByTag(tag);
        
        if (keys.length > 0) {
            await this.deleteMany(keys);
            await this.client.del(`tag:${tag}`);
        }

        return keys.length;
    }

    async getTags(key: string): Promise<string[]> {
        return this.client.smembers(`keys:${key}:tags`);
    }

    // ============ Pattern Operations ============

    async keys(pattern: string = '*'): Promise<string[]> {
        const fullPattern = `${this.config.keyPrefix}${pattern}`;
        return this.client.keys(fullPattern);
    }

    async deletePattern(pattern: string): Promise<number> {
        const keys = await this.keys(pattern);
        
        if (keys.length > 0) {
            await this.client.del(...keys);
        }

        return keys.length;
    }

    // ============ TTL Operations ============

    async expire(key: string, seconds: number): Promise<boolean> {
        const result = await this.client.expire(key, seconds);
        return result === 1;
    }

    async ttl(key: string): Promise<number> {
        return this.client.ttl(key);
    }

    async persist(key: string): Promise<boolean> {
        const result = await this.client.persist(key);
        return result === 1;
    }

    // ============ Atomic Operations ============

    async increment(key: string, by: number = 1): Promise<number> {
        return this.client.incrby(key, by);
    }

    async decrement(key: string, by: number = 1): Promise<number> {
        return this.client.decrby(key, by);
    }

    // ============ Hash Operations ============

    async hget<T = any>(key: string, field: string): Promise<T | null> {
        const value = await this.client.hget(key, field);
        
        if (!value) {
            return null;
        }

        try {
            return JSON.parse(value);
        } catch {
            return value as any;
        }
    }

    async hset<T = any>(key: string, field: string, value: T): Promise<number> {
        const serialized = typeof value === 'string' ? value : JSON.stringify(value);
        return this.client.hset(key, field, serialized);
    }

    async hgetall<T = any>(key: string): Promise<Record<string, T> | null> {
        const values = await this.client.hgetall(key);
        
        if (Object.keys(values).length === 0) {
            return null;
        }

        const result: Record<string, T> = {};
        
        for (const [field, value] of Object.entries(values)) {
            try {
                result[field] = JSON.parse(value);
            } catch {
                result[field] = value as any;
            }
        }

        return result;
    }

    async hdel(key: string, ...fields: string[]): Promise<number> {
        return this.client.hdel(key, ...fields);
    }

    // ============ List Operations ============

    async lpush(key: string, ...values: any[]): Promise<number> {
        const serialized = values.map(v => 
            typeof v === 'string' ? v : JSON.stringify(v)
        );
        return this.client.lpush(key, ...serialized);
    }

    async rpush(key: string, ...values: any[]): Promise<number> {
        const serialized = values.map(v => 
            typeof v === 'string' ? v : JSON.stringify(v)
        );
        return this.client.rpush(key, ...serialized);
    }

    async lrange<T = any>(key: string, start: number, stop: number): Promise<T[]> {
        const values = await this.client.lrange(key, start, stop);
        
        return values.map(v => {
            try {
                return JSON.parse(v);
            } catch {
                return v as any;
            }
        });
    }

    // ============ Set Operations ============

    async sadd(key: string, ...members: any[]): Promise<number> {
        const serialized = members.map(m => 
            typeof m === 'string' ? m : JSON.stringify(m)
        );
        return this.client.sadd(key, ...serialized);
    }

    async smembers<T = any>(key: string): Promise<T[]> {
        const members = await this.client.smembers(key);
        
        return members.map(m => {
            try {
                return JSON.parse(m);
            } catch {
                return m as any;
            }
        });
    }

    async srem(key: string, ...members: any[]): Promise<number> {
        const serialized = members.map(m => 
            typeof m === 'string' ? m : JSON.stringify(m)
        );
        return this.client.srem(key, ...serialized);
    }

    // ============ Sorted Set Operations ============

    async zadd(key: string, score: number, member: any): Promise<number> {
        const serialized = typeof member === 'string' ? member : JSON.stringify(member);
        return this.client.zadd(key, score, serialized);
    }

    async zrange<T = any>(key: string, start: number, stop: number): Promise<T[]> {
        const members = await this.client.zrange(key, start, stop);
        
        return members.map(m => {
            try {
                return JSON.parse(m);
            } catch {
                return m as any;
            }
        });
    }

    async zrangebyscore<T = any>(key: string, min: number, max: number): Promise<T[]> {
        const members = await this.client.zrangebyscore(key, min, max);
        
        return members.map(m => {
            try {
                return JSON.parse(m);
            } catch {
                return m as any;
            }
        });
    }

    // ============ Info & Stats ============

    async info(): Promise<RedisInfo> {
        const info = await this.client.info();
        const parsed = this.parseRedisInfo(info);

        return {
            version: parsed.redis_version,
            uptime: parseInt(parsed.uptime_in_seconds) || 0,
            connected_clients: parseInt(parsed.connected_clients) || 0,
            used_memory: parseInt(parsed.used_memory) || 0,
            used_memory_human: parsed.used_memory_human,
            total_connections_received: parseInt(parsed.total_connections_received) || 0,
            total_commands_processed: parseInt(parsed.total_commands_processed) || 0,
            instantaneous_ops_per_sec: parseInt(parsed.instantaneous_ops_per_sec) || 0,
            hit_rate: this.calculateHitRate(parsed),
            db_keys: await this.dbSize()
        };
    }

    private parseRedisInfo(info: string): Record<string, string> {
        const result: Record<string, string> = {};
        const lines = info.split('\n');

        for (const line of lines) {
            if (line && !line.startsWith('#')) {
                const [key, value] = line.split(':');
                if (key && value) {
                    result[key] = value;
                }
            }
        }

        return result;
    }

    private calculateHitRate(info: Record<string, string>): number {
        const hits = parseInt(info.keyspace_hits) || 0;
        const misses = parseInt(info.keyspace_misses) || 0;
        const total = hits + misses;
        return total > 0 ? hits / total : 0;
    }

    async dbSize(): Promise<number> {
        return this.client.dbsize();
    }

    async flushDb(): Promise<void> {
        await this.client.flushdb();
    }

    // ============ Health Check ============

    async healthCheck(): Promise<boolean> {
        try {
            const result = await this.client.ping();
            return result === 'PONG';
        } catch {
            return false;
        }
    }

    // ============ Connection Management ============

    async disconnect(): Promise<void> {
        await this.client.quit();
        this.initialized = false;
        this.emit('disconnected');
    }

    isConnected(): boolean {
        return this.client.status === 'ready';
    }

    // ============ Utility ============

    generateKey(parts: string[]): string {
        return parts.join(':');
    }

    getClient(): Redis.Redis {
        return this.client;
    }
}

export interface RedisInfo {
    version: string;
    uptime: number;
    connected_clients: number;
    used_memory: number;
    used_memory_human: string;
    total_connections_received: number;
    total_commands_processed: number;
    instantaneous_ops_per_sec: number;
    hit_rate: number;
    db_keys: number;
}