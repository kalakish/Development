import { EventEmitter } from 'events';
import { CronJob } from 'cron';
import { ReportEngine } from '../report-engine';
import { SQLServerConnection } from '@nova/core/database/sqlserver-connection';
import { v4 as uuidv4 } from 'uuid';

export class ReportScheduler extends EventEmitter {
    private engine: ReportEngine;
    private connection: SQLServerConnection;
    private jobs: Map<string, CronJob> = new Map();
    private schedules: Map<string, ScheduledReport> = new Map();

    constructor(engine: ReportEngine) {
        super();
        this.engine = engine;
        this.connection = engine['connection'];
    }

    async initialize(): Promise<void> {
        await this.ensureScheduleTable();
        await this.loadSchedules();
        this.startScheduler();
    }

    private async ensureScheduleTable(): Promise<void> {
        await this.connection.query(`
            IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'ReportSchedule')
            BEGIN
                CREATE TABLE [ReportSchedule] (
                    [Id] INT IDENTITY(1,1) NOT NULL,
                    [SystemId] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [DF_ReportSchedule_SystemId] DEFAULT NEWID(),
                    [ScheduleId] NVARCHAR(100) NOT NULL,
                    [ReportId] NVARCHAR(100) NOT NULL,
                    [Name] NVARCHAR(255) NOT NULL,
                    [Description] NVARCHAR(500) NULL,
                    [Schedule] NVARCHAR(MAX) NOT NULL,
                    [Parameters] NVARCHAR(MAX) NULL,
                    [Recipients] NVARCHAR(MAX) NULL,
                    [Format] NVARCHAR(50) NOT NULL,
                    [NextRun] DATETIME2 NULL,
                    [LastRun] DATETIME2 NULL,
                    [LastResult] NVARCHAR(50) NULL,
                    [Enabled] BIT NOT NULL CONSTRAINT [DF_ReportSchedule_Enabled] DEFAULT 1,
                    [CreatedBy] NVARCHAR(100) NOT NULL,
                    [CreatedAt] DATETIME2 NOT NULL CONSTRAINT [DF_ReportSchedule_CreatedAt] DEFAULT GETUTCDATE(),
                    [ModifiedAt] DATETIME2 NULL,
                    CONSTRAINT [PK_ReportSchedule] PRIMARY KEY CLUSTERED ([Id])
                );

                CREATE UNIQUE INDEX [UX_ReportSchedule_ScheduleId] ON [ReportSchedule] ([ScheduleId]);
                CREATE INDEX [IX_ReportSchedule_ReportId] ON [ReportSchedule] ([ReportId]);
                CREATE INDEX [IX_ReportSchedule_NextRun] ON [ReportSchedule] ([NextRun]);
                
                PRINT '✅ Created ReportSchedule table';
            END
        `);

        await this.connection.query(`
            IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'ReportExecutionLog')
            BEGIN
                CREATE TABLE [ReportExecutionLog] (
                    [Id] INT IDENTITY(1,1) NOT NULL,
                    [SystemId] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [DF_ReportExecutionLog_SystemId] DEFAULT NEWID(),
                    [ScheduleId] NVARCHAR(100) NOT NULL,
                    [ReportId] NVARCHAR(100) NOT NULL,
                    [ExecutionId] NVARCHAR(100) NOT NULL,
                    [Status] NVARCHAR(50) NOT NULL,
                    [StartedAt] DATETIME2 NOT NULL,
                    [CompletedAt] DATETIME2 NULL,
                    [Duration] INT NULL,
                    [RowCount] INT NULL,
                    [FileSize] INT NULL,
                    [FileUrl] NVARCHAR(500) NULL,
                    [Error] NVARCHAR(MAX) NULL,
                    [Parameters] NVARCHAR(MAX) NULL,
                    CONSTRAINT [PK_ReportExecutionLog] PRIMARY KEY CLUSTERED ([Id])
                );

                CREATE INDEX [IX_ReportExecutionLog_ScheduleId] ON [ReportExecutionLog] ([ScheduleId]);
                CREATE INDEX [IX_ReportExecutionLog_ExecutionId] ON [ReportExecutionLog] ([ExecutionId]);
                CREATE INDEX [IX_ReportExecutionLog_StartedAt] ON [ReportExecutionLog] ([StartedAt]);
                
                PRINT '✅ Created ReportExecutionLog table';
            END
        `);
    }

    private async loadSchedules(): Promise<void> {
        const query = `
            SELECT * FROM [ReportSchedule]
            WHERE [Enabled] = 1
            ORDER BY [NextRun]
        `;

        const result = await this.connection.query(query);
        
        for (const row of result.recordset) {
            const schedule: ScheduledReport = {
                id: row.ScheduleId,
                reportId: row.ReportId,
                name: row.Name,
                description: row.Description,
                schedule: JSON.parse(row.Schedule),
                parameters: row.Parameters ? JSON.parse(row.Parameters) : undefined,
                recipients: row.Recipients ? JSON.parse(row.Recipients) : undefined,
                format: row.Format,
                nextRun: row.NextRun,
                lastRun: row.LastRun,
                lastResult: row.LastResult,
                enabled: row.Enabled === 1,
                createdBy: row.CreatedBy,
                createdAt: row.CreatedAt,
                modifiedAt: row.ModifiedAt
            };

            this.schedules.set(schedule.id, schedule);
            
            if (schedule.enabled) {
                this.scheduleJob(schedule);
            }
        }
    }

    async schedule(
        reportId: string,
        scheduleDef: ScheduleDefinition,
        options?: ScheduleOptions
    ): Promise<string> {
        const scheduleId = options?.scheduleId || uuidv4();

        const schedule: ScheduledReport = {
            id: scheduleId,
            reportId,
            name: options?.name || `Schedule for ${reportId}`,
            description: options?.description,
            schedule: scheduleDef,
            parameters: options?.parameters,
            recipients: options?.recipients,
            format: options?.format || 'pdf',
            enabled: true,
            createdBy: options?.createdBy || 'system',
            createdAt: new Date()
        };

        // Calculate next run
        schedule.nextRun = this.calculateNextRun(scheduleDef);

        // Save to database
        await this.saveSchedule(schedule);

        // Store in memory
        this.schedules.set(schedule.id, schedule);

        // Schedule job
        this.scheduleJob(schedule);

        this.emit('scheduled', {
            scheduleId,
            reportId,
            nextRun: schedule.nextRun,
            timestamp: new Date()
        });

        return scheduleId;
    }

    async unschedule(scheduleId: string): Promise<void> {
        const schedule = this.schedules.get(scheduleId);
        
        if (!schedule) {
            throw new Error(`Schedule not found: ${scheduleId}`);
        }

        // Remove job
        const job = this.jobs.get(scheduleId);
        if (job) {
            job.stop();
            this.jobs.delete(scheduleId);
        }

        // Update database
        await this.connection.query(`
            UPDATE [ReportSchedule]
            SET [Enabled] = 0,
                [ModifiedAt] = GETUTCDATE()
            WHERE [ScheduleId] = @ScheduleId
        `, [scheduleId]);

        schedule.enabled = false;
        this.schedules.delete(scheduleId);

        this.emit('unscheduled', {
            scheduleId,
            reportId: schedule.reportId,
            timestamp: new Date()
        });
    }

    async pause(scheduleId: string): Promise<void> {
        const schedule = this.schedules.get(scheduleId);
        
        if (schedule && schedule.enabled) {
            schedule.enabled = false;
            
            const job = this.jobs.get(scheduleId);
            if (job) {
                job.stop();
            }

            await this.connection.query(`
                UPDATE [ReportSchedule]
                SET [Enabled] = 0,
                    [ModifiedAt] = GETUTCDATE()
                WHERE [ScheduleId] = @ScheduleId
            `, [scheduleId]);

            this.emit('paused', { scheduleId, timestamp: new Date() });
        }
    }

    async resume(scheduleId: string): Promise<void> {
        const schedule = this.schedules.get(scheduleId);
        
        if (schedule && !schedule.enabled) {
            schedule.enabled = true;
            schedule.nextRun = this.calculateNextRun(schedule.schedule);
            
            this.scheduleJob(schedule);

            await this.connection.query(`
                UPDATE [ReportSchedule]
                SET [Enabled] = 1,
                    [NextRun] = @NextRun,
                    [ModifiedAt] = GETUTCDATE()
                WHERE [ScheduleId] = @ScheduleId
            `, [schedule.nextRun, scheduleId]);

            this.emit('resumed', { 
                scheduleId, 
                nextRun: schedule.nextRun,
                timestamp: new Date() 
            });
        }
    }

    async updateSchedule(
        scheduleId: string,
        updates: Partial<ScheduledReport>
    ): Promise<void> {
        const schedule = this.schedules.get(scheduleId);
        
        if (!schedule) {
            throw new Error(`Schedule not found: ${scheduleId}`);
        }

        // Update schedule
        Object.assign(schedule, updates);

        // Recalculate next run if schedule changed
        if (updates.schedule) {
            schedule.nextRun = this.calculateNextRun(schedule.schedule);
        }

        // Reschedule job
        if (schedule.enabled) {
            const oldJob = this.jobs.get(scheduleId);
            if (oldJob) {
                oldJob.stop();
                this.jobs.delete(scheduleId);
            }
            this.scheduleJob(schedule);
        }

        // Save to database
        await this.saveSchedule(schedule);

        this.emit('updated', {
            scheduleId,
            reportId: schedule.reportId,
            timestamp: new Date()
        });
    }

    private scheduleJob(schedule: ScheduledReport): void {
        if (!schedule.enabled || !schedule.nextRun) return;

        const cronExpression = this.getCronExpression(schedule.schedule);
        
        const job = new CronJob(
            cronExpression,
            async () => {
                await this.executeSchedule(schedule);
            },
            null,
            true,
            schedule.schedule.timeZone || 'UTC'
        );

        this.jobs.set(schedule.id, job);
    }

    private async executeSchedule(schedule: ScheduledReport): Promise<void> {
        const executionId = uuidv4();
        const startTime = Date.now();

        this.emit('executionStarted', {
            scheduleId: schedule.id,
            reportId: schedule.reportId,
            executionId,
            timestamp: new Date()
        });

        try {
            // Generate report
            const result = await this.engine.generateReport(
                schedule.reportId,
                schedule.parameters,
                { useCache: false }
            );

            // Export report
            const exportedData = await this.engine.exportReport(
                result,
                schedule.format as any,
                {
                    title: schedule.name,
                    author: 'NOVA Scheduler',
                    parameters: schedule.parameters
                }
            );

            // Save to storage
            const fileUrl = await this.saveReportFile(
                executionId,
                exportedData,
                schedule.format
            );

            // Send to recipients
            if (schedule.recipients && schedule.recipients.length > 0) {
                await this.sendReport(
                    schedule.recipients,
                    exportedData,
                    schedule.format,
                    {
                        subject: `Report: ${schedule.name}`,
                        body: `Scheduled report generated at ${new Date().toLocaleString()}`,
                        attachments: [{
                            filename: `${schedule.name}_${executionId}.${this.getFileExtension(schedule.format)}`,
                            content: exportedData
                        }]
                    }
                );
            }

            // Log execution
            await this.logExecution({
                scheduleId: schedule.id,
                reportId: schedule.reportId,
                executionId,
                status: 'success',
                startedAt: new Date(startTime),
                completedAt: new Date(),
                duration: Date.now() - startTime,
                rowCount: result.rowCount,
                fileSize: Buffer.isBuffer(exportedData) ? exportedData.length : exportedData.length,
                fileUrl,
                parameters: schedule.parameters
            });

            // Update schedule
            schedule.lastRun = new Date();
            schedule.lastResult = 'success';
            schedule.nextRun = this.calculateNextRun(schedule.schedule);

            await this.connection.query(`
                UPDATE [ReportSchedule]
                SET [LastRun] = @LastRun,
                    [LastResult] = @LastResult,
                    [NextRun] = @NextRun
                WHERE [ScheduleId] = @ScheduleId
            `, [
                schedule.lastRun,
                schedule.lastResult,
                schedule.nextRun,
                schedule.id
            ]);

            this.emit('executionCompleted', {
                scheduleId: schedule.id,
                reportId: schedule.reportId,
                executionId,
                duration: Date.now() - startTime,
                rowCount: result.rowCount,
                timestamp: new Date()
            });

        } catch (error) {
            // Log failure
            await this.logExecution({
                scheduleId: schedule.id,
                reportId: schedule.reportId,
                executionId,
                status: 'failed',
                startedAt: new Date(startTime),
                completedAt: new Date(),
                duration: Date.now() - startTime,
                error: error.message,
                parameters: schedule.parameters
            });

            schedule.lastRun = new Date();
            schedule.lastResult = 'failed';
            schedule.nextRun = this.calculateNextRun(schedule.schedule);

            await this.connection.query(`
                UPDATE [ReportSchedule]
                SET [LastRun] = @LastRun,
                    [LastResult] = @LastResult,
                    [NextRun] = @NextRun
                WHERE [ScheduleId] = @ScheduleId
            `, [
                schedule.lastRun,
                schedule.lastResult,
                schedule.nextRun,
                schedule.id
            ]);

            this.emit('executionFailed', {
                scheduleId: schedule.id,
                reportId: schedule.reportId,
                executionId,
                error: error.message,
                timestamp: new Date()
            });
        }
    }

    private async saveSchedule(schedule: ScheduledReport): Promise<void> {
        const query = `
            MERGE INTO [ReportSchedule] AS target
            USING (SELECT @ScheduleId AS ScheduleId) AS source
            ON target.[ScheduleId] = source.[ScheduleId]
            WHEN MATCHED THEN
                UPDATE SET 
                    [ReportId] = @ReportId,
                    [Name] = @Name,
                    [Description] = @Description,
                    [Schedule] = @Schedule,
                    [Parameters] = @Parameters,
                    [Recipients] = @Recipients,
                    [Format] = @Format,
                    [NextRun] = @NextRun,
                    [LastRun] = @LastRun,
                    [LastResult] = @LastResult,
                    [Enabled] = @Enabled,
                    [ModifiedAt] = GETUTCDATE()
            WHEN NOT MATCHED THEN
                INSERT ([ScheduleId], [ReportId], [Name], [Description], 
                        [Schedule], [Parameters], [Recipients], [Format],
                        [NextRun], [LastRun], [LastResult], [Enabled], [CreatedBy])
                VALUES (@ScheduleId, @ReportId, @Name, @Description,
                        @Schedule, @Parameters, @Recipients, @Format,
                        @NextRun, @LastRun, @LastResult, @Enabled, @CreatedBy);
        `;

        await this.connection.query(query, [
            schedule.id,
            schedule.reportId,
            schedule.name,
            schedule.description || null,
            JSON.stringify(schedule.schedule),
            schedule.parameters ? JSON.stringify(schedule.parameters) : null,
            schedule.recipients ? JSON.stringify(schedule.recipients) : null,
            schedule.format,
            schedule.nextRun || null,
            schedule.lastRun || null,
            schedule.lastResult || null,
            schedule.enabled ? 1 : 0,
            schedule.createdBy
        ]);
    }

    private async logExecution(log: ExecutionLog): Promise<void> {
        const query = `
            INSERT INTO [ReportExecutionLog] (
                [ScheduleId], [ReportId], [ExecutionId], [Status],
                [StartedAt], [CompletedAt], [Duration], [RowCount],
                [FileSize], [FileUrl], [Error], [Parameters]
            ) VALUES (
                @ScheduleId, @ReportId, @ExecutionId, @Status,
                @StartedAt, @CompletedAt, @Duration, @RowCount,
                @FileSize, @FileUrl, @Error, @Parameters
            )
        `;

        await this.connection.query(query, [
            log.scheduleId,
            log.reportId,
            log.executionId,
            log.status,
            log.startedAt,
            log.completedAt,
            log.duration,
            log.rowCount || null,
            log.fileSize || null,
            log.fileUrl || null,
            log.error || null,
            log.parameters ? JSON.stringify(log.parameters) : null
        ]);
    }

    private async saveReportFile(
        executionId: string,
        data: Buffer | string,
        format: string
    ): Promise<string> {
        // Implementation would save to file system or cloud storage
        return `reports/${executionId}.${format}`;
    }

    private async sendReport(
        recipients: string[],
        data: Buffer | string,
        format: string,
        options: any
    ): Promise<void> {
        // Implementation would send email or other notification
        this.emit('reportSent', {
            recipients,
            format,
            timestamp: new Date()
        });
    }

    private calculateNextRun(schedule: ScheduleDefinition): Date | null {
        if (schedule.frequency === 'once') {
            return schedule.startDate || null;
        }

        const now = new Date();
        
        switch (schedule.frequency) {
            case 'hourly':
                return new Date(now.getTime() + (schedule.interval || 1) * 3600000);
            
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
            
            case 'cron':
                if (schedule.cron) {
                    const job = new CronJob(schedule.cron, () => {});
                    return job.nextDate().toDate();
                }
                return null;
            
            default:
                return null;
        }
    }

    private getCronExpression(schedule: ScheduleDefinition): string {
        switch (schedule.frequency) {
            case 'hourly':
                return `0 */${schedule.interval || 1} * * *`;
            
            case 'daily':
                const [dailyHour, dailyMinute] = (schedule.time || '00:00').split(':').map(Number);
                return `${dailyMinute} ${dailyHour} * * *`;
            
            case 'weekly':
                const [weeklyHour, weeklyMinute] = (schedule.time || '00:00').split(':').map(Number);
                return `${weeklyMinute} ${weeklyHour} * * ${schedule.dayOfWeek || 1}`;
            
            case 'monthly':
                const [monthlyHour, monthlyMinute] = (schedule.time || '00:00').split(':').map(Number);
                return `${monthlyMinute} ${monthlyHour} ${schedule.dayOfMonth || 1} * *`;
            
            case 'cron':
                return schedule.cron || '0 0 * * *';
            
            default:
                return '0 0 * * *';
        }
    }

    private getFileExtension(format: string): string {
        const extensions: Record<string, string> = {
            'pdf': 'pdf',
            'excel': 'xlsx',
            'csv': 'csv',
            'json': 'json',
            'xml': 'xml',
            'html': 'html',
            'yaml': 'yaml',
            'text': 'txt',
            'markdown': 'md'
        };
        return extensions[format] || 'txt';
    }

    private startScheduler(): void {
        // Run every minute to check for due schedules
        setInterval(() => {
            this.checkDueSchedules();
        }, 60000);
    }

    private async checkDueSchedules(): Promise<void> {
        const now = new Date();

        for (const schedule of this.schedules.values()) {
            if (schedule.enabled && schedule.nextRun && schedule.nextRun <= now) {
                await this.executeSchedule(schedule);
            }
        }
    }

    // ============ Public API ============

    getSchedule(scheduleId: string): ScheduledReport | undefined {
        return this.schedules.get(scheduleId);
    }

    getSchedules(reportId?: string): ScheduledReport[] {
        const schedules = Array.from(this.schedules.values());
        
        if (reportId) {
            return schedules.filter(s => s.reportId === reportId);
        }
        
        return schedules;
    }

    async getExecutionLogs(
        scheduleId?: string,
        limit: number = 100
    ): Promise<ExecutionLog[]> {
        let query = `
            SELECT TOP ${limit} * FROM [ReportExecutionLog]
            WHERE 1=1
        `;
        
        const params: any[] = [];
        
        if (scheduleId) {
            query += ` AND [ScheduleId] = @ScheduleId`;
            params.push(scheduleId);
        }

        query += ` ORDER BY [StartedAt] DESC`;

        const result = await this.connection.query(query, params);
        return result.recordset;
    }

    async getScheduleStats(): Promise<ScheduleStats> {
        const schedules = Array.from(this.schedules.values());
        const activeSchedules = schedules.filter(s => s.enabled);
        const dueNow = schedules.filter(s => 
            s.enabled && s.nextRun && s.nextRun <= new Date()
        );

        const result = await this.connection.query(`
            SELECT 
                COUNT(*) AS TotalExecutions,
                SUM(CASE WHEN [Status] = 'success' THEN 1 ELSE 0 END) AS SuccessfulExecutions,
                SUM(CASE WHEN [Status] = 'failed' THEN 1 ELSE 0 END) AS FailedExecutions,
                AVG([Duration]) AS AverageDuration,
                AVG([RowCount]) AS AverageRowCount
            FROM [ReportExecutionLog]
            WHERE [StartedAt] >= DATEADD(day, -30, GETUTCDATE())
        `);

        const stats = result.recordset[0];

        return {
            totalSchedules: schedules.length,
            activeSchedules: activeSchedules.length,
            dueNow: dueNow.length,
            totalExecutions: stats.TotalExecutions || 0,
            successfulExecutions: stats.SuccessfulExecutions || 0,
            failedExecutions: stats.FailedExecutions || 0,
            averageDuration: stats.AverageDuration || 0,
            averageRowCount: stats.AverageRowCount || 0
        };
    }
}

export interface ScheduleDefinition {
    frequency: 'once' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'cron';
    interval?: number;
    dayOfWeek?: number;
    dayOfMonth?: number;
    time?: string;
    cron?: string;
    startDate?: Date;
    endDate?: Date;
    timeZone?: string;
}

export interface ScheduleOptions {
    scheduleId?: string;
    name?: string;
    description?: string;
    parameters?: Record<string, any>;
    recipients?: string[];
    format?: string;
    createdBy?: string;
}

export interface ScheduledReport {
    id: string;
    reportId: string;
    name: string;
    description?: string;
    schedule: ScheduleDefinition;
    parameters?: Record<string, any>;
    recipients?: string[];
    format: string;
    nextRun?: Date | null;
    lastRun?: Date | null;
    lastResult?: string | null;
    enabled: boolean;
    createdBy: string;
    createdAt: Date;
    modifiedAt?: Date;
}

export interface ExecutionLog {
    scheduleId: string;
    reportId: string;
    executionId: string;
    status: 'success' | 'failed' | 'cancelled';
    startedAt: Date;
    completedAt?: Date;
    duration?: number;
    rowCount?: number;
    fileSize?: number;
    fileUrl?: string;
    error?: string;
    parameters?: Record<string, any>;
}

export interface ScheduleStats {
    totalSchedules: number;
    activeSchedules: number;
    dueNow: number;
    totalExecutions: number;
    successfulExecutions: number;
    failedExecutions: number;
    averageDuration: number;
    averageRowCount: number;
}