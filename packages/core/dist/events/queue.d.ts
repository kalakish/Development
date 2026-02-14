/// <reference types="node" />
import { Worker, Job } from 'bullmq';
import Redis from 'ioredis';
import { EventEmitter } from 'events';
import { NovaEvent } from './dispatcher';
export declare class EventQueue extends EventEmitter {
    private queue;
    private scheduler;
    private workers;
    private redis;
    private queues;
    private paused;
    constructor(redis: Redis, options?: QueueOptions);
    private initializePriorityQueues;
    enqueue(event: NovaEvent, options?: EnqueueOptions): Promise<Job>;
    enqueueBatch(events: NovaEvent[]): Promise<Job[]>;
    enqueueWithDelay(event: NovaEvent, delayMs: number): Promise<Job>;
    enqueueScheduled(event: NovaEvent, cron: string): Promise<void>;
    startWorker(handler: EventWorkerHandler, concurrency?: number): Worker;
    pause(): Promise<void>;
    resume(): Promise<void>;
    getJob(jobId: string): Promise<Job | undefined>;
    getJobs(status?: JobStatus[]): Promise<Job[]>;
    removeJob(jobId: string): Promise<void>;
    clear(): Promise<void>;
    count(): Promise<QueueCounts>;
    getQueueMetrics(): Promise<QueueMetrics>;
    private selectQueue;
    private getPriorityNumber;
    private calculateDelay;
    private calculateThroughput;
    shutdown(): Promise<void>;
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
//# sourceMappingURL=queue.d.ts.map