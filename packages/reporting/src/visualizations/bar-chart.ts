import { ChartConfiguration } from 'chart.js';
import { ChartConfig, ChartSeries, AxisConfig } from './chart-generator';

export class BarChart {
    generate(config: ChartConfig, data: any[]): ChartConfiguration {
        const categories = this.extractCategories(data, config);
        const datasets = this.createDatasets(config, data);

        return {
            type: 'bar',
            data: {
                labels: categories,
                datasets: datasets.map((dataset, index) => ({
                    label: dataset.name,
                    data: dataset.values,
                    backgroundColor: dataset.color || config.colors?.[index] || this.getDefaultColor(index),
                    borderColor: config.borderColor || 'rgba(0,0,0,0.1)',
                    borderWidth: 1,
                    yAxisID: dataset.yAxis === 1 ? 'y1' : 'y'
                }))
            },
            options: {
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
                        mode: 'index',
                        intersect: false
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
                        },
                        beginAtZero: true
                    }
                }
            }
        };
    }

    generateStacked(config: ChartConfig, data: any[]): ChartConfiguration {
        const chart = this.generate(config, data);
        
        if (chart.options && chart.options.scales) {
            chart.options.scales = {
                ...chart.options.scales,
                x: {
                    ...chart.options.scales.x,
                    stacked: true
                },
                y: {
                    ...chart.options.scales.y,
                    stacked: true
                }
            };
        }

        return chart;
    }

    generateGrouped(config: ChartConfig, data: any[]): ChartConfiguration {
        // Grouped is the default bar chart
        return this.generate(config, data);
    }

    generateHorizontal(config: ChartConfig, data: any[]): ChartConfiguration {
        const chart = this.generate(config, data);
        chart.type = 'bar' as any;
        
        if (chart.options) {
            chart.options.indexAxis = 'y';
        }

        return chart;
    }

    private extractCategories(data: any[], config: ChartConfig): string[] {
        if (data.length === 0) return [];

        // Use the first series data field as categories if it's a string field
        const firstSeries = config.series[0];
        if (typeof firstSeries.data === 'string') {
            return data.map(row => String(row[firstSeries.data]));
        }

        // Use index as categories
        return data.map((_, index) => `Item ${index + 1}`);
    }

    private createDatasets(config: ChartConfig, data: any[]): BarDataset[] {
        return config.series.map(series => ({
            name: series.name,
            values: this.extractValues(data, series),
            color: series.color,
            yAxis: series.yAxis || 0
        }));
    }

    private extractValues(data: any[], series: ChartSeries): number[] {
        if (typeof series.data === 'string') {
            return data.map(row => {
                const value = row[series.data];
                return typeof value === 'number' ? value : 0;
            });
        }
        return series.data;
    }

    private getDefaultColor(index: number): string {
        const colors = [
            'rgba(54, 162, 235, 0.8)',
            'rgba(255, 99, 132, 0.8)',
            'rgba(255, 206, 86, 0.8)',
            'rgba(75, 192, 192, 0.8)',
            'rgba(153, 102, 255, 0.8)',
            'rgba(255, 159, 64, 0.8)',
            'rgba(199, 199, 199, 0.8)',
            'rgba(83, 102, 255, 0.8)',
            'rgba(255, 99, 255, 0.8)',
            'rgba(99, 255, 132, 0.8)'
        ];
        return colors[index % colors.length];
    }
}

interface BarDataset {
    name: string;
    values: number[];
    color?: string;
    yAxis?: number;
}