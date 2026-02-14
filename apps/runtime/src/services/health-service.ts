import { SQLServerConnection } from '@nova/core/database/sqlserver-connection';
import { Redis } from 'ioredis';
import { NovaApplication } from '@nova/core';

export interface HealthStatus {
    status: 'healthy' | 'degraded' | 'unhealthy';
    version: string;
    timestamp: string;
    uptime: number;
    services: Record<string, ServiceHealth>;
    checks: HealthCheck[];
}

export interface ServiceHealth {
    status: 'healthy' | 'degraded' | 'unhealthy';
    latency?: number;
    error?: string;
    details?: Record<string, any>;
}

export interface HealthCheck {
    name: string;
    status: 'healthy' | 'degraded' | 'unhealthy';
    latency: number;
    timestamp: string;
    error?: string;
}

export class HealthService {
    private app: NovaApplication;
    private database: SQLServerConnection;
    private redis?: Redis;
    private startTime: Date;
    private checks: Map<string, HealthCheckFunction> = new Map();

    constructor(app: NovaApplication, database: SQLServerConnection, redis?: Redis) {
        this.app = app;
        this.database = database;
        this.redis = redis;
        this.startTime = new Date();
        
        // Register default health checks
        this.registerDefaultChecks();
    }

    private registerDefaultChecks() {
        // Database health check
        this.registerCheck('database', async () => {
            const start = Date.now();
            try {
                await this.database.query('SELECT 1');
                return {
                    status: 'healthy',
                    latency: Date.now() - start
                };
            } catch (error) {
                return {
                    status: 'unhealthy',
                    latency: Date.now() - start,
                    error: error.message
                };
            }
        });

        // Redis health check
        if (this.redis) {
            this.registerCheck('redis', async () => {
                const start = Date.now();
                try {
                    await this.redis.ping();
                    return {
                        status: 'healthy',
                        latency: Date.now() - start
                    };
                } catch (error) {
                    return {
                        status: 'unhealthy',
                        latency: Date.now() - start,
                        error: error.message
                    };
                }
            });
        }

        // Application health check
        this.registerCheck('application', async () => {
            return {
                status: this.app.getStatus() === 'running' ? 'healthy' : 'degraded',
                details: {
                    status: this.app.getStatus(),
                    instanceId: this.app.getInstanceId(),
                    sessions: this.app.getSessions().length
                }
            };
        });

        // Disk space check
        this.registerCheck('disk', async () => {
            try {
                const { exec } = require('child_process');
                const util = require('util');
                const execPromise = util.promisify(exec);

                if (process.platform === 'win32') {
                    const { stdout } = await execPromise('wmic logicaldisk get size,freespace,caption');
                    return {
                        status: 'healthy',
                        details: { disk: stdout }
                    };
                } else {
                    const { stdout } = await execPromise('df -h /');
                    return {
                        status: 'healthy',
                        details: { disk: stdout }
                    };
                }
            } catch (error) {
                return {
                    status: 'degraded',
                    error: error.message
                };
            }
        });

        // Memory check
        this.registerCheck('memory', async () => {
            const memoryUsage = process.memoryUsage();
            const heapUsed = memoryUsage.heapUsed / 1024 / 1024;
            const heapTotal = memoryUsage.heapTotal / 1024 / 1024;
            const rss = memoryUsage.rss / 1024 / 1024;

            const status = heapUsed / heapTotal < 0.9 ? 'healthy' : 'degraded';

            return {
                status,
                details: {
                    heapUsed: `${heapUsed.toFixed(2)} MB`,
                    heapTotal: `${heapTotal.toFixed(2)} MB`,
                    rss: `${rss.toFixed(2)} MB`,
                    external: `${(memoryUsage.external / 1024 / 1024).toFixed(2)} MB`
                }
            };
        });
    }

    registerCheck(name: string, check: HealthCheckFunction): void {
        this.checks.set(name, check);
    }

    async getHealth(deep: boolean = false): Promise<HealthStatus> {
        const services: Record<string, ServiceHealth> = {};
        const checks: HealthCheck[] = [];

        // Run all health checks in parallel
        const checkPromises = Array.from(this.checks.entries()).map(async ([name, checkFn]) => {
            const start = Date.now();
            try {
                const result = await checkFn();
                const latency = Date.now() - start;

                services[name] = {
                    status: result.status,
                    latency,
                    error: result.error,
                    details: result.details
                };

                checks.push({
                    name,
                    status: result.status,
                    latency,
                    timestamp: new Date().toISOString(),
                    error: result.error
                });

                return result.status;
            } catch (error) {
                services[name] = {
                    status: 'unhealthy',
                    latency: Date.now() - start,
                    error: error.message
                };

                checks.push({
                    name,
                    status: 'unhealthy',
                    latency: Date.now() - start,
                    timestamp: new Date().toISOString(),
                    error: error.message
                });

                return 'unhealthy';
            }
        });

        const results = await Promise.all(checkPromises);

        // Determine overall status
        let overallStatus: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
        
        if (results.includes('unhealthy')) {
            overallStatus = 'unhealthy';
        } else if (results.includes('degraded')) {
            overallStatus = 'degraded';
        }

        return {
            status: overallStatus,
            version: process.env.npm_package_version || '2.0.0',
            timestamp: new Date().toISOString(),
            uptime: Date.now() - this.startTime.getTime(),
            services,
            checks: deep ? checks : []
        };
    }

    async getLiveness(): Promise<HealthStatus> {
        // Liveness probe - lightweight check
        return {
            status: this.app.getStatus() === 'running' ? 'healthy' : 'unhealthy',
            version: process.env.npm_package_version || '2.0.0',
            timestamp: new Date().toISOString(),
            uptime: Date.now() - this.startTime.getTime(),
            services: {
                application: {
                    status: this.app.getStatus() === 'running' ? 'healthy' : 'unhealthy',
                    details: {
                        status: this.app.getStatus(),
                        instanceId: this.app.getInstanceId()
                    }
                }
            },
            checks: []
        };
    }

    async getReadiness(): Promise<HealthStatus> {
        // Readiness probe - check if service can accept traffic
        const services: Record<string, ServiceHealth> = {};
        let isReady = true;

        // Check database
        try {
            await this.database.query('SELECT 1');
            services.database = { status: 'healthy' };
        } catch (error) {
            services.database = { status: 'unhealthy', error: error.message };
            isReady = false;
        }

        // Check Redis if configured
        if (this.redis) {
            try {
                await this.redis.ping();
                services.redis = { status: 'healthy' };
            } catch (error) {
                services.redis = { status: 'degraded', error: error.message };
            }
        }

        return {
            status: isReady ? 'healthy' : 'unhealthy',
            version: process.env.npm_package_version || '2.0.0',
            timestamp: new Date().toISOString(),
            uptime: Date.now() - this.startTime.getTime(),
            services,
            checks: []
        };
    }

    async getMetrics(): Promise<any> {
        const memoryUsage = process.memoryUsage();
        const cpuUsage = process.cpuUsage();

        // Get database metrics
        const dbMetrics = this.database.getMetrics();

        // Get Redis metrics
        let redisMetrics = {};
        if (this.redis) {
            const info = await this.redis.info();
            redisMetrics = this.parseRedisInfo(info);
        }

        return {
            timestamp: new Date().toISOString(),
            uptime: Date.now() - this.startTime.getTime(),
            process: {
                pid: process.pid,
                title: process.title,
                version: process.version,
                platform: process.platform,
                arch: process.arch,
                memory: {
                    rss: memoryUsage.rss,
                    heapTotal: memoryUsage.heapTotal,
                    heapUsed: memoryUsage.heapUsed,
                    external: memoryUsage.external
                },
                cpu: {
                    user: cpuUsage.user,
                    system: cpuUsage.system
                },
                eventLoopLag: await this.measureEventLoopLag()
            },
            database: dbMetrics,
            redis: redisMetrics,
            application: {
                status: this.app.getStatus(),
                sessions: this.app.getSessions().length,
                companies: this.app.getCompanies().length,
                tenants: this.app.getTenants().length
            }
        };
    }

    private async measureEventLoopLag(): Promise<number> {
        return new Promise((resolve) => {
            const start = Date.now();
            setImmediate(() => {
                resolve(Date.now() - start);
            });
        });
    }

    private parseRedisInfo(info: string): any {
        const lines = info.split('\r\n');
        const result: any = {};

        lines.forEach(line => {
            if (line && !line.startsWith('#')) {
                const [key, value] = line.split(':');
                if (key && value) {
                    result[key] = value;
                }
            }
        });

        return result;
    }

    async reset(): Promise<void> {
        this.startTime = new Date();
        this.checks.clear();
        this.registerDefaultChecks();
    }
}

export interface HealthCheckFunction {
    (): Promise<{
        status: 'healthy' | 'degraded' | 'unhealthy';
        latency?: number;
        error?: string;
        details?: Record<string, any>;
    }>;
}

export const createHealthService = (
    app: NovaApplication,
    database: SQLServerConnection,
    redis?: Redis
) => {
    return new HealthService(app, database, redis);
};