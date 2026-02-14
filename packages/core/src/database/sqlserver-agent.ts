import { SQLServerConnection } from './sqlserver-connection';

export class SQLServerAgent {
    private connection: SQLServerConnection;

    constructor(connection: SQLServerConnection) {
        this.connection = connection;
    }

    async createJob(job: JobDefinition): Promise<string> {
        const jobId = job.id || `Job_${Date.now()}`;

        await this.connection.query(`
            USE msdb;
            
            -- Create job
            EXEC dbo.sp_add_job
                @job_name = N'${jobId}',
                @enabled = ${job.enabled ? 1 : 0},
                @description = N'${job.description || ''}',
                @category_name = N'${job.category || '[Uncategorized]'}',
                @owner_login_name = N'${job.owner || 'sa'}';
            
            -- Add job step
            EXEC dbo.sp_add_jobstep
                @job_name = N'${jobId}',
                @step_name = N'${job.stepName || 'Step 1'}',
                @step_id = 1,
                @command = N'${job.command}',
                @database_name = N'${job.database || 'master'}',
                @subsystem = N'${job.subsystem || 'TSQL'}',
                @retry_attempts = ${job.retryAttempts || 0},
                @retry_interval = ${job.retryInterval || 0},
                @output_file_name = N'${job.outputFile || ''}';
            
            -- Create schedule if provided
            ${job.schedule ? this.createScheduleScript(jobId, job.schedule) : ''}
            
            -- Add job to server
            EXEC dbo.sp_add_jobserver
                @job_name = N'${jobId}';
        `);

        return jobId;
    }

    async updateJob(jobId: string, updates: Partial<JobDefinition>): Promise<void> {
        await this.connection.query(`
            USE msdb;
            
            EXEC dbo.sp_update_job
                @job_name = N'${jobId}',
                @enabled = ${updates.enabled !== undefined ? (updates.enabled ? 1 : 0) : null},
                @description = N'${updates.description || ''}';
        `);
    }

    async deleteJob(jobId: string): Promise<void> {
        await this.connection.query(`
            USE msdb;
            
            EXEC dbo.sp_delete_job
                @job_name = N'${jobId}';
        `);
    }

    async startJob(jobId: string): Promise<void> {
        await this.connection.query(`
            USE msdb;
            
            EXEC dbo.sp_start_job
                @job_name = N'${jobId}';
        `);
    }

    async stopJob(jobId: string): Promise<void> {
        await this.connection.query(`
            USE msdb;
            
            EXEC dbo.sp_stop_job
                @job_name = N'${jobId}';
        `);
    }

    async getJobStatus(jobId: string): Promise<JobStatus> {
        const result = await this.connection.query(`
            USE msdb;
            
            SELECT 
                job_id,
                last_run_date,
                last_run_time,
                last_run_outcome,
                last_outcome_message,
                last_run_duration,
                enabled
            FROM dbo.sysjobactivity
            WHERE job_id = (SELECT job_id FROM dbo.sysjobs WHERE name = '${jobId}')
        `);

        return this.parseJobStatus(result.recordset[0]);
    }

    async createSchedule(schedule: ScheduleDefinition): Promise<string> {
        const scheduleId = `Schedule_${Date.now()}`;

        await this.connection.query(`
            USE msdb;
            
            EXEC dbo.sp_add_schedule
                @schedule_name = N'${scheduleId}',
                @freq_type = ${schedule.freqType || 4},
                @freq_interval = ${schedule.freqInterval || 1},
                @freq_subday_type = ${schedule.freqSubdayType || 1},
                @freq_subday_interval = ${schedule.freqSubdayInterval || 0},
                @freq_relative_interval = ${schedule.freqRelativeInterval || 0},
                @freq_recurrence_factor = ${schedule.freqRecurrenceFactor || 0},
                @active_start_date = ${schedule.activeStartDate || 0},
                @active_end_date = ${schedule.activeEndDate || 0},
                @active_start_time = ${schedule.activeStartTime || 0},
                @active_end_time = ${schedule.activeEndTime || 0};
        `);

        return scheduleId;
    }

    async attachSchedule(jobId: string, scheduleName: string): Promise<void> {
        await this.connection.query(`
            USE msdb;
            
            EXEC dbo.sp_attach_schedule
                @job_name = N'${jobId}',
                @schedule_name = N'${scheduleName}';
        `);
    }

    async detachSchedule(jobId: string, scheduleName: string): Promise<void> {
        await this.connection.query(`
            USE msdb;
            
            EXEC dbo.sp_detach_schedule
                @job_name = N'${jobId}',
                @schedule_name = N'${scheduleName}';
        `);
    }

    async createAlert(alert: AlertDefinition): Promise<string> {
        const alertId = `Alert_${Date.now()}`;

        await this.connection.query(`
            USE msdb;
            
            EXEC dbo.sp_add_alert
                @name = N'${alertId}',
                @message_id = ${alert.messageId || 0},
                @severity = ${alert.severity || 0},
                @enabled = ${alert.enabled ? 1 : 0},
                @delay_between_responses = ${alert.delay || 0},
                @notification_message = N'${alert.message || ''}',
                @include_event_description_in = ${alert.includeDescription ? 1 : 0},
                @job_name = N'${alert.jobName || ''}';
        `);

        return alertId;
    }

    async createOperator(operator: OperatorDefinition): Promise<string> {
        const operatorId = `Operator_${Date.now()}`;

        await this.connection.query(`
            USE msdb;
            
            EXEC dbo.sp_add_operator
                @name = N'${operatorId}',
                @enabled = ${operator.enabled ? 1 : 0},
                @email_address = N'${operator.email || ''}',
                @pager_address = N'${operator.pager || ''}',
                @weekday_pager_start_time = ${operator.pagerStartTime || 90000},
                @weekday_pager_end_time = ${operator.pagerEndTime || 180000},
                @pager_days = ${operator.pagerDays || 62},
                @netsend_address = N'${operator.netSend || ''}';
        `);

        return operatorId;
    }

    async getJobHistory(jobId: string, limit: number = 100): Promise<JobHistoryEntry[]> {
        const result = await this.connection.query(`
            USE msdb;
            
            SELECT TOP ${limit}
                h.instance_id,
                h.job_id,
                j.name as job_name,
                h.step_id,
                h.step_name,
                h.message,
                h.run_status,
                h.run_date,
                h.run_time,
                h.run_duration,
                h.retries_attempted,
                h.server
            FROM dbo.sysjobhistory h
            JOIN dbo.sysjobs j ON h.job_id = j.job_id
            WHERE j.name = '${jobId}'
            ORDER BY h.instance_id DESC
        `);

        return result.recordset.map(row => ({
            instanceId: row.instance_id,
            jobId: row.job_id,
            jobName: row.job_name,
            stepId: row.step_id,
            stepName: row.step_name,
            message: row.message,
            status: this.getRunStatus(row.run_status),
            runDate: this.parseDateTime(row.run_date, row.run_time),
            duration: row.run_duration,
            retries: row.retries_attempted
        }));
    }

    private createScheduleScript(jobId: string, schedule: ScheduleDefinition): string {
        return `
            EXEC dbo.sp_add_schedule
                @schedule_name = N'${jobId}_Schedule',
                @freq_type = ${schedule.freqType || 4},
                @freq_interval = ${schedule.freqInterval || 1},
                @freq_subday_type = ${schedule.freqSubdayType || 1},
                @freq_subday_interval = ${schedule.freqSubdayInterval || 0},
                @active_start_time = ${schedule.activeStartTime || 0};
            
            EXEC dbo.sp_attach_schedule
                @job_name = N'${jobId}',
                @schedule_name = N'${jobId}_Schedule';
        `;
    }

    private parseJobStatus(row: any): JobStatus {
        if (!row) return { running: false, enabled: false, lastRun: null };

        const lastRunDate = this.parseDateTime(row.last_run_date, row.last_run_time);
        
        return {
            running: false, // Need additional query to determine if running
            enabled: row.enabled === 1,
            lastRun: lastRunDate,
            lastOutcome: this.getRunOutcome(row.last_run_outcome),
            lastMessage: row.last_outcome_message,
            duration: row.last_run_duration
        };
    }

    private parseDateTime(date: number, time: number): Date | null {
        if (!date || !time) return null;
        
        const dateStr = date.toString();
        const timeStr = time.toString().padStart(6, '0');
        
        const year = parseInt(dateStr.substring(0, 4));
        const month = parseInt(dateStr.substring(4, 6));
        const day = parseInt(dateStr.substring(6, 8));
        const hour = parseInt(timeStr.substring(0, 2));
        const minute = parseInt(timeStr.substring(2, 4));
        const second = parseInt(timeStr.substring(4, 6));
        
        return new Date(year, month - 1, day, hour, minute, second);
    }

    private getRunStatus(status: number): string {
        const statuses: Record<number, string> = {
            0: 'Failed',
            1: 'Succeeded',
            2: 'Retry',
            3: 'Canceled',
            4: 'In Progress'
        };
        return statuses[status] || 'Unknown';
    }

    private getRunOutcome(outcome: number): string {
        const outcomes: Record<number, string> = {
            0: 'Failed',
            1: 'Succeeded',
            2: 'Retry',
            3: 'Canceled',
            5: 'Unknown'
        };
        return outcomes[outcome] || 'Unknown';
    }
}

export interface JobDefinition {
    id?: string;
    name: string;
    enabled?: boolean;
    description?: string;
    category?: string;
    owner?: string;
    command: string;
    stepName?: string;
    database?: string;
    subsystem?: 'TSQL' | 'CmdExec' | 'PowerShell' | 'SSIS' | 'SSAS' | 'SSRS';
    retryAttempts?: number;
    retryInterval?: number;
    outputFile?: string;
    schedule?: ScheduleDefinition;
}

export interface ScheduleDefinition {
    freqType?: number; // 4 = Daily, 8 = Weekly, 16 = Monthly
    freqInterval?: number;
    freqSubdayType?: number; // 1 = At specified time, 2 = Seconds, 4 = Minutes, 8 = Hours
    freqSubdayInterval?: number;
    freqRelativeInterval?: number;
    freqRecurrenceFactor?: number;
    activeStartDate?: number;
    activeEndDate?: number;
    activeStartTime?: number;
    activeEndTime?: number;
}

export interface AlertDefinition {
    name: string;
    messageId?: number;
    severity?: number;
    enabled?: boolean;
    delay?: number;
    message?: string;
    includeDescription?: boolean;
    jobName?: string;
}

export interface OperatorDefinition {
    name: string;
    enabled?: boolean;
    email?: string;
    pager?: string;
    netSend?: string;
    pagerStartTime?: number;
    pagerEndTime?: number;
    pagerDays?: number;
}

export interface JobStatus {
    running: boolean;
    enabled: boolean;
    lastRun: Date | null;
    lastOutcome?: string;
    lastMessage?: string;
    duration?: number;
}

export interface JobHistoryEntry {
    instanceId: number;
    jobId: string;
    jobName: string;
    stepId: number;
    stepName: string;
    message: string;
    status: string;
    runDate: Date | null;
    duration: number;
    retries: number;
}