import { ChartConfiguration } from 'chart.js';
import { ChartConfig, ChartSeries, AxisConfig } from './chart-generator';

export class LineChart {
    generate(config: ChartConfig, data: any[]): ChartConfiguration {
        const categories = this.extractCategories(data, config);
        const datasets = this.createDatasets(config, data);

        return {
            type: 'line',
            data: {
                labels: categories,
                datasets: datasets.map((dataset, index) => ({
                    label: dataset.name,
                    data: dataset.values,
                    borderColor: dataset.color || config.colors?.[index] || this.getDefaultColor(index),
                    backgroundColor: this.hexToRgba(dataset.color || config.colors?.[index] || this.getDefaultColor(index), 0.1),
                    borderWidth: 2,
                    pointRadius: 3,
                    pointHoverRadius: 5,
                    tension: 0.1,
                    fill: dataset.fill || false,
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

    generateSpline(config: ChartConfig, data: any[]): ChartConfiguration {
        const chart = this.generate(config, data);
        
        chart.data.datasets.forEach(dataset => {
            dataset.tension = 0.4;
        });

        return chart;
    }

    generateArea(config: ChartConfig, data: any[]): ChartConfiguration {
        const chart = this.generate(config, data);
        
        chart.data.datasets.forEach(dataset => {
            dataset.fill = true;
            dataset.backgroundColor = this.hexToRgba(dataset.borderColor as string, 0.3);
        });

        return chart;
    }

    generateStepped(config: ChartConfig, data: any[]): ChartConfiguration {
        const chart = this.generate(config, data);
        
        chart.data.datasets.forEach(dataset => {
            dataset.stepped = true;
        });

        return chart;
    }

    generateMultiAxis(config: ChartConfig, data: any[]): ChartConfiguration {
        const chart = this.generate(config, data);
        
        if (chart.options && chart.options.scales) {
            chart.options.scales = {
                ...chart.options.scales,
                y1: {
                    type: 'linear',
                    display: true,
                    position: 'right',
                    title: {
                        display: !!config.yAxis2?.title,
                        text: config.yAxis2?.title || ''
                    },
                    min: config.yAxis2?.min,
                    max: config.yAxis2?.max,
                    grid: {
                        drawOnChartArea: false
                    }
                }
            };
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

    private createDatasets(config: ChartConfig, data: any[]): LineDataset[] {
        return config.series.map(series => ({
            name: series.name,
            values: this.extractValues(data, series),
            color: series.color,
            yAxis: series.yAxis || 0,
            fill: series.type === 'area'
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
            'rgb(54, 162, 235)',
            'rgb(255, 99, 132)',
            'rgb(255, 206, 86)',
            'rgb(75, 192, 192)',
            'rgb(153, 102, 255)',
            'rgb(255, 159, 64)',
            'rgb(199, 199, 199)',
            'rgb(83, 102, 255)',
            'rgb(255, 99, 255)',
            'rgb(99, 255, 132)'
        ];
        return colors[index % colors.length];
    }

    private hexToRgba(hex: string, alpha: number): string {
        // Convert hex color to rgba
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }
}

interface LineDataset {
    name: string;
    values: number[];
    color?: string;
    yAxis?: number;
    fill?: boolean;
}