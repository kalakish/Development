"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.IntegrationEvent = exports.EventQueue = exports.BusinessEvent = exports.EventSubscriber = exports.EventDispatcher = void 0;
class EventDispatcher {
    static instance;
    subscribers;
    eventQueue;
    constructor() {
        this.subscribers = new Map();
        this.eventQueue = new EventQueue();
        this.startEventProcessor();
    }
    static getInstance() {
        if (!EventDispatcher.instance) {
            EventDispatcher.instance = new EventDispatcher();
        }
        return EventDispatcher.instance;
    }
    registerSubscriber(eventName, subscriber) {
        if (!this.subscribers.has(eventName)) {
            this.subscribers.set(eventName, []);
        }
        this.subscribers.get(eventName)?.push(subscriber);
        // Sort by priority
        this.subscribers.get(eventName)?.sort((a, b) => (b.priority || 0) - (a.priority || 0));
    }
    async dispatch(eventName, ...args) {
        const event = new BusinessEvent(eventName, args);
        await this.eventQueue.enqueue(event);
    }
    async startEventProcessor() {
        while (true) {
            const event = await this.eventQueue.dequeue();
            await this.processEvent(event);
        }
    }
    async processEvent(event) {
        const subscribers = this.subscribers.get(event.name) || [];
        for (const subscriber of subscribers) {
            try {
                await subscriber.handler(...event.args);
                if (subscriber.synchronous) {
                    // Wait for synchronous subscribers
                }
            }
            catch (error) {
                console.error(`Error processing event ${event.name}:`, error);
                // Error handling strategy
                if (subscriber.throwOnError) {
                    throw error;
                }
            }
        }
    }
}
exports.EventDispatcher = EventDispatcher;
class EventSubscriber {
    eventName;
    handler;
    priority;
    synchronous;
    throwOnError;
    constructor(eventName, handler, priority = 0, synchronous = false, throwOnError = false) {
        this.eventName = eventName;
        this.handler = handler;
        this.priority = priority;
        this.synchronous = synchronous;
        this.throwOnError = throwOnError;
    }
}
exports.EventSubscriber = EventSubscriber;
class BusinessEvent {
    name;
    args;
    timestamp;
    id;
    constructor(name, args, timestamp = new Date(), id = uuid()) {
        this.name = name;
        this.args = args;
        this.timestamp = timestamp;
        this.id = id;
    }
}
exports.BusinessEvent = BusinessEvent;
class EventQueue {
    queue = [];
    processing = false;
    async enqueue(event) {
        this.queue.push(event);
    }
    async dequeue() {
        while (this.queue.length === 0) {
            await this.sleep(100);
        }
        return this.queue.shift();
    }
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}
exports.EventQueue = EventQueue;
// Decorators for event subscription
function EventSubscriber(eventPattern, priority = 0) {
    return function (target, propertyKey, descriptor) {
        const originalMethod = descriptor.value;
        descriptor.value = function (...args) {
            const dispatcher = EventDispatcher.getInstance();
            dispatcher.registerSubscriber(eventPattern, new EventSubscriber(eventPattern, originalMethod.bind(this), priority));
            return originalMethod.apply(this, args);
        };
        return descriptor;
    };
}
exports.EventSubscriber = EventSubscriber;
function IntegrationEvent(synchronous = false, throwOnError = false) {
    return function (target, propertyKey, descriptor) {
        const originalMethod = descriptor.value;
        descriptor.value = async function (...args) {
            const eventName = `${target.constructor.name}.${propertyKey}`;
            const dispatcher = EventDispatcher.getInstance();
            // Dispatch before event
            await dispatcher.dispatch(`${eventName}:before`, ...args);
            // Execute original method
            const result = await originalMethod.apply(this, args);
            // Dispatch after event
            await dispatcher.dispatch(`${eventName}:after`, result, ...args);
            return result;
        };
        return descriptor;
    };
}
exports.IntegrationEvent = IntegrationEvent;
//# sourceMappingURL=event-dispatcher.js.map