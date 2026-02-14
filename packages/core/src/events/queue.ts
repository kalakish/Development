import { Queue, Worker, QueueScheduler, Job } from 'bullmq';
import Redis from 'ioredis';
import { EventEmitter } from 'events';
import { NovaEvent } from './dispatcher';

export class EventQueue extends EventEmitter {
    private queue: Queue;
    private scheduler: QueueScheduler;
    private workers: Worker[] = [];
    private redis: Redis;
    private queues: Map<string, Queue> = new Map();
    private paused: boolean = false;

    constructor(redis: Redis, options?: QueueOptions) {
        super();
        this.redis = redis;
        
        // Main event queue
        this.queue = new Queue('nova:events', {
            connection: redis,
            defaultJobOptions: {
                attempts: 3,
                backoff: {
                    type: 'exponential',
                    delay: 1000
                },
                removeOnComplete: 100,
                removeOnFail: 500
            }
        });

        // Scheduler for delayed jobs
        this.scheduler = new QueueScheduler('nova:events', {
            connection: redis
        });

        this.initializePriorityQueues(options);
    }

    private initializePriorityQueues(options?: QueueOptions): void {
        // Priority queues
        const priorities = ['critical', 'high', 'normal', 'low'];
        
        for (const priority of priorities) {
            const queue = new Queue(`nova:${priority}`, {
                connection: this.redis,
                defaultJobOptions: {
                    attempts: priorities.indexOf(priority) === 0 ? 5 : 3,
                    priority: this.getPriorityNumber(priority)
                }
            });
            
            this.queues.set(priority, queue);
        }
    }

    async enqueue(event: NovaEvent, options?: EnqueueOptions): Promise<Job> {
        const queue = this.selectQueue(event.priority);
        
        const jobOptions: any = {
            jobId: event.id,
            attempts: options?.attempts || 3,
            delay: options?.delay,
            priority: options?.priority || event.priority,
            timestamp: Date.now()
        };

        if (options?.schedule) {
            jobOptions.delay = this.calculateDelay(options.schedule);
        }

        const job = await queue.add(event.name, event, jobOptions);
        
        this.emit('enqueued', {
            eventId: event.id,
            queue: queue.name,
            timestamp: new Date()
        });

        return job;
    }

    async enqueueBatch(events: NovaEvent[]): Promise<Job[]> {
        const jobs = await Promise.all(
            events.map(event => this.enqueue(event))
        );
        return jobs;
    }

    async enqueueWithDelay(event: NovaEvent, delayMs: number): Promise<Job> {
        return this.enqueue(event, { delay: delayMs });
    }

    async enqueueScheduled(event: NovaEvent, cron: string): Promise<void> {
        // For scheduled recurring events
        const repeatableKey = `repeat:${event.name}:${cron}`;
        
        await this.queue.add(event.name, event, {
            repeat: {
                pattern: cron
            },
            jobId: repeatableKey
        });
    }

    startWorker(handler: EventWorkerHandler, concurrency: number = 5): Worker {
        const worker = new Worker(this.queue.name, async job => {
            await handler(job.data, job);
        }, {
            connection: this.redis,
            concurrency,
            limiter: {
                max: 100,
                duration: 1000
            }
        });

        worker.on('completed', job => {
            this.emit('completed', {
                jobId: job.id,
                eventId: job.data.id,
                timestamp: new Date()
            });
        });

        worker.on('failed', (job, error) => {
            this.emit('failed', {
                jobId: job.id,
                eventId: job.data.id,
                error: error.message,
                attempts: job.attemptsMade,
                timestamp: new Date()
            });
        });

        worker.on('error', error => {
            this.emit('error', error);
        });

        this.workers.push(worker);
        return worker;
    }

    async pause(): Promise<void> {
        this.paused = true;
        await this.queue.pause();
        
        for (const queue of this.queues.values()) {
            await queue.pause();
        }
        
        this.emit('paused');
    }

    async resume(): Promise<void> {
        this.paused = false;
        await this.queue.resume();
        
        for (const queue of this.queues.values()) {
            await queue.resume();
        }
        
        this.emit('resumed');
    }

    async getJob(jobId: string): Promise<Job | undefined> {
        return this.queue.getJob(jobId);
    }

    async getJobs(status: JobStatus[] = ['waiting', 'active', 'completed', 'failed']): Promise<Job[]> {
        return this.queue.getJobs(status);
    }

    async removeJob(jobId: string): Promise<void> {
        const job = await this.getJob(jobId);
        if (job) {
            await job.remove();
        }
    }

    async clear(): Promise<void> {
        await this.queue.obliterate({ force: true });
        
        for (const queue of this.queues.values()) {
            await queue.obliterate({ force: true });
        }
    }

    async count(): Promise<QueueCounts> {
        const [waiting, active, completed, failed, delayed] = await Promise.all([
            this.queue.getWaitingCount(),
            this.queue.getActiveCount(),
            this.queue.getCompletedCount(),
            this.queue.getFailedCount(),
            this.queue.getDelayedCount()
        ]);

        return {
            waiting,
            active,
            completed,
            failed,
            delayed,
            total: waiting + active + completed + failed + delayed
        };
    }

    async getQueueMetrics(): Promise<QueueMetrics> {
        const counts = await this.count();
        const jobs = await this.getJobs(['completed', 'failed']);
        
        let totalProcessingTime = 0;
        let completedJobs = 0;
        
        for (const job of jobs) {
            if (job.finishedOn) {
                totalProcessingTime += job.finishedOn - job.timestamp;
                completedJobs++;
            }
        }

        return {
            counts,
            averageProcessingTime: completedJobs > 0 ? totalProcessingTime / completedJobs : 0,
            throughput: await this.calculateThroughput(),
            errorRate: counts.completed + counts.failed > 0 
                ? counts.failed / (counts.completed + counts.failed) 
                : 0
        };
    }

    private selectQueue(priority: number): Queue {
        if (priority >= 100) return this.queues.get('critical')!;
        if (priority >= 50) return this.queues.get('high')!;
        if (priority >= 10) return this.queues.get('normal')!;
        return this.queues.get('low')!;
    }

    private getPriorityNumber(priority: string): number {
        switch (priority) {
            case 'critical': return 100;
            case 'high': return 50;
            case 'normal': return 10;
            case 'low': return 0;
            default: return 10;
        }
    }

    private calculateDelay(schedule: string | Date): number {
        if (schedule instanceof Date) {
            return Math.max(0, schedule.getTime() - Date.now());
        }
        
        // Parse cron expression
        // Simplified implementation
        return 60000; // 1 minute default
    }

    private async calculateThroughput(): Promise<number> {
        const oneHourAgo = Date.now() - 3600000;
        const jobs = await this.getJobs(['completed']);
        
        const recentJobs = jobs.filter(job => 
            job.finishedOn && job.finishedOn > oneHourAgo
        );
        
        return recentJobs.length;
    }

    async shutdown(): Promise<void> {
        await this.pause();
        
        for (const worker of this.workers) {
            await worker.close();
        }
        
        await this.queue.close();
        
        for (const queue of this.queues.values()) {
            await queue.close();
        }
        
        await this.scheduler.close();
    }
}

export type JobStatus = 'waiting' | 'active' | 'completed' | 'failed' | 'delayed';

export interface QueueOptions {
    defaultPriority?: number;
    maxAttempts?: number;
    concurrency?: number;
}

export interface EnqueueOptions {
    delay?: number;
    priority?: number;
    attempts?: number;
    schedule?: string | Date;
}

export interface EventWorkerHandler {
    (event: NovaEvent, job: Job): Promise<void>;
}

export interface QueueCounts {
    waiting: number;
    active: number;
    completed: number;
    failed: number;
    delayed: number;
    total: number;
}

export interface QueueMetrics {
    counts: QueueCounts;
    averageProcessingTime: number;
    throughput: number;
    errorRate: number;
}