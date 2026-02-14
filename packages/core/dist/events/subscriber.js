"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EventSubscriber = void 0;
const events_1 = require("events");
class EventSubscriber extends events_1.EventEmitter {
    id;
    dispatcher;
    patterns = new Map();
    handlers = new Map();
    retryPolicy;
    deadLetterQueue;
    constructor(dispatcher, options) {
        super();
        this.dispatcher = dispatcher;
        this.id = this.generateSubscriberId();
        this.retryPolicy = options?.retryPolicy || {
            maxRetries: 3,
            backoffMultiplier: 2,
            initialDelay: 1000
        };
        this.deadLetterQueue = new DeadLetterQueue();
    }
    async subscribe(eventName, handler, options) {
        const handlerId = this.generateHandlerId();
        const eventHandler = {
            id: handlerId,
            pattern: this.createPattern(eventName),
            handler: handler,
            filter: options?.filter,
            priority: options?.priority || 0,
            retryPolicy: { ...this.retryPolicy, ...options?.retryPolicy },
            timeout: options?.timeout,
            metadata: options?.metadata
        };
        if (!this.handlers.has(eventName)) {
            this.handlers.set(eventName, []);
        }
        this.handlers.get(eventName).push(eventHandler);
        // Register with dispatcher
        await this.dispatcher.subscribe(eventName, this.handleEvent.bind(this), {
            priority: options?.priority,
            filter: options?.filter
        });
        this.emit('subscribed', {
            eventName,
            handlerId,
            timestamp: new Date()
        });
        return handlerId;
    }
    async subscribePattern(pattern, handler, options) {
        const handlerId = this.generateHandlerId();
        const eventPattern = {
            pattern,
            regex: this.patternToRegex(pattern),
            handlerId
        };
        this.patterns.set(handlerId, eventPattern);
        // Register with dispatcher for all events
        await this.dispatcher.subscribe('*', async (data, event) => {
            if (event && this.matchesPattern(event.name, eventPattern)) {
                await this.executeHandler(handler, data, event);
            }
        }, options);
        return handlerId;
    }
    async unsubscribe(handlerId) {
        for (const [eventName, handlers] of this.handlers) {
            const index = handlers.findIndex(h => h.id === handlerId);
            if (index !== -1) {
                handlers.splice(index, 1);
                if (handlers.length === 0) {
                    this.handlers.delete(eventName);
                }
                break;
            }
        }
        this.patterns.delete(handlerId);
        this.emit('unsubscribed', {
            handlerId,
            timestamp: new Date()
        });
    }
    async handleEvent(data, event) {
        const handlers = this.handlers.get(event.name) || [];
        // Sort by priority
        handlers.sort((a, b) => b.priority - a.priority);
        for (const handler of handlers) {
            await this.executeHandler(handler.handler, data, event, handler);
        }
    }
    async executeHandler(handler, data, event, options) {
        const startTime = Date.now();
        try {
            // Apply filter
            if (options?.filter && !options.filter(data)) {
                return;
            }
            // Set timeout
            let timeoutId;
            const timeoutPromise = options?.timeout ? new Promise((_, reject) => {
                timeoutId = setTimeout(() => {
                    reject(new Error(`Handler timeout after ${options.timeout}ms`));
                }, options.timeout);
            }) : null;
            // Execute with retry
            let attempts = 0;
            let lastError;
            const maxRetries = options?.retryPolicy?.maxRetries || this.retryPolicy.maxRetries;
            const initialDelay = options?.retryPolicy?.initialDelay || this.retryPolicy.initialDelay;
            const backoffMultiplier = options?.retryPolicy?.backoffMultiplier || this.retryPolicy.backoffMultiplier;
            while (attempts <= maxRetries) {
                try {
                    if (timeoutPromise) {
                        await Promise.race([
                            handler(data, event),
                            timeoutPromise
                        ]);
                    }
                    else {
                        await handler(data, event);
                    }
                    // Success
                    this.emit('handlerSuccess', {
                        handlerId: options?.id,
                        eventId: event.id,
                        duration: Date.now() - startTime,
                        attempts: attempts + 1
                    });
                    if (timeoutId)
                        clearTimeout(timeoutId);
                    return;
                }
                catch (error) {
                    lastError = error;
                    attempts++;
                    if (attempts <= maxRetries) {
                        // Calculate backoff delay
                        const delay = initialDelay * Math.pow(backoffMultiplier, attempts - 1);
                        this.emit('handlerRetry', {
                            handlerId: options?.id,
                            eventId: event.id,
                            attempt: attempts,
                            delay,
                            error: error.message
                        });
                        await this.sleep(delay);
                    }
                }
            }
            // All retries failed
            throw lastError;
        }
        catch (error) {
            // Move to dead letter queue
            await this.deadLetterQueue.push({
                event,
                handlerId: options?.id,
                error: error.message,
                timestamp: new Date()
            });
            this.emit('handlerFailed', {
                handlerId: options?.id,
                eventId: event.id,
                error: error.message,
                duration: Date.now() - startTime
            });
            throw error;
        }
    }
    matchesPattern(eventName, pattern) {
        return pattern.regex.test(eventName);
    }
    patternToRegex(pattern) {
        // Convert wildcard pattern to regex
        // * matches any sequence of characters
        // ? matches any single character
        const regexStr = pattern
            .replace(/\./g, '\\.')
            .replace(/\*/g, '.*')
            .replace(/\?/g, '.');
        return new RegExp(`^${regexStr}$`);
    }
    createPattern(eventName) {
        return {
            pattern: eventName,
            regex: this.patternToRegex(eventName),
            handlerId: this.generateHandlerId()
        };
    }
    generateSubscriberId() {
        return `sub_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
    generateHandlerId() {
        return `hnd_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    // Dead letter queue management
    async replayDeadLetter(filter) {
        const items = await this.deadLetterQueue.getItems(filter);
        for (const item of items) {
            try {
                await this.handleEvent(item.event.data, item.event);
                await this.deadLetterQueue.remove(item.id);
            }
            catch (error) {
                // Keep in DLQ
            }
        }
    }
    async getDeadLetterCount() {
        return this.deadLetterQueue.count();
    }
    async clearDeadLetter() {
        await this.deadLetterQueue.clear();
    }
    // Metrics
    getHandlerStats() {
        const stats = [];
        for (const [eventName, handlers] of this.handlers) {
            for (const handler of handlers) {
                stats.push({
                    handlerId: handler.id,
                    eventName,
                    priority: handler.priority,
                    retryPolicy: handler.retryPolicy,
                    timeout: handler.timeout,
                    metadata: handler.metadata
                });
            }
        }
        return stats;
    }
}
exports.EventSubscriber = EventSubscriber;
class DeadLetterQueue {
    items = new Map();
    async push(item) {
        const id = `dlq_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        this.items.set(id, { id, ...item });
    }
    async getItems(filter) {
        let items = Array.from(this.items.values());
        if (filter) {
            items = items.filter(filter);
        }
        return items;
    }
    async remove(id) {
        this.items.delete(id);
    }
    async clear() {
        this.items.clear();
    }
    async count() {
        return this.items.size;
    }
}
//# sourceMappingURL=subscriber.js.map