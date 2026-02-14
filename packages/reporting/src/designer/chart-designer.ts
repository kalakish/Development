import { EventEmitter } from 'events';
import { VisualizationDefinition } from '../report-engine';

export interface ChartConfig {
    type: 'bar' | 'line' | 'pie' | 'doughnut' | 'radar' | 'polar' | 'scatter' | 'bubble';
    title?: string;
    subtitle?: string;
    xAxis?: AxisConfig;
    yAxis?: AxisConfig;
    yAxis2?: AxisConfig;
    legend?: LegendConfig;
    tooltip?: TooltipConfig;
    colors?: string[];
    animations?: AnimationConfig;
    grid?: GridConfig;
    series: SeriesConfig[];
}

export interface AxisConfig {
    title?: string;
    min?: number;
    max?: number;
    step?: number;
    format?: string;
    rotate?: number;
    visible?: boolean;
    grid?: boolean;
}

export interface LegendConfig {
    visible?: boolean;
    position?: 'top' | 'bottom' | 'left' | 'right';
    align?: 'start' | 'center' | 'end';
    fontSize?: number;
    color?: string;
}

export interface TooltipConfig {
    enabled?: boolean;
    trigger?: 'hover' | 'click';
    format?: string;
    backgroundColor?: string;
    textColor?: string;
}

export interface AnimationConfig {
    enabled?: boolean;
    duration?: number;
    easing?: 'linear' | 'easeInQuad' | 'easeOutQuad' | 'easeInOutQuad';
}

export interface GridConfig {
    show?: boolean;
    horizontal?: boolean;
    vertical?: boolean;
    color?: string;
    width?: number;
}

export interface SeriesConfig {
    name: string;
    data: string;
    type?: 'bar' | 'line' | 'spline' | 'area' | 'scatter';
    color?: string;
    stack?: string;
    axis?: 'y' | 'y2';
    visible?: boolean;
    format?: string;
    marker?: MarkerConfig;
    label?: LabelConfig;
}

export interface MarkerConfig {
    enabled?: boolean;
    size?: number;
    color?: string;
    borderColor?: string;
    borderWidth?: number;
}

export interface LabelConfig {
    enabled?: boolean;
    position?: 'top' | 'bottom' | 'center' | 'inside';
    format?: string;
    fontSize?: number;
    color?: string;
    backgroundColor?: string;
}

export class ChartDesigner extends EventEmitter {
    private chartConfig: ChartConfig;
    private previewData: any[];
    private selectedSeries?: number;
    private undoStack: any[] = [];
    private redoStack: any[] = [];

    constructor(initialConfig?: Partial<ChartConfig>) {
        super();
        this.chartConfig = this.getDefaultConfig(initialConfig);
        this.previewData = this.generatePreviewData();
    }

    private getDefaultConfig(initial?: Partial<ChartConfig>): ChartConfig {
        return {
            type: initial?.type || 'bar',
            title: initial?.title || 'New Chart',
            series: initial?.series || [],
            colors: initial?.colors || [
                '#5470c6', '#91cc75', '#fac858', '#ee6666', '#73c0de', '#3ba272', '#fc8452', '#9a60b4'
            ],
            legend: {
                visible: true,
                position: 'bottom',
                align: 'center',
                fontSize: 12,
                ...initial?.legend
            },
            tooltip: {
                enabled: true,
                trigger: 'hover',
                backgroundColor: 'rgba(0,0,0,0.8)',
                textColor: '#fff',
                ...initial?.tooltip
            },
            animations: {
                enabled: true,
                duration: 1000,
                easing: 'easeOutQuad',
                ...initial?.animations
            },
            grid: {
                show: true,
                horizontal: true,
                vertical: false,
                color: '#e0e0e0',
                width: 1,
                ...initial?.grid
            },
            xAxis: {
                visible: true,
                grid: true,
                ...initial?.xAxis
            },
            yAxis: {
                visible: true,
                grid: true,
                ...initial?.yAxis
            }
        };
    }

    private generatePreviewData(): any[] {
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        return months.slice(0, 6).map(month => ({
            category: month,
            value: Math.floor(Math.random() * 1000),
            value2: Math.floor(Math.random() * 800),
            value3: Math.floor(Math.random() * 600)
        }));
    }

    // ============ Chart Configuration ============

    setChartType(type: ChartConfig['type']): void {
        this.undoStack.push({ ...this.chartConfig });
        this.chartConfig.type = type;
        this.emit('chartTypeChanged', type);
    }

    setTitle(title: string): void {
        this.undoStack.push({ ...this.chartConfig });
        this.chartConfig.title = title;
        this.emit('titleChanged', title);
    }

    setXAxis(config: Partial<AxisConfig>): void {
        this.undoStack.push({ ...this.chartConfig });
        this.chartConfig.xAxis = {
            ...this.chartConfig.xAxis,
            ...config
        };
        this.emit('xAxisChanged', this.chartConfig.xAxis);
    }

    setYAxis(config: Partial<AxisConfig>): void {
        this.undoStack.push({ ...this.chartConfig });
        this.chartConfig.yAxis = {
            ...this.chartConfig.yAxis,
            ...config
        };
        this.emit('yAxisChanged', this.chartConfig.yAxis);
    }

    setLegend(config: Partial<LegendConfig>): void {
        this.undoStack.push({ ...this.chartConfig });
        this.chartConfig.legend = {
            ...this.chartConfig.legend,
            ...config
        };
        this.emit('legendChanged', this.chartConfig.legend);
    }

    setColors(colors: string[]): void {
        this.undoStack.push({ ...this.chartConfig });
        this.chartConfig.colors = colors;
        this.emit('colorsChanged', colors);
    }

    // ============ Series Management ============

    addSeries(series: SeriesConfig): void {
        this.undoStack.push({ ...this.chartConfig });
        this.chartConfig.series.push({
            ...series,
            name: series.name || `Series ${this.chartConfig.series.length + 1}`,
            data: series.data || 'value'
        });
        this.emit('seriesAdded', this.chartConfig.series[this.chartConfig.series.length - 1]);
    }

    updateSeries(index: number, updates: Partial<SeriesConfig>): void {
        this.undoStack.push({ ...this.chartConfig });
        this.chartConfig.series[index] = {
            ...this.chartConfig.series[index],
            ...updates
        };
        this.emit('seriesUpdated', this.chartConfig.series[index]);
    }

    removeSeries(index: number): void {
        this.undoStack.push({ ...this.chartConfig });
        const removed = this.chartConfig.series.splice(index, 1);
        this.emit('seriesRemoved', removed[0]);
    }

    selectSeries(index: number): void {
        this.selectedSeries = index;
        this.emit('seriesSelected', this.chartConfig.series[index]);
    }

    // ============ Data Configuration ============

    setCategoryField(field: string): void {
        this.undoStack.push({ ...this.chartConfig });
        this.emit('categoryFieldChanged', field);
    }

    setValueField(field: string, seriesIndex?: number): void {
        this.undoStack.push({ ...this.chartConfig });
        
        if (seriesIndex !== undefined) {
            this.chartConfig.series[seriesIndex].data = field;
        } else {
            // Update all series or default
        }
        
        this.emit('valueFieldChanged', { field, seriesIndex });
    }

    // ============ Preview ============

    setPreviewData(data: any[]): void {
        this.previewData = data;
        this.emit('previewDataChanged', data);
    }

    getPreviewData(): any[] {
        return this.previewData;
    }

    // ============ Undo/Redo ============

    undo(): void {
        if (this.undoStack.length === 0) return;
        
        const previous = this.undoStack.pop();
        this.redoStack.push({ ...this.chartConfig });
        this.chartConfig = previous;
        this.emit('undo', this.chartConfig);
    }

    redo(): void {
        if (this.redoStack.length === 0) return;
        
        const next = this.redoStack.pop();
        this.undoStack.push({ ...this.chartConfig });
        this.chartConfig = next;
        this.emit('redo', this.chartConfig);
    }

    // ============ Export/Import ============

    exportConfig(): ChartConfig {
        return { ...this.chartConfig };
    }

    importConfig(config: ChartConfig): void {
        this.undoStack.push({ ...this.chartConfig });
        this.chartConfig = config;
        this.emit('configImported', config);
    }

    toJSON(): string {
        return JSON.stringify(this.chartConfig, null, 2);
    }

    fromJSON(json: string): void {
        try {
            const config = JSON.parse(json);
            this.importConfig(config);
        } catch (error) {
            throw new Error(`Invalid chart configuration: ${error.message}`);
        }
    }

    // ============ Getters ============

    getConfig(): ChartConfig {
        return { ...this.chartConfig };
    }

    getSeries(): SeriesConfig[] {
        return [...this.chartConfig.series];
    }

    getSelectedSeries(): SeriesConfig | undefined {
        return this.selectedSeries !== undefined 
            ? this.chartConfig.series[this.selectedSeries]
            : undefined;
    }

    canUndo(): boolean {
        return this.undoStack.length > 0;
    }

    canRedo(): boolean {
        return this.redoStack.length > 0;
    }

    // ============ Validation ============

    validate(): ValidationResult {
        const errors: string[] = [];
        const warnings: string[] = [];

        if (!this.chartConfig.title) {
            warnings.push('Chart title is recommended');
        }

        if (this.chartConfig.series.length === 0) {
            errors.push('Chart must have at least one series');
        }

        if (this.chartConfig.type === 'pie' && this.chartConfig.series.length > 1) {
            warnings.push('Pie chart works best with a single series');
        }

        this.chartConfig.series.forEach((series, index) => {
            if (!series.name) {
                errors.push(`Series ${index + 1} requires a name`);
            }
            if (!series.data) {
                errors.push(`Series ${index + 1} requires a data field`);
            }
        });

        return {
            valid: errors.length === 0,
            errors,
            warnings
        };
    }
}

export interface ValidationResult {
    valid: boolean;
    errors: string[];
    warnings: string[];
}