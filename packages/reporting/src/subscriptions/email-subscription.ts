import nodemailer from 'nodemailer';
import SMTPTransport from 'nodemailer/lib/smtp-transport';
import { EventEmitter } from 'events';
import { SQLServerConnection } from '@nova/core/database/sqlserver-connection';
import { ReportSubscriptionService, ReportSubscription, SubscriptionDelivery } from './report-subscription';
import { ReportResult } from '../report-engine';
import { DateTime } from '@nova/core/data-types/datetime';
import { v4 as uuidv4 } from 'uuid';

export interface EmailConfig {
    host: string;
    port: number;
    secure: boolean;
    auth: {
        user: string;
        pass: string;
    };
    from: string;
    fromName?: string;
    replyTo?: string;
    pool?: boolean;
    maxConnections?: number;
    rateLimit?: number;
}

export interface EmailTemplate {
    id: string;
    name: string;
    subject: string;
    html?: string;
    text?: string;
    variables?: string[];
}

export interface EmailSubscription extends ReportSubscription {
    emailConfig: EmailDeliveryConfig;
}

export interface EmailDeliveryConfig {
    recipients: string[];
    cc?: string[];
    bcc?: string[];
    subject?: string;
    template?: string;
    attachReport: boolean;
    attachFormat: 'pdf' | 'excel' | 'csv' | 'json' | 'xml' | 'html' | 'yaml';
    attachName?: string;
    compressAttachment?: boolean;
    encryptAttachment?: boolean;
    password?: string;
    scheduledTime?: string;
    timeZone?: string;
}

export interface EmailDelivery {
    id: string;
    subscriptionId: string;
    reportId: string;
    reportName: string;
    recipients: string[];
    subject: string;
    status: 'pending' | 'sending' | 'sent' | 'failed';
    sentAt?: Date;
    error?: string;
    messageId?: string;
    attachments: EmailAttachment[];
}

export interface EmailAttachment {
    filename: string;
    contentType: string;
    size: number;
    content: Buffer | string;
}

export interface EmailStats {
    totalSent: number;
    totalFailed: number;
    averageDeliveryTime: number;
    openRate: number;
    clickRate: number;
    bounceRate: number;
}

export class EmailSubscriptionService extends EventEmitter {
    private connection: SQLServerConnection;
    private subscriptionService: ReportSubscriptionService;
    private transporter: nodemailer.Transporter;
    private emailConfig: EmailConfig;
    private templates: Map<string, EmailTemplate> = new Map();
    private deliveries: Map<string, EmailDelivery> = new Map();
    private initialized: boolean = false;

    constructor(
        connection: SQLServerConnection,
        subscriptionService: ReportSubscriptionService,
        emailConfig: EmailConfig
    ) {
        super();
        this.connection = connection;
        this.subscriptionService = subscriptionService;
        this.emailConfig = emailConfig;
        
        this.transporter = nodemailer.createTransport({
            host: emailConfig.host,
            port: emailConfig.port,
            secure: emailConfig.secure,
            auth: emailConfig.auth,
            pool: emailConfig.pool || true,
            maxConnections: emailConfig.maxConnections || 5,
            rateLimit: emailConfig.rateLimit || 10,
            tls: {
                rejectUnauthorized: false
            }
        } as SMTPTransport.Options);
    }

    async initialize(): Promise<void> {
        if (this.initialized) return;

        await this.ensureEmailTables();
        await this.loadTemplates();
        
        this.initialized = true;
        this.emit('initialized');
    }

    private async ensureEmailTables(): Promise<void> {
        // Create EmailTemplates table
        await this.connection.query(`
            IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'EmailTemplates')
            BEGIN
                CREATE TABLE [EmailTemplates] (
                    [Id] INT IDENTITY(1,1) NOT NULL,
                    [SystemId] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [DF_EmailTemplates_SystemId] DEFAULT NEWID(),
                    [Name] NVARCHAR(255) NOT NULL,
                    [Subject] NVARCHAR(500) NOT NULL,
                    [Html] NVARCHAR(MAX) NULL,
                    [Text] NVARCHAR(MAX) NULL,
                    [Variables] NVARCHAR(MAX) NULL,
                    [IsSystem] BIT NOT NULL CONSTRAINT [DF_EmailTemplates_IsSystem] DEFAULT 0,
                    [SystemCreatedAt] DATETIME2 NOT NULL CONSTRAINT [DF_EmailTemplates_CreatedAt] DEFAULT GETUTCDATE(),
                    [SystemModifiedAt] DATETIME2 NULL,
                    [SystemDeletedAt] DATETIME2 NULL,
                    CONSTRAINT [PK_EmailTemplates] PRIMARY KEY CLUSTERED ([Id])
                );

                CREATE UNIQUE INDEX [UX_EmailTemplates_SystemId] ON [EmailTemplates] ([SystemId]);
                CREATE UNIQUE INDEX [UX_EmailTemplates_Name] ON [EmailTemplates] ([Name]) WHERE [SystemDeletedAt] IS NULL;
                
                PRINT '✅ Created EmailTemplates table';
            END
        `);

        // Create EmailDeliveries table
        await this.connection.query(`
            IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'EmailDeliveries')
            BEGIN
                CREATE TABLE [EmailDeliveries] (
                    [Id] INT IDENTITY(1,1) NOT NULL,
                    [SystemId] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [DF_EmailDeliveries_SystemId] DEFAULT NEWID(),
                    [SubscriptionId] UNIQUEIDENTIFIER NOT NULL,
                    [ReportId] NVARCHAR(100) NOT NULL,
                    [ReportName] NVARCHAR(255) NOT NULL,
                    [Recipients] NVARCHAR(MAX) NOT NULL,
                    [Subject] NVARCHAR(500) NOT NULL,
                    [Status] NVARCHAR(20) NOT NULL,
                    [SentAt] DATETIME2 NULL,
                    [Error] NVARCHAR(MAX) NULL,
                    [MessageId] NVARCHAR(255) NULL,
                    [Attachments] NVARCHAR(MAX) NULL,
                    [OpenedAt] DATETIME2 NULL,
                    [ClickedAt] DATETIME2 NULL,
                    [BouncedAt] DATETIME2 NULL,
                    [SystemCreatedAt] DATETIME2 NOT NULL CONSTRAINT [DF_EmailDeliveries_CreatedAt] DEFAULT GETUTCDATE(),
                    CONSTRAINT [PK_EmailDeliveries] PRIMARY KEY CLUSTERED ([Id])
                );

                CREATE UNIQUE INDEX [UX_EmailDeliveries_SystemId] ON [EmailDeliveries] ([SystemId]);
                CREATE INDEX [IX_EmailDeliveries_SubscriptionId] ON [EmailDeliveries] ([SubscriptionId]);
                CREATE INDEX [IX_EmailDeliveries_Status] ON [EmailDeliveries] ([Status]);
                CREATE INDEX [IX_EmailDeliveries_SentAt] ON [EmailDeliveries] ([SentAt]);
                
                PRINT '✅ Created EmailDeliveries table';
            END
        `);
    }

    // ============ Email Subscription ============

    async createEmailSubscription(
        name: string,
        reportId: string,
        userId: string,
        userName: string,
        emailConfig: EmailDeliveryConfig,
        schedule?: any,
        parameters?: any
    ): Promise<string> {
        const subscription: Omit<ReportSubscription, 'id' | 'createdAt' | 'updatedAt' | 'deliveryCount' | 'errorCount'> = {
            name,
            reportId,
            userId,
            userName,
            schedule: schedule || { frequency: 'weekly', dayOfWeek: 1, time: '08:00' },
            parameters,
            format: emailConfig.attachFormat,
            delivery: {
                type: 'email',
                recipients: emailConfig.recipients,
                cc: emailConfig.cc,
                bcc: emailConfig.bcc,
                subject: emailConfig.subject,
                attachments: emailConfig.attachReport,
                compress: emailConfig.compressAttachment,
                encrypt: emailConfig.encryptAttachment
            },
            enabled: true,
            filters: []
        };

        const subscriptionId = await this.subscriptionService.createSubscription(subscription);

        // Store email-specific configuration
        await this.saveEmailConfig(subscriptionId, emailConfig);

        this.emit('emailSubscriptionCreated', {
            subscriptionId,
            reportId,
            recipients: emailConfig.recipients.length,
            timestamp: new Date()
        });

        return subscriptionId;
    }

    private async saveEmailConfig(
        subscriptionId: string,
        config: EmailDeliveryConfig
    ): Promise<void> {
        // Store in metadata or separate table
        await this.connection.query(`
            UPDATE [ReportSubscriptions]
            SET [Metadata] = JSON_MODIFY(
                ISNULL([Metadata], '{}'),
                '$.emailConfig',
                @EmailConfig
            )
            WHERE [SystemId] = @SubscriptionId
        `, [
            JSON.stringify(config),
            subscriptionId
        ]);
    }

    private async getEmailConfig(subscriptionId: string): Promise<EmailDeliveryConfig | null> {
        const result = await this.connection.query(`
            SELECT [Metadata] FROM [ReportSubscriptions]
            WHERE [SystemId] = @SubscriptionId
        `, [subscriptionId]);

        if (result.recordset.length === 0) {
            return null;
        }

        const metadata = JSON.parse(result.recordset[0].Metadata || '{}');
        return metadata.emailConfig || null;
    }

    // ============ Email Delivery ============

    async sendReportEmail(
        subscriptionId: string,
        reportResult: ReportResult,
        reportData: Buffer | string
    ): Promise<EmailDelivery> {
        const subscription = await this.subscriptionService.getSubscription(subscriptionId);
        
        if (!subscription) {
            throw new Error(`Subscription not found: ${subscriptionId}`);
        }

        const emailConfig = await this.getEmailConfig(subscriptionId);
        
        if (!emailConfig) {
            throw new Error(`Email configuration not found for subscription: ${subscriptionId}`);
        }

        const deliveryId = uuidv4();
        const startTime = Date.now();

        // Prepare email content
        const subject = this.prepareSubject(emailConfig, subscription, reportResult);
        const html = await this.prepareHtmlContent(emailConfig, subscription, reportResult);
        const text = await this.prepareTextContent(emailConfig, subscription, reportResult);

        // Prepare attachments
        const attachments: EmailAttachment[] = [];
        
        if (emailConfig.attachReport) {
            const filename = emailConfig.attachName || 
                `${subscription.name}_${DateTime.now().toISOString()}.${this.getFileExtension(emailConfig.attachFormat)}`;
            
            attachments.push({
                filename,
                contentType: this.getContentType(emailConfig.attachFormat),
                size: Buffer.isBuffer(reportData) ? reportData.length : reportData.length,
                content: reportData
            });
        }

        const delivery: EmailDelivery = {
            id: deliveryId,
            subscriptionId,
            reportId: subscription.reportId,
            reportName: subscription.name,
            recipients: emailConfig.recipients,
            subject,
            status: 'sending',
            attachments,
            sentAt: new Date()
        };

        this.deliveries.set(deliveryId, delivery);
        await this.saveEmailDelivery(delivery);

        this.emit('emailSending', {
            deliveryId,
            subscriptionId,
            recipients: emailConfig.recipients.length,
            timestamp: new Date()
        });

        try {
            // Send email
            const info = await this.transporter.sendMail({
                from: `"${this.emailConfig.fromName || this.emailConfig.from}" <${this.emailConfig.from}>`,
                to: emailConfig.recipients.join(', '),
                cc: emailConfig.cc?.join(', '),
                bcc: emailConfig.bcc?.join(', '),
                replyTo: this.emailConfig.replyTo,
                subject,
                text,
                html,
                attachments: attachments.map(a => ({
                    filename: a.filename,
                    content: a.content,
                    contentType: a.contentType
                }))
            });

            // Update delivery status
            delivery.status = 'sent';
            delivery.messageId = info.messageId;
            delivery.sentAt = new Date();

            await this.saveEmailDelivery(delivery);

            this.emit('emailSent', {
                deliveryId,
                subscriptionId,
                messageId: info.messageId,
                duration: Date.now() - startTime,
                timestamp: new Date()
            });

        } catch (error) {
            delivery.status = 'failed';
            delivery.error = error.message;

            await this.saveEmailDelivery(delivery);

            this.emit('emailFailed', {
                deliveryId,
                subscriptionId,
                error: error.message,
                timestamp: new Date()
            });

            throw error;
        }

        return delivery;
    }

    private prepareSubject(
        config: EmailDeliveryConfig,
        subscription: ReportSubscription,
        result: ReportResult
    ): string {
        if (config.subject) {
            // Replace variables in subject
            let subject = config.subject;
            subject = subject.replace('{{reportName}}', subscription.name);
            subject = subject.replace('{{date}}', DateTime.now().toLocaleDateString());
            subject = subject.replace('{{time}}', DateTime.now().toLocaleTimeString());
            subject = subject.replace('{{rowCount}}', result.rowCount.toString());
            return subject;
        }

        return `Report: ${subscription.name} - ${DateTime.now().toLocaleDateString()}`;
    }

    private async prepareHtmlContent(
        config: EmailDeliveryConfig,
        subscription: ReportSubscription,
        result: ReportResult
    ): Promise<string> {
        if (config.template) {
            const template = await this.getTemplate(config.template);
            if (template?.html) {
                // Apply template variables
                let html = template.html;
                html = html.replace('{{reportName}}', subscription.name);
                html = html.replace('{{date}}', DateTime.now().toLocaleDateString());
                html = html.replace('{{time}}', DateTime.now().toLocaleTimeString());
                html = html.replace('{{rowCount}}', result.rowCount.toString());
                html = html.replace('{{parameters}}', JSON.stringify(result.parameters || {}, null, 2));
                return html;
            }
        }

        // Default HTML template
        return `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <style>
                    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                    .header { background: #0078D4; color: white; padding: 20px; border-radius: 5px; }
                    .content { padding: 20px; }
                    .footer { margin-top: 30px; padding: 20px; background: #f5f5f5; border-radius: 5px; font-size: 0.9em; color: #666; }
                    table { border-collapse: collapse; width: 100%; }
                    th { background: #f5f5f5; padding: 10px; text-align: left; }
                    td { padding: 10px; border-bottom: 1px solid #ddd; }
                    .badge { display: inline-block; padding: 3px 8px; border-radius: 3px; background: #e0e0e0; }
                </style>
            </head>
            <body>
                <div class="header">
                    <h1>${subscription.name}</h1>
                    <p>Generated: ${DateTime.now().toLocaleString()}</p>
                </div>
                
                <div class="content">
                    <h2>Report Summary</h2>
                    <ul>
                        <li><strong>Report ID:</strong> ${result.reportId}</li>
                        <li><strong>Generated:</strong> ${result.generatedAt.toLocaleString()}</li>
                        <li><strong>Execution Time:</strong> ${result.executionTime}ms</li>
                        <li><strong>Total Rows:</strong> <span class="badge">${result.rowCount}</span></li>
                    </ul>
                    
                    <h2>Parameters</h2>
                    <pre style="background: #f5f5f5; padding: 15px; border-radius: 5px;">${JSON.stringify(result.parameters || {}, null, 2)}</pre>
                </div>
                
                <div class="footer">
                    <p>This is an automated report from NOVA Framework.</p>
                    <p>Generated at: ${DateTime.now().toLocaleString()}</p>
                </div>
            </body>
            </html>
        `;
    }

    private async prepareTextContent(
        config: EmailDeliveryConfig,
        subscription: ReportSubscription,
        result: ReportResult
    ): Promise<string> {
        return `
REPORT: ${subscription.name}
Generated: ${DateTime.now().toLocaleString()}

Report ID: ${result.reportId}
Execution Time: ${result.executionTime}ms
Total Rows: ${result.rowCount}

Parameters:
${JSON.stringify(result.parameters || {}, null, 2)}

This is an automated report from NOVA Framework.
        `;
    }

    // ============ Email Templates ============

    async createTemplate(template: Omit<EmailTemplate, 'id'>): Promise<string> {
        const id = uuidv4();

        await this.connection.query(`
            INSERT INTO [EmailTemplates] (
                [SystemId], [Name], [Subject], [Html], [Text], [Variables]
            ) VALUES (
                @TemplateId, @Name, @Subject, @Html, @Text, @Variables
            )
        `, [
            id,
            template.name,
            template.subject,
            template.html || null,
            template.text || null,
            template.variables ? JSON.stringify(template.variables) : null
        ]);

        this.templates.set(id, { id, ...template });

        return id;
    }

    async updateTemplate(templateId: string, updates: Partial<EmailTemplate>): Promise<void> {
        const sets: string[] = [];
        const params: any[] = [];

        if (updates.name !== undefined) {
            sets.push('[Name] = @Name');
            params.push(updates.name);
        }

        if (updates.subject !== undefined) {
            sets.push('[Subject] = @Subject');
            params.push(updates.subject);
        }

        if (updates.html !== undefined) {
            sets.push('[Html] = @Html');
            params.push(updates.html);
        }

        if (updates.text !== undefined) {
            sets.push('[Text] = @Text');
            params.push(updates.text);
        }

        if (updates.variables !== undefined) {
            sets.push('[Variables] = @Variables');
            params.push(JSON.stringify(updates.variables));
        }

        sets.push('[SystemModifiedAt] = GETUTCDATE()');
        params.push(templateId);

        await this.connection.query(`
            UPDATE [EmailTemplates]
            SET ${sets.join(', ')}
            WHERE [SystemId] = @TemplateId AND [SystemDeletedAt] IS NULL
        `, params);

        const template = this.templates.get(templateId);
        if (template) {
            Object.assign(template, updates);
        }
    }

    async deleteTemplate(templateId: string): Promise<void> {
        await this.connection.query(`
            UPDATE [EmailTemplates]
            SET [SystemDeletedAt] = GETUTCDATE()
            WHERE [SystemId] = @TemplateId
        `, [templateId]);

        this.templates.delete(templateId);
    }

    async getTemplate(templateId: string): Promise<EmailTemplate | null> {
        // Check cache
        if (this.templates.has(templateId)) {
            return this.templates.get(templateId)!;
        }

        const result = await this.connection.query(`
            SELECT * FROM [EmailTemplates]
            WHERE [SystemId] = @TemplateId AND [SystemDeletedAt] IS NULL
        `, [templateId]);

        if (result.recordset.length === 0) {
            return null;
        }

        const row = result.recordset[0];
        const template = {
            id: row.SystemId,
            name: row.Name,
            subject: row.Subject,
            html: row.Html,
            text: row.Text,
            variables: row.Variables ? JSON.parse(row.Variables) : undefined
        };

        this.templates.set(templateId, template);
        return template;
    }

    async getTemplates(): Promise<EmailTemplate[]> {
        const result = await this.connection.query(`
            SELECT * FROM [EmailTemplates]
            WHERE [SystemDeletedAt] IS NULL
            ORDER BY [Name] ASC
        `);

        return result.recordset.map(row => ({
            id: row.SystemId,
            name: row.Name,
            subject: row.Subject,
            html: row.Html,
            text: row.Text,
            variables: row.Variables ? JSON.parse(row.Variables) : undefined
        }));
    }

    private async loadTemplates(): Promise<void> {
        const templates = await this.getTemplates();
        
        for (const template of templates) {
            this.templates.set(template.id, template);
        }
    }

    // ============ Email Delivery Tracking ============

    private async saveEmailDelivery(delivery: EmailDelivery): Promise<void> {
        const query = `
            INSERT INTO [EmailDeliveries] (
                [SystemId], [SubscriptionId], [ReportId], [ReportName],
                [Recipients], [Subject], [Status], [SentAt],
                [Error], [MessageId], [Attachments]
            ) VALUES (
                @DeliveryId, @SubscriptionId, @ReportId, @ReportName,
                @Recipients, @Subject, @Status, @SentAt,
                @Error, @MessageId, @Attachments
            )
        `;

        await this.connection.query(query, [
            delivery.id,
            delivery.subscriptionId,
            delivery.reportId,
            delivery.reportName,
            JSON.stringify(delivery.recipients),
            delivery.subject,
            delivery.status,
            delivery.sentAt || null,
            delivery.error || null,
            delivery.messageId || null,
            JSON.stringify(delivery.attachments.map(a => ({
                filename: a.filename,
                contentType: a.contentType,
                size: a.size
            })))
        ]);
    }

    async trackEmailOpen(deliveryId: string): Promise<void> {
        await this.connection.query(`
            UPDATE [EmailDeliveries]
            SET [OpenedAt] = GETUTCDATE()
            WHERE [SystemId] = @DeliveryId
        `, [deliveryId]);

        this.emit('emailOpened', {
            deliveryId,
            timestamp: new Date()
        });
    }

    async trackEmailClick(deliveryId: string, url: string): Promise<void> {
        await this.connection.query(`
            UPDATE [EmailDeliveries]
            SET [ClickedAt] = GETUTCDATE()
            WHERE [SystemId] = @DeliveryId
        `, [deliveryId]);

        this.emit('emailClicked', {
            deliveryId,
            url,
            timestamp: new Date()
        });
    }

    async trackEmailBounce(deliveryId: string, reason: string): Promise<void> {
        await this.connection.query(`
            UPDATE [EmailDeliveries]
            SET [BouncedAt] = GETUTCDATE(),
                [Status] = 'failed',
                [Error] = @Error
            WHERE [SystemId] = @DeliveryId
        `, [reason, deliveryId]);

        this.emit('emailBounced', {
            deliveryId,
            reason,
            timestamp: new Date()
        });
    }

    // ============ Email Statistics ============

    async getEmailStats(days: number = 30): Promise<EmailStats> {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - days);

        const result = await this.connection.query(`
            SELECT 
                COUNT(*) AS TotalSent,
                SUM(CASE WHEN [Status] = 'failed' THEN 1 ELSE 0 END) AS TotalFailed,
                AVG(DATEDIFF(MILLISECOND, [SystemCreatedAt], [SentAt])) AS AvgDeliveryTime,
                SUM(CASE WHEN [OpenedAt] IS NOT NULL THEN 1 ELSE 0 END) AS TotalOpened,
                SUM(CASE WHEN [ClickedAt] IS NOT NULL THEN 1 ELSE 0 END) AS TotalClicked,
                SUM(CASE WHEN [BouncedAt] IS NOT NULL THEN 1 ELSE 0 END) AS TotalBounced
            FROM [EmailDeliveries]
            WHERE [SentAt] >= @CutoffDate
        `, [cutoffDate]);

        const row = result.recordset[0];

        return {
            totalSent: row.TotalSent || 0,
            totalFailed: row.TotalFailed || 0,
            averageDeliveryTime: row.AvgDeliveryTime || 0,
            openRate: row.TotalSent > 0 ? (row.TotalOpened || 0) / row.TotalSent : 0,
            clickRate: row.TotalOpened > 0 ? (row.TotalClicked || 0) / row.TotalOpened : 0,
            bounceRate: row.TotalSent > 0 ? (row.TotalBounced || 0) / row.TotalSent : 0
        };
    }

    async getSubscriptionEmailStats(subscriptionId: string): Promise<EmailStats> {
        const result = await this.connection.query(`
            SELECT 
                COUNT(*) AS TotalSent,
                SUM(CASE WHEN [Status] = 'failed' THEN 1 ELSE 0 END) AS TotalFailed,
                AVG(DATEDIFF(MILLISECOND, [SystemCreatedAt], [SentAt])) AS AvgDeliveryTime,
                SUM(CASE WHEN [OpenedAt] IS NOT NULL THEN 1 ELSE 0 END) AS TotalOpened,
                SUM(CASE WHEN [ClickedAt] IS NOT NULL THEN 1 ELSE 0 END) AS TotalClicked,
                SUM(CASE WHEN [BouncedAt] IS NOT NULL THEN 1 ELSE 0 END) AS TotalBounced
            FROM [EmailDeliveries]
            WHERE [SubscriptionId] = @SubscriptionId
        `, [subscriptionId]);

        const row = result.recordset[0];

        return {
            totalSent: row.TotalSent || 0,
            totalFailed: row.TotalFailed || 0,
            averageDeliveryTime: row.AvgDeliveryTime || 0,
            openRate: row.TotalSent > 0 ? (row.TotalOpened || 0) / row.TotalSent : 0,
            clickRate: row.TotalOpened > 0 ? (row.TotalClicked || 0) / row.TotalOpened : 0,
            bounceRate: row.TotalSent > 0 ? (row.TotalBounced || 0) / row.TotalSent : 0
        };
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

    private getContentType(format: string): string {
        const types: Record<string, string> = {
            'pdf': 'application/pdf',
            'excel': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'csv': 'text/csv',
            'json': 'application/json',
            'xml': 'application/xml',
            'html': 'text/html',
            'yaml': 'application/x-yaml'
        };
        return types[format] || 'application/octet-stream';
    }

    // ============ Cleanup ============

    async cleanup(retentionDays: number = 30): Promise<number> {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

        const result = await this.connection.query(`
            DELETE FROM [EmailDeliveries]
            WHERE [SentAt] < @CutoffDate
        `, [cutoffDate]);

        return result.rowsAffected[0];
    }

    async verifyConnection(): Promise<boolean> {
        try {
            await this.transporter.verify();
            return true;
        } catch (error) {
            this.emit('connectionError', { error: error.message });
            return false;
        }
    }

    async close(): Promise<void> {
        this.transporter.close();
    }
}