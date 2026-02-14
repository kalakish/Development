"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RedisCache = void 0;
const ioredis_1 = __importDefault(require("ioredis"));
const events_1 = require("events");
class RedisCache extends events_1.EventEmitter {
    client;
    config;
    initialized = false;
    defaultTTL = 3600;
    constructor(config) {
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
    async initialize() {
        if (this.initialized)
            return;
        this.client = new ioredis_1.default({
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
        await new Promise((resolve, reject) => {
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
    async get(key) {
        const value = await this.client.get(key);
        if (!value) {
            return null;
        }
        try {
            return JSON.parse(value);
        }
        catch {
            return value;
        }
    }
    async set(key, value, options) {
        const serialized = typeof value === 'string' ? value : JSON.stringify(value);
        const ttl = options?.ttl || this.defaultTTL;
        if (ttl > 0) {
            await this.client.setex(key, ttl, serialized);
        }
        else {
            await this.client.set(key, serialized);
        }
        // Store tags
        if (options?.tags && options.tags.length > 0) {
            await this.addTags(key, options.tags);
        }
    }
    async delete(key) {
        const result = await this.client.del(key);
        return result > 0;
    }
    async has(key) {
        const exists = await this.client.exists(key);
        return exists === 1;
    }
    async clear() {
        const keys = await this.client.keys(`${this.config.keyPrefix}*`);
        if (keys.length > 0) {
            await this.client.del(...keys);
        }
    }
    // ============ Batch Operations ============
    async getMany(keys) {
        if (keys.length === 0)
            return [];
        const values = await this.client.mget(...keys);
        return values.map(value => {
            if (!value)
                return null;
            try {
                return JSON.parse(value);
            }
            catch {
                return value;
            }
        });
    }
    async setMany(entries) {
        const pipeline = this.client.pipeline();
        for (const { key, value, options } of entries) {
            const serialized = typeof value === 'string' ? value : JSON.stringify(value);
            const ttl = options?.ttl || this.defaultTTL;
            if (ttl > 0) {
                pipeline.setex(key, ttl, serialized);
            }
            else {
                pipeline.set(key, serialized);
            }
            if (options?.tags && options.tags.length > 0) {
                await this.addTags(key, options.tags);
            }
        }
        await pipeline.exec();
    }
    async deleteMany(keys) {
        if (keys.length === 0)
            return 0;
        const result = await this.client.del(...keys);
        return result;
    }
    // ============ Tag Operations ============
    async addTags(key, tags) {
        const pipeline = this.client.pipeline();
        for (const tag of tags) {
            pipeline.sadd(`tag:${tag}`, key);
            pipeline.expire(`tag:${tag}`, this.defaultTTL);
        }
        pipeline.sadd(`keys:${key}:tags`, ...tags);
        pipeline.expire(`keys:${key}:tags`, this.defaultTTL);
        await pipeline.exec();
    }
    async getByTag(tag) {
        return this.client.smembers(`tag:${tag}`);
    }
    async invalidateTag(tag) {
        const keys = await this.getByTag(tag);
        if (keys.length > 0) {
            await this.deleteMany(keys);
            await this.client.del(`tag:${tag}`);
        }
        return keys.length;
    }
    async getTags(key) {
        return this.client.smembers(`keys:${key}:tags`);
    }
    // ============ Pattern Operations ============
    async keys(pattern = '*') {
        const fullPattern = `${this.config.keyPrefix}${pattern}`;
        return this.client.keys(fullPattern);
    }
    async deletePattern(pattern) {
        const keys = await this.keys(pattern);
        if (keys.length > 0) {
            await this.client.del(...keys);
        }
        return keys.length;
    }
    // ============ TTL Operations ============
    async expire(key, seconds) {
        const result = await this.client.expire(key, seconds);
        return result === 1;
    }
    async ttl(key) {
        return this.client.ttl(key);
    }
    async persist(key) {
        const result = await this.client.persist(key);
        return result === 1;
    }
    // ============ Atomic Operations ============
    async increment(key, by = 1) {
        return this.client.incrby(key, by);
    }
    async decrement(key, by = 1) {
        return this.client.decrby(key, by);
    }
    // ============ Hash Operations ============
    async hget(key, field) {
        const value = await this.client.hget(key, field);
        if (!value) {
            return null;
        }
        try {
            return JSON.parse(value);
        }
        catch {
            return value;
        }
    }
    async hset(key, field, value) {
        const serialized = typeof value === 'string' ? value : JSON.stringify(value);
        return this.client.hset(key, field, serialized);
    }
    async hgetall(key) {
        const values = await this.client.hgetall(key);
        if (Object.keys(values).length === 0) {
            return null;
        }
        const result = {};
        for (const [field, value] of Object.entries(values)) {
            try {
                result[field] = JSON.parse(value);
            }
            catch {
                result[field] = value;
            }
        }
        return result;
    }
    async hdel(key, ...fields) {
        return this.client.hdel(key, ...fields);
    }
    // ============ List Operations ============
    async lpush(key, ...values) {
        const serialized = values.map(v => typeof v === 'string' ? v : JSON.stringify(v));
        return this.client.lpush(key, ...serialized);
    }
    async rpush(key, ...values) {
        const serialized = values.map(v => typeof v === 'string' ? v : JSON.stringify(v));
        return this.client.rpush(key, ...serialized);
    }
    async lrange(key, start, stop) {
        const values = await this.client.lrange(key, start, stop);
        return values.map(v => {
            try {
                return JSON.parse(v);
            }
            catch {
                return v;
            }
        });
    }
    // ============ Set Operations ============
    async sadd(key, ...members) {
        const serialized = members.map(m => typeof m === 'string' ? m : JSON.stringify(m));
        return this.client.sadd(key, ...serialized);
    }
    async smembers(key) {
        const members = await this.client.smembers(key);
        return members.map(m => {
            try {
                return JSON.parse(m);
            }
            catch {
                return m;
            }
        });
    }
    async srem(key, ...members) {
        const serialized = members.map(m => typeof m === 'string' ? m : JSON.stringify(m));
        return this.client.srem(key, ...serialized);
    }
    // ============ Sorted Set Operations ============
    async zadd(key, score, member) {
        const serialized = typeof member === 'string' ? member : JSON.stringify(member);
        return this.client.zadd(key, score, serialized);
    }
    async zrange(key, start, stop) {
        const members = await this.client.zrange(key, start, stop);
        return members.map(m => {
            try {
                return JSON.parse(m);
            }
            catch {
                return m;
            }
        });
    }
    async zrangebyscore(key, min, max) {
        const members = await this.client.zrangebyscore(key, min, max);
        return members.map(m => {
            try {
                return JSON.parse(m);
            }
            catch {
                return m;
            }
        });
    }
    // ============ Info & Stats ============
    async info() {
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
    parseRedisInfo(info) {
        const result = {};
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
    calculateHitRate(info) {
        const hits = parseInt(info.keyspace_hits) || 0;
        const misses = parseInt(info.keyspace_misses) || 0;
        const total = hits + misses;
        return total > 0 ? hits / total : 0;
    }
    async dbSize() {
        return this.client.dbsize();
    }
    async flushDb() {
        await this.client.flushdb();
    }
    // ============ Health Check ============
    async healthCheck() {
        try {
            const result = await this.client.ping();
            return result === 'PONG';
        }
        catch {
            return false;
        }
    }
    // ============ Connection Management ============
    async disconnect() {
        await this.client.quit();
        this.initialized = false;
        this.emit('disconnected');
    }
    isConnected() {
        return this.client.status === 'ready';
    }
    // ============ Utility ============
    generateKey(parts) {
        return parts.join(':');
    }
    getClient() {
        return this.client;
    }
}
exports.RedisCache = RedisCache;
//# sourceMappingURL=redis-cache.js.map