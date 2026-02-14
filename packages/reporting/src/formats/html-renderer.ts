import { ExportOptions } from '../export';
import { ChartGenerator } from '../visualizations/chart-generator';

export interface HTMLOptions {
    template?: string;
    responsive?: boolean;
    theme?: 'light' | 'dark' | 'custom';
    customCSS?: string;
    includeCharts?: boolean;
    interactive?: boolean;
}

export class HTMLRenderer {
    private options: HTMLOptions;
    private chartGenerator: ChartGenerator;

    constructor(options?: HTMLOptions) {
        this.options = {
            template: options?.template || 'default',
            responsive: options?.responsive !== false,
            theme: options?.theme || 'light',
            includeCharts: options?.includeCharts !== false,
            interactive: options?.interactive !== false
        };

        this.chartGenerator = new ChartGenerator();
    }

    async render(datasets: Record<string, any[]>, options?: ExportOptions): Promise<string> {
        const template = await this.loadTemplate();
        const css = this.getCSS();
        const scripts = this.getScripts();
        const charts = this.options.includeCharts ? await this.renderCharts(datasets) : '';

        const html = template
            .replace('{{TITLE}}', options?.title || 'Report')
            .replace('{{CSS}}', css)
            .replace('{{SCRIPTS}}', scripts)
            .replace('{{METADATA}}', this.renderMetadata(options))
            .replace('{{SUMMARY}}', this.renderSummary(datasets))
            .replace('{{DATASETS}}', this.renderDatasets(datasets))
            .replace('{{CHARTS}}', charts)
            .replace('{{FOOTER}}', this.renderFooter(options));

        return html;
    }

    private async loadTemplate(): Promise<string> {
        switch (this.options.template) {
            case 'minimal':
                return this.getMinimalTemplate();
            case 'dashboard':
                return this.getDashboardTemplate();
            case 'default':
            default:
                return this.getDefaultTemplate();
        }
    }

    private getDefaultTemplate(): string {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{{TITLE}}</title>
    {{CSS}}
    {{SCRIPTS}}
</head>
<body>
    <div class="report-container">
        <header>
            <h1>{{TITLE}}</h1>
            <div class="metadata">{{METADATA}}</div>
        </header>
        
        <div class="summary-section">{{SUMMARY}}</div>
        
        <div class="charts-section">{{CHARTS}}</div>
        
        <div class="datasets-section">{{DATASETS}}</div>
        
        <footer>{{FOOTER}}</footer>
    </div>
</body>
</html>`;
    }

    private getMinimalTemplate(): string {
        return `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>{{TITLE}}</title>
    {{CSS}}
</head>
<body style="font-family: Arial, sans-serif; margin: 40px;">
    <h1>{{TITLE}}</h1>
    <div>{{METADATA}}</div>
    <div>{{DATASETS}}</div>
</body>
</html>`;
    }

    private getDashboardTemplate(): string {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{{TITLE}}</title>
    {{CSS}}
    {{SCRIPTS}}
</head>
<body>
    <div class="dashboard">
        <nav class="dashboard-nav">
            <h1>{{TITLE}}</h1>
            <div class="timestamp">{{METADATA}}</div>
        </nav>
        
        <div class="dashboard-grid">
            <div class="summary-widgets">{{SUMMARY}}</div>
            <div class="chart-grid">{{CHARTS}}</div>
            <div class="data-tables">{{DATASETS}}</div>
        </div>
    </div>
</body>
</html>`;
    }

    private getCSS(): string {
        const themeCSS = this.getThemeCSS();
        const responsiveCSS = this.getResponsiveCSS();
        const customCSS = this.options.customCSS || '';

        return `<style>
            ${themeCSS}
            ${responsiveCSS}
            ${customCSS}
        </style>`;
    }

    private getThemeCSS(): string {
        if (this.options.theme === 'dark') {
            return `
                body { background-color: #1a1a1a; color: #e0e0e0; }
                .report-container { background-color: #2d2d2d; }
                table { background-color: #333; color: #fff; }
                th { background-color: #444; }
                td { border-color: #555; }
            `;
        }

        return `
            body { 
                font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                margin: 0;
                padding: 20px;
                background-color: #f5f5f5;
                color: #333;
            }
            .report-container {
                max-width: 1200px;
                margin: 0 auto;
                background-color: white;
                box-shadow: 0 2px 4px rgba(0,0,0,0.1);
                padding: 30px;
                border-radius: 5px;
            }
            h1, h2, h3 { color: #4472C4; }
            table {
                border-collapse: collapse;
                width: 100%;
                margin: 20px 0;
                box-shadow: 0 1px 3px rgba(0,0,0,0.1);
            }
            th {
                background-color: #4472C4;
                color: white;
                padding: 12px;
                text-align: left;
                font-weight: 600;
            }
            td {
                border: 1px solid #ddd;
                padding: 10px;
            }
            tr:nth-child(even) { background-color: #f9f9f9; }
            tr:hover { background-color: #e6f0ff; }
            .metadata {
                background-color: #f8f9fa;
                padding: 15px;
                border-radius: 5px;
                margin-bottom: 20px;
            }
            .summary-grid {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
                gap: 20px;
                margin-bottom: 30px;
            }
            .summary-item {
                background-color: #f8f9fa;
                padding: 15px;
                border-radius: 5px;
                text-align: center;
                border-left: 4px solid #4472C4;
            }
            .summary-label {
                color: #666;
                font-size: 0.9em;
                margin-bottom: 5px;
            }
            .summary-value {
                font-size: 24px;
                font-weight: bold;
                color: #4472C4;
            }
            .badge {
                display: inline-block;
                padding: 3px 8px;
                border-radius: 3px;
                font-size: 0.8em;
                font-weight: bold;
                background-color: #e0e0e0;
            }
            .badge-number {
                background-color: #4472C4;
                color: white;
            }
            .chart-container {
                margin: 30px 0;
                padding: 20px;
                background: white;
                border: 1px solid #ddd;
                border-radius: 5px;
            }
        `;
    }

    private getResponsiveCSS(): string {
        if (!this.options.responsive) return '';

        return `
            @media (max-width: 768px) {
                .report-container { padding: 15px; }
                table { font-size: 14px; }
                th, td { padding: 8px; }
                .summary-grid { grid-template-columns: 1fr; }
                .chart-container { padding: 10px; }
            }
        `;
    }

    private getScripts(): string {
        if (!this.options.interactive) return '';

        return `
            <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
            <script src="https://cdn.jsdelivr.net/npm/apexcharts"></script>
            <script>
                document.addEventListener('DOMContentLoaded', function() {
                    // Initialize charts
                    const chartContainers = document.querySelectorAll('.chart-canvas');
                    chartContainers.forEach(container => {
                        const config = JSON.parse(container.dataset.chart || '{}');
                        if (config.type === 'apex') {
                            new ApexCharts(container, config.options).render();
                        } else {
                            new Chart(container, config);
                        }
                    });

                    // Add sorting to tables
                    document.querySelectorAll('table.sortable').forEach(table => {
                        table.querySelectorAll('th').forEach((header, index) => {
                            header.addEventListener('click', () => {
                                sortTable(table, index);
                            });
                        });
                    });

                    function sortTable(table, column) {
                        const tbody = table.querySelector('tbody');
                        const rows = Array.from(tbody.querySelectorAll('tr'));
                        const isNumeric = !isNaN(rows[0].cells[column].innerText);
                        
                        rows.sort((a, b) => {
                            const aVal = a.cells[column].innerText;
                            const bVal = b.cells[column].innerText;
                            
                            if (isNumeric) {
                                return parseFloat(aVal) - parseFloat(bVal);
                            }
                            return aVal.localeCompare(bVal);
                        });

                        tbody.append(...rows);
                    }
                });
            </script>
        `;
    }

    private renderMetadata(options?: ExportOptions): string {
        let html = `<div class="metadata">`;
        html += `<p><strong>Generated:</strong> ${options?.generatedAt?.toLocaleString() || new Date().toLocaleString()}</p>`;
        html += `<p><strong>Generated By:</strong> ${options?.author || 'NOVA Framework'}</p>`;

        if (options?.parameters) {
            html += `<p><strong>Parameters:</strong></p><ul>`;
            for (const [key, value] of Object.entries(options.parameters)) {
                html += `<li><strong>${key}:</strong> ${JSON.stringify(value)}</li>`;
            }
            html += `</ul>`;
        }

        html += `</div>`;
        return html;
    }

    private renderSummary(datasets: Record<string, any[]>): string {
        const totalRows = Object.values(datasets).reduce((sum, d) => sum + d.length, 0);
        const totalDatasets = Object.keys(datasets).length;

        return `
            <div class="summary-grid">
                <div class="summary-item">
                    <div class="summary-label">Total Datasets</div>
                    <div class="summary-value">${totalDatasets}</div>
                </div>
                <div class="summary-item">
                    <div class="summary-label">Total Rows</div>
                    <div class="summary-value">${totalRows.toLocaleString()}</div>
                </div>
            </div>
        `;
    }

    private renderDatasets(datasets: Record<string, any[]>): string {
        let html = '';

        for (const [name, data] of Object.entries(datasets)) {
            if (data.length === 0) continue;

            html += `<h2>${name} <span class="badge badge-number">${data.length} rows</span></h2>`;

            const columns = Object.keys(data[0]);
            
            html += '<table class="sortable">';
            html += '<thead><tr>';
            columns.forEach(col => {
                html += `<th>${this.formatColumnHeader(col)}</th>`;
            });
            html += '</tr></thead><tbody>';

            data.forEach(row => {
                html += '<tr>';
                columns.forEach(col => {
                    let value = row[col];
                    value = this.formatCellValue(value);
                    html += `<td>${value}</td>`;
                });
                html += '</tr>';
            });

            html += '</tbody></table>';
        }

        return html;
    }

    private async renderCharts(datasets: Record<string, any[]>): Promise<string> {
        let html = '<div class="charts-section">';

        for (const [name, data] of Object.entries(datasets)) {
            if (data.length === 0) continue;

            const numericColumns = this.getNumericColumns(data);
            if (numericColumns.length === 0) continue;

            const firstColumn = Object.keys(data[0])[0];
            const chartId = `chart-${name.replace(/\s+/g, '-').toLowerCase()}`;

            html += `<div class="chart-container">`;
            html += `<h3>${name} - ${numericColumns[0]}</h3>`;
            html += `<canvas id="${chartId}" class="chart-canvas"></canvas>`;

            // Embed chart configuration
            const chartConfig = {
                type: 'bar',
                data: {
                    labels: data.map(row => row[firstColumn]),
                    datasets: [{
                        label: numericColumns[0],
                        data: data.map(row => row[numericColumns[0]]),
                        backgroundColor: '#4472C4'
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: true
                }
            };

            html += `<script>document.addEventListener('DOMContentLoaded', function() {
                const ctx = document.getElementById('${chartId}').getContext('2d');
                new Chart(ctx, ${JSON.stringify(chartConfig)});
            });</script>`;

            html += `</div>`;
        }

        html += '</div>';
        return html;
    }

    private renderFooter(options?: ExportOptions): string {
        return `
            <div style="text-align: center; margin-top: 40px; color: #666; font-size: 0.9em;">
                Generated by NOVA Framework | ${new Date().toLocaleString()}
            </div>
        `;
    }

    private formatColumnHeader(header: string): string {
        return header
            .replace(/([A-Z])/g, ' $1')
            .replace(/^./, str => str.toUpperCase())
            .trim();
    }

    private formatCellValue(value: any): string {
        if (value === null || value === undefined) return '';
        if (value instanceof Date) return value.toLocaleString();
        if (typeof value === 'boolean') return value ? 'Yes' : 'No';
        if (typeof value === 'object') return JSON.stringify(value);
        return String(value);
    }

    private getNumericColumns(data: any[]): string[] {
        if (data.length === 0) return [];
        return Object.keys(data[0]).filter(key => typeof data[0][key] === 'number');
    }
}