import { ConnectionPool, config as SQLConfig, IResult } from 'mssql';
import { EventEmitter } from 'events';
import { SQLServerMetrics } from './sqlserver-metrics';

export interface PoolConfig {
    min: number;
    max: number;
    idleTimeout: number;
    acquireTimeout: number;
    reapInterval: number;
    createRetryInterval: number;
    validateConnection: boolean;
}

export interface PoolStats {
    total: number;
    active: number;
    idle: number;
    waiting: number;
    hitRate: number;
    missRate: number;
    averageAcquireTime: number;
    averageIdleTime: number;
}

export class SQLServerPoolManager extends EventEmitter {
    private pools: Map<string, ConnectionPool> = new Map();
    private poolConfigs: Map<string, PoolConfig> = new Map();
    private poolMetrics: Map<string, SQLServerMetrics> = new Map();
    private poolStats: Map<string, PoolStats> = new Map();
    private reapTimer: NodeJS.Timeout | null = null;
    private defaultConfig: PoolConfig = {
        min: 0,
        max: 10,
        idleTimeout: 30000,
        acquireTimeout: 15000,
        reapInterval: 60000,
        createRetryInterval: 500,
        validateConnection: true
    };

    constructor() {
        super();
        this.startReaper();
    }

    // ============ Pool Management ============

    async createPool(name: string, config: SQLConfig, poolConfig?: Partial<PoolConfig>): Promise<ConnectionPool> {
        if (this.pools.has(name)) {
            return this.pools.get(name)!;
        }

        const finalPoolConfig = {
            ...this.defaultConfig,
            ...poolConfig
        };

        const pool = new ConnectionPool({
            ...config,
            pool: {
                max: finalPoolConfig.max,
                min: finalPoolConfig.min,
                idleTimeoutMillis: finalPoolConfig.idleTimeout,
                acquireTimeoutMillis: finalPoolConfig.acquireTimeout,
                createRetryIntervalMillis: finalPoolConfig.createRetryInterval
            }
        });

        pool.on('error', (err) => {
            this.emit('poolError', { name, error: err });
            this.updatePoolMetrics(name, { errors: 1 });
        });

        pool.on('acquire', () => {
            this.updatePoolStats(name, { type: 'acquire' });
        });

        pool.on('release', () => {
            this.updatePoolStats(name, { type: 'release' });
        });

        await pool.connect();
        
        this.pools.set(name, pool);
        this.poolConfigs.set(name, finalPoolConfig as PoolConfig);
        this.initializeMetrics(name);
        this.initializeStats(name);

        this.emit('poolCreated', { name, config: finalPoolConfig });

        return pool;
    }

    async getPool(name: string): Promise<ConnectionPool> {
        const pool = this.pools.get(name);
        if (!pool) {
            throw new Error(`Pool not found: ${name}`);
        }
        return pool;
    }

    async closePool(name: string): Promise<void> {
        const pool = this.pools.get(name);
        if (pool) {
            await pool.close();
            this.pools.delete(name);
            this.poolConfigs.delete(name);
            this.poolMetrics.delete(name);
            this.poolStats.delete(name);
            this.emit('poolClosed', { name });
        }
    }

    async closeAllPools(): Promise<void> {
        const closePromises = Array.from(this.pools.keys()).map(name => this.closePool(name));
        await Promise.all(closePromises);
        
        if (this.reapTimer) {
            clearInterval(this.reapTimer);
            this.reapTimer = null;
        }
    }

    // ============ Pool Configuration ============

    updatePoolConfig(name: string, config: Partial<PoolConfig>): void {
        const currentConfig = this.poolConfigs.get(name);
        if (currentConfig) {
            const newConfig = { ...currentConfig, ...config };
            this.poolConfigs.set(name, newConfig);
            
            // Update pool settings
            const pool = this.pools.get(name);
            if (pool) {
                // MSSQL doesn't support dynamic pool reconfiguration
                // Need to recreate pool with new settings
                this.recreatePool(name, newConfig).catch(err => {
                    this.emit('poolRecreateError', { name, error: err });
                });
            }
        }
    }

    private async recreatePool(name: string, config: PoolConfig): Promise<void> {
        const oldPool = this.pools.get(name);
        if (oldPool) {
            const oldConfig = oldPool.config;
            await this.closePool(name);
            await this.createPool(name, oldConfig, config);
        }
    }

    // ============ Pool Statistics ============

    private initializeMetrics(name: string): void {
        this.poolMetrics.set(name, new SQLServerMetrics());
    }

    private initializeStats(name: string): void {
        this.poolStats.set(name, {
            total: 0,
            active: 0,
            idle: 0,
            waiting: 0,
            hitRate: 0,
            missRate: 0,
            averageAcquireTime: 0,
            averageIdleTime: 0
        });
    }

    private updatePoolMetrics(name: string, update: Partial<SQLServerMetrics>): void {
        const metrics = this.poolMetrics.get(name);
        if (metrics) {
            Object.assign(metrics, update);
        }
    }

    private updatePoolStats(name: string, event: { type: 'acquire' | 'release' }): void {
        const stats = this.poolStats.get(name);
        if (!stats) return;

        if (event.type === 'acquire') {
            stats.active++;
            stats.idle--;
        } else {
            stats.active--;
            stats.idle++;
        }

        stats.total = stats.active + stats.idle;
    }

    async getPoolStats(name: string): Promise<PoolStats> {
        const pool = this.pools.get(name);
        const stats = this.poolStats.get(name);
        const metrics = this.poolMetrics.get(name);
        const config = this.poolConfigs.get(name);

        if (!pool || !stats || !metrics || !config) {
            throw new Error(`Pool not found: ${name}`);
        }

        // Update dynamic stats
        stats.waiting = pool.waitingCount;
        stats.idle = pool.size - pool.borrowed;
        stats.active = pool.borrowed;
        stats.total = pool.size;

        // Calculate hit/miss rates
        const totalRequests = metrics.connectionAcquires || 0;
        stats.hitRate = totalRequests > 0 ? (metrics.connectionHits || 0) / totalRequests : 0;
        stats.missRate = totalRequests > 0 ? (metrics.connectionMisses || 0) / totalRequests : 0;

        // Calculate average times
        stats.averageAcquireTime = metrics.averageAcquireTime || 0;
        stats.averageIdleTime = metrics.averageIdleTime || 0;

        return { ...stats };
    }

    getAllPoolStats(): Record<string, PoolStats> {
        const stats: Record<string, PoolStats> = {};
        for (const name of this.pools.keys()) {
            try {
                stats[name] = this.getPoolStats(name);
            } catch {
                // Skip pools that can't get stats
            }
        }
        return stats;
    }

    // ============ Connection Pool Reaping ============

    private startReaper(): void {
        this.reapTimer = setInterval(() => {
            this.reapIdleConnections();
        }, this.defaultConfig.reapInterval);
    }

    private async reapIdleConnections(): Promise<void> {
        for (const [name, pool] of this.pools) {
            const config = this.poolConfigs.get(name);
            if (!config) continue;

            try {
                const idleCount = pool.size - pool.borrowed;
                const minIdle = config.min;
                
                if (idleCount > minIdle) {
                    const toRemove = idleCount - minIdle;
                    await this.shrinkPool(name, toRemove);
                }
            } catch (error) {
                this.emit('reapError', { name, error });
            }
        }
    }

    private async shrinkPool(name: string, count: number): Promise<void> {
        // MSSQL driver doesn't support direct connection removal
        // Will close entire pool and recreate if necessary
        const pool = this.pools.get(name);
        const config = this.poolConfigs.get(name);
        const poolConfig = pool?.config;

        if (pool && config && poolConfig) {
            const idleCount = pool.size - pool.borrowed;
            if (idleCount >= count) {
                // Recreate pool with smaller min size
                await this.recreatePool(name, { ...config, min: Math.max(0, config.min - count) });
            }
        }
    }

    // ============ Connection Validation ============

    async validatePool(name: string): Promise<boolean> {
        const pool = this.pools.get(name);
        const config = this.poolConfigs.get(name);

        if (!pool || !config?.validateConnection) {
            return true;
        }

        try {
            const request = pool.request();
            await request.query('SELECT 1');
            return true;
        } catch {
            return false;
        }
    }

    async validateAllPools(): Promise<Map<string, boolean>> {
        const results = new Map<string, boolean>();
        
        for (const name of this.pools.keys()) {
            const isValid = await this.validatePool(name);
            results.set(name, isValid);
        }

        return results;
    }

    // ============ Pool Metrics ============

    getPoolMetrics(name: string): SQLServerMetrics {
        const metrics = this.poolMetrics.get(name);
        if (!metrics) {
            throw new Error(`Pool not found: ${name}`);
        }
        return metrics.clone();
    }

    getAllPoolMetrics(): Record<string, SQLServerMetrics> {
        const metrics: Record<string, SQLServerMetrics> = {};
        for (const [name, poolMetrics] of this.poolMetrics) {
            metrics[name] = poolMetrics.clone();
        }
        return metrics;
    }

    // ============ Utility Methods ============

    async executeOnPool<T>(name: string, callback: (pool: ConnectionPool) => Promise<T>): Promise<T> {
        const pool = await this.getPool(name);
        const startTime = Date.now();

        try {
            const result = await callback(pool);
            
            const metrics = this.poolMetrics.get(name);
            if (metrics) {
                metrics.connectionAcquires++;
                metrics.totalAcquireTime += Date.now() - startTime;
                metrics.averageAcquireTime = metrics.totalAcquireTime / metrics.connectionAcquires;
            }

            return result;
        } catch (error) {
            const metrics = this.poolMetrics.get(name);
            if (metrics) {
                metrics.connectionErrors++;
            }
            throw error;
        }
    }

    poolExists(name: string): boolean {
        return this.pools.has(name);
    }

    getPoolNames(): string[] {
        return Array.from(this.pools.keys());
    }

    getPoolCount(): number {
        return this.pools.size;
    }

    // ============ Cleanup ============

    async destroy(): Promise<void> {
        await this.closeAllPools();
        this.pools.clear();
        this.poolConfigs.clear();
        this.poolMetrics.clear();
        this.poolStats.clear();
    }
}

export class SQLServerPool {
    private static instance: SQLServerPoolManager;
    
    static getInstance(): SQLServerPoolManager {
        if (!SQLServerPool.instance) {
            SQLServerPool.instance = new SQLServerPoolManager();
        }
        return SQLServerPool.instance;
    }
}