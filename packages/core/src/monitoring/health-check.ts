import { EventEmitter } from 'events';
import { SQLServerPoolManager } from '../database/sqlserver-pool';
import { SQLServerHealth } from '../database/sqlserver-health';
import { CacheManager } from '../cache/cache-manager';
import { EventDispatcher } from '../events/event-dispatcher';
import { MetricsCollector } from './metrics-collector';

export interface HealthStatus {
    status: 'healthy' | 'unhealthy' | 'degraded';
    checks: HealthCheck[];
    timestamp: Date;
    duration: number;
}

export interface HealthCheck {
    name: string;
    status: 'passed' | 'failed' | 'warning';
    message?: string;
    duration: number;
    metadata?: Record<string, any>;
}

export interface HealthCheckOptions {
    timeout?: number;
    critical?: boolean;
    tags?: string[];
}

export class HealthChecker extends EventEmitter {
    private poolManager?: SQLServerPoolManager;
    private sqlServerHealth?: SQLServerHealth;
    private cacheManager?: CacheManager;
    private eventDispatcher?: EventDispatcher;
    private metricsCollector?: MetricsCollector;
    
    private checks: Map<string, HealthCheckDefinition> = new Map();
    private results: Map<string, HealthStatus> = new Map();
    private interval: NodeJS.Timeout | null = null;

    constructor() {
        super();
        this.registerDefaultChecks();
    }

    initialize(
        poolManager?: SQLServerPoolManager,
        cacheManager?: CacheManager,
        eventDispatcher?: EventDispatcher,
        metricsCollector?: MetricsCollector
    ): void {
        this.poolManager = poolManager;
        this.cacheManager = cacheManager;
        this.eventDispatcher = eventDispatcher;
        this.metricsCollector = metricsCollector;

        if (poolManager) {
            this.sqlServerHealth = new SQLServerHealth(poolManager);
            this.registerDatabaseChecks();
        }

        if (cacheManager) {
            this.registerCacheChecks();
        }

        if (eventDispatcher) {
            this.registerEventChecks();
        }

        this.emit('initialized');
    }

    // ============ Check Registration ============

    registerCheck(
        name: string,
        check: () => Promise<HealthCheck>,
        options?: HealthCheckOptions
    ): void {
        this.checks.set(name, {
            name,
            check,
            options: {
                timeout: options?.timeout || 5000,
                critical: options?.critical || false,
                tags: options?.tags || []
            }
        });

        this.emit('checkRegistered', { name });
    }

    unregisterCheck(name: string): void {
        this.checks.delete(name);
        this.emit('checkUnregistered', { name });
    }

    private registerDefaultChecks(): void {
        // System health checks
        this.registerCheck('system.memory', async () => {
            const start = Date.now();
            const memory = process.memoryUsage();
            
            const heapUsedMB = memory.heapUsed / 1024 / 1024;
            const heapTotalMB = memory.heapTotal / 1024 / 1024;
            const heapUsagePercent = (heapUsedMB / heapTotalMB) * 100;

            let status: 'passed' | 'warning' = 'passed';
            let message: string | undefined;

            if (heapUsagePercent > 90) {
                status = 'warning';
                message = `High heap usage: ${heapUsagePercent.toFixed(1)}%`;
            }

            return {
                name: 'system.memory',
                status,
                message,
                duration: Date.now() - start,
                metadata: {
                    heapUsed: memory.heapUsed,
                    heapTotal: memory.heapTotal,
                    heapUsagePercent,
                    rss: memory.rss
                }
            };
        }, { critical: true });

        this.registerCheck('system.cpu', async () => {
            const start = Date.now();
            const cpu = process.cpuUsage();
            
            return {
                name: 'system.cpu',
                status: 'passed',
                duration: Date.now() - start,
                metadata: {
                    user: cpu.user,
                    system: cpu.system
                }
            };
        });

        this.registerCheck('system.disk', async () => {
            const start = Date.now();
            
            // This would check disk space
            return {
                name: 'system.disk',
                status: 'passed',
                duration: Date.now() - start,
                metadata: {
                    // Mock data - implement actual disk check
                    free: 1024 * 1024 * 1024,
                    total: 10 * 1024 * 1024 * 1024
                }
            };
        });

        this.registerCheck('system.uptime', async () => {
            const start = Date.now();
            const uptime = process.uptime();
            
            return {
                name: 'system.uptime',
                status: 'passed',
                duration: Date.now() - start,
                metadata: {
                    uptime,
                    uptimeHours: uptime / 3600
                }
            };
        });
    }

    private registerDatabaseChecks(): void {
        if (!this.poolManager || !this.sqlServerHealth) return;

        this.registerCheck('database.connection', async () => {
            const start = Date.now();
            
            try {
                const poolNames = this.poolManager!.getPoolNames();
                
                if (poolNames.length === 0) {
                    return {
                        name: 'database.connection',
                        status: 'warning',
                        message: 'No database pools configured',
                        duration: Date.now() - start
                    };
                }

                // Check default pool
                const defaultPool = poolNames[0];
                const check = await this.sqlServerHealth!.checkConnectivity(defaultPool);
                
                return {
                    ...check,
                    name: 'database.connection',
                    metadata: {
                        ...check.metadata,
                        poolName: defaultPool
                    }
                };
            } catch (error) {
                return {
                    name: 'database.connection',
                    status: 'failed',
                    message: error.message,
                    duration: Date.now() - start
                };
            }
        }, { critical: true });

        this.registerCheck('database.latency', async () => {
            const start = Date.now();
            
            try {
                const poolNames = this.poolManager!.getPoolNames();
                const defaultPool = poolNames[0];
                const check = await this.sqlServerHealth!.checkLatency(defaultPool);
                
                return {
                    ...check,
                    name: 'database.latency'
                };
            } catch (error) {
                return {
                    name: 'database.latency',
                    status: 'failed',
                    message: error.message,
                    duration: Date.now() - start
                };
            }
        });

        this.registerCheck('database.pool', async () => {
            const start = Date.now();
            
            try {
                const poolNames = this.poolManager!.getPoolNames();
                const checks = await Promise.all(
                    poolNames.map(name => this.sqlServerHealth!.checkPoolHealth(name))
                );

                const failed = checks.filter(c => c.status === 'failed');
                const warnings = checks.filter(c => c.status === 'warning');

                let status: 'passed' | 'warning' | 'failed' = 'passed';
                if (failed.length > 0) status = 'failed';
                else if (warnings.length > 0) status = 'warning';

                return {
                    name: 'database.pool',
                    status,
                    message: `${checks.length} pools checked, ${failed.length} failed, ${warnings.length} warnings`,
                    duration: Date.now() - start,
                    metadata: { checks }
                };
            } catch (error) {
                return {
                    name: 'database.pool',
                    status: 'failed',
                    message: error.message,
                    duration: Date.now() - start
                };
            }
        }, { critical: true });
    }

    private registerCacheChecks(): void {
        if (!this.cacheManager) return;

        this.registerCheck('cache.health', async () => {
            const start = Date.now();
            
            try {
                const health = await this.cacheManager!.healthCheck();
                
                return {
                    name: 'cache.health',
                    status: health.status === 'healthy' ? 'passed' : 'failed',
                    message: health.error,
                    duration: Date.now() - start,
                    metadata: health.checks
                };
            } catch (error) {
                return {
                    name: 'cache.health',
                    status: 'failed',
                    message: error.message,
                    duration: Date.now() - start
                };
            }
        }, { critical: true });
    }

    private registerEventChecks(): void {
        if (!this.eventDispatcher) return;

        this.registerCheck('events.health', async () => {
            const start = Date.now();
            
            try {
                // Test event dispatch
                const testEvent = await this.eventDispatcher!.dispatch('health.check', {
                    timestamp: new Date()
                });

                return {
                    name: 'events.health',
                    status: 'passed',
                    message: `Event dispatched: ${testEvent}`,
                    duration: Date.now() - start
                };
            } catch (error) {
                return {
                    name: 'events.health',
                    status: 'failed',
                    message: error.message,
                    duration: Date.now() - start
                };
            }
        });
    }

    // ============ Health Checks ============

    async runHealthCheck(tags?: string[]): Promise<HealthStatus> {
        const startTime = Date.now();
        const checks: HealthCheck[] = [];
        const failedCriticalChecks: string[] = [];

        const checkEntries = Array.from(this.checks.entries())
            .filter(([_, check]) => {
                if (!tags) return true;
                return check.options.tags?.some(tag => tags.includes(tag));
            });

        for (const [name, definition] of checkEntries) {
            try {
                const checkPromise = definition.check();
                const timeoutPromise = new Promise<HealthCheck>((_, reject) => {
                    setTimeout(() => {
                        reject(new Error(`Health check timeout after ${definition.options.timeout}ms`));
                    }, definition.options.timeout);
                });

                const result = await Promise.race([checkPromise, timeoutPromise]);
                
                checks.push(result);

                if (result.status === 'failed' && definition.options.critical) {
                    failedCriticalChecks.push(name);
                }

            } catch (error) {
                const check: HealthCheck = {
                    name,
                    status: 'failed',
                    message: error.message,
                    duration: Date.now() - startTime
                };

                checks.push(check);

                if (definition.options.critical) {
                    failedCriticalChecks.push(name);
                }
            }
        }

        // Determine overall status
        let status: 'healthy' | 'unhealthy' | 'degraded' = 'healthy';

        if (failedCriticalChecks.length > 0) {
            status = 'unhealthy';
        } else if (checks.some(c => c.status === 'failed' || c.status === 'warning')) {
            status = 'degraded';
        }

        const healthStatus: HealthStatus = {
            status,
            checks,
            timestamp: new Date(),
            duration: Date.now() - startTime
        };

        // Cache result
        this.results.set('latest', healthStatus);

        // Emit event
        this.emit('healthCheckCompleted', healthStatus);

        return healthStatus;
    }

    async runHealthCheckGroup(group: string): Promise<HealthStatus> {
        const groupTags = this.getTagsForGroup(group);
        return this.runHealthCheck(groupTags);
    }

    // ============ Continuous Monitoring ============

    startMonitoring(interval: number = 60000): void {
        if (this.interval) {
            clearInterval(this.interval);
        }

        this.interval = setInterval(async () => {
            await this.runHealthCheck();
        }, interval);

        // Run initial check
        setImmediate(() => this.runHealthCheck());

        this.emit('monitoringStarted', { interval });
    }

    stopMonitoring(): void {
        if (this.interval) {
            clearInterval(this.interval);
            this.interval = null;
            this.emit('monitoringStopped');
        }
    }

    // ============ Results ============

    getLatestHealthStatus(): HealthStatus | undefined {
        return this.results.get('latest');
    }

    getHealthHistory(limit: number = 100): HealthStatus[] {
        // This would return historical health statuses
        return [];
    }

    // ============ Check Management ============

    getChecks(tags?: string[]): HealthCheckDefinition[] {
        let checks = Array.from(this.checks.values());

        if (tags) {
            checks = checks.filter(c => 
                c.options.tags?.some(tag => tags.includes(tag))
            );
        }

        return checks;
    }

    getCheck(name: string): HealthCheckDefinition | undefined {
        return this.checks.get(name);
    }

    // ============ Group Management ============

    private tagGroups: Map<string, string[]> = new Map();

    registerGroup(name: string, tags: string[]): void {
        this.tagGroups.set(name, tags);
    }

    getTagsForGroup(group: string): string[] {
        return this.tagGroups.get(group) || [];
    }

    // ============ Health Report ============

    async generateHealthReport(tags?: string[]): Promise<string> {
        const status = await this.runHealthCheck(tags);
        
        let report = `# System Health Report\n\n`;
        report += `**Status:** ${status.status.toUpperCase()}\n`;
        report += `**Timestamp:** ${status.timestamp.toISOString()}\n`;
        report += `**Duration:** ${status.duration}ms\n`;
        report += `**Checks:** ${status.checks.length}\n\n`;

        const failed = status.checks.filter(c => c.status === 'failed');
        const warnings = status.checks.filter(c => c.status === 'warning');
        const passed = status.checks.filter(c => c.status === 'passed');

        if (failed.length > 0) {
            report += `## ❌ Failed Checks (${failed.length})\n\n`;
            failed.forEach(check => {
                report += `- **${check.name}**: ${check.message || 'No message'}\n`;
            });
            report += '\n';
        }

        if (warnings.length > 0) {
            report += `## ⚠️ Warnings (${warnings.length})\n\n`;
            warnings.forEach(check => {
                report += `- **${check.name}**: ${check.message || 'No message'}\n`;
            });
            report += '\n';
        }

        if (passed.length > 0) {
            report += `## ✅ Passed Checks (${passed.length})\n\n`;
            passed.forEach(check => {
                report += `- **${check.name}**: ${check.duration}ms\n`;
            });
            report += '\n';
        }

        return report;
    }
}

export interface HealthCheckDefinition {
    name: string;
    check: () => Promise<HealthCheck>;
    options: {
        timeout: number;
        critical: boolean;
        tags: string[];
    };
}