import { ChartConfiguration } from 'chart.js';
import { ChartConfig, ChartSeries } from './chart-generator';

export class PieChart {
    generate(config: ChartConfig, data: any[]): ChartConfiguration {
        const { labels, values } = this.extractData(config, data);

        return {
            type: 'pie',
            data: {
                labels,
                datasets: [{
                    data: values,
                    backgroundColor: this.getColors(values.length, config.colors),
                    borderColor: 'white',
                    borderWidth: 2,
                    hoverOffset: 4
                }]
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
                        position: config.legend?.position || 'bottom',
                        align: config.legend?.align || 'center',
                        labels: {
                            usePointStyle: true,
                            pointStyle: 'circle'
                        }
                    },
                    tooltip: {
                        enabled: config.tooltip?.enabled !== false,
                        callbacks: {
                            label: (context) => {
                                const label = context.label || '';
                                const value = context.raw as number;
                                const total = (context.dataset.data as number[]).reduce((a, b) => a + b, 0);
                                const percentage = ((value / total) * 100).toFixed(1);
                                return `${label}: ${value} (${percentage}%)`;
                            }
                        }
                    }
                }
            }
        };
    }

    generateDoughnut(config: ChartConfig, data: any[]): ChartConfiguration {
        const chart = this.generate(config, data);
        chart.type = 'doughnut';
        
        if (chart.options) {
            chart.options.cutout = '50%';
        }

        return chart;
    }

    generatePolarArea(config: ChartConfig, data: any[]): ChartConfiguration {
        const chart = this.generate(config, data);
        chart.type = 'polarArea';

        return chart;
    }

    generateNestedPie(config: ChartConfig, data: any[]): ChartConfiguration[] {
        // Create multiple nested pie charts
        const charts: ChartConfiguration[] = [];
        
        config.series.forEach((series, index) => {
            const seriesConfig = {
                ...config,
                title: `${config.title} - ${series.name}`,
                series: [series]
            };
            charts.push(this.generate(seriesConfig, data));
        });

        return charts;
    }

    private extractData(config: ChartConfig, data: any[]): { labels: string[]; values: number[] } {
        if (data.length === 0) {
            return { labels: [], values: [] };
        }

        const series = config.series[0];
        
        if (typeof series.data === 'string') {
            // Use specified fields for labels and values
            const labelField = config.xAxis?.title || Object.keys(data[0])[0];
            const valueField = series.data;

            return {
                labels: data.map(row => String(row[labelField])),
                values: data.map(row => {
                    const value = row[valueField];
                    return typeof value === 'number' ? value : 0;
                })
            };
        }

        // Use provided data directly
        return {
            labels: series.data.map((_, i) => `Item ${i + 1}`),
            values: series.data
        };
    }

    private getColors(count: number, customColors?: string[]): string[] {
        const defaultColors = [
            '#5470c6', '#91cc75', '#fac858', '#ee6666', '#73c0de',
            '#3ba272', '#fc8452', '#9a60b4', '#ea7ccc', '#ff99c3'
        ];

        const colors = customColors || defaultColors;
        
        // Repeat colors if needed
        return Array.from({ length: count }, (_, i) => colors[i % colors.length]);
    }

    calculatePercentages(values: number[]): number[] {
        const total = values.reduce((sum, value) => sum + value, 0);
        return values.map(value => (value / total) * 100);
    }

    formatPercentage(value: number, decimals: number = 1): string {
        return `${value.toFixed(decimals)}%`;
    }
}