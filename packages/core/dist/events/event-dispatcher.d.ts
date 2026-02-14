export declare class EventDispatcher {
    private static instance;
    private subscribers;
    private eventQueue;
    private constructor();
    static getInstance(): EventDispatcher;
    registerSubscriber(eventName: string, subscriber: EventSubscriber): void;
    dispatch(eventName: string, ...args: any[]): Promise<void>;
    private startEventProcessor;
    private processEvent;
}
export declare class EventSubscriber {
    eventName: string;
    handler: Function;
    priority: number;
    synchronous: boolean;
    throwOnError: boolean;
    constructor(eventName: string, handler: Function, priority?: number, synchronous?: boolean, throwOnError?: boolean);
}
export declare class BusinessEvent {
    name: string;
    args: any[];
    timestamp: Date;
    id: string;
    constructor(name: string, args: any[], timestamp?: Date, id?: string);
}
export declare class EventQueue {
    private queue;
    private processing;
    enqueue(event: BusinessEvent): Promise<void>;
    dequeue(): Promise<BusinessEvent>;
    private sleep;
}
export declare function EventSubscriber(eventPattern: string, priority?: number): (target: any, propertyKey: string, descriptor: PropertyDescriptor) => PropertyDescriptor;
export declare function IntegrationEvent(synchronous?: boolean, throwOnError?: boolean): (target: any, propertyKey: string, descriptor: PropertyDescriptor) => PropertyDescriptor;
//# sourceMappingURL=event-dispatcher.d.ts.map