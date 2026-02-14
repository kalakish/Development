import { EventEmitter } from 'events';
import { Logger } from '@nova/core/utils/logger';

export interface Message {
    id: string;
    topic: string;
    content: any;
    timestamp: Date;
    metadata?: Record<string, any>;
}

export interface QueueOptions {
    name: string;
    durable?: boolean;
    autoDelete?: boolean;
    maxLength?: number;
    messageTTL?: number;
}

export interface PublishOptions {
    persistent?: boolean;
    priority?: number;
    delay?: number;
    expiration?: number;
    headers?: Record<string, any>;
}

export interface SubscribeOptions {
    queue?: string;
    durable?: boolean;
    autoAck?: boolean;
    prefetch?: number;
    consumerTag?: string;
}

export abstract class QueueClient extends EventEmitter {
    protected logger: Logger;
    protected connected: boolean = false;
    protected queues: Map<string, any> = new Map();
    protected consumers: Map<string, any> = new Map();

    constructor(name: string) {
        super();
        this.logger = new Logger(`QueueClient:${name}`);
    }

    abstract connect(): Promise<void>;
    abstract disconnect(): Promise<void>;
    abstract createQueue(options: QueueOptions): Promise<any>;
    abstract deleteQueue(queueName: string): Promise<void>;
    abstract publish(topic: string, message: any, options?: PublishOptions): Promise<string>;
    abstract subscribe(topic: string, handler: (message: Message) => Promise<void>, options?: SubscribeOptions): Promise<string>;
    abstract unsubscribe(consumerTag: string): Promise<void>;
    abstract ack(message: Message): Promise<void>;
    abstract nack(message: Message, requeue?: boolean): Promise<void>;
    abstract reject(message: Message, requeue?: boolean): Promise<void>;
    abstract purge(queueName: string): Promise<number>;
    abstract getQueueSize(queueName: string): Promise<number>;
    abstract isConnected(): boolean;

    protected generateMessageId(): string {
        return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    protected generateConsumerTag(): string {
        return `consumer_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    async healthCheck(): Promise<boolean> {
        return this.connected;
    }

    async getStats(): Promise<QueueStats> {
        const stats: QueueStats = {
            connected: this.connected,
            queues: this.queues.size,
            consumers: this.consumers.size,
            messages: {
                pending: 0,
                processing: 0,
                completed: 0,
                failed: 0
            }
        };

        for (const queueName of this.queues.keys()) {
            stats.messages.pending += await this.getQueueSize(queueName);
        }

        return stats;
    }
}

export interface QueueStats {
    connected: boolean;
    queues: number;
    consumers: number;
    messages: {
        pending: number;
        processing: number;
        completed: number;
        failed: number;
    };
}