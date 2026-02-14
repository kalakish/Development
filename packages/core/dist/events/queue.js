"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EventQueue = void 0;
const bullmq_1 = require("bullmq");
const events_1 = require("events");
class EventQueue extends events_1.EventEmitter {
    queue;
    scheduler;
    workers = [];
    redis;
    queues = new Map();
    paused = false;
    constructor(redis, options) {
        super();
        this.redis = redis;
        // Main event queue
        this.queue = new bullmq_1.Queue('nova:events', {
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
        this.scheduler = new bullmq_1.QueueScheduler('nova:events', {
            connection: redis
        });
        this.initializePriorityQueues(options);
    }
    initializePriorityQueues(options) {
        // Priority queues
        const priorities = ['critical', 'high', 'normal', 'low'];
        for (const priority of priorities) {
            const queue = new bullmq_1.Queue(`nova:${priority}`, {
                connection: this.redis,
                defaultJobOptions: {
                    attempts: priorities.indexOf(priority) === 0 ? 5 : 3,
                    priority: this.getPriorityNumber(priority)
                }
            });
            this.queues.set(priority, queue);
        }
    }
    async enqueue(event, options) {
        const queue = this.selectQueue(event.priority);
        const jobOptions = {
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
    async enqueueBatch(events) {
        const jobs = await Promise.all(events.map(event => this.enqueue(event)));
        return jobs;
    }
    async enqueueWithDelay(event, delayMs) {
        return this.enqueue(event, { delay: delayMs });
    }
    async enqueueScheduled(event, cron) {
        // For scheduled recurring events
        const repeatableKey = `repeat:${event.name}:${cron}`;
        await this.queue.add(event.name, event, {
            repeat: {
                pattern: cron
            },
            jobId: repeatableKey
        });
    }
    startWorker(handler, concurrency = 5) {
        const worker = new bullmq_1.Worker(this.queue.name, async (job) => {
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
    async pause() {
        this.paused = true;
        await this.queue.pause();
        for (const queue of this.queues.values()) {
            await queue.pause();
        }
        this.emit('paused');
    }
    async resume() {
        this.paused = false;
        await this.queue.resume();
        for (const queue of this.queues.values()) {
            await queue.resume();
        }
        this.emit('resumed');
    }
    async getJob(jobId) {
        return this.queue.getJob(jobId);
    }
    async getJobs(status = ['waiting', 'active', 'completed', 'failed']) {
        return this.queue.getJobs(status);
    }
    async removeJob(jobId) {
        const job = await this.getJob(jobId);
        if (job) {
            await job.remove();
        }
    }
    async clear() {
        await this.queue.obliterate({ force: true });
        for (const queue of this.queues.values()) {
            await queue.obliterate({ force: true });
        }
    }
    async count() {
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
    async getQueueMetrics() {
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
    selectQueue(priority) {
        if (priority >= 100)
            return this.queues.get('critical');
        if (priority >= 50)
            return this.queues.get('high');
        if (priority >= 10)
            return this.queues.get('normal');
        return this.queues.get('low');
    }
    getPriorityNumber(priority) {
        switch (priority) {
            case 'critical': return 100;
            case 'high': return 50;
            case 'normal': return 10;
            case 'low': return 0;
            default: return 10;
        }
    }
    calculateDelay(schedule) {
        if (schedule instanceof Date) {
            return Math.max(0, schedule.getTime() - Date.now());
        }
        // Parse cron expression
        // Simplified implementation
        return 60000; // 1 minute default
    }
    async calculateThroughput() {
        const oneHourAgo = Date.now() - 3600000;
        const jobs = await this.getJobs(['completed']);
        const recentJobs = jobs.filter(job => job.finishedOn && job.finishedOn > oneHourAgo);
        return recentJobs.length;
    }
    async shutdown() {
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
exports.EventQueue = EventQueue;
//# sourceMappingURL=queue.js.map