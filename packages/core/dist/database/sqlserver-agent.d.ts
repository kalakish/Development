import { SQLServerConnection } from './sqlserver-connection';
export declare class SQLServerAgent {
    private connection;
    constructor(connection: SQLServerConnection);
    createJob(job: JobDefinition): Promise<string>;
    updateJob(jobId: string, updates: Partial<JobDefinition>): Promise<void>;
    deleteJob(jobId: string): Promise<void>;
    startJob(jobId: string): Promise<void>;
    stopJob(jobId: string): Promise<void>;
    getJobStatus(jobId: string): Promise<JobStatus>;
    createSchedule(schedule: ScheduleDefinition): Promise<string>;
    attachSchedule(jobId: string, scheduleName: string): Promise<void>;
    detachSchedule(jobId: string, scheduleName: string): Promise<void>;
    createAlert(alert: AlertDefinition): Promise<string>;
    createOperator(operator: OperatorDefinition): Promise<string>;
    getJobHistory(jobId: string, limit?: number): Promise<JobHistoryEntry[]>;
    private createScheduleScript;
    private parseJobStatus;
    private parseDateTime;
    private getRunStatus;
    private getRunOutcome;
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
    freqType?: number;
    freqInterval?: number;
    freqSubdayType?: number;
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
//# sourceMappingURL=sqlserver-agent.d.ts.map