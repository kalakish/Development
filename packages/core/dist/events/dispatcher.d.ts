/// <reference types="node" />
import { EventEmitter } from 'events';
import Redis from 'ioredis';
export declare class EventDispatcher extends EventEmitter {
    private static instance;
    private subscribers;
    private eventQueue;
    private redis;
    private initialized;
    private constructor();
    static getInstance(): EventDispatcher;
    initialize(): Promise<void>;
    dispatch(eventName: string, data: any, options?: DispatchOptions): Promise<string>;
    dispatchIntegration(eventName: string, data: any): Promise<string>;
    dispatchBusiness(eventName: string, data: any): Promise<string>;
    registerSubscriber(subscriber: EventSubscriber): void;
    subscribe(eventName: string, handler: EventHandler, options?: SubscriberOptions): Promise<string>;
    unsubscribe(subscriberId: string): Promise<void>;
    private startEventProcessor;
    private processEvent;
    private generateEventId;
    private generateSubscriberId;
    private generateCorrelationId;
    private delay;
}
export declare class EventQueue {
    private queue;
    constructor(redis: Redis);
    enqueue(event: NovaEvent): Promise<void>;
    dequeue(): Promise<NovaEvent | null>;
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
//# sourceMappingURL=dispatcher.d.ts.map