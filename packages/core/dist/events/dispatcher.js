"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.EventQueue = exports.EventDispatcher = void 0;
const events_1 = require("events");
const bullmq_1 = require("bullmq");
const ioredis_1 = __importDefault(require("ioredis"));
class EventDispatcher extends events_1.EventEmitter {
    static instance;
    subscribers = new Map();
    eventQueue;
    redis;
    initialized = false;
    constructor() {
        super();
        this.redis = new ioredis_1.default({
            host: process.env.REDIS_HOST || 'localhost',
            port: parseInt(process.env.REDIS_PORT || '6379')
        });
        this.eventQueue = new EventQueue(this.redis);
    }
    static getInstance() {
        if (!EventDispatcher.instance) {
            EventDispatcher.instance = new EventDispatcher();
        }
        return EventDispatcher.instance;
    }
    async initialize() {
        if (this.initialized)
            return;
        // Start event processor
        this.startEventProcessor();
        this.initialized = true;
        this.emit('initialized', {
            timestamp: new Date()
        });
    }
    async dispatch(eventName, data, options) {
        const event = {
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
    async dispatchIntegration(eventName, data) {
        return this.dispatch(eventName, data, {
            source: 'integration',
            priority: 10
        });
    }
    async dispatchBusiness(eventName, data) {
        return this.dispatch(eventName, data, {
            source: 'business',
            priority: 5
        });
    }
    registerSubscriber(subscriber) {
        if (!this.subscribers.has(subscriber.eventName)) {
            this.subscribers.set(subscriber.eventName, []);
        }
        this.subscribers.get(subscriber.eventName)?.push(subscriber);
        // Sort by priority
        this.subscribers.get(subscriber.eventName)?.sort((a, b) => (b.priority || 0) - (a.priority || 0));
    }
    async subscribe(eventName, handler, options) {
        const subscriberId = this.generateSubscriberId();
        const subscriber = {
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
    async unsubscribe(subscriberId) {
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
    async startEventProcessor() {
        const worker = new bullmq_1.Worker('events', async (job) => {
            const event = job.data;
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
    async processEvent(event) {
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
                    }
                    catch (error) {
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
            }
            catch (error) {
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
    generateEventId() {
        return `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
    generateSubscriberId() {
        return `sub_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
    generateCorrelationId() {
        return `cor_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}
exports.EventDispatcher = EventDispatcher;
class EventQueue {
    queue;
    constructor(redis) {
        this.queue = new bullmq_1.Queue('events', {
            connection: redis
        });
    }
    async enqueue(event) {
        await this.queue.add(event.name, event, {
            priority: event.priority,
            attempts: 3,
            backoff: {
                type: 'exponential',
                delay: 1000
            }
        });
    }
    async dequeue() {
        const job = await this.queue.getNextJob();
        return job?.data || null;
    }
}
exports.EventQueue = EventQueue;
//# sourceMappingURL=dispatcher.js.map