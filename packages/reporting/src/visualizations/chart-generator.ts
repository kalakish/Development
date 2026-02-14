import { ChartConfiguration } from 'chart.js';
import { createCanvas } from 'canvas';
import { ChartJSNodeCanvas } from 'chartjs-node-canvas';
import { BarChart } from './bar-chart';
import { LineChart } from './line-chart';
import { PieChart } from './pie-chart';
import { TableChart } from './table-chart';

export interface ChartConfig {
    type: 'bar' | 'line' | 'pie' | 'doughnut' | 'radar' | 'polar' | 'scatter' | 'bubble';
    title?: string;
    subtitle?: string;
    width?: number;
    height?: number;
    series: ChartSeries[];
    xAxis?: AxisConfig;
    yAxis?: AxisConfig;
    yAxis2?: AxisConfig;
    legend?: LegendConfig;
    tooltip?: TooltipConfig;
    colors?: string[];
    backgroundColor?: string;
    borderColor?: string;
}

export interface ChartSeries {
    name: string;
    data: string | number[];
    type?: 'bar' | 'line' | 'spline' | 'area';
    color?: string;
    yAxis?: 0 | 1;
    visible?: boolean;
}

export interface AxisConfig {
    title?: string;
    min?: number;
    max?: number;
    step?: number;
    format?: string;
    grid?: boolean;
    visible?: boolean;
}

export interface LegendConfig {
    visible?: boolean;
    position?: 'top' | 'bottom' | 'left' | 'right';
    align?: 'start' | 'center' | 'end';
}

export interface TooltipConfig {
    enabled?: boolean;
    shared?: boolean;
    format?: string;
}

export class ChartGenerator {
    private barChart: BarChart;
    private lineChart: LineChart;
    private pieChart: PieChart;
    private tableChart: TableChart;
    private chartJSNodeCanvas: ChartJSNodeCanvas;

    constructor() {
        this.barChart = new BarChart();
        this.lineChart = new LineChart();
        this.pieChart = new PieChart();
        this.tableChart = new TableChart();

        this.chartJSNodeCanvas = new ChartJSNodeCanvas({
            width: 800,
            height: 600,
            backgroundColour: 'white'
        });
    }

    // ============ Chart Generation ============

    async generateChart(config: ChartConfig, data: any[]): Promise<ChartConfiguration> {
        switch (config.type) {
            case 'bar':
                return this.barChart.generate(config, data);
            case 'line':
                return this.lineChart.generate(config, data);
            case 'pie':
                return this.pieChart.generate(config, data);
            default:
                return this.barChart.generate(config, data);
        }
    }

    async generateChartBuffer(config: ChartConfig, data: any[]): Promise<Buffer> {
        const chartConfig = await this.generateChart(config, data);
        return this.chartJSNodeCanvas.renderToBuffer(chartConfig as any);
    }

    async generateChartDataURL(config: ChartConfig, data: any[]): Promise<string> {
        const buffer = await this.generateChartBuffer(config, data);
        return `data:image/png;base64,${buffer.toString('base64')}`;
    }

    // ============ Specific Chart Types ============

    createBarChart(data: any[], options?: Partial<ChartConfig>): ChartConfiguration {
        const config: ChartConfig = {
            type: 'bar',
            title: options?.title || 'Bar Chart',
            series: options?.series || [{
                name: 'Series 1',
                data: 'value'
            }],
            xAxis: options?.xAxis || { title: 'Category', visible: true },
            yAxis: options?.yAxis || { title: 'Value', visible: true },
            ...options
        };

        return this.barChart.generate(config, data);
    }

    createLineChart(data: any[], options?: Partial<ChartConfig>): ChartConfiguration {
        const config: ChartConfig = {
            type: 'line',
            title: options?.title || 'Line Chart',
            series: options?.series || [{
                name: 'Series 1',
                data: 'value'
            }],
            xAxis: options?.xAxis || { title: 'Category', visible: true },
            yAxis: options?.yAxis || { title: 'Value', visible: true },
            ...options
        };

        return this.lineChart.generate(config, data);
    }

    createPieChart(data: any[], options?: Partial<ChartConfig>): ChartConfiguration {
        const config: ChartConfig = {
            type: 'pie',
            title: options?.title || 'Pie Chart',
            series: options?.series || [{
                name: 'Series 1',
                data: 'value'
            }],
            ...options
        };

        return this.pieChart.generate(config, data);
    }

    createTable(data: any[], options?: Partial<ChartConfig>): any[] {
        return this.tableChart.generate(data, options);
    }

    // ============ Chart Data Processing ============

    private extractNumericFields(data: any[]): string[] {
        if (data.length === 0) return [];
        
        return Object.keys(data[0]).filter(key => 
            typeof data[0][key] === 'number'
        );
    }

    private extractCategories(data: any[], field: string): string[] {
        return data.map(row => String(row[field]));
    }

    private extractSeriesData(data: any[], field: string): number[] {
        return data.map(row => {
            const value = row[field];
            return typeof value === 'number' ? value : 0;
        });
    }

    // ============ Chart Styling ============

    getDefaultColors(): string[] {
        return [
            '#5470c6', '#91cc75', '#fac858', '#ee6666', '#73c0de',
            '#3ba272', '#fc8452', '#9a60b4', '#ea7ccc', '#ff99c3'
        ];
    }

    getColorPalette(name: 'modern' | 'pastel' | 'vibrant'): string[] {
        const palettes = {
            modern: ['#3366CC', '#DC3912', '#FF9900', '#109618', '#990099', '#0099C6', '#DD4477', '#66AA00', '#B82E2E', '#316395'],
            pastel: ['#B3E4FF', '#F9D7E0', '#FFF2B5', '#D4E6C3', '#E5D4ED', '#FFD9B3', '#C9E4DE', '#FBC8D5', '#E6D7BD', '#D6EAF8'],
            vibrant: ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9']
        };
        return palettes[name] || palettes.modern;
    }

    // ============ Chart Options ============

    getChartOptions(config: ChartConfig): any {
        return {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                title: {
                    display: !!config.title,
                    text: config.title || ''
                },
                subtitle: {
                    display: !!config.subtitle,
                    text: config.subtitle || ''
                },
                legend: {
                    display: config.legend?.visible !== false,
                    position: config.legend?.position || 'top',
                    align: config.legend?.align || 'center'
                },
                tooltip: {
                    enabled: config.tooltip?.enabled !== false,
                    mode: config.tooltip?.shared ? 'index' : 'nearest'
                }
            },
            scales: {
                x: {
                    display: config.xAxis?.visible !== false,
                    title: {
                        display: !!config.xAxis?.title,
                        text: config.xAxis?.title || ''
                    },
                    grid: {
                        display: config.xAxis?.grid !== false
                    }
                },
                y: {
                    display: config.yAxis?.visible !== false,
                    title: {
                        display: !!config.yAxis?.title,
                        text: config.yAxis?.title || ''
                    },
                    min: config.yAxis?.min,
                    max: config.yAxis?.max,
                    grid: {
                        display: config.yAxis?.grid !== false
                    }
                }
            }
        };
    }
}