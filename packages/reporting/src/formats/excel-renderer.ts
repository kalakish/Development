import ExcelJS from 'exceljs';
import { ExportOptions } from '../export';
import { ChartGenerator } from '../visualizations/chart-generator';

export interface ExcelSheetConfig {
    name: string;
    data: any[];
    columns?: string[];
    freezeHeader?: boolean;
    autoFilter?: boolean;
    conditionalFormatting?: boolean;
    totals?: boolean;
    charts?: ExcelChartConfig[];
}

export interface ExcelChartConfig {
    type: 'bar' | 'line' | 'pie';
    title: string;
    range: string;
    sheet?: string;
}

export class ExcelRenderer {
    private workbook: ExcelJS.Workbook;
    private options: ExportOptions;
    private chartGenerator: ChartGenerator;

    constructor(options?: ExportOptions) {
        this.workbook = new ExcelJS.Workbook();
        this.options = options || {};
        this.chartGenerator = new ChartGenerator();

        // Set workbook properties
        this.workbook.creator = this.options.author || 'NOVA Framework';
        this.workbook.created = new Date();
        this.workbook.modified = new Date();
    }

    async render(datasets: Record<string, any[]>, options?: ExportOptions): Promise<Buffer> {
        // Create summary sheet
        this.createSummarySheet(datasets);

        // Create data sheets
        for (const [name, data] of Object.entries(datasets)) {
            if (data.length === 0) continue;
            await this.createDataSheet(name, data);
        }

        const buffer = await this.workbook.xlsx.writeBuffer();
        return Buffer.from(buffer);
    }

    private createSummarySheet(datasets: Record<string, any[]>): void {
        const sheet = this.workbook.addWorksheet('Summary', {
            properties: { defaultColWidth: 20 }
        });

        // Title
        sheet.mergeCells('A1:D1');
        const titleCell = sheet.getCell('A1');
        titleCell.value = this.options.title || 'Report Summary';
        titleCell.font = { size: 16, bold: true };
        titleCell.alignment = { horizontal: 'center' };

        // Generated date
        sheet.mergeCells('A2:D2');
        const dateCell = sheet.getCell('A2');
        dateCell.value = `Generated: ${new Date().toLocaleString()}`;
        dateCell.font = { size: 11, italic: true };
        dateCell.alignment = { horizontal: 'center' };

        // Parameters
        if (this.options.parameters) {
            let rowIndex = 4;
            
            sheet.getCell(`A${rowIndex}`).value = 'Parameters';
            sheet.getCell(`A${rowIndex}`).font = { bold: true, size: 12 };
            rowIndex++;

            for (const [key, value] of Object.entries(this.options.parameters)) {
                sheet.getCell(`A${rowIndex}`).value = key;
                sheet.getCell(`B${rowIndex}`).value = JSON.stringify(value);
                sheet.getCell(`A${rowIndex}`).font = { bold: true };
                rowIndex++;
            }
        }

        // Dataset summary
        let summaryRow = 8;
        sheet.getCell(`A${summaryRow}`).value = 'Dataset';
        sheet.getCell(`B${summaryRow}`).value = 'Rows';
        sheet.getCell(`C${summaryRow}`).value = 'Columns';
        
        // Style header
        ['A', 'B', 'C'].forEach(col => {
            const cell = sheet.getCell(`${col}${summaryRow}`);
            cell.font = { bold: true };
            cell.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FF4472C4' }
            };
            cell.font = { color: { argb: 'FFFFFFFF' }, bold: true };
        });

        summaryRow++;

        for (const [name, data] of Object.entries(datasets)) {
            sheet.getCell(`A${summaryRow}`).value = name;
            sheet.getCell(`B${summaryRow}`).value = data.length;
            sheet.getCell(`C${summaryRow}`).value = data.length > 0 ? Object.keys(data[0]).length : 0;
            summaryRow++;
        }

        // Format columns
        sheet.getColumn('A').width = 30;
        sheet.getColumn('B').width = 15;
        sheet.getColumn('C').width = 15;
        sheet.getColumn('D').width = 30;
    }

    private async createDataSheet(name: string, data: any[]): Promise<void> {
        const sheetName = name.substring(0, 31); // Excel sheet name limit
        const sheet = this.workbook.addWorksheet(sheetName);

        // Get columns from first row
        const columns = Object.keys(data[0]);
        
        // Define columns
        sheet.columns = columns.map(col => ({
            header: this.formatColumnHeader(col),
            key: col,
            width: this.getColumnWidth(data, col)
        }));

        // Style header row
        const headerRow = sheet.getRow(1);
        headerRow.font = { bold: true, size: 11, color: { argb: 'FFFFFFFF' } };
        headerRow.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FF4472C4' }
        };
        headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
        headerRow.height = 20;

        // Add data
        sheet.addRows(data);

        // Auto filter
        sheet.autoFilter = {
            from: { row: 1, column: 1 },
            to: { row: data.length, column: columns.length }
        };

        // Freeze header row
        sheet.views = [
            { state: 'frozen', xSplit: 0, ySplit: 1 }
        ];

        // Format cells
        this.formatCells(sheet, data, columns);

        // Add totals row if requested
        if (this.options.showTotals) {
            this.addTotalsRow(sheet, data, columns);
        }

        // Add conditional formatting
        this.addConditionalFormatting(sheet, data, columns);

        // Create charts
        await this.createCharts(sheet, name, data);
    }

    private formatCells(
        sheet: ExcelJS.Worksheet,
        data: any[],
        columns: string[]
    ): void {
        data.forEach((row, rowIndex) => {
            const excelRow = sheet.getRow(rowIndex + 2);
            
            columns.forEach((col, colIndex) => {
                const cell = excelRow.getCell(colIndex + 1);
                const value = row[col];

                // Auto-detect and format data types
                if (value instanceof Date) {
                    cell.value = value;
                    cell.numFmt = 'yyyy-mm-dd hh:mm:ss';
                } else if (typeof value === 'number') {
                    if (Number.isInteger(value)) {
                        cell.numFmt = '#,##0';
                    } else {
                        cell.numFmt = '#,##0.00';
                    }
                } else if (typeof value === 'boolean') {
                    cell.value = value ? 'Yes' : 'No';
                }

                // Add borders
                cell.border = {
                    top: { style: 'thin' },
                    left: { style: 'thin' },
                    bottom: { style: 'thin' },
                    right: { style: 'thin' }
                };
            });
        });
    }

    private addTotalsRow(
        sheet: ExcelJS.Worksheet,
        data: any[],
        columns: string[]
    ): void {
        const totalRow = sheet.addRow({});
        totalRow.font = { bold: true };
        
        columns.forEach((col, colIndex) => {
            const cell = totalRow.getCell(colIndex + 1);
            const values = data.map(row => row[col]).filter(v => typeof v === 'number');
            
            if (values.length > 0) {
                const sum = values.reduce((a, b) => a + b, 0);
                cell.value = sum;
                cell.numFmt = '#,##0.00';
            } else if (colIndex === 0) {
                cell.value = 'Total';
            }
        });

        // Style totals row
        totalRow.eachCell(cell => {
            cell.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FFF2F2F2' }
            };
            cell.border = {
                top: { style: 'medium' },
                bottom: { style: 'double' }
            };
        });
    }

    private addConditionalFormatting(
        sheet: ExcelJS.Worksheet,
        data: any[],
        columns: string[]
    ): void {
        columns.forEach((col, colIndex) => {
            const values = data.map(row => row[col]).filter(v => typeof v === 'number');
            
            if (values.length > 0) {
                const columnLetter = String.fromCharCode(65 + colIndex);
                const range = `${columnLetter}2:${columnLetter}${data.length + 1}`;

                // Color scale (green-yellow-red)
                sheet.addConditionalFormatting({
                    ref: range,
                    rules: [
                        {
                            type: 'colorScale',
                            cfvo: [
                                { type: 'num', value: Math.min(...values) },
                                { type: 'num', value: (Math.min(...values) + Math.max(...values)) / 2 },
                                { type: 'num', value: Math.max(...values) }
                            ],
                            color: [
                                { argb: 'FF63BE7B' }, // Green
                                { argb: 'FFFFEB84' }, // Yellow
                                { argb: 'FFF8696B' }  // Red
                            ]
                        }
                    ]
                });

                // Data bars
                sheet.addConditionalFormatting({
                    ref: range,
                    rules: [
                        {
                            type: 'dataBar',
                            color: { argb: 'FF4472C4' }
                        }
                    ]
                });
            }
        });
    }

    private async createCharts(
        sheet: ExcelJS.Worksheet,
        name: string,
        data: any[]
    ): Promise<void> {
        if (data.length === 0) return;

        const numericColumns = this.getNumericColumns(data);
        if (numericColumns.length === 0) return;

        // Create chart sheet
        const chartSheet = this.workbook.addWorksheet(`${name} Charts`);

        // Bar chart
        const barChart = chartSheet.addImage({
            base64: await this.generateChartImage('bar', data),
            extension: 'png',
            editAs: 'oneCell'
        });
        chartSheet.addDrawing(barChart, {
            tl: { col: 1, row: 1 },
            ext: { width: 600, height: 400 }
        });

        // Line chart
        if (data.length > 1) {
            const lineChart = chartSheet.addImage({
                base64: await this.generateChartImage('line', data),
                extension: 'png',
                editAs: 'oneCell'
            });
            chartSheet.addDrawing(lineChart, {
                tl: { col: 1, row: 25 },
                ext: { width: 600, height: 400 }
            });
        }

        // Pie chart (first numeric column)
        const pieChart = chartSheet.addImage({
            base64: await this.generateChartImage('pie', data),
            extension: 'png',
            editAs: 'oneCell'
        });
        chartSheet.addDrawing(pieChart, {
            tl: { col: 1, row: 50 },
            ext: { width: 600, height: 400 }
        });
    }

    private async generateChartImage(type: string, data: any[]): Promise<string> {
        const firstColumn = Object.keys(data[0])[0];
        const numericColumns = this.getNumericColumns(data);
        
        const chartConfig = {
            type: type as any,
            title: `${type.charAt(0).toUpperCase() + type.slice(1)} Chart`,
            series: [{
                name: numericColumns[0],
                data: numericColumns[0]
            }],
            xAxis: {
                title: firstColumn,
                visible: true
            },
            yAxis: {
                title: numericColumns[0],
                visible: true
            }
        };

        const chartBuffer = await this.chartGenerator.generateChartBuffer(chartConfig, data);
        return chartBuffer.toString('base64');
    }

    private getColumnWidth(data: any[], column: string): number {
        const maxLength = data.reduce((max, row) => {
            const value = row[column];
            const length = value ? String(value).length : 0;
            return Math.max(max, length);
        }, column.length);

        return Math.min(50, Math.max(15, maxLength + 2));
    }

    private formatColumnHeader(header: string): string {
        return header
            .replace(/([A-Z])/g, ' $1')
            .replace(/^./, str => str.toUpperCase())
            .trim();
    }

    private getNumericColumns(data: any[]): string[] {
        if (data.length === 0) return [];
        
        return Object.keys(data[0]).filter(key => 
            typeof data[0][key] === 'number'
        );
    }

    getWorkbook(): ExcelJS.Workbook {
        return this.workbook;
    }
}