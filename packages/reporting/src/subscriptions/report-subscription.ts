import { EventEmitter } from 'events';
import { SQLServerConnection } from '@nova/core/database/sqlserver-connection';
import { ReportEngine, ReportDefinition, ReportParameters, ReportResult } from '../report-engine';
import { ReportScheduler, ScheduleDefinition } from '../scheduler/report-scheduler';
import { v4 as uuidv4 } from 'uuid';
import { DateTime } from '@nova/core/data-types/datetime';

export interface ReportSubscription {
    id: string;
    name: string;
    description?: string;
    reportId: string;
    userId: string;
    userName: string;
    schedule: ScheduleDefinition;
    parameters?: ReportParameters;
    format: 'pdf' | 'excel' | 'csv' | 'json' | 'xml' | 'html' | 'yaml';
    delivery: DeliveryConfig;
    filters?: SubscriptionFilter[];
    enabled: boolean;
    lastDelivery?: Date;
    nextDelivery?: Date;
    deliveryCount: number;
    errorCount: number;
    createdAt: Date;
    updatedAt: Date;
    expiresAt?: Date;
    metadata?: Record<string, any>;
}

export interface DeliveryConfig {
    type: 'email' | 'webhook' | 'ftp' | 's3' | 'sharepoint';
    recipients?: string[];
    subject?: string;
    message?: string;
    attachments?: boolean;
    compress?: boolean;
    encrypt?: boolean;
    retentionDays?: number;
    webhookUrl?: string;
    webhookHeaders?: Record<string, string>;
    ftpConfig?: FTPConfig;
    s3Config?: S3Config;
    sharepointConfig?: SharepointConfig;
}

export interface FTPConfig {
    host: string;
    port: number;
    username: string;
    password: string;
    path: string;
    secure?: boolean;
}

export interface S3Config {
    bucket: string;
    region: string;
    accessKey: string;
    secretKey: string;
    path: string;
    endpoint?: string;
}

export interface SharepointConfig {
    siteUrl: string;
    library: string;
    folder: string;
    username?: string;
    password?: string;
    clientId?: string;
    clientSecret?: string;
}

export interface SubscriptionFilter {
    field: string;
    operator: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'like' | 'in' | 'between';
    value: any;
    secondValue?: any;
}

export interface SubscriptionDelivery {
    id: string;
    subscriptionId: string;
    reportId: string;
    reportName: string;
    status: 'pending' | 'processing' | 'success' | 'failed';
    format: string;
    recipientCount: number;
    fileSize?: number;
    fileUrl?: string;
    error?: string;
    startedAt: Date;
    completedAt?: Date;
    duration?: number;
    parameters?: ReportParameters;
}

export interface SubscriptionStats {
    totalSubscriptions: number;
    activeSubscriptions: number;
    totalDeliveries: number;
    successfulDeliveries: number;
    failedDeliveries: number;
    pendingDeliveries: number;
    averageDeliveryTime: number;
    subscriptionsByReport: Record<string, number>;
    subscriptionsByFormat: Record<string, number>;
}

export class ReportSubscriptionService extends EventEmitter {
    private connection: SQLServerConnection;
    private reportEngine: ReportEngine;
    private reportScheduler: ReportScheduler;
    private subscriptions: Map<string, ReportSubscription> = new Map();
    private deliveries: Map<string, SubscriptionDelivery> = new Map();
    private deliveryQueue: string[] = [];
    private processing: boolean = false;
    private initialized: boolean = false;

    constructor(
        connection: SQLServerConnection,
        reportEngine: ReportEngine,
        reportScheduler: ReportScheduler
    ) {
        super();
        this.connection = connection;
        this.reportEngine = reportEngine;
        this.reportScheduler = reportScheduler;
    }

    async initialize(): Promise<void> {
        if (this.initialized) return;

        await this.ensureSubscriptionTables();
        await this.loadSubscriptions();
        
        this.initialized = true;
        this.emit('initialized');

        // Start delivery processor
        this.startDeliveryProcessor();
    }

    private async ensureSubscriptionTables(): Promise<void> {
        // Create ReportSubscriptions table
        await this.connection.query(`
            IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'ReportSubscriptions')
            BEGIN
                CREATE TABLE [ReportSubscriptions] (
                    [Id] INT IDENTITY(1,1) NOT NULL,
                    [SystemId] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [DF_ReportSubscriptions_SystemId] DEFAULT NEWID(),
                    [Name] NVARCHAR(255) NOT NULL,
                    [Description] NVARCHAR(500) NULL,
                    [ReportId] NVARCHAR(100) NOT NULL,
                    [UserId] UNIQUEIDENTIFIER NOT NULL,
                    [UserName] NVARCHAR(100) NOT NULL,
                    [Schedule] NVARCHAR(MAX) NOT NULL,
                    [Parameters] NVARCHAR(MAX) NULL,
                    [Format] NVARCHAR(20) NOT NULL,
                    [Delivery] NVARCHAR(MAX) NOT NULL,
                    [Filters] NVARCHAR(MAX) NULL,
                    [Enabled] BIT NOT NULL CONSTRAINT [DF_ReportSubscriptions_Enabled] DEFAULT 1,
                    [LastDelivery] DATETIME2 NULL,
                    [NextDelivery] DATETIME2 NULL,
                    [DeliveryCount] INT NOT NULL CONSTRAINT [DF_ReportSubscriptions_DeliveryCount] DEFAULT 0,
                    [ErrorCount] INT NOT NULL CONSTRAINT [DF_ReportSubscriptions_ErrorCount] DEFAULT 0,
                    [ExpiresAt] DATETIME2 NULL,
                    [Metadata] NVARCHAR(MAX) NULL,
                    [SystemCreatedAt] DATETIME2 NOT NULL CONSTRAINT [DF_ReportSubscriptions_CreatedAt] DEFAULT GETUTCDATE(),
                    [SystemModifiedAt] DATETIME2 NULL,
                    [SystemDeletedAt] DATETIME2 NULL,
                    CONSTRAINT [PK_ReportSubscriptions] PRIMARY KEY CLUSTERED ([Id])
                );

                CREATE UNIQUE INDEX [UX_ReportSubscriptions_SystemId] ON [ReportSubscriptions] ([SystemId]);
                CREATE INDEX [IX_ReportSubscriptions_ReportId] ON [ReportSubscriptions] ([ReportId]);
                CREATE INDEX [IX_ReportSubscriptions_UserId] ON [ReportSubscriptions] ([UserId]);
                CREATE INDEX [IX_ReportSubscriptions_NextDelivery] ON [ReportSubscriptions] ([NextDelivery]);
                CREATE INDEX [IX_ReportSubscriptions_Enabled] ON [ReportSubscriptions] ([Enabled]);
                
                PRINT '✅ Created ReportSubscriptions table';
            END
        `);

        // Create SubscriptionDeliveries table
        await this.connection.query(`
            IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'SubscriptionDeliveries')
            BEGIN
                CREATE TABLE [SubscriptionDeliveries] (
                    [Id] INT IDENTITY(1,1) NOT NULL,
                    [SystemId] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [DF_SubscriptionDeliveries_SystemId] DEFAULT NEWID(),
                    [SubscriptionId] UNIQUEIDENTIFIER NOT NULL,
                    [ReportId] NVARCHAR(100) NOT NULL,
                    [ReportName] NVARCHAR(255) NOT NULL,
                    [Status] NVARCHAR(20) NOT NULL,
                    [Format] NVARCHAR(20) NOT NULL,
                    [RecipientCount] INT NOT NULL,
                    [FileSize] BIGINT NULL,
                    [FileUrl] NVARCHAR(500) NULL,
                    [Error] NVARCHAR(MAX) NULL,
                    [Parameters] NVARCHAR(MAX) NULL,
                    [StartedAt] DATETIME2 NOT NULL,
                    [CompletedAt] DATETIME2 NULL,
                    [Duration] INT NULL,
                    [SystemCreatedAt] DATETIME2 NOT NULL CONSTRAINT [DF_SubscriptionDeliveries_CreatedAt] DEFAULT GETUTCDATE(),
                    CONSTRAINT [PK_SubscriptionDeliveries] PRIMARY KEY CLUSTERED ([Id])
                );

                CREATE UNIQUE INDEX [UX_SubscriptionDeliveries_SystemId] ON [SubscriptionDeliveries] ([SystemId]);
                CREATE INDEX [IX_SubscriptionDeliveries_SubscriptionId] ON [SubscriptionDeliveries] ([SubscriptionId]);
                CREATE INDEX [IX_SubscriptionDeliveries_Status] ON [SubscriptionDeliveries] ([Status]);
                CREATE INDEX [IX_SubscriptionDeliveries_StartedAt] ON [SubscriptionDeliveries] ([StartedAt]);
                
                PRINT '✅ Created SubscriptionDeliveries table';
            END
        `);
    }

    // ============ Subscription Management ============

    async createSubscription(
        subscription: Omit<ReportSubscription, 'id' | 'createdAt' | 'updatedAt' | 'deliveryCount' | 'errorCount'>
    ): Promise<string> {
        const id = uuidv4();
        const now = new Date();

        // Validate subscription
        await this.validateSubscription(subscription);

        // Calculate next delivery
        const nextDelivery = this.calculateNextDelivery(subscription.schedule);

        const newSubscription: ReportSubscription = {
            id,
            ...subscription,
            enabled: subscription.enabled ?? true,
            deliveryCount: 0,
            errorCount: 0,
            nextDelivery,
            createdAt: now,
            updatedAt: now
        };

        // Save to database
        await this.saveSubscription(newSubscription);

        // Cache in memory
        this.subscriptions.set(id, newSubscription);

        // Schedule next delivery
        if (newSubscription.enabled && nextDelivery) {
            await this.scheduleNextDelivery(newSubscription);
        }

        this.emit('subscriptionCreated', {
            subscriptionId: id,
            reportId: subscription.reportId,
            userId: subscription.userId,
            timestamp: now
        });

        return id;
    }

    async updateSubscription(
        subscriptionId: string,
        updates: Partial<ReportSubscription>
    ): Promise<ReportSubscription> {
        const subscription = this.subscriptions.get(subscriptionId);
        
        if (!subscription) {
            throw new Error(`Subscription not found: ${subscriptionId}`);
        }

        const updatedSubscription: ReportSubscription = {
            ...subscription,
            ...updates,
            updatedAt: new Date()
        };

        // Recalculate next delivery if schedule changed
        if (updates.schedule || updates.enabled !== undefined) {
            updatedSubscription.nextDelivery = updatedSubscription.enabled
                ? this.calculateNextDelivery(updatedSubscription.schedule)
                : undefined;
        }

        // Save to database
        await this.saveSubscription(updatedSubscription);

        // Update cache
        this.subscriptions.set(subscriptionId, updatedSubscription);

        // Reschedule next delivery
        if (updatedSubscription.enabled && updatedSubscription.nextDelivery) {
            await this.scheduleNextDelivery(updatedSubscription);
        }

        this.emit('subscriptionUpdated', {
            subscriptionId,
            updates: Object.keys(updates),
            timestamp: new Date()
        });

        return updatedSubscription;
    }

    async deleteSubscription(subscriptionId: string): Promise<void> {
        const subscription = this.subscriptions.get(subscriptionId);
        
        if (!subscription) {
            throw new Error(`Subscription not found: ${subscriptionId}`);
        }

        // Soft delete from database
        await this.connection.query(`
            UPDATE [ReportSubscriptions]
            SET [SystemDeletedAt] = GETUTCDATE(),
                [Enabled] = 0
            WHERE [SystemId] = @SubscriptionId
        `, [subscriptionId]);

        // Remove from cache
        this.subscriptions.delete(subscriptionId);

        this.emit('subscriptionDeleted', {
            subscriptionId,
            reportId: subscription.reportId,
            timestamp: new Date()
        });
    }

    async enableSubscription(subscriptionId: string): Promise<void> {
        const subscription = this.subscriptions.get(subscriptionId);
        
        if (!subscription) {
            throw new Error(`Subscription not found: ${subscriptionId}`);
        }

        subscription.enabled = true;
        subscription.nextDelivery = this.calculateNextDelivery(subscription.schedule);
        subscription.updatedAt = new Date();

        await this.saveSubscription(subscription);
        this.subscriptions.set(subscriptionId, subscription);

        if (subscription.nextDelivery) {
            await this.scheduleNextDelivery(subscription);
        }

        this.emit('subscriptionEnabled', {
            subscriptionId,
            nextDelivery: subscription.nextDelivery,
            timestamp: new Date()
        });
    }

    async disableSubscription(subscriptionId: string): Promise<void> {
        const subscription = this.subscriptions.get(subscriptionId);
        
        if (!subscription) {
            throw new Error(`Subscription not found: ${subscriptionId}`);
        }

        subscription.enabled = false;
        subscription.nextDelivery = undefined;
        subscription.updatedAt = new Date();

        await this.saveSubscription(subscription);
        this.subscriptions.set(subscriptionId, subscription);

        this.emit('subscriptionDisabled', {
            subscriptionId,
            timestamp: new Date()
        });
    }

    async getSubscription(subscriptionId: string): Promise<ReportSubscription | null> {
        // Check cache first
        if (this.subscriptions.has(subscriptionId)) {
            return this.subscriptions.get(subscriptionId)!;
        }

        // Load from database
        const subscription = await this.loadSubscription(subscriptionId);
        
        if (subscription) {
            this.subscriptions.set(subscriptionId, subscription);
        }

        return subscription;
    }

    async getUserSubscriptions(userId: string): Promise<ReportSubscription[]> {
        const result = await this.connection.query(`
            SELECT * FROM [ReportSubscriptions]
            WHERE [UserId] = @UserId AND [SystemDeletedAt] IS NULL
            ORDER BY [SystemCreatedAt] DESC
        `, [userId]);

        return Promise.all(result.recordset.map(row => this.mapToSubscription(row)));
    }

    async getReportSubscriptions(reportId: string): Promise<ReportSubscription[]> {
        const result = await this.connection.query(`
            SELECT * FROM [ReportSubscriptions]
            WHERE [ReportId] = @ReportId AND [SystemDeletedAt] IS NULL
            ORDER BY [SystemCreatedAt] DESC
        `, [reportId]);

        return Promise.all(result.recordset.map(row => this.mapToSubscription(row)));
    }

    async getActiveSubscriptions(): Promise<ReportSubscription[]> {
        const result = await this.connection.query(`
            SELECT * FROM [ReportSubscriptions]
            WHERE [Enabled] = 1 
                AND [SystemDeletedAt] IS NULL
                AND ([ExpiresAt] IS NULL OR [ExpiresAt] > GETUTCDATE())
            ORDER BY [NextDelivery] ASC
        `);

        return Promise.all(result.recordset.map(row => this.mapToSubscription(row)));
    }

    // ============ Subscription Delivery ============

    async deliverNow(subscriptionId: string): Promise<string> {
        const subscription = await this.getSubscription(subscriptionId);
        
        if (!subscription) {
            throw new Error(`Subscription not found: ${subscriptionId}`);
        }

        // Add to delivery queue
        this.deliveryQueue.push(subscriptionId);
        
        // Trigger processing
        this.processDeliveryQueue();

        const deliveryId = `del_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        this.emit('deliveryQueued', {
            deliveryId,
            subscriptionId,
            reportId: subscription.reportId,
            timestamp: new Date()
        });

        return deliveryId;
    }

    private async processDeliveryQueue(): Promise<void> {
        if (this.processing || this.deliveryQueue.length === 0) {
            return;
        }

        this.processing = true;

        try {
            while (this.deliveryQueue.length > 0) {
                const subscriptionId = this.deliveryQueue.shift()!;
                await this.processSubscriptionDelivery(subscriptionId);
            }
        } catch (error) {
            this.emit('deliveryProcessorError', {
                error: error.message,
                timestamp: new Date()
            });
        } finally {
            this.processing = false;
        }
    }

    private async processSubscriptionDelivery(subscriptionId: string): Promise<void> {
        const subscription = await this.getSubscription(subscriptionId);
        
        if (!subscription || !subscription.enabled) {
            return;
        }

        const deliveryId = uuidv4();
        const startTime = Date.now();

        const delivery: SubscriptionDelivery = {
            id: deliveryId,
            subscriptionId: subscription.id,
            reportId: subscription.reportId,
            reportName: subscription.name,
            status: 'processing',
            format: subscription.format,
            recipientCount: subscription.delivery.recipients?.length || 0,
            startedAt: new Date(),
            parameters: subscription.parameters
        };

        this.deliveries.set(deliveryId, delivery);
        await this.saveDelivery(delivery);

        this.emit('deliveryStarted', {
            deliveryId,
            subscriptionId,
            timestamp: new Date()
        });

        try {
            // Generate report
            const reportResult = await this.reportEngine.generateReport(
                subscription.reportId,
                {
                    ...subscription.parameters,
                    filters: subscription.filters
                }
            );

            // Export report
            const exportedData = await this.reportEngine.exportReport(
                reportResult,
                subscription.format,
                {
                    title: subscription.name,
                    parameters: subscription.parameters
                }
            );

            // Deliver based on type
            const fileUrl = await this.deliverReport(
                subscription.delivery,
                exportedData,
                subscription.format,
                reportResult
            );

            // Update delivery record
            delivery.status = 'success';
            delivery.completedAt = new Date();
            delivery.duration = Date.now() - startTime;
            delivery.fileSize = Buffer.isBuffer(exportedData) 
                ? exportedData.length 
                : exportedData.length;
            delivery.fileUrl = fileUrl;

            // Update subscription
            subscription.lastDelivery = new Date();
            subscription.deliveryCount++;
            subscription.nextDelivery = this.calculateNextDelivery(subscription.schedule);
            subscription.updatedAt = new Date();

            await this.saveSubscription(subscription);
            await this.saveDelivery(delivery);

            this.emit('deliveryCompleted', {
                deliveryId,
                subscriptionId,
                duration: delivery.duration,
                fileSize: delivery.fileSize,
                timestamp: new Date()
            });

        } catch (error) {
            // Update delivery with error
            delivery.status = 'failed';
            delivery.completedAt = new Date();
            delivery.duration = Date.now() - startTime;
            delivery.error = error.message;

            // Update subscription
            subscription.errorCount++;
            subscription.nextDelivery = this.calculateNextDelivery(subscription.schedule);
            subscription.updatedAt = new Date();

            await this.saveSubscription(subscription);
            await this.saveDelivery(delivery);

            this.emit('deliveryFailed', {
                deliveryId,
                subscriptionId,
                error: error.message,
                timestamp: new Date()
            });
        }
    }

    private async deliverReport(
        config: DeliveryConfig,
        data: Buffer | string,
        format: string,
        result: ReportResult
    ): Promise<string> {
        switch (config.type) {
            case 'email':
                return this.deliverViaEmail(config, data, format, result);
            case 'webhook':
                return this.deliverViaWebhook(config, data, format);
            case 'ftp':
                return this.deliverViaFTP(config, data, format);
            case 's3':
                return this.deliverViaS3(config, data, format);
            case 'sharepoint':
                return this.deliverViaSharepoint(config, data, format);
            default:
                throw new Error(`Unsupported delivery type: ${config.type}`);
        }
    }

    private async deliverViaEmail(
        config: DeliveryConfig,
        data: Buffer | string,
        format: string,
        result: ReportResult
    ): Promise<string> {
        // This would integrate with email service
        // For now, return mock URL
        const filename = `${result.reportName}_${DateTime.now().toISOString()}.${this.getFileExtension(format)}`;
        return `email://sent?recipients=${config.recipients?.length}&filename=${filename}`;
    }

    private async deliverViaWebhook(
        config: DeliveryConfig,
        data: Buffer | string,
        format: string
    ): Promise<string> {
        // This would send HTTP request to webhook URL
        return `webhook://${config.webhookUrl}`;
    }

    private async deliverViaFTP(
        config: DeliveryConfig,
        data: Buffer | string,
        format: string
    ): Promise<string> {
        // This would upload to FTP server
        return `ftp://${config.ftpConfig?.host}/${config.ftpConfig?.path}`;
    }

    private async deliverViaS3(
        config: DeliveryConfig,
        data: Buffer | string,
        format: string
    ): Promise<string> {
        // This would upload to S3
        return `s3://${config.s3Config?.bucket}/${config.s3Config?.path}`;
    }

    private async deliverViaSharepoint(
        config: DeliveryConfig,
        data: Buffer | string,
        format: string
    ): Promise<string> {
        // This would upload to SharePoint
        return `sharepoint://${config.sharepointConfig?.siteUrl}/${config.sharepointConfig?.library}`;
    }

    // ============ Scheduling ============

    private async scheduleNextDelivery(subscription: ReportSubscription): Promise<void> {
        if (!subscription.nextDelivery) {
            return;
        }

        // Schedule using report scheduler
        await this.reportScheduler.schedule(
            subscription.reportId,
            subscription.schedule,
            {
                scheduleId: subscription.id,
                name: subscription.name,
                parameters: subscription.parameters,
                recipients: subscription.delivery.recipients,
                format: subscription.format,
                createdBy: subscription.userName
            }
        );
    }

    private calculateNextDelivery(schedule: ScheduleDefinition): Date | undefined {
        const now = new Date();
        
        switch (schedule.frequency) {
            case 'once':
                return schedule.startDate;
            
            case 'hourly':
                const hourly = new Date(now);
                hourly.setHours(hourly.getHours() + (schedule.interval || 1));
                return hourly;
            
            case 'daily':
                const daily = new Date(now);
                daily.setDate(daily.getDate() + 1);
                if (schedule.time) {
                    const [hours, minutes] = schedule.time.split(':').map(Number);
                    daily.setHours(hours, minutes, 0, 0);
                }
                return daily;
            
            case 'weekly':
                const weekly = new Date(now);
                const daysToAdd = (schedule.dayOfWeek || 1) - weekly.getDay();
                weekly.setDate(weekly.getDate() + (daysToAdd > 0 ? daysToAdd : daysToAdd + 7));
                if (schedule.time) {
                    const [hours, minutes] = schedule.time.split(':').map(Number);
                    weekly.setHours(hours, minutes, 0, 0);
                }
                return weekly;
            
            case 'monthly':
                const monthly = new Date(now);
                monthly.setMonth(monthly.getMonth() + 1);
                monthly.setDate(schedule.dayOfMonth || 1);
                if (schedule.time) {
                    const [hours, minutes] = schedule.time.split(':').map(Number);
                    monthly.setHours(hours, minutes, 0, 0);
                }
                return monthly;
            
            default:
                return undefined;
        }
    }

    // ============ Database Operations ============

    private async saveSubscription(subscription: ReportSubscription): Promise<void> {
        const query = `
            MERGE INTO [ReportSubscriptions] AS target
            USING (SELECT @SubscriptionId AS SubscriptionId) AS source
            ON target.[SystemId] = source.[SubscriptionId]
            WHEN MATCHED THEN
                UPDATE SET 
                    [Name] = @Name,
                    [Description] = @Description,
                    [ReportId] = @ReportId,
                    [UserId] = @UserId,
                    [UserName] = @UserName,
                    [Schedule] = @Schedule,
                    [Parameters] = @Parameters,
                    [Format] = @Format,
                    [Delivery] = @Delivery,
                    [Filters] = @Filters,
                    [Enabled] = @Enabled,
                    [LastDelivery] = @LastDelivery,
                    [NextDelivery] = @NextDelivery,
                    [DeliveryCount] = @DeliveryCount,
                    [ErrorCount] = @ErrorCount,
                    [ExpiresAt] = @ExpiresAt,
                    [Metadata] = @Metadata,
                    [SystemModifiedAt] = GETUTCDATE()
            WHEN NOT MATCHED THEN
                INSERT ([SystemId], [Name], [Description], [ReportId], [UserId], [UserName],
                        [Schedule], [Parameters], [Format], [Delivery], [Filters],
                        [Enabled], [LastDelivery], [NextDelivery], [DeliveryCount],
                        [ErrorCount], [ExpiresAt], [Metadata])
                VALUES (@SubscriptionId, @Name, @Description, @ReportId, @UserId, @UserName,
                        @Schedule, @Parameters, @Format, @Delivery, @Filters,
                        @Enabled, @LastDelivery, @NextDelivery, @DeliveryCount,
                        @ErrorCount, @ExpiresAt, @Metadata);
        `;

        await this.connection.query(query, [
            subscription.id,
            subscription.name,
            subscription.description || null,
            subscription.reportId,
            subscription.userId,
            subscription.userName,
            JSON.stringify(subscription.schedule),
            subscription.parameters ? JSON.stringify(subscription.parameters) : null,
            subscription.format,
            JSON.stringify(subscription.delivery),
            subscription.filters ? JSON.stringify(subscription.filters) : null,
            subscription.enabled ? 1 : 0,
            subscription.lastDelivery || null,
            subscription.nextDelivery || null,
            subscription.deliveryCount,
            subscription.errorCount,
            subscription.expiresAt || null,
            subscription.metadata ? JSON.stringify(subscription.metadata) : null
        ]);
    }

    private async saveDelivery(delivery: SubscriptionDelivery): Promise<void> {
        const query = `
            INSERT INTO [SubscriptionDeliveries] (
                [SystemId], [SubscriptionId], [ReportId], [ReportName],
                [Status], [Format], [RecipientCount], [FileSize],
                [FileUrl], [Error], [Parameters], [StartedAt],
                [CompletedAt], [Duration]
            ) VALUES (
                @DeliveryId, @SubscriptionId, @ReportId, @ReportName,
                @Status, @Format, @RecipientCount, @FileSize,
                @FileUrl, @Error, @Parameters, @StartedAt,
                @CompletedAt, @Duration
            )
        `;

        await this.connection.query(query, [
            delivery.id,
            delivery.subscriptionId,
            delivery.reportId,
            delivery.reportName,
            delivery.status,
            delivery.format,
            delivery.recipientCount,
            delivery.fileSize || null,
            delivery.fileUrl || null,
            delivery.error || null,
            delivery.parameters ? JSON.stringify(delivery.parameters) : null,
            delivery.startedAt,
            delivery.completedAt || null,
            delivery.duration || null
        ]);
    }

    private async loadSubscription(subscriptionId: string): Promise<ReportSubscription | null> {
        const result = await this.connection.query(`
            SELECT * FROM [ReportSubscriptions]
            WHERE [SystemId] = @SubscriptionId AND [SystemDeletedAt] IS NULL
        `, [subscriptionId]);

        if (result.recordset.length === 0) {
            return null;
        }

        return this.mapToSubscription(result.recordset[0]);
    }

    private async loadSubscriptions(): Promise<void> {
        const subscriptions = await this.getActiveSubscriptions();
        
        for (const subscription of subscriptions) {
            this.subscriptions.set(subscription.id, subscription);
        }

        this.emit('subscriptionsLoaded', {
            count: this.subscriptions.size,
            timestamp: new Date()
        });
    }

    private async mapToSubscription(row: any): Promise<ReportSubscription> {
        return {
            id: row.SystemId,
            name: row.Name,
            description: row.Description,
            reportId: row.ReportId,
            userId: row.UserId,
            userName: row.UserName,
            schedule: JSON.parse(row.Schedule),
            parameters: row.Parameters ? JSON.parse(row.Parameters) : undefined,
            format: row.Format,
            delivery: JSON.parse(row.Delivery),
            filters: row.Filters ? JSON.parse(row.Filters) : undefined,
            enabled: row.Enabled === 1,
            lastDelivery: row.LastDelivery,
            nextDelivery: row.NextDelivery,
            deliveryCount: row.DeliveryCount,
            errorCount: row.ErrorCount,
            createdAt: row.SystemCreatedAt,
            updatedAt: row.SystemModifiedAt || row.SystemCreatedAt,
            expiresAt: row.ExpiresAt,
            metadata: row.Metadata ? JSON.parse(row.Metadata) : undefined
        };
    }

    // ============ Validation ============

    private async validateSubscription(subscription: any): Promise<void> {
        if (!subscription.name) {
            throw new Error('Subscription name is required');
        }

        if (!subscription.reportId) {
            throw new Error('Report ID is required');
        }

        if (!subscription.schedule) {
            throw new Error('Schedule definition is required');
        }

        if (!subscription.format) {
            throw new Error('Export format is required');
        }

        if (!subscription.delivery) {
            throw new Error('Delivery configuration is required');
        }

        if (subscription.delivery.type === 'email' && 
            (!subscription.delivery.recipients || subscription.delivery.recipients.length === 0)) {
            throw new Error('Email delivery requires at least one recipient');
        }

        // Verify report exists
        try {
            await this.reportEngine.getReport(subscription.reportId);
        } catch (error) {
            throw new Error(`Report not found: ${subscription.reportId}`);
        }
    }

    // ============ Delivery History ============

    async getSubscriptionDeliveries(
        subscriptionId: string,
        limit: number = 100
    ): Promise<SubscriptionDelivery[]> {
        const result = await this.connection.query(`
            SELECT TOP ${limit} * FROM [SubscriptionDeliveries]
            WHERE [SubscriptionId] = @SubscriptionId
            ORDER BY [StartedAt] DESC
        `, [subscriptionId]);

        return result.recordset.map(row => ({
            id: row.SystemId,
            subscriptionId: row.SubscriptionId,
            reportId: row.ReportId,
            reportName: row.ReportName,
            status: row.Status,
            format: row.Format,
            recipientCount: row.RecipientCount,
            fileSize: row.FileSize,
            fileUrl: row.FileUrl,
            error: row.Error,
            parameters: row.Parameters ? JSON.parse(row.Parameters) : undefined,
            startedAt: row.StartedAt,
            completedAt: row.CompletedAt,
            duration: row.Duration
        }));
    }

    async getDelivery(deliveryId: string): Promise<SubscriptionDelivery | null> {
        // Check cache first
        if (this.deliveries.has(deliveryId)) {
            return this.deliveries.get(deliveryId)!;
        }

        const result = await this.connection.query(`
            SELECT * FROM [SubscriptionDeliveries]
            WHERE [SystemId] = @DeliveryId
        `, [deliveryId]);

        if (result.recordset.length === 0) {
            return null;
        }

        const row = result.recordset[0];
        return {
            id: row.SystemId,
            subscriptionId: row.SubscriptionId,
            reportId: row.ReportId,
            reportName: row.ReportName,
            status: row.Status,
            format: row.Format,
            recipientCount: row.RecipientCount,
            fileSize: row.FileSize,
            fileUrl: row.FileUrl,
            error: row.Error,
            parameters: row.Parameters ? JSON.parse(row.Parameters) : undefined,
            startedAt: row.StartedAt,
            completedAt: row.CompletedAt,
            duration: row.Duration
        };
    }

    // ============ Statistics ============

    async getSubscriptionStats(): Promise<SubscriptionStats> {
        const subscriptions = Array.from(this.subscriptions.values());
        const activeSubscriptions = subscriptions.filter(s => s.enabled);

        const deliveriesResult = await this.connection.query(`
            SELECT 
                COUNT(*) AS Total,
                SUM(CASE WHEN [Status] = 'success' THEN 1 ELSE 0 END) AS Success,
                SUM(CASE WHEN [Status] = 'failed' THEN 1 ELSE 0 END) AS Failed,
                SUM(CASE WHEN [Status] = 'processing' THEN 1 ELSE 0 END) AS Processing,
                AVG(CASE WHEN [Duration] IS NOT NULL THEN [Duration] ELSE 0 END) AS AvgDuration
            FROM [SubscriptionDeliveries]
            WHERE [StartedAt] >= DATEADD(day, -30, GETUTCDATE())
        `);

        const deliveries = deliveriesResult.recordset[0];

        // Group by report
        const subscriptionsByReport: Record<string, number> = {};
        subscriptions.forEach(s => {
            subscriptionsByReport[s.reportId] = (subscriptionsByReport[s.reportId] || 0) + 1;
        });

        // Group by format
        const subscriptionsByFormat: Record<string, number> = {};
        subscriptions.forEach(s => {
            subscriptionsByFormat[s.format] = (subscriptionsByFormat[s.format] || 0) + 1;
        });

        return {
            totalSubscriptions: subscriptions.length,
            activeSubscriptions: activeSubscriptions.length,
            totalDeliveries: deliveries.Total || 0,
            successfulDeliveries: deliveries.Success || 0,
            failedDeliveries: deliveries.Failed || 0,
            pendingDeliveries: deliveries.Processing || 0,
            averageDeliveryTime: deliveries.AvgDuration || 0,
            subscriptionsByReport,
            subscriptionsByFormat
        };
    }

    // ============ Delivery Processor ============

    private startDeliveryProcessor(): void {
        // Check for due subscriptions every minute
        setInterval(async () => {
            await this.processDueSubscriptions();
        }, 60000);

        // Process delivery queue every 5 seconds
        setInterval(async () => {
            await this.processDeliveryQueue();
        }, 5000);
    }

    private async processDueSubscriptions(): Promise<void> {
        const now = new Date();

        for (const subscription of this.subscriptions.values()) {
            if (subscription.enabled && 
                subscription.nextDelivery && 
                subscription.nextDelivery <= now) {
                
                await this.deliverNow(subscription.id);
            }
        }
    }

    // ============ Utility ============

    private getFileExtension(format: string): string {
        const extensions: Record<string, string> = {
            'pdf': 'pdf',
            'excel': 'xlsx',
            'csv': 'csv',
            'json': 'json',
            'xml': 'xml',
            'html': 'html',
            'yaml': 'yaml'
        };
        return extensions[format] || 'txt';
    }

    // ============ Cleanup ============

    async cleanup(retentionDays: number = 30): Promise<number> {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

        const result = await this.connection.query(`
            DELETE FROM [SubscriptionDeliveries]
            WHERE [StartedAt] < @CutoffDate
        `, [cutoffDate]);

        return result.rowsAffected[0];
    }
}