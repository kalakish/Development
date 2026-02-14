/// <reference types="node" />
import { EventEmitter } from 'events';
import { EventDispatcher, NovaEvent } from './dispatcher';
export declare class EventSubscriber extends EventEmitter {
    private id;
    private dispatcher;
    private patterns;
    private handlers;
    private retryPolicy;
    private deadLetterQueue;
    constructor(dispatcher: EventDispatcher, options?: SubscriberOptions);
    subscribe(eventName: string, handler: EventHandler, options?: HandlerOptions): Promise<string>;
    subscribePattern(pattern: string, handler: EventHandlerFunction, options?: HandlerOptions): Promise<string>;
    unsubscribe(handlerId: string): Promise<void>;
    private handleEvent;
    private executeHandler;
    private matchesPattern;
    private patternToRegex;
    private createPattern;
    private generateSubscriberId;
    private generateHandlerId;
    private sleep;
    replayDeadLetter(filter?: (item: DeadLetterItem) => boolean): Promise<void>;
    getDeadLetterCount(): Promise<number>;
    clearDeadLetter(): Promise<void>;
    getHandlerStats(): HandlerStats[];
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
//# sourceMappingURL=subscriber.d.ts.map