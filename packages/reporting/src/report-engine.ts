import { EventEmitter } from 'events';
import { Session } from '@nova/core/session';
import { Record } from '@nova/orm/record';
import { SQLServerConnection } from '@nova/core/database/sqlserver-connection';
import { ReportDataset, DatasetOptions } from './dataset';
import { ReportExporter, ExportFormat, ExportOptions } from './export';
import { ReportScheduler } from './scheduler/report-scheduler';
import { ReportDesigner } from './designer/report-designer';
import { TemplateEngine } from './templates/template-engine';
import { ChartGenerator } from './visualizations/chart-generator';
import { Aggregator } from './aggregations/aggregator';
import { v4 as uuidv4 } from 'uuid';

export class ReportEngine extends EventEmitter {
    private session: Session;
    private connection: SQLServerConnection;
    private exporter: ReportExporter;
    private scheduler: ReportScheduler;
    private designer: ReportDesigner;
    private templateEngine: TemplateEngine;
    private chartGenerator: ChartGenerator;
    private aggregator: Aggregator;

    private reports: Map<string, ReportDefinition> = new Map();
    private executions: Map<string, ReportExecution> = new Map();
    private cache: Map<string, ReportCache> = new Map();

    constructor(session: Session) {
        super();
        this.session = session;
        this.connection = session['connection'];
        this.exporter = new ReportExporter();
        this.scheduler = new ReportScheduler(this);
        this.designer = new ReportDesigner();
        this.templateEngine = new TemplateEngine();
        this.chartGenerator = new ChartGenerator();
        this.aggregator = new Aggregator();
    }

    // ============ Report Registration ============

    async registerReport(definition: ReportDefinition): Promise<string> {
        const reportId = definition.id || uuidv4();
        
        // Validate report definition
        this.validateReportDefinition(definition);

        this.reports.set(reportId, {
            ...definition,
            id: reportId,
            createdAt: new Date(),
            updatedAt: new Date()
        });

        this.emit('reportRegistered', {
            reportId,
            name: definition.name,
            timestamp: new Date()
        });

        return reportId;
    }

    async getReport(reportId: string): Promise<ReportDefinition | undefined> {
        return this.reports.get(reportId);
    }

    async updateReport(reportId: string, definition: Partial<ReportDefinition>): Promise<void> {
        const report = this.reports.get(reportId);
        
        if (!report) {
            throw new Error(`Report not found: ${reportId}`);
        }

        Object.assign(report, definition, {
            updatedAt: new Date()
        });

        this.emit('reportUpdated', {
            reportId,
            name: report.name,
            timestamp: new Date()
        });
    }

    async deleteReport(reportId: string): Promise<void> {
        this.reports.delete(reportId);
        
        this.emit('reportDeleted', {
            reportId,
            timestamp: new Date()
        });
    }

    // ============ Report Execution ============

    async generateReport(
        reportId: string,
        parameters?: ReportParameters,
        options?: ExecutionOptions
    ): Promise<ReportResult> {
        const report = this.reports.get(reportId);
        
        if (!report) {
            throw new Error(`Report not found: ${reportId}`);
        }

        const executionId = uuidv4();
        const startTime = Date.now();

        const execution: ReportExecution = {
            id: executionId,
            reportId,
            status: 'running',
            parameters: parameters || {},
            startTime: new Date(),
            progress: 0
        };

        this.executions.set(executionId, execution);
        this.emit('executionStarted', { executionId, reportId });

        try {
            // Check cache
            if (options?.useCache) {
                const cached = await this.getCachedResult(reportId, parameters);
                if (cached) {
                    execution.status = 'completed';
                    execution.endTime = new Date();
                    execution.progress = 100;
                    
                    this.emit('executionCompleted', { executionId, reportId });
                    
                    return cached;
                }
            }

            // Execute pre-report trigger
            await this.executeTrigger(report, 'onPreReport', { parameters, execution });

            // Load datasets
            const datasets = await this.loadDatasets(report, parameters);
            execution.progress = 30;

            // Apply filters
            const filteredDatasets = await this.applyFilters(datasets, parameters);
            execution.progress = 50;

            // Apply aggregations
            const aggregatedDatasets = await this.applyAggregations(filteredDatasets, report);
            execution.progress = 70;

            // Apply sorting
            const sortedDatasets = await this.applySorting(aggregatedDatasets, report);
            execution.progress = 80;

            // Generate visualizations
            const visualizations = await this.generateVisualizations(report, sortedDatasets);
            execution.progress = 90;

            // Execute post-report trigger
            await this.executeTrigger(report, 'onPostReport', { 
                datasets: sortedDatasets, 
                visualizations,
                execution 
            });

            // Prepare result
            const result: ReportResult = {
                id: executionId,
                reportId,
                reportName: report.name,
                generatedAt: new Date(),
                executionTime: Date.now() - startTime,
                parameters: parameters || {},
                datasets: sortedDatasets,
                visualizations,
                rowCount: this.getTotalRowCount(sortedDatasets),
                status: 'success'
            };

            // Cache result
            if (options?.cache) {
                await this.cacheResult(reportId, parameters, result, options.cacheTTL);
            }

            execution.status = 'completed';
            execution.endTime = new Date();
            execution.progress = 100;
            execution.result = result;

            this.emit('executionCompleted', { 
                executionId, 
                reportId,
                rowCount: result.rowCount,
                executionTime: result.executionTime 
            });

            return result;

        } catch (error) {
            execution.status = 'failed';
            execution.endTime = new Date();
            execution.error = error.message;

            this.emit('executionFailed', {
                executionId,
                reportId,
                error: error.message,
                timestamp: new Date()
            });

            throw error;
        }
    }

    async executeAsync(
        reportId: string,
        parameters?: ReportParameters
    ): Promise<string> {
        const executionId = uuidv4();
        
        // Execute in background
        setImmediate(async () => {
            try {
                await this.generateReport(reportId, parameters);
            } catch (error) {
                console.error(`Async report execution failed: ${error.message}`);
            }
        });

        return executionId;
    }

    async cancelExecution(executionId: string): Promise<void> {
        const execution = this.executions.get(executionId);
        
        if (execution && execution.status === 'running') {
            execution.status = 'cancelled';
            execution.endTime = new Date();
            
            this.emit('executionCancelled', { executionId, reportId: execution.reportId });
        }
    }

    // ============ Dataset Operations ============

    private async loadDatasets(
        report: ReportDefinition,
        parameters?: ReportParameters
    ): Promise<Record<string, any[]>> {
        const datasets: Record<string, any[]> = {};

        for (const datasetDef of report.datasets) {
            const dataset = new ReportDataset(
                datasetDef.name,
                datasetDef.tableName,
                this.session,
                {
                    columns: datasetDef.columns,
                    relations: datasetDef.relations
                }
            );

            // Apply dataset parameters
            if (datasetDef.parameters) {
                for (const param of datasetDef.parameters) {
                    const value = parameters?.[param.name] ?? param.defaultValue;
                    if (value !== undefined) {
                        dataset.setParameter(param.name, value);
                    }
                }
            }

            await dataset.load();
            datasets[datasetDef.name] = dataset.getData();

            this.emit('datasetLoaded', {
                reportId: report.id,
                datasetName: datasetDef.name,
                rowCount: dataset.getRowCount()
            });
        }

        return datasets;
    }

    private async applyFilters(
        datasets: Record<string, any[]>,
        parameters?: ReportParameters
    ): Promise<Record<string, any[]>> {
        const filtered: Record<string, any[]> = {};

        for (const [name, data] of Object.entries(datasets)) {
            let filteredData = [...data];

            // Apply global filters
            if (parameters?.filters) {
                for (const filter of parameters.filters) {
                    filteredData = filteredData.filter(row => 
                        this.evaluateFilter(row, filter)
                    );
                }
            }

            filtered[name] = filteredData;
        }

        return filtered;
    }

    private async applyAggregations(
        datasets: Record<string, any[]>,
        report: ReportDefinition
    ): Promise<Record<string, any[]>> {
        const aggregated: Record<string, any[]> = {};

        for (const [name, data] of Object.entries(datasets)) {
            const datasetDef = report.datasets.find(d => d.name === name);
            
            if (datasetDef?.aggregations) {
                const result = await this.aggregator.aggregate(data, datasetDef.aggregations);
                aggregated[name] = result;
            } else {
                aggregated[name] = data;
            }
        }

        return aggregated;
    }

    private async applySorting(
        datasets: Record<string, any[]>,
        report: ReportDefinition
    ): Promise<Record<string, any[]>> {
        const sorted: Record<string, any[]> = {};

        for (const [name, data] of Object.entries(datasets)) {
            let sortedData = [...data];
            const sortBy = report.sortBy?.[name];

            if (sortBy) {
                sortedData = sortedData.sort((a, b) => {
                    for (const sort of sortBy) {
                        const aVal = a[sort.field];
                        const bVal = b[sort.field];
                        
                        if (aVal < bVal) return sort.direction === 'asc' ? -1 : 1;
                        if (aVal > bVal) return sort.direction === 'asc' ? 1 : -1;
                    }
                    return 0;
                });
            }

            sorted[name] = sortedData;
        }

        return sorted;
    }

    // ============ Visualization Operations ============

    private async generateVisualizations(
        report: ReportDefinition,
        datasets: Record<string, any[]>
    ): Promise<Visualization[]> {
        const visualizations: Visualization[] = [];

        for (const vizDef of report.visualizations || []) {
            const dataset = datasets[vizDef.dataset];
            
            if (!dataset) {
                continue;
            }

            let chart;
            switch (vizDef.type) {
                case 'bar':
                    chart = this.chartGenerator.createBarChart(
                        dataset,
                        vizDef.options
                    );
                    break;
                case 'line':
                    chart = this.chartGenerator.createLineChart(
                        dataset,
                        vizDef.options
                    );
                    break;
                case 'pie':
                    chart = this.chartGenerator.createPieChart(
                        dataset,
                        vizDef.options
                    );
                    break;
                case 'table':
                    chart = this.chartGenerator.createTable(
                        dataset,
                        vizDef.options
                    );
                    break;
                default:
                    continue;
            }

            visualizations.push(chart);
        }

        return visualizations;
    }

    // ============ Export Operations ============

    async exportReport(
        result: ReportResult,
        format: ExportFormat,
        options?: ExportOptions
    ): Promise<Buffer | string> {
        return this.exporter.export(result.datasets, format, {
            title: result.reportName,
            generatedAt: result.generatedAt,
            parameters: result.parameters,
            ...options
        });
    }

    async exportToMultiple(
        result: ReportResult,
        formats: ExportFormat[]
    ): Promise<Record<ExportFormat, Buffer | string>> {
        const exports: Record<ExportFormat, Buffer | string> = {};

        for (const format of formats) {
            exports[format] = await this.exportReport(result, format);
        }

        return exports;
    }

    // ============ Scheduling Operations ============

    async scheduleReport(
        reportId: string,
        schedule: ScheduleDefinition,
        parameters?: ReportParameters
    ): Promise<string> {
        return this.scheduler.schedule(reportId, schedule, parameters);
    }

    async unscheduleReport(scheduleId: string): Promise<void> {
        await this.scheduler.unschedule(scheduleId);
    }

    async getScheduledReports(): Promise<ScheduledReport[]> {
        return this.scheduler.getScheduled();
    }

    // ============ Caching Operations ============

    private async cacheResult(
        reportId: string,
        parameters: any,
        result: ReportResult,
        ttl: number = 3600
    ): Promise<void> {
        const key = this.getCacheKey(reportId, parameters);
        
        this.cache.set(key, {
            result,
            expiresAt: Date.now() + (ttl * 1000)
        });

        // Cleanup expired cache
        this.cleanupCache();
    }

    private async getCachedResult(
        reportId: string,
        parameters?: any
    ): Promise<ReportResult | null> {
        const key = this.getCacheKey(reportId, parameters);
        const cached = this.cache.get(key);

        if (cached && cached.expiresAt > Date.now()) {
            return cached.result;
        }

        return null;
    }

    private getCacheKey(reportId: string, parameters?: any): string {
        return `${reportId}_${JSON.stringify(parameters || {})}`;
    }

    private cleanupCache(): void {
        const now = Date.now();
        
        for (const [key, cache] of this.cache) {
            if (cache.expiresAt <= now) {
                this.cache.delete(key);
            }
        }
    }

    // ============ Trigger Operations ============

    private async executeTrigger(
        report: ReportDefinition,
        triggerName: string,
        context: any
    ): Promise<void> {
        const trigger = report.triggers?.find(t => t.name === triggerName);
        
        if (trigger && trigger.handler) {
            await trigger.handler(context);
        }
    }

    // ============ Utility Operations ============

    private validateReportDefinition(definition: ReportDefinition): void {
        if (!definition.name) {
            throw new Error('Report name is required');
        }

        if (!definition.datasets || definition.datasets.length === 0) {
            throw new Error('Report must have at least one dataset');
        }

        for (const dataset of definition.datasets) {
            if (!dataset.name) {
                throw new Error('Dataset name is required');
            }
            if (!dataset.tableName) {
                throw new Error(`Dataset ${dataset.name} must specify a table name`);
            }
        }
    }

    private evaluateFilter(row: any, filter: ReportFilter): boolean {
        const value = this.getNestedValue(row, filter.field);

        switch (filter.operator) {
            case 'eq':
                return value === filter.value;
            case 'neq':
                return value !== filter.value;
            case 'gt':
                return value > filter.value;
            case 'gte':
                return value >= filter.value;
            case 'lt':
                return value < filter.value;
            case 'lte':
                return value <= filter.value;
            case 'like':
                return String(value).includes(String(filter.value));
            case 'in':
                return Array.isArray(filter.value) && filter.value.includes(value);
            case 'between':
                return value >= filter.value && value <= filter.secondValue;
            case 'isnull':
                return value === null || value === undefined;
            case 'isnotnull':
                return value !== null && value !== undefined;
            default:
                return true;
        }
    }

    private getNestedValue(obj: any, path: string): any {
        return path.split('.').reduce((current, key) => 
            current && current[key] !== undefined ? current[key] : undefined, obj
        );
    }

    private getTotalRowCount(datasets: Record<string, any[]>): number {
        return Object.values(datasets).reduce((sum, data) => sum + data.length, 0);
    }

    // ============ Status & Monitoring ============

    getExecution(executionId: string): ReportExecution | undefined {
        return this.executions.get(executionId);
    }

    getExecutions(reportId?: string): ReportExecution[] {
        const executions = Array.from(this.executions.values());
        
        if (reportId) {
            return executions.filter(e => e.reportId === reportId);
        }
        
        return executions;
    }

    getReports(): ReportDefinition[] {
        return Array.from(this.reports.values());
    }

    async getStats(): Promise<ReportEngineStats> {
        const executions = Array.from(this.executions.values());
        
        return {
            totalReports: this.reports.size,
            totalExecutions: executions.length,
            successfulExecutions: executions.filter(e => e.status === 'completed').length,
            failedExecutions: executions.filter(e => e.status === 'failed').length,
            runningExecutions: executions.filter(e => e.status === 'running').length,
            cachedResults: this.cache.size,
            averageExecutionTime: this.calculateAverageExecutionTime(executions)
        };
    }

    private calculateAverageExecutionTime(executions: ReportExecution[]): number {
        const completed = executions.filter(e => e.endTime && e.startTime);
        
        if (completed.length === 0) return 0;
        
        const total = completed.reduce((sum, e) => 
            sum + (e.endTime!.getTime() - e.startTime.getTime()), 0
        );
        
        return total / completed.length;
    }

    // ============ Cleanup ============

    async cleanup(olderThan: Date): Promise<number> {
        let removedCount = 0;

        // Cleanup old executions
        for (const [id, execution] of this.executions) {
            if (execution.endTime && execution.endTime < olderThan) {
                this.executions.delete(id);
                removedCount++;
            }
        }

        // Cleanup expired cache
        this.cleanupCache();

        return removedCount;
    }
}

export interface ReportDefinition {
    id?: string;
    name: string;
    description?: string;
    version?: string;
    datasets: DatasetDefinition[];
    parameters?: ReportParameter[];
    filters?: ReportFilter[];
    sortBy?: Record<string, ReportSort[]>;
    aggregations?: Record<string, AggregationDefinition[]>;
    visualizations?: VisualizationDefinition[];
    triggers?: ReportTrigger[];
    permissions?: ReportPermission[];
    layout?: ReportLayout;
    createdAt?: Date;
    updatedAt?: Date;
    createdBy?: string;
}

export interface DatasetDefinition {
    name: string;
    tableName: string;
    columns: DatasetColumn[];
    relations?: DatasetRelation[];
    parameters?: DatasetParameter[];
    filters?: ReportFilter[];
    aggregations?: AggregationDefinition[];
}

export interface DatasetColumn {
    name: string;
    source: string;
    dataType: string;
    caption?: string;
    format?: string;
    width?: number;
    visible?: boolean;
}

export interface DatasetRelation {
    type: 'inner' | 'left' | 'right' | 'full';
    table: string;
    condition: string;
}

export interface DatasetParameter {
    name: string;
    value: any;
}

export interface ReportParameter {
    name: string;
    type: 'string' | 'number' | 'boolean' | 'date' | 'datetime' | 'option';
    label?: string;
    required?: boolean;
    defaultValue?: any;
    validValues?: any[];
    multiSelect?: boolean;
}

export interface ReportFilter {
    field: string;
    operator: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'like' | 'in' | 'between' | 'isnull' | 'isnotnull';
    value?: any;
    secondValue?: any;
}

export interface ReportSort {
    field: string;
    direction: 'asc' | 'desc';
}

export interface AggregationDefinition {
    field: string;
    type: 'sum' | 'avg' | 'count' | 'min' | 'max';
    alias?: string;
}

export interface VisualizationDefinition {
    type: 'bar' | 'line' | 'pie' | 'table' | 'chart';
    dataset: string;
    title?: string;
    options?: Record<string, any>;
}

export interface ReportTrigger {
    name: 'onPreReport' | 'onPostReport' | 'onPreDataset' | 'onPostDataset';
    handler: (context: any) => Promise<void>;
}

export interface ReportPermission {
    role: string;
    permissions: ('view' | 'execute' | 'export' | 'schedule' | 'modify' | 'delete')[];
}

export interface ReportLayout {
    type: 'tabular' | 'matrix' | 'chart' | 'custom';
    template?: string;
    options?: Record<string, any>;
}

export interface ReportParameters {
    [key: string]: any;
    filters?: ReportFilter[];
}

export interface ReportExecution {
    id: string;
    reportId: string;
    status: 'running' | 'completed' | 'failed' | 'cancelled';
    parameters: ReportParameters;
    startTime: Date;
    endTime?: Date;
    progress?: number;
    result?: ReportResult;
    error?: string;
}

export interface ReportResult {
    id: string;
    reportId: string;
    reportName: string;
    generatedAt: Date;
    executionTime: number;
    parameters: ReportParameters;
    datasets: Record<string, any[]>;
    visualizations: Visualization[];
    rowCount: number;
    status: 'success' | 'partial' | 'failed';
    error?: string;
}

export interface Visualization {
    type: string;
    title?: string;
    data: any;
    options: Record<string, any>;
}

export interface ExecutionOptions {
    useCache?: boolean;
    cache?: boolean;
    cacheTTL?: number;
    timeout?: number;
    async?: boolean;
}

export interface ReportCache {
    result: ReportResult;
    expiresAt: number;
}

export interface ReportEngineStats {
    totalReports: number;
    totalExecutions: number;
    successfulExecutions: number;
    failedExecutions: number;
    runningExecutions: number;
    cachedResults: number;
    averageExecutionTime: number;
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

export interface ScheduledReport {
    id: string;
    reportId: string;
    schedule: ScheduleDefinition;
    parameters?: ReportParameters;
    nextRun?: Date;
    lastRun?: Date;
    lastResult?: string;
    enabled: boolean;
    createdBy: string;
    createdAt: Date;
}