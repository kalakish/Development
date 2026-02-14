import { EventEmitter } from 'events';
import { EventDispatcher, NovaEvent } from './dispatcher';

export class EventSubscriber extends EventEmitter {
    private id: string;
    private dispatcher: EventDispatcher;
    private patterns: Map<string, EventPattern> = new Map();
    private handlers: Map<string, EventHandler[]> = new Map();
    private retryPolicy: RetryPolicy;
    private deadLetterQueue: DeadLetterQueue;

    constructor(dispatcher: EventDispatcher, options?: SubscriberOptions) {
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

    async subscribe(
        eventName: string,
        handler: EventHandler,
        options?: HandlerOptions
    ): Promise<string> {
        const handlerId = this.generateHandlerId();
        
        const eventHandler: EventHandler = {
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

        this.handlers.get(eventName)!.push(eventHandler);
        
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

    async subscribePattern(
        pattern: string,
        handler: EventHandlerFunction,
        options?: HandlerOptions
    ): Promise<string> {
        const handlerId = this.generateHandlerId();
        
        const eventPattern: EventPattern = {
            pattern,
            regex: this.patternToRegex(pattern),
            handlerId
        };

        this.patterns.set(handlerId, eventPattern);

        // Register with dispatcher for all events
        await this.dispatcher.subscribe('*', async (data: any, event?: NovaEvent) => {
            if (event && this.matchesPattern(event.name, eventPattern)) {
                await this.executeHandler(handler, data, event);
            }
        }, options);

        return handlerId;
    }

    async unsubscribe(handlerId: string): Promise<void> {
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

    private async handleEvent(data: any, event: NovaEvent): Promise<void> {
        const handlers = this.handlers.get(event.name) || [];
        
        // Sort by priority
        handlers.sort((a, b) => b.priority - a.priority);

        for (const handler of handlers) {
            await this.executeHandler(handler.handler, data, event, handler);
        }
    }

    private async executeHandler(
        handler: EventHandlerFunction,
        data: any,
        event: NovaEvent,
        options?: EventHandler
    ): Promise<void> {
        const startTime = Date.now();

        try {
            // Apply filter
            if (options?.filter && !options.filter(data)) {
                return;
            }

            // Set timeout
            let timeoutId: NodeJS.Timeout;
            const timeoutPromise = options?.timeout ? new Promise((_, reject) => {
                timeoutId = setTimeout(() => {
                    reject(new Error(`Handler timeout after ${options.timeout}ms`));
                }, options.timeout);
            }) : null;

            // Execute with retry
            let attempts = 0;
            let lastError: Error;
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
                    } else {
                        await handler(data, event);
                    }

                    // Success
                    this.emit('handlerSuccess', {
                        handlerId: options?.id,
                        eventId: event.id,
                        duration: Date.now() - startTime,
                        attempts: attempts + 1
                    });

                    if (timeoutId) clearTimeout(timeoutId);
                    return;

                } catch (error) {
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
            throw lastError!;

        } catch (error) {
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

    private matchesPattern(eventName: string, pattern: EventPattern): boolean {
        return pattern.regex.test(eventName);
    }

    private patternToRegex(pattern: string): RegExp {
        // Convert wildcard pattern to regex
        // * matches any sequence of characters
        // ? matches any single character
        const regexStr = pattern
            .replace(/\./g, '\\.')
            .replace(/\*/g, '.*')
            .replace(/\?/g, '.');
        
        return new RegExp(`^${regexStr}$`);
    }

    private createPattern(eventName: string): EventPattern {
        return {
            pattern: eventName,
            regex: this.patternToRegex(eventName),
            handlerId: this.generateHandlerId()
        };
    }

    private generateSubscriberId(): string {
        return `sub_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    private generateHandlerId(): string {
        return `hnd_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // Dead letter queue management
    async replayDeadLetter(filter?: (item: DeadLetterItem) => boolean): Promise<void> {
        const items = await this.deadLetterQueue.getItems(filter);
        
        for (const item of items) {
            try {
                await this.handleEvent(item.event.data, item.event);
                await this.deadLetterQueue.remove(item.id);
            } catch (error) {
                // Keep in DLQ
            }
        }
    }

    async getDeadLetterCount(): Promise<number> {
        return this.deadLetterQueue.count();
    }

    async clearDeadLetter(): Promise<void> {
        await this.deadLetterQueue.clear();
    }

    // Metrics
    getHandlerStats(): HandlerStats[] {
        const stats: HandlerStats[] = [];
        
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

export interface EventHandler {
    id: string;
    pattern: EventPattern;
    handler: EventHandlerFunction;
    filter?: (data: any) => boolean;
    priority: number;
    retryPolicy: RetryPolicy;
    timeout?: number;
    metadata?: Record<string, any>;
}

export interface EventPattern {
    pattern: string;
    regex: RegExp;
    handlerId: string;
}

export interface EventHandlerFunction {
    (data: any, event?: NovaEvent): Promise<void> | void;
}

export interface RetryPolicy {
    maxRetries: number;
    backoffMultiplier: number;
    initialDelay: number;
}

export interface HandlerOptions {
    filter?: (data: any) => boolean;
    priority?: number;
    retryPolicy?: Partial<RetryPolicy>;
    timeout?: number;
    metadata?: Record<string, any>;
}

export interface HandlerStats {
    handlerId: string;
    eventName: string;
    priority: number;
    retryPolicy: RetryPolicy;
    timeout?: number;
    metadata?: Record<string, any>;
}

class DeadLetterQueue {
    private items: Map<string, DeadLetterItem> = new Map();

    async push(item: Omit<DeadLetterItem, 'id'>): Promise<void> {
        const id = `dlq_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        this.items.set(id, { id, ...item });
    }

    async getItems(filter?: (item: DeadLetterItem) => boolean): Promise<DeadLetterItem[]> {
        let items = Array.from(this.items.values());
        if (filter) {
            items = items.filter(filter);
        }
        return items;
    }

    async remove(id: string): Promise<void> {
        this.items.delete(id);
    }

    async clear(): Promise<void> {
        this.items.clear();
    }

    async count(): Promise<number> {
        return this.items.size;
    }
}

export interface DeadLetterItem {
    id: string;
    event: NovaEvent;
    handlerId?: string;
    error: string;
    timestamp: Date;
}

export interface SubscriberOptions {
    retryPolicy?: Partial<RetryPolicy>;
}