import { EventEmitter } from 'events';
import { Queue, Worker } from 'bullmq';
import Redis from 'ioredis';

export class EventDispatcher extends EventEmitter {
    private static instance: EventDispatcher;
    private subscribers: Map<string, EventSubscriber[]> = new Map();
    private eventQueue: EventQueue;
    private redis: Redis;
    private initialized: boolean = false;
 
    private constructor() {
        super();
        this.redis = new Redis({
            host: process.env.REDIS_HOST || 'localhost',
            port: parseInt(process.env.REDIS_PORT || '6379')
        });
        
        this.eventQueue = new EventQueue(this.redis);
    }

    static getInstance(): EventDispatcher {
        if (!EventDispatcher.instance) {
            EventDispatcher.instance = new EventDispatcher();
        }
        return EventDispatcher.instance;
    }

    async initialize(): Promise<void> {
        if (this.initialized) return;
        
        // Start event processor
        this.startEventProcessor();
        
        this.initialized = true;
        
        this.emit('initialized', {
            timestamp: new Date()
        });
    }

    async dispatch(eventName: string, data: any, options?: DispatchOptions): Promise<string> {
        const event: NovaEvent = {
            id: this.generateEventId(),
            name: eventName,
            data,
            timestamp: new Date(),
            source: options?.source || 'application',
            correlationId: options?.correlationId || this.generateCorrelationId(),
            priority: options?.priority || 0,
            retryCount: 0
        };

        // Emit locally
        this.emit(eventName, event);
        
        // Queue for processing
        await this.eventQueue.enqueue(event);
        
        return event.id;
    }

    async dispatchIntegration(eventName: string, data: any): Promise<string> {
        return this.dispatch(eventName, data, {
            source: 'integration',
            priority: 10
        });
    }

    async dispatchBusiness(eventName: string, data: any): Promise<string> {
        return this.dispatch(eventName, data, {
            source: 'business',
            priority: 5
        });
    }

    registerSubscriber(subscriber: EventSubscriber): void {
        if (!this.subscribers.has(subscriber.eventName)) {
            this.subscribers.set(subscriber.eventName, []);
        }
        
        this.subscribers.get(subscriber.eventName)?.push(subscriber);
        
        // Sort by priority
        this.subscribers.get(subscriber.eventName)?.sort((a, b) => 
            (b.priority || 0) - (a.priority || 0)
        );
    }

    async subscribe(
        eventName: string,
        handler: EventHandler,
        options?: SubscriberOptions
    ): Promise<string> {
        const subscriberId = this.generateSubscriberId();
        
        const subscriber: EventSubscriber = {
            id: subscriberId,
            eventName,
            handler,
            priority: options?.priority || 0,
            synchronous: options?.synchronous || false,
            filter: options?.filter,
            maxRetries: options?.maxRetries || 3
        };
        
        this.registerSubscriber(subscriber);
        
        return subscriberId;
    }

    async unsubscribe(subscriberId: string): Promise<void> {
        for (const [eventName, subscribers] of this.subscribers) {
            const index = subscribers.findIndex(s => s.id === subscriberId);
            if (index !== -1) {
                subscribers.splice(index, 1);
                if (subscribers.length === 0) {
                    this.subscribers.delete(eventName);
                }
                break;
            }
        }
    }

    private async startEventProcessor(): Promise<void> {
        const worker = new Worker('events', async job => {
            const event = job.data as NovaEvent;
            await this.processEvent(event);
        }, {
            connection: this.redis
        });

        worker.on('completed', job => {
            this.emit('eventProcessed', {
                eventId: job.data.id,
                timestamp: new Date()
            });
        });

        worker.on('failed', (job, error) => {
            this.emit('eventFailed', {
                eventId: job?.data.id,
                error: error.message,
                timestamp: new Date()
            });
        });
    }

    private async processEvent(event: NovaEvent): Promise<void> {
        const subscribers = this.subscribers.get(event.name) || [];
        
        for (const subscriber of subscribers) {
            // Apply filter if exists
            if (subscriber.filter && !subscriber.filter(event.data)) {
                continue;
            }
            
            try {
                let retryCount = 0;
                let success = false;
                
                while (!success && retryCount < (subscriber.maxRetries || 3)) {
                    try {
                        await subscriber.handler(event.data, event);
                        success = true;
                    } catch (error) {
                        retryCount++;
                        if (retryCount >= (subscriber.maxRetries || 3)) {
                            throw error;
                        }
                        await this.delay(1000 * retryCount);
                    }
                }
                
                this.emit('subscriberExecuted', {
                    subscriberId: subscriber.id,
                    eventId: event.id,
                    success: true
                });
                
            } catch (error) {
                this.emit('subscriberFailed', {
                    subscriberId: subscriber.id,
                    eventId: event.id,
                    error: error.message
                });
                
                if (subscriber.synchronous) {
                    throw error;
                }
            }
        }
    }

    private generateEventId(): string {
        return `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    private generateSubscriberId(): string {
        return `sub_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    private generateCorrelationId(): string {
        return `cor_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    private delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

export class EventQueue {
    private queue: Queue;

    constructor(redis: Redis) {
        this.queue = new Queue('events', {
            connection: redis
        });
    }

    async enqueue(event: NovaEvent): Promise<void> {
        await this.queue.add(event.name, event, {
            priority: event.priority,
            attempts: 3,
            backoff: {
                type: 'exponential',
                delay: 1000
            }
        });
    }

    async dequeue(): Promise<NovaEvent | null> {
        const job = await this.queue.getNextJob();
        return job?.data as NovaEvent || null;
    }
}

export interface NovaEvent {
    id: string;
    name: string;
    data: any;
    timestamp: Date;
    source: string;
    correlationId: string;
    priority: number;
    retryCount: number;
}

export interface EventSubscriber {
    id: string;
    eventName: string;
    handler: EventHandler;
    priority: number;
    synchronous: boolean;
    filter?: (data: any) => boolean;
    maxRetries?: number;
}

export interface DispatchOptions {
    source?: string;
    correlationId?: string;
    priority?: number;
    delay?: number;
}

export interface SubscriberOptions {
    priority?: number;
    synchronous?: boolean;
    filter?: (data: any) => boolean;
    maxRetries?: number;
}

export type EventHandler = (data: any, event?: NovaEvent) => Promise<void> | void;