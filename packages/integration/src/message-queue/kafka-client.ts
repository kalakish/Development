import { Kafka, Producer, Consumer, EachMessagePayload, Partitioners } from 'kafkajs';
import { QueueClient, QueueOptions, PublishOptions, SubscribeOptions, Message } from './queue-client';

export class KafkaClient extends QueueClient {
    private kafka: Kafka;
    private producer: Producer | null = null;
    private consumer: Consumer | null = null;
    private brokers: string[];
    private clientId: string;
    private groupId: string;

    constructor(brokers: string[], clientId: string = 'nova-client', groupId: string = 'nova-group') {
        super('Kafka');
        this.brokers = brokers;
        this.clientId = clientId;
        this.groupId = groupId;

        this.kafka = new Kafka({
            clientId: this.clientId,
            brokers: this.brokers,
            retry: {
                initialRetryTime: 100,
                retries: 8
            }
        });
    }

    async connect(): Promise<void> {
        try {
            this.producer = this.kafka.producer({
                createPartitioner: Partitioners.LegacyPartitioner
            });
            await this.producer.connect();

            this.consumer = this.kafka.consumer({ groupId: this.groupId });
            await this.consumer.connect();

            this.connected = true;
            this.logger.success('Connected to Kafka');
            this.emit('connected');

        } catch (error) {
            this.logger.error(`Failed to connect to Kafka: ${error.message}`);
            throw error;
        }
    }

    async disconnect(): Promise<void> {
        try {
            await this.producer?.disconnect();
            await this.consumer?.disconnect();
            this.connected = false;
            this.logger.info('Disconnected from Kafka');
            this.emit('disconnected');
        } catch (error) {
            this.logger.error(`Failed to disconnect: ${error.message}`);
            throw error;
        }
    }

    async createQueue(options: QueueOptions): Promise<any> {
        // Kafka topics are created automatically on first use
        this.queues.set(options.name, { name: options.name });
        this.logger.debug(`Registered topic: ${options.name}`);
        return { topic: options.name };
    }

    async deleteQueue(queueName: string): Promise<void> {
        // Kafka doesn't support topic deletion via client
        this.queues.delete(queueName);
        this.logger.debug(`Removed topic: ${queueName}`);
    }

    async publish(topic: string, message: any, options?: PublishOptions): Promise<string> {
        if (!this.producer) throw new Error('Not connected');

        const messageId = this.generateMessageId();
        const payload = {
            id: messageId,
            content: message,
            timestamp: new Date(),
            metadata: options?.headers
        };

        await this.producer.send({
            topic,
            messages: [{
                key: messageId,
                value: JSON.stringify(payload),
                timestamp: options?.expiration?.toString(),
                headers: options?.headers
            }]
        });

        this.logger.debug(`Published message ${messageId} to ${topic}`);
        return messageId;
    }

    async subscribe(
        topic: string,
        handler: (message: Message) => Promise<void>,
        options?: SubscribeOptions
    ): Promise<string> {
        if (!this.consumer) throw new Error('Not connected');

        await this.consumer.subscribe({
            topic,
            fromBeginning: options?.durable ?? false
        });

        const consumerTag = options?.consumerTag || this.generateConsumerTag();

        await this.consumer.run({
            eachMessage: async (payload: EachMessagePayload) => {
                try {
                    const data = JSON.parse(payload.message.value?.toString() || '{}');
                    
                    const message: Message = {
                        id: data.id || payload.message.key?.toString() || this.generateMessageId(),
                        topic: payload.topic,
                        content: data.content,
                        timestamp: new Date(data.timestamp),
                        metadata: data.metadata
                    };

                    await handler(message);

                    if (options?.autoAck !== false) {
                        await this.ack(message);
                    }

                } catch (error) {
                    this.logger.error(`Failed to process message: ${error.message}`);
                }
            }
        });

        this.consumers.set(consumerTag, { topic, handler });
        this.logger.debug(`Subscribed to ${topic} with consumer ${consumerTag}`);

        return consumerTag;
    }

    async unsubscribe(consumerTag: string): Promise<void> {
        // Kafka doesn't support per-consumer unsubscription via client
        this.consumers.delete(consumerTag);
        this.logger.debug(`Unsubscribed consumer ${consumerTag}`);
    }

    async ack(message: Message): Promise<void> {
        // Kafka automatically commits offsets
    }

    async nack(message: Message, requeue: boolean = true): Promise<void> {
        // Kafka doesn't support nack
    }

    async reject(message: Message, requeue: boolean = false): Promise<void> {
        // Kafka doesn't support reject
    }

    async purge(queueName: string): Promise<number> {
        // Kafka doesn't support purging topics via client
        return 0;
    }

    async getQueueSize(queueName: string): Promise<number> {
        // Kafka doesn't provide queue size via client
        return 0;
    }

    isConnected(): boolean {
        return this.connected;
    }
}