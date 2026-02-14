import { EventEmitter } from 'events';
import { ReportDefinition, DatasetDefinition, ReportParameter, ReportFilter, ReportSort, VisualizationDefinition } from '../report-engine';
import { SQLServerConnection } from '@nova/core/database/sqlserver-connection';
import { v4 as uuidv4 } from 'uuid';

export interface DesignerState {
    report: ReportDefinition;
    selectedElement?: string;
    undoStack: DesignerAction[];
    redoStack: DesignerAction[];
    dirty: boolean;
    previewData?: any;
    validationErrors: ValidationError[];
}

export interface DesignerAction {
    type: 'add' | 'update' | 'delete' | 'move';
    target: string;
    before?: any;
    after?: any;
    timestamp: Date;
}

export interface ValidationError {
    element: string;
    message: string;
    severity: 'error' | 'warning';
}

export class ReportDesigner extends EventEmitter {
    private state: DesignerState;
    private connection: SQLServerConnection;
    private maxUndoStack: number = 50;

    constructor(connection: SQLServerConnection, initialReport?: ReportDefinition) {
        super();
        this.connection = connection;
        this.state = {
            report: initialReport || this.createEmptyReport(),
            undoStack: [],
            redoStack: [],
            dirty: false,
            validationErrors: []
        };
    }

    // ============ Report Management ============

    private createEmptyReport(): ReportDefinition {
        return {
            id: uuidv4(),
            name: 'New Report',
            description: '',
            version: '1.0.0',
            datasets: [],
            parameters: [],
            filters: [],
            sortBy: {},
            visualizations: [],
            createdAt: new Date(),
            updatedAt: new Date()
        };
    }

    async loadReport(reportId: string): Promise<void> {
        const result = await this.connection.query(`
            SELECT * FROM [ReportDefinitions]
            WHERE [ReportId] = @reportId AND [SystemDeletedAt] IS NULL
        `, [reportId]);

        if (result.recordset.length === 0) {
            throw new Error(`Report not found: ${reportId}`);
        }

        const row = result.recordset[0];
        this.state.report = {
            id: row.ReportId,
            name: row.Name,
            description: row.Description,
            version: row.Version,
            datasets: JSON.parse(row.Datasets || '[]'),
            parameters: JSON.parse(row.Parameters || '[]'),
            filters: JSON.parse(row.Filters || '[]'),
            sortBy: JSON.parse(row.SortBy || '{}'),
            visualizations: JSON.parse(row.Visualizations || '[]'),
            createdAt: row.CreatedAt,
            updatedAt: row.UpdatedAt,
            createdBy: row.CreatedBy
        };

        this.state.dirty = false;
        this.emit('loaded', this.state.report);
    }

    async saveReport(): Promise<void> {
        await this.validate();

        if (this.state.validationErrors.filter(e => e.severity === 'error').length > 0) {
            throw new Error('Cannot save report with validation errors');
        }

        const query = `
            MERGE INTO [ReportDefinitions] AS target
            USING (SELECT @ReportId AS ReportId) AS source
            ON target.[ReportId] = source.[ReportId]
            WHEN MATCHED THEN
                UPDATE SET 
                    [Name] = @Name,
                    [Description] = @Description,
                    [Version] = @Version,
                    [Datasets] = @Datasets,
                    [Parameters] = @Parameters,
                    [Filters] = @Filters,
                    [SortBy] = @SortBy,
                    [Visualizations] = @Visualizations,
                    [UpdatedAt] = GETUTCDATE()
            WHEN NOT MATCHED THEN
                INSERT ([ReportId], [Name], [Description], [Version],
                        [Datasets], [Parameters], [Filters], [SortBy],
                        [Visualizations], [CreatedAt], [UpdatedAt])
                VALUES (@ReportId, @Name, @Description, @Version,
                        @Datasets, @Parameters, @Filters, @SortBy,
                        @Visualizations, GETUTCDATE(), GETUTCDATE());
        `;

        await this.connection.query(query, [
            this.state.report.id,
            this.state.report.name,
            this.state.report.description || null,
            this.state.report.version,
            JSON.stringify(this.state.report.datasets),
            JSON.stringify(this.state.report.parameters || []),
            JSON.stringify(this.state.report.filters || []),
            JSON.stringify(this.state.report.sortBy || {}),
            JSON.stringify(this.state.report.visualizations || [])
        ]);

        this.state.dirty = false;
        this.emit('saved', this.state.report);
    }

    // ============ Dataset Management ============

    async addDataset(dataset: DatasetDefinition): Promise<void> {
        this.pushUndo({
            type: 'add',
            target: 'dataset',
            before: null,
            after: { ...dataset },
            timestamp: new Date()
        });

        this.state.report.datasets.push({
            ...dataset,
            name: dataset.name || `Dataset_${this.state.report.datasets.length + 1}`
        });

        this.state.dirty = true;
        this.emit('datasetAdded', dataset);
        await this.validate();
    }

    updateDataset(index: number, updates: Partial<DatasetDefinition>): void {
        const original = { ...this.state.report.datasets[index] };

        this.pushUndo({
            type: 'update',
            target: 'dataset',
            before: original,
            after: { ...original, ...updates },
            timestamp: new Date()
        });

        this.state.report.datasets[index] = {
            ...original,
            ...updates
        };

        this.state.dirty = true;
        this.emit('datasetUpdated', this.state.report.datasets[index]);
        this.validate();
    }

    removeDataset(index: number): void {
        const dataset = this.state.report.datasets[index];

        this.pushUndo({
            type: 'delete',
            target: 'dataset',
            before: { ...dataset },
            after: null,
            timestamp: new Date()
        });

        this.state.report.datasets.splice(index, 1);
        this.state.dirty = true;
        this.emit('datasetRemoved', dataset);
        this.validate();
    }

    // ============ Parameter Management ============

    addParameter(parameter: ReportParameter): void {
        this.pushUndo({
            type: 'add',
            target: 'parameter',
            before: null,
            after: { ...parameter },
            timestamp: new Date()
        });

        this.state.report.parameters = this.state.report.parameters || [];
        this.state.report.parameters.push(parameter);
        this.state.dirty = true;
        this.emit('parameterAdded', parameter);
        this.validate();
    }

    updateParameter(index: number, updates: Partial<ReportParameter>): void {
        const original = { ...this.state.report.parameters[index] };

        this.pushUndo({
            type: 'update',
            target: 'parameter',
            before: original,
            after: { ...original, ...updates },
            timestamp: new Date()
        });

        this.state.report.parameters[index] = {
            ...original,
            ...updates
        };

        this.state.dirty = true;
        this.emit('parameterUpdated', this.state.report.parameters[index]);
        this.validate();
    }

    removeParameter(index: number): void {
        const parameter = this.state.report.parameters[index];

        this.pushUndo({
            type: 'delete',
            target: 'parameter',
            before: { ...parameter },
            after: null,
            timestamp: new Date()
        });

        this.state.report.parameters.splice(index, 1);
        this.state.dirty = true;
        this.emit('parameterRemoved', parameter);
        this.validate();
    }

    // ============ Filter Management ============

    addFilter(filter: ReportFilter): void {
        this.pushUndo({
            type: 'add',
            target: 'filter',
            before: null,
            after: { ...filter },
            timestamp: new Date()
        });

        this.state.report.filters = this.state.report.filters || [];
        this.state.report.filters.push(filter);
        this.state.dirty = true;
        this.emit('filterAdded', filter);
        this.validate();
    }

    removeFilter(index: number): void {
        const filter = this.state.report.filters[index];

        this.pushUndo({
            type: 'delete',
            target: 'filter',
            before: { ...filter },
            after: null,
            timestamp: new Date()
        });

        this.state.report.filters.splice(index, 1);
        this.state.dirty = true;
        this.emit('filterRemoved', filter);
        this.validate();
    }

    // ============ Visualization Management ============

    addVisualization(visualization: VisualizationDefinition): void {
        this.pushUndo({
            type: 'add',
            target: 'visualization',
            before: null,
            after: { ...visualization },
            timestamp: new Date()
        });

        this.state.report.visualizations = this.state.report.visualizations || [];
        this.state.report.visualizations.push(visualization);
        this.state.dirty = true;
        this.emit('visualizationAdded', visualization);
        this.validate();
    }

    updateVisualization(index: number, updates: Partial<VisualizationDefinition>): void {
        const original = { ...this.state.report.visualizations[index] };

        this.pushUndo({
            type: 'update',
            target: 'visualization',
            before: original,
            after: { ...original, ...updates },
            timestamp: new Date()
        });

        this.state.report.visualizations[index] = {
            ...original,
            ...updates
        };

        this.state.dirty = true;
        this.emit('visualizationUpdated', this.state.report.visualizations[index]);
        this.validate();
    }

    removeVisualization(index: number): void {
        const visualization = this.state.report.visualizations[index];

        this.pushUndo({
            type: 'delete',
            target: 'visualization',
            before: { ...visualization },
            after: null,
            timestamp: new Date()
        });

        this.state.report.visualizations.splice(index, 1);
        this.state.dirty = true;
        this.emit('visualizationRemoved', visualization);
        this.validate();
    }

    // ============ Undo/Redo ============

    undo(): void {
        if (this.state.undoStack.length === 0) return;

        const action = this.state.undoStack.pop()!;
        this.state.redoStack.push(action);

        switch (action.type) {
            case 'add':
                this.undoAdd(action);
                break;
            case 'update':
                this.undoUpdate(action);
                break;
            case 'delete':
                this.undoDelete(action);
                break;
        }

        this.state.dirty = true;
        this.emit('undo', action);
        this.validate();
    }

    redo(): void {
        if (this.state.redoStack.length === 0) return;

        const action = this.state.redoStack.pop()!;
        this.pushUndo(action);

        switch (action.type) {
            case 'add':
                this.redoAdd(action);
                break;
            case 'update':
                this.redoUpdate(action);
                break;
            case 'delete':
                this.redoDelete(action);
                break;
        }

        this.state.dirty = true;
        this.emit('redo', action);
        this.validate();
    }

    private pushUndo(action: DesignerAction): void {
        this.state.undoStack.push(action);
        this.state.redoStack = [];

        if (this.state.undoStack.length > this.maxUndoStack) {
            this.state.undoStack.shift();
        }
    }

    private undoAdd(action: DesignerAction): void {
        switch (action.target) {
            case 'dataset':
                const dsIndex = this.state.report.datasets.findIndex(d => d.name === action.after.name);
                if (dsIndex !== -1) this.state.report.datasets.splice(dsIndex, 1);
                break;
            case 'parameter':
                const pIndex = this.state.report.parameters.findIndex(p => p.name === action.after.name);
                if (pIndex !== -1) this.state.report.parameters.splice(pIndex, 1);
                break;
            case 'visualization':
                const vIndex = this.state.report.visualizations.findIndex(v => v.title === action.after.title);
                if (vIndex !== -1) this.state.report.visualizations.splice(vIndex, 1);
                break;
        }
    }

    private undoUpdate(action: DesignerAction): void {
        switch (action.target) {
            case 'dataset':
                const dsIndex = this.state.report.datasets.findIndex(d => d.name === action.after.name);
                if (dsIndex !== -1) this.state.report.datasets[dsIndex] = action.before;
                break;
            case 'parameter':
                const pIndex = this.state.report.parameters.findIndex(p => p.name === action.after.name);
                if (pIndex !== -1) this.state.report.parameters[pIndex] = action.before;
                break;
            case 'visualization':
                const vIndex = this.state.report.visualizations.findIndex(v => v.title === action.after.title);
                if (vIndex !== -1) this.state.report.visualizations[vIndex] = action.before;
                break;
        }
    }

    private undoDelete(action: DesignerAction): void {
        switch (action.target) {
            case 'dataset':
                this.state.report.datasets.push(action.before);
                break;
            case 'parameter':
                this.state.report.parameters.push(action.before);
                break;
            case 'visualization':
                this.state.report.visualizations.push(action.before);
                break;
        }
    }

    private redoAdd(action: DesignerAction): void {
        switch (action.target) {
            case 'dataset':
                this.state.report.datasets.push(action.after);
                break;
            case 'parameter':
                this.state.report.parameters.push(action.after);
                break;
            case 'visualization':
                this.state.report.visualizations.push(action.after);
                break;
        }
    }

    private redoUpdate(action: DesignerAction): void {
        switch (action.target) {
            case 'dataset':
                const dsIndex = this.state.report.datasets.findIndex(d => d.name === action.before.name);
                if (dsIndex !== -1) this.state.report.datasets[dsIndex] = action.after;
                break;
            case 'parameter':
                const pIndex = this.state.report.parameters.findIndex(p => p.name === action.before.name);
                if (pIndex !== -1) this.state.report.parameters[pIndex] = action.after;
                break;
            case 'visualization':
                const vIndex = this.state.report.visualizations.findIndex(v => v.title === action.before.title);
                if (vIndex !== -1) this.state.report.visualizations[vIndex] = action.after;
                break;
        }
    }

    private redoDelete(action: DesignerAction): void {
        switch (action.target) {
            case 'dataset':
                const dsIndex = this.state.report.datasets.findIndex(d => d.name === action.before.name);
                if (dsIndex !== -1) this.state.report.datasets.splice(dsIndex, 1);
                break;
            case 'parameter':
                const pIndex = this.state.report.parameters.findIndex(p => p.name === action.before.name);
                if (pIndex !== -1) this.state.report.parameters.splice(pIndex, 1);
                break;
            case 'visualization':
                const vIndex = this.state.report.visualizations.findIndex(v => v.title === action.before.title);
                if (vIndex !== -1) this.state.report.visualizations.splice(vIndex, 1);
                break;
        }
    }

    // ============ Validation ============

    async validate(): Promise<ValidationError[]> {
        this.state.validationErrors = [];

        // Validate report name
        if (!this.state.report.name) {
            this.state.validationErrors.push({
                element: 'report',
                message: 'Report name is required',
                severity: 'error'
            });
        }

        // Validate datasets
        if (this.state.report.datasets.length === 0) {
            this.state.validationErrors.push({
                element: 'datasets',
                message: 'Report must have at least one dataset',
                severity: 'error'
            });
        }

        // Validate each dataset
        this.state.report.datasets.forEach((dataset, index) => {
            if (!dataset.name) {
                this.state.validationErrors.push({
                    element: `dataset[${index}]`,
                    message: 'Dataset name is required',
                    severity: 'error'
                });
            }

            if (!dataset.tableName) {
                this.state.validationErrors.push({
                    element: `dataset[${index}]`,
                    message: 'Dataset table name is required',
                    severity: 'error'
                });
            }

            if (!dataset.columns || dataset.columns.length === 0) {
                this.state.validationErrors.push({
                    element: `dataset[${index}]`,
                    message: 'Dataset must have at least one column',
                    severity: 'error'
                });
            }
        });

        // Validate parameters
        this.state.report.parameters?.forEach((param, index) => {
            if (!param.name) {
                this.state.validationErrors.push({
                    element: `parameter[${index}]`,
                    message: 'Parameter name is required',
                    severity: 'error'
                });
            }

            if (!param.type) {
                this.state.validationErrors.push({
                    element: `parameter[${index}]`,
                    message: 'Parameter type is required',
                    severity: 'error'
                });
            }
        });

        // Validate visualizations
        this.state.report.visualizations?.forEach((viz, index) => {
            if (!viz.type) {
                this.state.validationErrors.push({
                    element: `visualization[${index}]`,
                    message: 'Visualization type is required',
                    severity: 'error'
                });
            }

            if (!viz.dataset) {
                this.state.validationErrors.push({
                    element: `visualization[${index}]`,
                    message: 'Visualization must reference a dataset',
                    severity: 'error'
                });
            }

            // Check if referenced dataset exists
            const datasetExists = this.state.report.datasets.some(d => d.name === viz.dataset);
            if (!datasetExists) {
                this.state.validationErrors.push({
                    element: `visualization[${index}]`,
                    message: `Referenced dataset '${viz.dataset}' does not exist`,
                    severity: 'error'
                });
            }
        });

        this.emit('validated', this.state.validationErrors);
        return this.state.validationErrors;
    }

    // ============ Preview ============

    async generatePreview(parameters?: Record<string, any>): Promise<any> {
        // This would integrate with ReportEngine to generate preview
        // For now, return mock data
        const previewData: Record<string, any[]> = {};

        for (const dataset of this.state.report.datasets) {
            previewData[dataset.name] = [
                { id: 1, name: 'Sample Row 1', value: 100 },
                { id: 2, name: 'Sample Row 2', value: 200 },
                { id: 3, name: 'Sample Row 3', value: 300 }
            ];
        }

        this.state.previewData = previewData;
        this.emit('previewGenerated', previewData);
        
        return previewData;
    }

    // ============ Getters/Setters ============

    getState(): DesignerState {
        return { ...this.state };
    }

    getReport(): ReportDefinition {
        return { ...this.state.report };
    }

    setReportName(name: string): void {
        this.state.report.name = name;
        this.state.dirty = true;
        this.emit('nameChanged', name);
        this.validate();
    }

    setReportDescription(description: string): void {
        this.state.report.description = description;
        this.state.dirty = true;
        this.emit('descriptionChanged', description);
    }

    isDirty(): boolean {
        return this.state.dirty;
    }

    canUndo(): boolean {
        return this.state.undoStack.length > 0;
    }

    canRedo(): boolean {
        return this.state.redoStack.length > 0;
    }
}