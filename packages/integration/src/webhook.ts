import { EventEmitter } from 'events';
import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';
import crypto from 'crypto';
import { Session } from '../core/session';

export class WebhookManager extends EventEmitter {
    private webhooks: Map<string, Webhook> = new Map();
    private axiosInstance: AxiosInstance;
    private signatures: Map<string, string> = new Map();

    constructor() {
        super();
        this.axiosInstance = axios.create({
            timeout: 30000,
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'NOVA-Webhook/1.0'
            }
        });
    }

    async registerWebhook(webhook: Webhook): Promise<string> {
        const webhookId = this.generateWebhookId();
        
        // Validate webhook configuration
        this.validateWebhook(webhook);

        // Test webhook URL
        if (webhook.testOnRegister) {
            await this.testWebhook(webhook);
        }

        // Store webhook
        this.webhooks.set(webhookId, {
            ...webhook,
            id: webhookId,
            createdAt: new Date(),
            updatedAt: new Date(),
            status: WebhookStatus.Active
        });

        // Generate signature secret
        if (webhook.signatureEnabled) {
            this.signatures.set(webhookId, this.generateSignatureSecret());
        }

        this.emit('webhookRegistered', {
            webhookId,
            event: webhook.event,
            url: webhook.url
        });

        return webhookId;
    }

    async unregisterWebhook(webhookId: string): Promise<void> {
        const webhook = this.webhooks.get(webhookId);
        
        if (webhook) {
            webhook.status = WebhookStatus.Disabled;
            webhook.updatedAt = new Date();
            
            this.webhooks.delete(webhookId);
            this.signatures.delete(webhookId);
            
            this.emit('webhookUnregistered', webhookId);
        }
    }

    async trigger(event: string, payload: any, session?: Session): Promise<WebhookResult[]> {
        const results: WebhookResult[] = [];
        
        // Find webhooks for this event
        const webhooks = this.getWebhooksForEvent(event);
        
        for (const webhook of webhooks) {
            try {
                // Check rate limit
                if (this.isRateLimited(webhook)) {
                    results.push({
                        webhookId: webhook.id!,
                        success: false,
                        error: 'Rate limit exceeded',
                        statusCode: 429,
                        timestamp: new Date()
                    });
                    continue;
                }

                // Prepare request
                const config = await this.prepareRequest(webhook, payload, session);
                
                // Execute webhook
                const startTime = Date.now();
                const response = await this.axiosInstance.request(config);
                const duration = Date.now() - startTime;

                // Update statistics
                this.updateStats(webhook.id!, true, duration);

                const result: WebhookResult = {
                    webhookId: webhook.id!,
                    success: true,
                    statusCode: response.status,
                    response: response.data,
                    duration,
                    timestamp: new Date()
                };

                results.push(result);

                this.emit('webhookTriggered', {
                    webhookId: webhook.id,
                    event,
                    success: true,
                    duration
                });

            } catch (error) {
                // Handle error
                const duration = Date.now() - startTime;
                this.updateStats(webhook.id!, false, duration);

                const result: WebhookResult = {
                    webhookId: webhook.id!,
                    success: false,
                    error: error.message,
                    statusCode: error.response?.status,
                    response: error.response?.data,
                    duration,
                    timestamp: new Date()
                };

                results.push(result);

                this.emit('webhookFailed', {
                    webhookId: webhook.id,
                    event,
                    error: error.message,
                    duration
                });

                // Handle retry logic
                await this.handleRetry(webhook, payload, session);
            }
        }

        return results;
    }

    async triggerAsync(event: string, payload: any, session?: Session): Promise<string> {
        const jobId = `webhook_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        // Queue webhook for async processing
        setImmediate(() => {
            this.trigger(event, payload, session).catch(error => {
                this.emit('webhookAsyncError', { event, error: error.message });
            });
        });

        return jobId;
    }

    private async prepareRequest(
        webhook: Webhook,
        payload: any,
        session?: Session
    ): Promise<AxiosRequestConfig> {
        const config: AxiosRequestConfig = {
            method: webhook.method || 'POST',
            url: webhook.url,
            headers: {
                ...webhook.headers
            }
        };

        // Add payload
        if (config.method === 'GET') {
            config.params = payload;
        } else {
            config.data = payload;
        }

        // Add authentication
        if (webhook.auth) {
            this.addAuthentication(config, webhook.auth);
        }

        // Add signature
        if (webhook.signatureEnabled && webhook.id) {
            const secret = this.signatures.get(webhook.id);
            if (secret) {
                config.headers!['X-Webhook-Signature'] = this.generateSignature(
                    payload,
                    secret,
                    webhook.signatureVersion || 'v1'
                );
            }
        }

        // Add session context
        if (session) {
            config.headers!['X-User-ID'] = session.user.id;
            config.headers!['X-Company-ID'] = session.company.id;
            config.headers!['X-Session-ID'] = session.id;
        }

        // Add custom transformers
        if (webhook.transform) {
            config.data = webhook.transform(config.data);
        }

        return config;
    }

    private addAuthentication(config: AxiosRequestConfig, auth: WebhookAuth): void {
        switch (auth.type) {
            case 'basic':
                const credentials = Buffer.from(`${auth.username}:${auth.password}`).toString('base64');
                config.headers!['Authorization'] = `Basic ${credentials}`;
                break;
                
            case 'bearer':
                config.headers!['Authorization'] = `Bearer ${auth.token}`;
                break;
                
            case 'apiKey':
                config.headers![auth.header || 'X-API-Key'] = auth.apiKey;
                break;
                
            case 'oauth2':
                config.headers!['Authorization'] = `Bearer ${auth.accessToken}`;
                break;
        }
    }

    private generateSignature(payload: any, secret: string, version: string): string {
        const timestamp = Math.floor(Date.now() / 1000);
        const signature = crypto
            .createHmac('sha256', secret)
            .update(`${timestamp}.${JSON.stringify(payload)}`)
            .digest('hex');
        
        return `${version}=${signature}, t=${timestamp}`;
    }

    private async handleRetry(webhook: Webhook, payload: any, session?: Session): Promise<void> {
        if (!webhook.retry || !webhook.id) return;

        const stats = this.getStats(webhook.id);
        
        if (stats.failureCount < webhook.retry.maxAttempts) {
            const delay = this.calculateRetryDelay(
                webhook.retry,
                stats.failureCount + 1
            );

            setTimeout(() => {
                this.trigger(webhook.event, payload, session);
            }, delay);
        }
    }

    private calculateRetryDelay(retry: WebhookRetry, attempt: number): number {
        switch (retry.strategy) {
            case 'fixed':
                return retry.delay || 60000;
                
            case 'linear':
                return (retry.delay || 60000) * attempt;
                
            case 'exponential':
                return (retry.delay || 60000) * Math.pow(2, attempt - 1);
                
            default:
                return 60000;
        }
    }

    private async testWebhook(webhook: Webhook): Promise<void> {
        try {
            await this.axiosInstance.request({
                method: 'HEAD',
                url: webhook.url,
                timeout: 5000
            });
        } catch (error) {
            throw new Error(`Webhook URL test failed: ${error.message}`);
        }
    }

    private validateWebhook(webhook: Webhook): void {
        if (!webhook.url) {
            throw new Error('Webhook URL is required');
        }

        if (!webhook.event) {
            throw new Error('Webhook event is required');
        }

        try {
            new URL(webhook.url);
        } catch {
            throw new Error('Invalid webhook URL');
        }

        // Validate authentication
        if (webhook.auth) {
            this.validateAuth(webhook.auth);
        }
    }

    private validateAuth(auth: WebhookAuth): void {
        switch (auth.type) {
            case 'basic':
                if (!auth.username || !auth.password) {
                    throw new Error('Basic authentication requires username and password');
                }
                break;
                
            case 'bearer':
                if (!auth.token) {
                    throw new Error('Bearer authentication requires token');
                }
                break;
                
            case 'apiKey':
                if (!auth.apiKey) {
                    throw new Error('API Key authentication requires apiKey');
                }
                break;
                
            case 'oauth2':
                if (!auth.accessToken) {
                    throw new Error('OAuth2 authentication requires accessToken');
                }
                break;
        }
    }

    private getWebhooksForEvent(event: string): Webhook[] {
        const webhooks: Webhook[] = [];
        
        for (const webhook of this.webhooks.values()) {
            if (webhook.status === WebhookStatus.Active) {
                if (webhook.event === event || webhook.event === '*') {
                    webhooks.push(webhook);
                }
            }
        }
        
        return webhooks;
    }

    private isRateLimited(webhook: Webhook): boolean {
        if (!webhook.rateLimit || !webhook.id) return false;

        const stats = this.getStats(webhook.id);
        const now = Date.now();
        
        // Reset counter if window has passed
        if (now - stats.windowStart > (webhook.rateLimit.window || 60000)) {
            stats.windowStart = now;
            stats.windowCount = 0;
        }

        return stats.windowCount >= webhook.rateLimit.max;
    }

    private updateStats(webhookId: string, success: boolean, duration: number): void {
        const stats = this.getStats(webhookId);
        
        stats.totalCalls++;
        stats.windowCount++;
        
        if (success) {
            stats.successCount++;
        } else {
            stats.failureCount++;
        }
        
        stats.totalDuration += duration;
        stats.averageDuration = stats.totalDuration / stats.totalCalls;
        stats.lastCalled = new Date();

        // Store updated stats
        this.setStats(webhookId, stats);
    }

    private getStats(webhookId: string): WebhookStats {
        const key = `webhook_stats_${webhookId}`;
        // Retrieve from cache or create new
        return {
            totalCalls: 0,
            successCount: 0,
            failureCount: 0,
            totalDuration: 0,
            averageDuration: 0,
            windowStart: Date.now(),
            windowCount: 0,
            lastCalled: null
        };
    }

    private setStats(webhookId: string, stats: WebhookStats): void {
        // Store in cache
    }

    private generateWebhookId(): string {
        return `whk_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    private generateSignatureSecret(): string {
        return crypto.randomBytes(32).toString('hex');
    }

    // Management APIs
    async getWebhook(webhookId: string): Promise<Webhook | undefined> {
        return this.webhooks.get(webhookId);
    }

    async getWebhooks(filter?: WebhookFilter): Promise<Webhook[]> {
        let webhooks = Array.from(this.webhooks.values());
        
        if (filter) {
            if (filter.event) {
                webhooks = webhooks.filter(w => w.event === filter.event);
            }
            if (filter.status) {
                webhooks = webhooks.filter(w => w.status === filter.status);
            }
        }
        
        return webhooks;
    }

    async updateWebhook(webhookId: string, updates: Partial<Webhook>): Promise<Webhook> {
        const webhook = this.webhooks.get(webhookId);
        
        if (!webhook) {
            throw new Error(`Webhook not found: ${webhookId}`);
        }

        Object.assign(webhook, updates, {
            updatedAt: new Date()
        });

        this.validateWebhook(webhook);
        
        return webhook;
    }

    async getWebhookLogs(webhookId: string, limit: number = 100): Promise<WebhookLog[]> {
        // Retrieve from logs
        return [];
    }

    async getWebhookStats(webhookId: string): Promise<WebhookStats> {
        return this.getStats(webhookId);
    }
}

export interface Webhook {
    id?: string;
    name: string;
    url: string;
    event: string;
    method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
    headers?: Record<string, string>;
    auth?: WebhookAuth;
    retry?: WebhookRetry;
    rateLimit?: WebhookRateLimit;
    signatureEnabled?: boolean;
    signatureVersion?: string;
    testOnRegister?: boolean;
    transform?: (payload: any) => any;
    status?: WebhookStatus;
    createdAt?: Date;
    updatedAt?: Date;
}

export interface WebhookAuth {
    type: 'basic' | 'bearer' | 'apiKey' | 'oauth2';
    username?: string;
    password?: string;
    token?: string;
    apiKey?: string;
    header?: string;
    accessToken?: string;
}

export interface WebhookRetry {
    maxAttempts: number;
    strategy: 'fixed' | 'linear' | 'exponential';
    delay?: number;
}

export interface WebhookRateLimit {
    max: number;
    window: number;
}

export enum WebhookStatus {
    Active = 'active',
    Disabled = 'disabled',
    Suspended = 'suspended'
}

export interface WebhookResult {
    webhookId: string;
    success: boolean;
    statusCode?: number;
    response?: any;
    error?: string;
    duration?: number;
    timestamp: Date;
}

export interface WebhookStats {
    totalCalls: number;
    successCount: number;
    failureCount: number;
    totalDuration: number;
    averageDuration: number;
    windowStart: number;
    windowCount: number;
    lastCalled: Date | null;
}

export interface WebhookLog {
    id: string;
    webhookId: string;
    event: string;
    success: boolean;
    statusCode?: number;
    duration: number;
    request: any;
    response?: any;
    error?: string;
    timestamp: Date;
}

export interface WebhookFilter {
    event?: string;
    status?: WebhookStatus;
}