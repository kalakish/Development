import { EventEmitter } from 'events';
import { SQLServerConnection } from '@nova/core/database/sqlserver-connection';
import { Redis } from 'ioredis';
import { NovaApplication } from '@nova/core';
import { Logger } from '@nova/core/utils/logger';

export interface MetricPoint {
    timestamp: Date;
    value: number;
    tags?: Record<string, string>;
}

export interface Metric {
    name: string;
    type: 'counter' | 'gauge' | 'histogram' | 'summary';
    description?: string;
    unit?: string;
    values: MetricPoint[];
}

export class MetricsService extends EventEmitter {
    private app: NovaApplication;
    private database: SQLServerConnection;
    private redis?: Redis;
    private logger: Logger;
    private metrics: Map<string, Metric> = new Map();
    private collectors: Map<string, MetricCollector> = new Map();
    private retentionPeriod: number = 86400000; // 24 hours
    private flushInterval: NodeJS.Timeout | null = null;

    constructor(app: NovaApplication, database: SQLServerConnection, redis?: Redis) {
        super();
        this.app = app;
        this.database = database;
        this.redis = redis;
        this.logger = new Logger('MetricsService');

        this.initializeDefaultCollectors();
        this.startFlushInterval();
    }

    private initializeDefaultCollectors() {
        // HTTP request metrics
        this.registerCollector('http_requests_total', {
            type: 'counter',
            description: 'Total number of HTTP requests',
            unit: 'requests',
            collect: async () => {
                const result = await this.database.query(`
                    SELECT COUNT(*) as count 
                    FROM [ReportExecutionLog] 
                    WHERE [StartedAt] >= DATEADD(hour, -1, GETUTCDATE())
                `);
                return [{ value: result.recordset[0]?.count || 0 }];
            }
        });

        // Active sessions
        this.registerCollector('active_sessions', {
            type: 'gauge',
            description: 'Number of active sessions',
            unit: 'sessions',
            collect: async () => {
                return [{ value: this.app.getSessions().length }];
            }
        });

        // Database query duration
        this.registerCollector('database_query_duration_seconds', {
            type: 'histogram',
            description: 'Database query duration in seconds',
            unit: 'seconds',
            collect: async () => {
                const metrics = this.database.getMetrics();
                return [{ 
                    value: metrics.totalTime / 1000,
                    tags: { queries: metrics.queries.toString() }
                }];
            }
        });

        // Memory usage
        this.registerCollector('process_memory_bytes', {
            type: 'gauge',
            description: 'Process memory usage in bytes',
            unit: 'bytes',
            collect: async () => {
                const mem = process.memoryUsage();
                return [
                    { value: mem.heapUsed, tags: { type: 'heap_used' } },
                    { value: mem.heapTotal, tags: { type: 'heap_total' } },
                    { value: mem.rss, tags: { type: 'rss' } },
                    { value: mem.external, tags: { type: 'external' } }
                ];
            }
        });

        // CPU usage
        this.registerCollector('process_cpu_seconds_total', {
            type: 'counter',
            description: 'Process CPU usage in seconds',
            unit: 'seconds',
            collect: async () => {
                const cpu = process.cpuUsage();
                return [
                    { value: cpu.user / 1000000, tags: { type: 'user' } },
                    { value: cpu.system / 1000000, tags: { type: 'system' } }
                ];
            }
        });

        // Event loop lag
        this.registerCollector('event_loop_lag_seconds', {
            type: 'gauge',
            description: 'Event loop lag in seconds',
            unit: 'seconds',
            collect: async () => {
                const lag = await this.measureEventLoopLag();
                return [{ value: lag / 1000 }];
            }
        });

        // Report executions
        this.registerCollector('report_executions_total', {
            type: 'counter',
            description: 'Total number of report executions',
            unit: 'executions',
            collect: async () => {
                const result = await this.database.query(`
                    SELECT 
                        [Status],
                        COUNT(*) as count
                    FROM [ReportExecutionLog] 
                    WHERE [StartedAt] >= DATEADD(hour, -1, GETUTCDATE())
                    GROUP BY [Status]
                `);
                
                return result.recordset.map((row: any) => ({
                    value: row.count,
                    tags: { status: row.Status }
                }));
            }
        });

        // Scheduled reports
        this.registerCollector('scheduled_reports', {
            type: 'gauge',
            description: 'Number of scheduled reports',
            unit: 'reports',
            collect: async () => {
                const result = await this.database.query(`
                    SELECT 
                        COUNT(*) as count,
                        SUM(CASE WHEN [Enabled] = 1 THEN 1 ELSE 0 END) as active
                    FROM [ReportSchedule]
                `);
                
                return [
                    { value: result.recordset[0]?.count || 0, tags: { type: 'total' } },
                    { value: result.recordset[0]?.active || 0, tags: { type: 'active' } }
                ];
            }
        });
    }

    registerCollector(name: string, collector: MetricCollector): void {
        this.collectors.set(name, collector);
        
        // Initialize metric
        this.metrics.set(name, {
            name,
            type: collector.type,
            description: collector.description,
            unit: collector.unit,
            values: []
        });
    }

    async collect(): Promise<void> {
        const promises = Array.from(this.collectors.entries()).map(async ([name, collector]) => {
            try {
                const points = await collector.collect();
                const metric = this.metrics.get(name)!;
                
                points.forEach(point => {
                    metric.values.push({
                        timestamp: new Date(),
                        value: point.value,
                        tags: point.tags
                    });
                });

                // Trim old values
                const cutoff = Date.now() - this.retentionPeriod;
                metric.values = metric.values.filter(v => v.timestamp.getTime() > cutoff);

            } catch (error) {
                this.logger.error(`Failed to collect metric ${name}:`, error);
            }
        });

        await Promise.all(promises);
        this.emit('collected', this.metrics);
    }

    async increment(name: string, value: number = 1, tags?: Record<string, string>): Promise<void> {
        let metric = this.metrics.get(name);
        
        if (!metric) {
            metric = {
                name,
                type: 'counter',
                values: []
            };
            this.metrics.set(name, metric);
        }

        metric.values.push({
            timestamp: new Date(),
            value,
            tags
        });
    }

    async gauge(name: string, value: number, tags?: Record<string, string>): Promise<void> {
        let metric = this.metrics.get(name);
        
        if (!metric) {
            metric = {
                name,
                type: 'gauge',
                values: []
            };
            this.metrics.set(name, metric);
        }

        metric.values.push({
            timestamp: new Date(),
            value,
            tags
        });
    }

    async histogram(name: string, value: number, tags?: Record<string, string>): Promise<void> {
        let metric = this.metrics.get(name);
        
        if (!metric) {
            metric = {
                name,
                type: 'histogram',
                values: []
            };
            this.metrics.set(name, metric);
        }

        metric.values.push({
            timestamp: new Date(),
            value,
            tags
        });
    }

    getMetric(name: string): Metric | undefined {
        return this.metrics.get(name);
    }

    getAllMetrics(): Metric[] {
        return Array.from(this.metrics.values());
    }

    async getPrometheusMetrics(): Promise<string> {
        const lines: string[] = [];

        for (const metric of this.metrics.values()) {
            // Help line
            if (metric.description) {
                lines.push(`# HELP ${metric.name} ${metric.description}`);
            }
            
            // Type line
            lines.push(`# TYPE ${metric.name} ${metric.type}`);

            // Values
            metric.values.forEach(point => {
                let line = metric.name;
                
                // Add tags
                if (point.tags && Object.keys(point.tags).length > 0) {
                    const tags = Object.entries(point.tags)
                        .map(([k, v]) => `${k}="${v}"`)
                        .join(',');
                    line += `{${tags}}`;
                }

                line += ` ${point.value}`;
                
                // Add timestamp
                if (point.timestamp) {
                    line += ` ${point.timestamp.getTime()}`;
                }

                lines.push(line);
            });
        }

        return lines.join('\n');
    }

    async getJSONMetrics(): Promise<any> {
        const result: any = {};

        for (const [name, metric] of this.metrics) {
            result[name] = {
                type: metric.type,
                description: metric.description,
                unit: metric.unit,
                values: metric.values.map(v => ({
                    timestamp: v.timestamp,
                    value: v.value,
                    tags: v.tags
                }))
            };
        }

        return result;
    }

    private startFlushInterval(): void {
        // Collect metrics every 15 seconds
        this.flushInterval = setInterval(() => {
            this.collect().catch(error => {
                this.logger.error('Failed to collect metrics:', error);
            });
        }, 15000);
    }

    stop(): void {
        if (this.flushInterval) {
            clearInterval(this.flushInterval);
            this.flushInterval = null;
        }
    }

    setRetentionPeriod(ms: number): void {
        this.retentionPeriod = ms;
    }

    async reset(): Promise<void> {
        this.metrics.clear();
        this.collectors.clear();
        this.initializeDefaultCollectors();
        await this.collect();
    }

    private async measureEventLoopLag(): Promise<number> {
        return new Promise((resolve) => {
            const start = Date.now();
            setImmediate(() => {
                resolve(Date.now() - start);
            });
        });
    }
}

export interface MetricCollector {
    type: 'counter' | 'gauge' | 'histogram' | 'summary';
    description?: string;
    unit?: string;
    collect: () => Promise<Array<{ value: number; tags?: Record<string, string> }>>;
}

export interface MetricsQuery {
    name?: string;
    startTime?: Date;
    endTime?: Date;
    tags?: Record<string, string>;
    aggregate?: 'avg' | 'sum' | 'min' | 'max' | 'count';
    interval?: string;
}

export const createMetricsService = (
    app: NovaApplication,
    database: SQLServerConnection,
    redis?: Redis
) => {
    return new MetricsService(app, database, redis);
};