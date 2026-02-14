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
export declare class RedisCache extends EventEmitter {
    private client;
    private config;
    private initialized;
    private defaultTTL;
    constructor(config?: Partial<RedisConfig>);
    initialize(): Promise<void>;
    get<T = any>(key: string): Promise<T | null>;
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
    private addTags;
    getByTag(tag: string): Promise<string[]>;
    invalidateTag(tag: string): Promise<number>;
    getTags(key: string): Promise<string[]>;
    keys(pattern?: string): Promise<string[]>;
    deletePattern(pattern: string): Promise<number>;
    expire(key: string, seconds: number): Promise<boolean>;
    ttl(key: string): Promise<number>;
    persist(key: string): Promise<boolean>;
    increment(key: string, by?: number): Promise<number>;
    decrement(key: string, by?: number): Promise<number>;
    hget<T = any>(key: string, field: string): Promise<T | null>;
    hset<T = any>(key: string, field: string, value: T): Promise<number>;
    hgetall<T = any>(key: string): Promise<Record<string, T> | null>;
    hdel(key: string, ...fields: string[]): Promise<number>;
    lpush(key: string, ...values: any[]): Promise<number>;
    rpush(key: string, ...values: any[]): Promise<number>;
    lrange<T = any>(key: string, start: number, stop: number): Promise<T[]>;
    sadd(key: string, ...members: any[]): Promise<number>;
    smembers<T = any>(key: string): Promise<T[]>;
    srem(key: string, ...members: any[]): Promise<number>;
    zadd(key: string, score: number, member: any): Promise<number>;
    zrange<T = any>(key: string, start: number, stop: number): Promise<T[]>;
    zrangebyscore<T = any>(key: string, min: number, max: number): Promise<T[]>;
    info(): Promise<RedisInfo>;
    private parseRedisInfo;
    private calculateHitRate;
    dbSize(): Promise<number>;
    flushDb(): Promise<void>;
    healthCheck(): Promise<boolean>;
    disconnect(): Promise<void>;
    isConnected(): boolean;
    generateKey(parts: string[]): string;
    getClient(): Redis.Redis;
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
//# sourceMappingURL=redis-cache.d.ts.map