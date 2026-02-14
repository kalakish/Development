import amqp, { Connection, Channel, ConsumeMessage } from 'amqplib';
import { QueueClient, QueueOptions, PublishOptions, SubscribeOptions, Message } from './queue-client';

export class RabbitMQClient extends QueueClient {
    private connection: Connection | null = null;
    private channel: Channel | null = null;
    private url: string;
    private reconnectAttempts: number = 0;
    private maxReconnectAttempts: number = 10;
    private reconnectDelay: number = 5000;

    constructor(url: string) {
        super('RabbitMQ');
        this.url = url;
    }

    async connect(): Promise<void> {
        try {
            this.connection = await amqp.connect(this.url);
            this.channel = await this.connection.createChannel();

            this.connection.on('error', (error) => {
                this.logger.error(`RabbitMQ connection error: ${error.message}`);
                this.emit('error', error);
            });

            this.connection.on('close', () => {
                this.logger.warn('RabbitMQ connection closed');
                this.connected = false;
                this.emit('disconnected');
                this.reconnect();
            });

            this.channel.on('error', (error) => {
                this.logger.error(`RabbitMQ channel error: ${error.message}`);
                this.emit('channelError', error);
            });

            this.connected = true;
            this.reconnectAttempts = 0;
            this.logger.success('Connected to RabbitMQ');
            this.emit('connected');

        } catch (error) {
            this.logger.error(`Failed to connect to RabbitMQ: ${error.message}`);
            throw error;
        }
    }

    private async reconnect(): Promise<void> {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            this.logger.error('Max reconnection attempts reached');
            return;
        }

        this.reconnectAttempts++;
        this.logger.info(`Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);

        setTimeout(async () => {
            try {
                await this.connect();
            } catch (error) {
                this.reconnect();
            }
        }, this.reconnectDelay * this.reconnectAttempts);
    }

    async disconnect(): Promise<void> {
        try {
            await this.channel?.close();
            await this.connection?.close();
            this.connected = false;
            this.logger.info('Disconnected from RabbitMQ');
            this.emit('disconnected');
        } catch (error) {
            this.logger.error(`Failed to disconnect: ${error.message}`);
            throw error;
        }
    }

    async createQueue(options: QueueOptions): Promise<any> {
        if (!this.channel) throw new Error('Not connected');

        const queue = await this.channel.assertQueue(options.name, {
            durable: options.durable ?? true,
            autoDelete: options.autoDelete ?? false,
            maxLength: options.maxLength,
            messageTtl: options.messageTTL
        });

        this.queues.set(options.name, queue);
        this.logger.debug(`Created queue: ${options.name}`);
        
        return queue;
    }

    async deleteQueue(queueName: string): Promise<void> {
        if (!this.channel) throw new Error('Not connected');

        await this.channel.deleteQueue(queueName);
        this.queues.delete(queueName);
        this.logger.debug(`Deleted queue: ${queueName}`);
    }

    async publish(topic: string, message: any, options?: PublishOptions): Promise<string> {
        if (!this.channel) throw new Error('Not connected');

        const messageId = this.generateMessageId();
        const content = Buffer.from(JSON.stringify({
            id: messageId,
            content: message,
            timestamp: new Date(),
            metadata: options?.headers
        }));

        await this.channel.publish('', topic, content, {
            persistent: options?.persistent ?? true,
            priority: options?.priority,
            expiration: options?.expiration?.toString(),
            headers: options?.headers,
            timestamp: Date.now(),
            messageId
        });

        this.logger.debug(`Published message ${messageId} to ${topic}`);
        return messageId;
    }

    async subscribe(
        topic: string,
        handler: (message: Message) => Promise<void>,
        options?: SubscribeOptions
    ): Promise<string> {
        if (!this.channel) throw new Error('Not connected');

        // Ensure queue exists
        const queueName = options?.queue || `${topic}_queue`;
        await this.createQueue({
            name: queueName,
            durable: options?.durable ?? true
        });

        // Bind queue to topic
        await this.channel.bindQueue(queueName, topic, '');

        // Set prefetch
        if (options?.prefetch) {
            await this.channel.prefetch(options.prefetch);
        }

        const consumerTag = options?.consumerTag || this.generateConsumerTag();

        const { consumerTag: tag } = await this.channel.consume(queueName, async (msg: ConsumeMessage | null) => {
            if (!msg) return;

            try {
                const data = JSON.parse(msg.content.toString());
                const message: Message = {
                    id: data.id,
                    topic,
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
                
                if (options?.autoAck !== false) {
                    await this.nack(msg, false);
                }
            }
        }, { consumerTag });

        this.consumers.set(consumerTag, { queueName, tag, handler });
        this.logger.debug(`Subscribed to ${topic} with consumer ${consumerTag}`);

        return consumerTag;
    }

    async unsubscribe(consumerTag: string): Promise<void> {
        if (!this.channel) throw new Error('Not connected');

        const consumer = this.consumers.get(consumerTag);
        if (consumer) {
            await this.channel.cancel(consumer.tag);
            this.consumers.delete(consumerTag);
            this.logger.debug(`Unsubscribed consumer ${consumerTag}`);
        }
    }

    async ack(message: Message): Promise<void> {
        // RabbitMQ handles acks via the original message object
        // This method is implemented for interface compatibility
    }

    async nack(message: Message, requeue: boolean = true): Promise<void> {
        // RabbitMQ handles nacks via the original message object
    }

    async reject(message: Message, requeue: boolean = false): Promise<void> {
        // RabbitMQ handles rejects via the original message object
    }

    async purge(queueName: string): Promise<number> {
        if (!this.channel) throw new Error('Not connected');

        const result = await this.channel.purgeQueue(queueName);
        return result.messageCount;
    }

    async getQueueSize(queueName: string): Promise<number> {
        if (!this.channel) throw new Error('Not connected');

        const queue = await this.channel.checkQueue(queueName);
        return queue.messageCount;
    }

    private async ack(msg: ConsumeMessage): Promise<void> {
        if (!this.channel) throw new Error('Not connected');
        this.channel.ack(msg);
    }

    private async nack(msg: ConsumeMessage, requeue: boolean): Promise<void> {
        if (!this.channel) throw new Error('Not connected');
        this.channel.nack(msg, false, requeue);
    }

    isConnected(): boolean {
        return this.connected && this.channel !== null;
    }
}