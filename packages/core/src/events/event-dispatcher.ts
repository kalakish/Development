export class EventDispatcher {
    private static instance: EventDispatcher;
    private subscribers: Map<string, EventSubscriber[]>;
    private eventQueue: EventQueue;

    private constructor() {
        this.subscribers = new Map();
        this.eventQueue = new EventQueue();
        this.startEventProcessor();
    }

    static getInstance(): EventDispatcher {
        if (!EventDispatcher.instance) {
            EventDispatcher.instance = new EventDispatcher();
        }
        return EventDispatcher.instance;
    }

    registerSubscriber(eventName: string, subscriber: EventSubscriber): void {
        if (!this.subscribers.has(eventName)) {
            this.subscribers.set(eventName, []);
        }
        this.subscribers.get(eventName)?.push(subscriber);
        
        // Sort by priority
        this.subscribers.get(eventName)?.sort((a, b) => 
            (b.priority || 0) - (a.priority || 0)
        );
    }

    async dispatch(eventName: string, ...args: any[]): Promise<void> {
        const event = new BusinessEvent(eventName, args);
        await this.eventQueue.enqueue(event);
    }

    private async startEventProcessor(): Promise<void> {
        while (true) {
            const event = await this.eventQueue.dequeue();
            await this.processEvent(event);
        }
    }

    private async processEvent(event: BusinessEvent): Promise<void> {
        const subscribers = this.subscribers.get(event.name) || [];
        
        for (const subscriber of subscribers) {
            try {
                await subscriber.handler(...event.args);
                
                if (subscriber.synchronous) {
                    // Wait for synchronous subscribers
                }
            } catch (error) {
                console.error(`Error processing event ${event.name}:`, error);
                
                // Error handling strategy
                if (subscriber.throwOnError) {
                    throw error;
                }
            }
        }
    }
}

export class EventSubscriber {
    constructor(
        public eventName: string,
        public handler: Function,
        public priority: number = 0,
        public synchronous: boolean = false,
        public throwOnError: boolean = false
    ) {}
}

export class BusinessEvent {
    constructor(
        public name: string,
        public args: any[],
        public timestamp: Date = new Date(),
        public id: string = uuid()
    ) {}
}

export class EventQueue {
    private queue: BusinessEvent[] = [];
    private processing: boolean = false;

    async enqueue(event: BusinessEvent): Promise<void> {
        this.queue.push(event);
    }

    async dequeue(): Promise<BusinessEvent> {
        while (this.queue.length === 0) {
            await this.sleep(100);
        }
        return this.queue.shift()!;
    }

    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// Decorators for event subscription
export function EventSubscriber(eventPattern: string, priority: number = 0) {
    return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
        const originalMethod = descriptor.value;
        
        descriptor.value = function (...args: any[]) {
            const dispatcher = EventDispatcher.getInstance();
            dispatcher.registerSubscriber(
                eventPattern,
                new EventSubscriber(eventPattern, originalMethod.bind(this), priority)
            );
            return originalMethod.apply(this, args);
        };
        
        return descriptor;
    };
}

export function IntegrationEvent(synchronous: boolean = false, throwOnError: boolean = false) {
    return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
        const originalMethod = descriptor.value;
        
        descriptor.value = async function (...args: any[]) {
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