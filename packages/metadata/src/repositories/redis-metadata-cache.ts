import Redis from 'ioredis';
import { ObjectMetadata, ObjectType } from '../models/object-metadata';

export class RedisMetadataCache {
    private redis: Redis;
    private defaultTTL: number = 3600; // 1 hour
    private prefix: string = 'nova:metadata:';

    constructor(redisUrl?: string, options?: RedisCacheOptions) {
        this.redis = redisUrl ? new Redis(redisUrl) : new Redis({
            host: process.env.REDIS_HOST || 'localhost',
            port: parseInt(process.env.REDIS_PORT || '6379')
        });
        
        this.defaultTTL = options?.defaultTTL || 3600;
        this.prefix = options?.prefix || 'nova:metadata:';
    }

    // ============ Object Caching ============

    async cacheObject<T extends ObjectMetadata>(metadata: T, ttl?: number): Promise<void> {
        const key = this.getObjectKey(metadata.objectType, metadata.id);
        const value = JSON.stringify(metadata);
        
        await this.redis.setex(key, ttl || this.defaultTTL, value);
        
        // Cache by name as well
        const nameKey = this.getObjectNameKey(metadata.objectType, metadata.name);
        await this.redis.setex(nameKey, ttl || this.defaultTTL, value);
    }

    async getCachedObject<T extends ObjectMetadata>(
        objectType: ObjectType,
        objectId: number
    ): Promise<T | null> {
        const key = this.getObjectKey(objectType, objectId);
        const value = await this.redis.get(key);
        
        if (value) {
            return JSON.parse(value) as T;
        }
        
        return null;
    }

    async getCachedObjectByName<T extends ObjectMetadata>(
        objectType: ObjectType,
        name: string
    ): Promise<T | null> {
        const key = this.getObjectNameKey(objectType, name);
        const value = await this.redis.get(key);
        
        if (value) {
            return JSON.parse(value) as T;
        }
        
        return null;
    }

    async invalidateObject(objectType: ObjectType, objectId: number): Promise<void> {
        const key = this.getObjectKey(objectType, objectId);
        const cached = await this.getCachedObject(objectType, objectId);
        
        if (cached) {
            const nameKey = this.getObjectNameKey(objectType, cached.name);
            await this.redis.del(key, nameKey);
        } else {
            await this.redis.del(key);
        }
    }

    async invalidateObjectByName(objectType: ObjectType, name: string): Promise<void> {
        const key = this.getObjectNameKey(objectType, name);
        const cached = await this.getCachedObjectByName(objectType, name);
        
        if (cached) {
            const idKey = this.getObjectKey(objectType, cached.id);
            await this.redis.del(key, idKey);
        } else {
            await this.redis.del(key);
        }
    }

    // ============ Collection Caching ============

    async cacheObjectsByType(objectType: ObjectType, objects: ObjectMetadata[], ttl?: number): Promise<void> {
        const key = this.getCollectionKey(objectType);
        const value = JSON.stringify(objects);
        
        await this.redis.setex(key, ttl || this.defaultTTL, value);
    }

    async getCachedObjectsByType(objectType: ObjectType): Promise<ObjectMetadata[] | null> {
        const key = this.getCollectionKey(objectType);
        const value = await this.redis.get(key);
        
        if (value) {
            return JSON.parse(value) as ObjectMetadata[];
        }
        
        return null;
    }

    async invalidateObjectsByType(objectType: ObjectType): Promise<void> {
        const key = this.getCollectionKey(objectType);
        await this.redis.del(key);
    }

    // ============ Dependency Caching ============

    async cacheDependencies(
        objectType: ObjectType,
        objectId: number,
        dependencies: any[],
        ttl?: number
    ): Promise<void> {
        const key = this.getDependencyKey(objectType, objectId);
        const value = JSON.stringify(dependencies);
        
        await this.redis.setex(key, ttl || this.defaultTTL, value);
    }

    async getCachedDependencies(
        objectType: ObjectType,
        objectId: number
    ): Promise<any[] | null> {
        const key = this.getDependencyKey(objectType, objectId);
        const value = await this.redis.get(key);
        
        if (value) {
            return JSON.parse(value);
        }
        
        return null;
    }

    async invalidateDependencies(objectType: ObjectType, objectId: number): Promise<void> {
        const key = this.getDependencyKey(objectType, objectId);
        await this.redis.del(key);
    }

    // ============ Extension Caching ============

    async cacheExtension(extensionId: string, metadata: any, ttl?: number): Promise<void> {
        const key = this.getExtensionKey(extensionId);
        const value = JSON.stringify(metadata);
        
        await this.redis.setex(key, ttl || this.defaultTTL, value);
    }

    async getCachedExtension(extensionId: string): Promise<any | null> {
        const key = this.getExtensionKey(extensionId);
        const value = await this.redis.get(key);
        
        if (value) {
            return JSON.parse(value);
        }
        
        return null;
    }

    async invalidateExtension(extensionId: string): Promise<void> {
        const key = this.getExtensionKey(extensionId);
        await this.redis.del(key);
    }

    async cacheExtensions(extensions: any[], ttl?: number): Promise<void> {
        const key = this.getExtensionsKey();
        const value = JSON.stringify(extensions);
        
        await this.redis.setex(key, ttl || this.defaultTTL, value);
    }

    async getCachedExtensions(): Promise<any[] | null> {
        const key = this.getExtensionsKey();
        const value = await this.redis.get(key);
        
        if (value) {
            return JSON.parse(value);
        }
        
        return null;
    }

    async invalidateExtensions(): Promise<void> {
        const key = this.getExtensionsKey();
        await this.redis.del(key);
    }

    // ============ Version Caching ============

    async cacheObjectVersions(
        objectType: ObjectType,
        objectId: number,
        versions: any[],
        ttl?: number
    ): Promise<void> {
        const key = this.getVersionsKey(objectType, objectId);
        const value = JSON.stringify(versions);
        
        await this.redis.setex(key, ttl || this.defaultTTL, value);
    }

    async getCachedObjectVersions(
        objectType: ObjectType,
        objectId: number
    ): Promise<any[] | null> {
        const key = this.getVersionsKey(objectType, objectId);
        const value = await this.redis.get(key);
        
        if (value) {
            return JSON.parse(value);
        }
        
        return null;
    }

    async invalidateObjectVersions(objectType: ObjectType, objectId: number): Promise<void> {
        const key = this.getVersionsKey(objectType, objectId);
        await this.redis.del(key);
    }

    // ============ Key Generation ============

    private getObjectKey(objectType: ObjectType, objectId: number): string {
        return `${this.prefix}obj:${objectType}:${objectId}`;
    }

    private getObjectNameKey(objectType: ObjectType, name: string): string {
        return `${this.prefix}name:${objectType}:${name}`;
    }

    private getCollectionKey(objectType: ObjectType): string {
        return `${this.prefix}collection:${objectType}`;
    }

    private getDependencyKey(objectType: ObjectType, objectId: number): string {
        return `${this.prefix}dep:${objectType}:${objectId}`;
    }

    private getExtensionKey(extensionId: string): string {
        return `${this.prefix}ext:${extensionId}`;
    }

    private getExtensionsKey(): string {
        return `${this.prefix}extensions`;
    }

    private getVersionsKey(objectType: ObjectType, objectId: number): string {
        return `${this.prefix}ver:${objectType}:${objectId}`;
    }

    // ============ Cache Management ============

    async clear(): Promise<void> {
        const keys = await this.redis.keys(`${this.prefix}*`);
        if (keys.length > 0) {
            await this.redis.del(...keys);
        }
    }

    async clearByPattern(pattern: string): Promise<void> {
        const keys = await this.redis.keys(`${this.prefix}${pattern}`);
        if (keys.length > 0) {
            await this.redis.del(...keys);
        }
    }

    async getStats(): Promise<CacheStats> {
        const keys = await this.redis.keys(`${this.prefix}*`);
        
        return {
            totalKeys: keys.length,
            memory: await this.redis.info('memory').then(info => {
                const match = info.match(/used_memory_human:(\S+)/);
                return match ? match[1] : '0B';
            }),
            uptime: await this.redis.info('server').then(info => {
                const match = info.match(/uptime_in_seconds:(\d+)/);
                return match ? parseInt(match[1]) : 0;
            })
        };
    }

    async disconnect(): Promise<void> {
        await this.redis.quit();
    }
}

export interface RedisCacheOptions {
    defaultTTL?: number;
    prefix?: string;
    url?: string;
}

export interface CacheStats {
    totalKeys: number;
    memory: string;
    uptime: number;
}