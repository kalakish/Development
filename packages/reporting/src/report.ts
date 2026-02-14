import { EventEmitter } from 'events';
import { Session } from '../core/session';
import { Record } from '../orm/record';
import { ReportDataset } from './dataset';
import { ReportExporter, ExportFormat } from './export';

export abstract class NovaReport extends EventEmitter {
    protected session: Session;
    protected metadata: ReportMetadata;
    protected datasets: Map<string, ReportDataset> = new Map();
    protected parameters: ReportParameters = {};
    protected state: ReportState;
    protected exporter: ReportExporter;

    constructor(metadata: ReportMetadata, session: Session) {
        super();
        this.metadata = metadata;
        this.session = session;
        this.state = {
            status: ReportStatus.Idle,
            progress: 0,
            startTime: null,
            endTime: null,
            rowCount: 0,
            error: null
        };
        this.exporter = new ReportExporter();
    }

    async initialize(): Promise<void> {
        await this.loadMetadata();
        await this.initializeDatasets();
        await this.executeTrigger('OnPreReport');
    }

    async setParameters(parameters: ReportParameters): Promise<void> {
        this.parameters = {
            ...this.parameters,
            ...parameters
        };

        // Validate parameters
        await this.validateParameters();

        this.emit('parametersChanged', this.parameters);
    }

    async execute(): Promise<ReportResult> {
        try {
            this.state.status = ReportStatus.Executing;
            this.state.startTime = new Date();
            this.state.progress = 0;
            
            this.emit('executionStarted', {
                timestamp: this.state.startTime
            });

            // Execute pre-processing
            await this.executeTrigger('OnPreReport');

            // Generate datasets
            await this.generateDatasets();

            // Apply filtering
            await this.applyFilters();

            // Apply sorting
            await this.applySorting();

            // Calculate aggregates
            await this.calculateAggregates();

            // Execute post-processing
            await this.executeTrigger('OnPostReport');

            // Prepare result
            const result: ReportResult = {
                success: true,
                metadata: this.metadata,
                parameters: this.parameters,
                datasets: this.getDatasetData(),
                rowCount: this.state.rowCount,
                executionTime: this.getExecutionTime(),
                timestamp: new Date()
            };

            this.state.status = ReportStatus.Completed;
            this.state.endTime = new Date();
            this.state.progress = 100;

            this.emit('executionCompleted', result);

            return result;

        } catch (error) {
            this.state.status = ReportStatus.Failed;
            this.state.error = error.message;
            this.state.endTime = new Date();

            this.emit('executionFailed', {
                error: error.message,
                timestamp: this.state.endTime
            });

            throw error;
        }
    }

    async export(format: ExportFormat, options?: ExportOptions): Promise<Buffer | string> {
        if (this.state.status !== ReportStatus.Completed) {
            await this.execute();
        }

        const data = this.getDatasetData();
        return this.exporter.export(data, format, {
            title: this.metadata.name,
            ...options
        });
    }

    async preview(): Promise<any> {
        // Generate preview data (limited rows)
        const originalLimit = this.parameters.limit;
        this.parameters.limit = 10;

        await this.execute();
        
        // Restore limit
        this.parameters.limit = originalLimit;

        return this.getDatasetData();
    }

    async schedule(cron: string, parameters?: ReportParameters): Promise<string> {
        const scheduleId = `report_${this.metadata.id}_${Date.now()}`;
        
        // Store schedule in database
        const scheduleData = {
            id: scheduleId,
            reportId: this.metadata.id,
            cron,
            parameters: parameters || this.parameters,
            createdBy: this.session.user.id,
            createdAt: new Date(),
            enabled: true
        };

        this.emit('scheduled', scheduleData);

        return scheduleId;
    }

    async cancel(): Promise<void> {
        if (this.state.status === ReportStatus.Executing) {
            this.state.status = ReportStatus.Cancelled;
            this.state.endTime = new Date();
            
            this.emit('cancelled');
        }
    }

    protected abstract initializeDatasets(): Promise<void>;

    protected async generateDatasets(): Promise<void> {
        for (const [name, dataset] of this.datasets) {
            await dataset.load();
            
            this.state.rowCount += dataset.getRowCount();
            
            this.emit('datasetLoaded', {
                name,
                rowCount: dataset.getRowCount()
            });
        }
    }

    protected async applyFilters(): Promise<void> {
        for (const dataset of this.datasets.values()) {
            if (this.parameters.filters) {
                for (const filter of this.parameters.filters) {
                    dataset.filter(filter);
                }
            }
        }
    }

    protected async applySorting(): Promise<void> {
        for (const dataset of this.datasets.values()) {
            if (this.parameters.sortBy) {
                dataset.sort(this.parameters.sortBy);
            }
        }
    }

    protected async calculateAggregates(): Promise<void> {
        // Override in derived classes
    }

    protected async validateParameters(): Promise<void> {
        const requiredParams = this.metadata.parameters || [];
        
        for (const param of requiredParams) {
            if (param.required && this.parameters[param.name] === undefined) {
                throw new Error(`Required parameter '${param.name}' is missing`);
            }

            // Validate parameter type
            if (this.parameters[param.name] !== undefined) {
                this.validateParameterType(param, this.parameters[param.name]);
            }
        }
    }

    private validateParameterType(param: ReportParameter, value: any): void {
        switch (param.type) {
            case 'integer':
                if (!Number.isInteger(value)) {
                    throw new Error(`Parameter '${param.name}' must be an integer`);
                }
                break;
            case 'decimal':
                if (typeof value !== 'number' || isNaN(value)) {
                    throw new Error(`Parameter '${param.name}' must be a number`);
                }
                break;
            case 'boolean':
                if (typeof value !== 'boolean') {
                    throw new Error(`Parameter '${param.name}' must be a boolean`);
                }
                break;
            case 'date':
                if (!(value instanceof Date) && isNaN(Date.parse(value))) {
                    throw new Error(`Parameter '${param.name}' must be a valid date`);
                }
                break;
        }
    }

    protected async executeTrigger(triggerName: string): Promise<void> {
        const trigger = this.metadata.triggers?.find(t => t.name === triggerName);
        
        if (trigger && trigger.handler) {
            await trigger.handler(this);
        }
    }

    protected async loadMetadata(): Promise<void> {
        // Load report metadata from metadata manager
    }

    getDataset(name: string): ReportDataset | undefined {
        return this.datasets.get(name);
    }

    getDatasetData(): Record<string, any[]> {
        const data: Record<string, any[]> = {};
        
        for (const [name, dataset] of this.datasets) {
            data[name] = dataset.getData();
        }
        
        return data;
    }

    getSession(): Session {
        return this.session;
    }

    getMetadata(): ReportMetadata {
        return this.metadata;
    }

    getState(): ReportState {
        return { ...this.state };
    }

    getExecutionTime(): number {
        if (this.state.startTime) {
            const end = this.state.endTime || new Date();
            return end.getTime() - this.state.startTime.getTime();
        }
        return 0;
    }

    getProgress(): number {
        return this.state.progress;
    }
}

export interface ReportMetadata {
    id: number;
    name: string;
    description?: string;
    datasets: ReportDatasetMetadata[];
    parameters?: ReportParameter[];
    triggers?: ReportTrigger[];
    properties?: Record<string, any>;
}

export interface ReportDatasetMetadata {
    name: string;
    tableName: string;
    columns: ReportColumn[];
    relations?: ReportRelation[];
}

export interface ReportColumn {
    name: string;
    source: string;
    dataType: string;
    caption?: string;
    format?: string;
    isAggregate?: boolean;
    aggregateType?: 'sum' | 'avg' | 'count' | 'min' | 'max';
}

export interface ReportRelation {
    type: 'inner' | 'left' | 'right';
    table: string;
    condition: string;
}

export interface ReportParameter {
    name: string;
    type: 'integer' | 'decimal' | 'string' | 'boolean' | 'date' | 'datetime';
    required?: boolean;
    defaultValue?: any;
    validValues?: any[];
    caption?: string;
}

export interface ReportTrigger {
    name: string;
    handler: Function;
}

export interface ReportParameters {
    [key: string]: any;
    filters?: ReportFilter[];
    sortBy?: ReportSort[];
    limit?: number;
    offset?: number;
}

export interface ReportFilter {
    field: string;
    operator: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'like' | 'in' | 'between';
    value: any;
    secondValue?: any;
}

export interface ReportSort {
    field: string;
    direction: 'asc' | 'desc';
}

export interface ReportResult {
    success: boolean;
    metadata: ReportMetadata;
    parameters: ReportParameters;
    datasets: Record<string, any[]>;
    rowCount: number;
    executionTime: number;
    timestamp: Date;
}

export interface ReportState {
    status: ReportStatus;
    progress: number;
    startTime: Date | null;
    endTime: Date | null;
    rowCount: number;
    error: string | null;
}

export enum ReportStatus {
    Idle = 'idle',
    Executing = 'executing',
    Completed = 'completed',
    Failed = 'failed',
    Cancelled = 'cancelled'
}

export interface ExportOptions {
    title?: string;
    author?: string;
    orientation?: 'portrait' | 'landscape';
    pageSize?: 'A4' | 'Letter' | 'Legal';
    margins?: {
        top: number;
        right: number;
        bottom: number;
        left: number;
    };
    watermark?: string;
}