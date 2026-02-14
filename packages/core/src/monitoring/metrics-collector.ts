import { EventEmitter } from 'events';
import { SQLServerMetrics } from '../database/sqlserver-metrics';
import { SQLServerPoolManager } from '../database/sqlserver-pool';
import { SQLServerConnection } from '../database/sqlserver-connection';
import { CacheManager } from '../cache/cache-manager';
import { EventDispatcher } from '../events/event-dispatcher';

export interface MetricPoint {
    timestamp: Date;
    value: number;
    labels?: Record<string, string>;
}

export interface MetricSeries {
    name: string;
    points: MetricPoint[];
    unit?: string;
    description?: string;
}

export interface MetricsCollectorOptions {
    interval?: number;
    retention?: number;
    maxPoints?: number;
    enableDatabase?: boolean;
    enableCache?: boolean;
    enableEvent?: boolean;
}

export class MetricsCollector extends EventEmitter {
    private metrics: Map<string, MetricSeries> = new Map();
    private collectors: Map<string, () => Promise<any>> = new Map();
    private interval: NodeJS.Timeout | null = null;
    private options: MetricsCollectorOptions;
    private poolManager?: SQLServerPoolManager;
    private connection?: SQLServerConnection;
    private cacheManager?: CacheManager;
    private eventDispatcher?: EventDispatcher;

    constructor(options: MetricsCollectorOptions = {}) {
        super();
        this.options = {
            interval: options.interval || 60000, // 1 minute
            retention: options.retention || 3600000, // 1 hour
            maxPoints: options.maxPoints || 1000,
            enableDatabase: options.enableDatabase !== false,
            enableCache: options.enableCache !== false,
            enableEvent: options.enableEvent !== false
        };
    }

    initialize(
        poolManager?: SQLServerPoolManager,
        connection?: SQLServerConnection,
        cacheManager?: CacheManager,
        eventDispatcher?: EventDispatcher
    ): void {
        this.poolManager = poolManager;
        this.connection = connection;
        this.cacheManager = cacheManager;
        this.eventDispatcher = eventDispatcher;

        this.registerDefaultCollectors();

        if (this.options.enableDatabase) {
            this.registerDatabaseCollectors();
        }

        if (this.options.enableCache && this.cacheManager) {
            this.registerCacheCollectors();
        }

        if (this.options.enableEvent && this.eventDispatcher) {
            this.registerEventCollectors();
        }

        this.startCollection();
        this.emit('initialized');
    }

    // ============ Collector Registration ============

    registerCollector(name: string, collector: () => Promise<any>, interval?: number): void {
        this.collectors.set(name, collector);
        this.emit('collectorRegistered', { name, interval });
    }

    unregisterCollector(name: string): void {
        this.collectors.delete(name);
        this.metrics.delete(name);
        this.emit('collectorUnregistered', { name });
    }

    private registerDefaultCollectors(): void {
        // System metrics
        this.registerCollector('system.cpu', async () => {
            return process.cpuUsage();
        });

        this.registerCollector('system.memory', async () => {
            return process.memoryUsage();
        });

        this.registerCollector('system.uptime', async () => {
            return process.uptime();
        });

        this.registerCollector('system.handles', async () => {
            return process.resourceUsage();
        });

        // Event loop metrics
        this.registerCollector('eventloop.lag', async () => {
            const start = Date.now();
            await new Promise(resolve => setImmediate(resolve));
            return Date.now() - start;
        });
    }

    private registerDatabaseCollectors(): void {
        if (this.poolManager) {
            this.registerCollector('database.pool.stats', async () => {
                const stats: Record<string, any> = {};
                const poolNames = this.poolManager!.getPoolNames();

                for (const name of poolNames) {
                    try {
                        stats[name] = await this.poolManager!.getPoolStats(name);
                    } catch (error) {
                        stats[name] = { error: error.message };
                    }
                }

                return stats;
            });

            this.registerCollector('database.pool.metrics', async () => {
                const metrics: Record<string, any> = {};
                const poolNames = this.poolManager!.getPoolNames();

                for (const name of poolNames) {
                    try {
                        const poolMetrics = this.poolManager!.getPoolMetrics(name);
                        metrics[name] = poolMetrics.toJSON();
                    } catch (error) {
                        metrics[name] = { error: error.message };
                    }
                }

                return metrics;
            });
        }

        if (this.connection) {
            this.registerCollector('database.connection.health', async () => {
                try {
                    const start = Date.now();
                    await this.connection!.query('SELECT 1');
                    return {
                        status: 'healthy',
                        latency: Date.now() - start
                    };
                } catch (error) {
                    return {
                        status: 'unhealthy',
                        error: error.message
                    };
                }
            });
        }
    }

    private registerCacheCollectors(): void {
        if (!this.cacheManager) return;

        this.registerCollector('cache.stats', async () => {
            const stats = await this.cacheManager!.getStats();
            const result: Record<string, any> = {};

            for (const [source, sourceStats] of stats) {
                result[source] = sourceStats;
            }

            return result;
        });

        this.registerCollector('cache.health', async () => {
            return this.cacheManager!.healthCheck();
        });
    }

    private registerEventCollectors(): void {
        if (!this.eventDispatcher) return;

        this.registerCollector('events.stats', async () => {
            // This would collect event dispatcher stats
            return {
                timestamp: new Date()
            };
        });
    }

    // ============ Collection Management ============

    startCollection(): void {
        if (this.interval) {
            clearInterval(this.interval);
        }

        this.interval = setInterval(async () => {
            await this.collectAll();
        }, this.options.interval);

        // Immediate first collection
        setImmediate(() => this.collectAll());
    }

    stopCollection(): void {
        if (this.interval) {
            clearInterval(this.interval);
            this.interval = null;
        }
    }

    async collectAll(): Promise<void> {
        const timestamp = new Date();

        for (const [name, collector] of this.collectors) {
            try {
                const value = await collector();
                await this.recordMetric(name, value, timestamp);
            } catch (error) {
                this.emit('collectorError', { name, error: error.message });
            }
        }

        this.emit('collectionCompleted', { timestamp });
    }

    async collect(name: string): Promise<void> {
        const collector = this.collectors.get(name);
        
        if (!collector) {
            throw new Error(`Collector not found: ${name}`);
        }

        try {
            const value = await collector();
            await this.recordMetric(name, value, new Date());
        } catch (error) {
            this.emit('collectorError', { name, error: error.message });
            throw error;
        }
    }

    // ============ Metric Recording ============

    private async recordMetric(name: string, value: any, timestamp: Date): Promise<void> {
        if (!this.metrics.has(name)) {
            this.metrics.set(name, {
                name,
                points: [],
                unit: this.inferUnit(name),
                description: this.inferDescription(name)
            });
        }

        const series = this.metrics.get(name)!;

        // Flatten object values into separate metrics
        if (value && typeof value === 'object') {
            for (const [key, val] of Object.entries(value)) {
                if (typeof val === 'number') {
                    const subName = `${name}.${key}`;
                    await this.recordMetric(subName, val, timestamp);
                }
            }
        } else if (typeof value === 'number') {
            series.points.push({
                timestamp,
                value
            });

            // Enforce retention policy
            this.enforceRetention(series);
        }
    }

    private enforceRetention(series: MetricSeries): void {
        const cutoff = Date.now() - this.options.retention;
        series.points = series.points.filter(p => p.timestamp.getTime() > cutoff);

        if (series.points.length > this.options.maxPoints) {
            series.points = series.points.slice(-this.options.maxPoints);
        }
    }

    // ============ Metric Queries ============

    getMetric(name: string, duration?: number): MetricSeries | undefined {
        const series = this.metrics.get(name);
        
        if (!series) {
            return undefined;
        }

        if (duration) {
            const cutoff = Date.now() - duration;
            const filteredPoints = series.points.filter(p => 
                p.timestamp.getTime() > cutoff
            );

            return {
                ...series,
                points: filteredPoints
            };
        }

        return { ...series };
    }

    getAllMetrics(): MetricSeries[] {
        return Array.from(this.metrics.values()).map(series => ({
            ...series,
            points: [...series.points]
        }));
    }

    queryMetrics(options: MetricQuery): MetricSeries[] {
        let series = Array.from(this.metrics.values());

        // Filter by name pattern
        if (options.namePattern) {
            const regex = new RegExp(options.namePattern);
            series = series.filter(s => regex.test(s.name));
        }

        // Filter by time range
        if (options.from || options.to) {
            series = series.map(s => ({
                ...s,
                points: s.points.filter(p => {
                    if (options.from && p.timestamp < options.from) return false;
                    if (options.to && p.timestamp > options.to) return false;
                    return true;
                })
            })).filter(s => s.points.length > 0);
        }

        // Apply limit
        if (options.limit) {
            series = series.slice(0, options.limit);
        }

        return series;
    }

    // ============ Aggregations ============

    getAggregatedMetric(name: string, window: number, fn: 'avg' | 'sum' | 'min' | 'max' = 'avg'): number | null {
        const series = this.metrics.get(name);
        
        if (!series || series.points.length === 0) {
            return null;
        }

        const cutoff = Date.now() - window;
        const recentPoints = series.points.filter(p => p.timestamp.getTime() > cutoff);
        
        if (recentPoints.length === 0) {
            return null;
        }

        const values = recentPoints.map(p => p.value);

        switch (fn) {
            case 'sum':
                return values.reduce((a, b) => a + b, 0);
            case 'avg':
                return values.reduce((a, b) => a + b, 0) / values.length;
            case 'min':
                return Math.min(...values);
            case 'max':
                return Math.max(...values);
        }
    }

    // ============ Statistics ============

    getStats(): MetricsStats {
        return {
            totalMetrics: this.metrics.size,
            totalCollectors: this.collectors.size,
            totalPoints: Array.from(this.metrics.values())
                .reduce((sum, s) => sum + s.points.length, 0),
            collectionInterval: this.options.interval,
            retentionPeriod: this.options.retention,
            maxPointsPerMetric: this.options.maxPoints,
            isRunning: this.interval !== null
        };
    }

    // ============ Cleanup ============

    async cleanup(): Promise<void> {
        this.stopCollection();
        this.metrics.clear();
        this.collectors.clear();
        this.emit('cleaned');
    }

    // ============ Utility ============

    private inferUnit(name: string): string | undefined {
        if (name.includes('cpu')) return 'percent';
        if (name.includes('memory')) return 'bytes';
        if (name.includes('time') || name.includes('latency')) return 'ms';
        if (name.includes('size')) return 'bytes';
        if (name.includes('count')) return 'count';
        if (name.includes('rate')) return 'percent';
        return undefined;
    }

    private inferDescription(name: string): string | undefined {
        const descriptions: Record<string, string> = {
            'system.cpu': 'CPU usage',
            'system.memory': 'Memory usage',
            'system.uptime': 'System uptime',
            'eventloop.lag': 'Event loop lag',
            'database.pool.stats': 'Database connection pool statistics',
            'database.connection.health': 'Database connection health',
            'cache.stats': 'Cache statistics',
            'cache.health': 'Cache health'
        };

        return descriptions[name] || `Metric: ${name}`;
    }

    // ============ Export/Import ============

    async exportMetrics(): Promise<Buffer> {
        const data = {
            options: this.options,
            metrics: Array.from(this.metrics.entries()).map(([name, series]) => ({
                name,
                points: series.points,
                unit: series.unit,
                description: series.description
            })),
            timestamp: new Date()
        };

        return Buffer.from(JSON.stringify(data));
    }

    async importMetrics(buffer: Buffer): Promise<void> {
        const data = JSON.parse(buffer.toString());

        for (const metric of data.metrics) {
            this.metrics.set(metric.name, {
                name: metric.name,
                points: metric.points,
                unit: metric.unit,
                description: metric.description
            });
        }

        this.emit('imported', { count: data.metrics.length });
    }
}

export interface MetricQuery {
    namePattern?: string;
    from?: Date;
    to?: Date;
    limit?: number;
}

export interface MetricsStats {
    totalMetrics: number;
    totalCollectors: number;
    totalPoints: number;
    collectionInterval: number;
    retentionPeriod: number;
    maxPointsPerMetric: number;
    isRunning: boolean;
}