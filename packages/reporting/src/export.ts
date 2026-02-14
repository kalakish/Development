import * as ExcelJS from 'exceljs';
import * as PDFKit from 'pdfkit';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';
import { createObjectCsvStringifier } from 'csv-writer';
import * as xml2js from 'xml2js';
import * as YAML from 'yaml';

export class ReportExporter {
    private pdfDocument?: PDFKit.PDFDocument;
    private excelWorkbook?: ExcelJS.Workbook;
    private csvStringifier?: any;

    // ============ Main Export ============

    async export(
        datasets: Record<string, any[]>,
        format: ExportFormat,
        options?: ExportOptions
    ): Promise<Buffer | string> {
        switch (format) {
            case 'pdf':
                return this.exportToPDF(datasets, options);
            case 'excel':
                return this.exportToExcel(datasets, options);
            case 'csv':
                return this.exportToCSV(datasets, options);
            case 'json':
                return this.exportToJSON(datasets, options);
            case 'xml':
                return this.exportToXML(datasets, options);
            case 'html':
                return this.exportToHTML(datasets, options);
            case 'yaml':
                return this.exportToYAML(datasets, options);
            case 'text':
                return this.exportToText(datasets, options);
            case 'markdown':
                return this.exportToMarkdown(datasets, options);
            default:
                throw new Error(`Unsupported export format: ${format}`);
        }
    }

    // ============ PDF Export ============

    private async exportToPDF(
        datasets: Record<string, any[]>,
        options?: ExportOptions
    ): Promise<Buffer> {
        return new Promise((resolve) => {
            const doc = new PDFKit({
                size: options?.pageSize || 'A4',
                layout: options?.orientation || 'portrait',
                margins: options?.margins || {
                    top: 50,
                    bottom: 50,
                    left: 50,
                    right: 50
                },
                info: {
                    Title: options?.title || 'Report',
                    Author: options?.author || 'NOVA Framework',
                    CreationDate: new Date()
                }
            });

            const chunks: Buffer[] = [];

            doc.on('data', chunk => chunks.push(chunk));
            doc.on('end', () => resolve(Buffer.concat(chunks)));

            // Title
            if (options?.title) {
                doc.fontSize(20)
                   .font('Helvetica-Bold')
                   .text(options.title, { align: 'center' })
                   .moveDown();
            }

            // Subtitle
            if (options?.subtitle) {
                doc.fontSize(14)
                   .font('Helvetica')
                   .text(options.subtitle, { align: 'center' })
                   .moveDown();
            }

            // Date
            doc.fontSize(10)
               .font('Helvetica')
               .text(`Generated: ${options?.generatedAt?.toLocaleString() || new Date().toLocaleString()}`, 
                     { align: 'right' })
               .moveDown();

            // Parameters
            if (options?.parameters) {
                doc.fontSize(12)
                   .font('Helvetica-Bold')
                   .text('Parameters')
                   .moveDown(0.5);

                for (const [key, value] of Object.entries(options.parameters)) {
                    doc.fontSize(10)
                       .font('Helvetica')
                       .text(`${key}: ${JSON.stringify(value)}`);
                }
                doc.moveDown();
            }

            // Datasets
            let datasetCount = 0;
            for (const [name, data] of Object.entries(datasets)) {
                if (data.length === 0) continue;

                datasetCount++;
                
                // Dataset title
                doc.fontSize(16)
                   .font('Helvetica-Bold')
                   .text(name)
                   .moveDown(0.5);

                // Add new page for each dataset except first
                if (datasetCount > 1) {
                    doc.addPage();
                }

                // Create table
                const columns = data.length > 0 ? Object.keys(data[0]) : [];
                const tableData = data.map(row => 
                    columns.map(col => {
                        const value = row[col];
                        if (value instanceof Date) return value.toLocaleDateString();
                        if (typeof value === 'object') return JSON.stringify(value);
                        return String(value || '');
                    })
                );

                // Draw table
                const startY = doc.y;
                const cellPadding = 5;
                const cellWidth = (doc.page.width - 100) / Math.min(columns.length, 6);
                let currentY = startY;

                // Headers
                doc.font('Helvetica-Bold');
                columns.forEach((col, i) => {
                    doc.text(col, 50 + i * cellWidth, currentY, {
                        width: cellWidth,
                        align: 'left'
                    });
                });

                // Rows
                doc.font('Helvetica');
                tableData.forEach(row => {
                    currentY += 20;
                    
                    // Check if need new page
                    if (currentY > doc.page.height - 50) {
                        doc.addPage();
                        currentY = 50;
                        
                        // Repeat headers
                        doc.font('Helvetica-Bold');
                        columns.forEach((col, i) => {
                            doc.text(col, 50 + i * cellWidth, currentY, {
                                width: cellWidth,
                                align: 'left'
                            });
                        });
                        doc.font('Helvetica');
                        currentY += 20;
                    }

                    row.forEach((cell, i) => {
                        doc.text(cell, 50 + i * cellWidth, currentY, {
                            width: cellWidth,
                            align: 'left'
                        });
                    });
                });

                doc.moveDown(2);
            }

            // Footer
            const footerY = doc.page.height - 50;
            doc.fontSize(8)
               .font('Helvetica')
               .text(
                   `Page ${doc.page}`, 
                   50, 
                   footerY, 
                   { align: 'center' }
               );

            // Watermark
            if (options?.watermark) {
                doc.save();
                doc.fontSize(40)
                   .fillColor('gray')
                   .opacity(0.3)
                   .rotate(-45, { origin: [doc.page.width / 2, doc.page.height / 2] })
                   .text(options.watermark, doc.page.width / 2, doc.page.height / 2, {
                       align: 'center',
                       valign: 'center'
                   })
                   .restore();
            }

            doc.end();
        });
    }

    // ============ Excel Export ============

    private async exportToExcel(
        datasets: Record<string, any[]>,
        options?: ExportOptions
    ): Promise<Buffer> {
        const workbook = new ExcelJS.Workbook();
        
        // Set workbook properties
        workbook.creator = options?.author || 'NOVA Framework';
        workbook.created = new Date();
        workbook.modified = new Date();

        // Summary sheet
        const summarySheet = workbook.addWorksheet('Summary', 0);
        this.createSummarySheet(summarySheet, datasets, options);

        // Data sheets
        for (const [name, data] of Object.entries(datasets)) {
            if (data.length === 0) continue;

            const sheetName = name.substring(0, 31); // Excel sheet name limit
            const worksheet = workbook.addWorksheet(sheetName);

            // Get columns from first row
            const columns = data.length > 0 ? Object.keys(data[0]) : [];
            
            // Define columns
            worksheet.columns = columns.map(col => ({
                header: this.formatColumnHeader(col),
                key: col,
                width: this.getColumnWidth(data, col)
            }));

            // Style header row
            const headerRow = worksheet.getRow(1);
            headerRow.font = { bold: true, size: 12, color: { argb: 'FFFFFFFF' } };
            headerRow.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FF4472C4' }
            };
            headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
            headerRow.height = 20;

            // Add data
            worksheet.addRows(data);

            // Auto filter
            worksheet.autoFilter = {
                from: { row: 1, column: 1 },
                to: { row: data.length, column: columns.length }
            };

            // Freeze header row
            worksheet.views = [
                { state: 'frozen', xSplit: 0, ySplit: 1 }
            ];

            // Format cells
            this.formatExcelCells(worksheet, data, columns);

            // Add totals row if requested
            if (options?.showTotals) {
                this.addExcelTotalsRow(worksheet, data, columns);
            }

            // Add conditional formatting
            this.addExcelConditionalFormatting(worksheet, data, columns, options);
        }

        const buffer = await workbook.xlsx.writeBuffer();
        return Buffer.from(buffer);
    }

    private createSummarySheet(
        worksheet: ExcelJS.Worksheet,
        datasets: Record<string, any[]>,
        options?: ExportOptions
    ): void {
        worksheet.columns = [
            { header: 'Property', key: 'property', width: 30 },
            { header: 'Value', key: 'value', width: 50 }
        ];

        const rows = [
            { property: 'Report Title', value: options?.title || 'Report' },
            { property: 'Generated At', value: options?.generatedAt?.toLocaleString() || new Date().toLocaleString() },
            { property: 'Generated By', value: options?.author || 'System' },
            { property: 'Total Datasets', value: Object.keys(datasets).length },
            { property: 'Total Rows', value: Object.values(datasets).reduce((sum, d) => sum + d.length, 0) }
        ];

        if (options?.parameters) {
            for (const [key, value] of Object.entries(options.parameters)) {
                rows.push({ 
                    property: `Parameter: ${key}`, 
                    value: JSON.stringify(value) 
                });
            }
        }

        rows.push({ property: '', value: '' });
        rows.push({ property: 'Dataset Summary', value: '' });

        for (const [name, data] of Object.entries(datasets)) {
            rows.push({ 
                property: `  ${name}`, 
                value: `${data.length} rows` 
            });
        }

        worksheet.addRows(rows);
        
        // Style summary sheet
        worksheet.getRow(1).font = { bold: true };
        worksheet.getCell('A1').fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFE0E0E0' }
        };
    }

    private formatExcelCells(
        worksheet: ExcelJS.Worksheet,
        data: any[],
        columns: string[]
    ): void {
        data.forEach((row, rowIndex) => {
            const excelRow = worksheet.getRow(rowIndex + 2);
            
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

    private addExcelTotalsRow(
        worksheet: ExcelJS.Worksheet,
        data: any[],
        columns: string[]
    ): void {
        const totalRow = worksheet.addRow({});
        
        columns.forEach((col, colIndex) => {
            const cell = totalRow.getCell(colIndex + 1);
            const values = data.map(row => row[col]).filter(v => typeof v === 'number');
            
            if (values.length > 0) {
                const sum = values.reduce((a, b) => a + b, 0);
                cell.value = sum;
                cell.numFmt = '#,##0.00';
                cell.font = { bold: true };
            } else {
                cell.value = 'Total';
                cell.font = { bold: true };
            }
        });
    }

    private addExcelConditionalFormatting(
        worksheet: ExcelJS.Worksheet,
        data: any[],
        columns: string[],
        options?: ExportOptions
    ): void {
        // Add color scales for numeric columns
        columns.forEach((col, colIndex) => {
            const values = data.map(row => row[col]).filter(v => typeof v === 'number');
            
            if (values.length > 0) {
                worksheet.addConditionalFormatting({
                    ref: `${String.fromCharCode(65 + colIndex)}2:${String.fromCharCode(65 + colIndex)}${data.length + 1}`,
                    rules: [
                        {
                            type: 'colorScale',
                            cfvo: [
                                { type: 'num', value: Math.min(...values) },
                                { type: 'num', value: (Math.min(...values) + Math.max(...values)) / 2 },
                                { type: 'num', value: Math.max(...values) }
                            ],
                            color: [
                                { argb: 'FFF8696B' },
                                { argb: 'FFFFEB84' },
                                { argb: 'FF63BE7B' }
                            ]
                        }
                    ]
                });
            }
        });
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

    // ============ CSV Export ============

    private async exportToCSV(
        datasets: Record<string, any[]>,
        options?: ExportOptions
    ): Promise<string> {
        const results: string[] = [];

        results.push(`# Report: ${options?.title || 'Report'}`);
        results.push(`# Generated: ${options?.generatedAt?.toLocaleString() || new Date().toLocaleString()}`);
        results.push('');

        for (const [name, data] of Object.entries(datasets)) {
            if (data.length === 0) continue;

            results.push(`# Dataset: ${name}`);
            results.push(`# Rows: ${data.length}`);
            results.push('');

            // Get columns
            const columns = Object.keys(data[0]);

            // Create CSV stringifier
            const csvStringifier = createObjectCsvStringifier({
                header: columns.map(col => ({ id: col, title: col }))
            });

            // Write header
            results.push(csvStringifier.getHeaderString() || '');

            // Write records
            results.push(csvStringifier.stringifyRecords(data));

            results.push(''); // Empty line between datasets
        }

        return results.join('\n');
    }

    // ============ JSON Export ============

    private async exportToJSON(
        datasets: Record<string, any[]>,
        options?: ExportOptions
    ): Promise<string> {
        const output: any = {
            metadata: {
                title: options?.title || 'Report',
                generatedAt: options?.generatedAt?.toISOString() || new Date().toISOString(),
                generatedBy: options?.author || 'NOVA Framework',
                parameters: options?.parameters || {}
            },
            summary: {
                totalDatasets: Object.keys(datasets).length,
                totalRows: Object.values(datasets).reduce((sum, d) => sum + d.length, 0)
            },
            datasets
        };

        return JSON.stringify(output, null, 2);
    }

    // ============ XML Export ============

    private async exportToXML(
        datasets: Record<string, any[]>,
        options?: ExportOptions
    ): Promise<string> {
        const builder = new xml2js.Builder({
            rootName: 'Report',
            xmldec: { version: '1.0', encoding: 'UTF-8' },
            renderOpts: { pretty: true, indent: '  ' }
        });

        const xmlObj: any = {
            $: {
                title: options?.title || 'Report',
                generatedAt: options?.generatedAt?.toISOString() || new Date().toISOString(),
                generatedBy: options?.author || 'NOVA Framework'
            },
            Metadata: {
                Parameters: options?.parameters ? 
                    Object.entries(options.parameters).map(([key, value]) => ({
                        Parameter: {
                            $: { name: key },
                            _: JSON.stringify(value)
                        }
                    })) : []
            }
        };

        for (const [name, data] of Object.entries(datasets)) {
            xmlObj[name] = {
                $: { rowCount: data.length },
                Record: data.map(row => {
                    const record: any = {};
                    for (const [key, value] of Object.entries(row)) {
                        record[key] = { _: this.formatXMLValue(value) };
                    }
                    return record;
                })
            };
        }

        return builder.buildObject(xmlObj);
    }

    private formatXMLValue(value: any): string {
        if (value === null || value === undefined) return '';
        if (value instanceof Date) return value.toISOString();
        if (typeof value === 'object') return JSON.stringify(value);
        return String(value);
    }

    // ============ HTML Export ============

    private async exportToHTML(
        datasets: Record<string, any[]>,
        options?: ExportOptions
    ): Promise<string> {
        const styles = `
            <style>
                body { 
                    font-family: 'Segoe UI', Arial, sans-serif; 
                    margin: 40px; 
                    background-color: #f5f5f5;
                }
                .report-container {
                    max-width: 1200px;
                    margin: 0 auto;
                    background-color: white;
                    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
                    padding: 30px;
                    border-radius: 5px;
                }
                h1 { 
                    color: #333; 
                    border-bottom: 2px solid #4472C4;
                    padding-bottom: 10px;
                }
                h2 { 
                    color: #4472C4; 
                    margin-top: 30px; 
                }
                .metadata {
                    background-color: #f8f9fa;
                    padding: 15px;
                    border-radius: 5px;
                    margin-bottom: 20px;
                }
                table { 
                    border-collapse: collapse; 
                    width: 100%; 
                    margin-top: 20px;
                    background-color: white;
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
                tr:nth-child(even) { 
                    background-color: #f9f9f9; 
                }
                tr:hover { 
                    background-color: #e6f0ff; 
                }
                .timestamp { 
                    color: #666; 
                    font-size: 0.9em; 
                }
                .summary {
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
                }
                .summary-label {
                    color: #666;
                    font-size: 0.9em;
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
            </style>
        `;

        let html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${options?.title || 'Report'}</title>
    ${styles}
</head>
<body>
    <div class="report-container">
        <h1>${options?.title || 'Report'}</h1>
        
        <div class="metadata">
            <p><strong>Generated:</strong> ${options?.generatedAt?.toLocaleString() || new Date().toLocaleString()}</p>
            <p><strong>Generated By:</strong> ${options?.author || 'NOVA Framework'}</p>
            ${options?.parameters ? `
                <p><strong>Parameters:</strong></p>
                <ul>
                    ${Object.entries(options.parameters).map(([key, value]) => 
                        `<li><strong>${key}:</strong> ${JSON.stringify(value)}</li>`
                    ).join('')}
                </ul>
            ` : ''}
        </div>

        <div class="summary">
            <div class="summary-item">
                <div class="summary-label">Total Datasets</div>
                <div class="summary-value">${Object.keys(datasets).length}</div>
            </div>
            <div class="summary-item">
                <div class="summary-label">Total Rows</div>
                <div class="summary-value">${Object.values(datasets).reduce((sum, d) => sum + d.length, 0)}</div>
            </div>
        </div>`;

        for (const [name, data] of Object.entries(datasets)) {
            if (data.length === 0) continue;

            html += `<h2>${name} <span class="badge badge-number">${data.length} rows</span></h2>`;

            const columns = Object.keys(data[0]);
            
            html += '<table>';
            html += '<thead><tr>';
            columns.forEach(col => {
                html += `<th>${this.formatColumnHeader(col)}</th>`;
            });
            html += '</tr></thead><tbody>';

            data.forEach(row => {
                html += '<tr>';
                columns.forEach(col => {
                    let value = row[col];
                    if (value instanceof Date) {
                        value = value.toLocaleString();
                    } else if (typeof value === 'object' && value !== null) {
                        value = JSON.stringify(value);
                    } else if (value === null || value === undefined) {
                        value = '';
                    }
                    html += `<td>${value}</td>`;
                });
                html += '</tr>';
            });

            html += '</tbody></table>';
        }

        html += `
    </div>
</body>
</html>`;

        return html;
    }

    // ============ YAML Export ============

    private async exportToYAML(
        datasets: Record<string, any[]>,
        options?: ExportOptions
    ): Promise<string> {
        const output = {
            metadata: {
                title: options?.title || 'Report',
                generatedAt: options?.generatedAt?.toISOString() || new Date().toISOString(),
                generatedBy: options?.author || 'NOVA Framework',
                parameters: options?.parameters || {}
            },
            summary: {
                totalDatasets: Object.keys(datasets).length,
                totalRows: Object.values(datasets).reduce((sum, d) => sum + d.length, 0)
            },
            datasets: Object.fromEntries(
                Object.entries(datasets).map(([name, data]) => [
                    name,
                    {
                        rowCount: data.length,
                        rows: data
                    }
                ])
            )
        };

        return YAML.stringify(output);
    }

    // ============ Text Export ============

    private async exportToText(
        datasets: Record<string, any[]>,
        options?: ExportOptions
    ): Promise<string> {
        const lines: string[] = [];

        lines.push('='.repeat(80));
        lines.push(options?.title?.toUpperCase() || 'REPORT');
        lines.push('='.repeat(80));
        lines.push(`Generated: ${options?.generatedAt?.toLocaleString() || new Date().toLocaleString()}`);
        lines.push(`Generated By: ${options?.author || 'NOVA Framework'}`);
        lines.push('='.repeat(80));
        lines.push('');

        if (options?.parameters) {
            lines.push('PARAMETERS:');
            lines.push('-'.repeat(40));
            for (const [key, value] of Object.entries(options.parameters)) {
                lines.push(`${key}: ${JSON.stringify(value)}`);
            }
            lines.push('');
            lines.push('='.repeat(80));
            lines.push('');
        }

        for (const [name, data] of Object.entries(datasets)) {
            if (data.length === 0) continue;

            lines.push(name.toUpperCase());
            lines.push('-'.repeat(name.length));
            lines.push(`Rows: ${data.length}`);
            lines.push('');

            const columns = Object.keys(data[0]);
            
            // Header
            lines.push(columns.map(col => col.padEnd(20)).join(''));
            lines.push(columns.map(() => '-'.repeat(20)).join(''));

            // Data
            data.forEach(row => {
                const rowLine = columns.map(col => {
                    const value = String(row[col] || '').substring(0, 18);
                    return value.padEnd(20);
                }).join('');
                lines.push(rowLine);
            });

            lines.push('');
            lines.push('='.repeat(80));
            lines.push('');
        }

        return lines.join('\n');
    }

    // ============ Markdown Export ============

    private async exportToMarkdown(
        datasets: Record<string, any[]>,
        options?: ExportOptions
    ): Promise<string> {
        const lines: string[] = [];

        lines.push(`# ${options?.title || 'Report'}`);
        lines.push('');
        lines.push(`**Generated:** ${options?.generatedAt?.toLocaleString() || new Date().toLocaleString()}`);
        lines.push(`**Generated By:** ${options?.author || 'NOVA Framework'}`);
        lines.push('');

        if (options?.parameters) {
            lines.push('## Parameters');
            lines.push('');
            for (const [key, value] of Object.entries(options.parameters)) {
                lines.push(`- **${key}:** ${JSON.stringify(value)}`);
            }
            lines.push('');
        }

        lines.push('## Summary');
        lines.push('');
        lines.push(`- **Total Datasets:** ${Object.keys(datasets).length}`);
        lines.push(`- **Total Rows:** ${Object.values(datasets).reduce((sum, d) => sum + d.length, 0)}`);
        lines.push('');

        for (const [name, data] of Object.entries(datasets)) {
            if (data.length === 0) continue;

            lines.push(`## ${name}`);
            lines.push('');
            lines.push(`*Rows: ${data.length}*`);
            lines.push('');

            const columns = Object.keys(data[0]);
            
            // Header
            lines.push(`| ${columns.map(col => col).join(' | ')} |`);
            lines.push(`| ${columns.map(() => '---').join(' | ')} |`);

            // Data
            data.forEach(row => {
                const rowLine = columns.map(col => {
                    const value = row[col];
                    if (value instanceof Date) return value.toLocaleString();
                    if (typeof value === 'object') return JSON.stringify(value);
                    return String(value || '');
                }).join(' | ');
                lines.push(`| ${rowLine} |`);
            });

            lines.push('');
        }

        return lines.join('\n');
    }

    // ============ Utility ============

    getContentType(format: ExportFormat): string {
        const types: Record<ExportFormat, string> = {
            'pdf': 'application/pdf',
            'excel': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'csv': 'text/csv',
            'json': 'application/json',
            'xml': 'application/xml',
            'html': 'text/html',
            'yaml': 'application/x-yaml',
            'text': 'text/plain',
            'markdown': 'text/markdown'
        };
        return types[format] || 'application/octet-stream';
    }

    getFileExtension(format: ExportFormat): string {
        const extensions: Record<ExportFormat, string> = {
            'pdf': 'pdf',
            'excel': 'xlsx',
            'csv': 'csv',
            'json': 'json',
            'xml': 'xml',
            'html': 'html',
            'yaml': 'yaml',
            'text': 'txt',
            'markdown': 'md'
        };
        return extensions[format];
    }
}

export type ExportFormat = 
    | 'pdf' 
    | 'excel' 
    | 'csv' 
    | 'json' 
    | 'xml' 
    | 'html' 
    | 'yaml'
    | 'text'
    | 'markdown';

export interface ExportOptions {
    title?: string;
    subtitle?: string;
    author?: string;
    generatedAt?: Date;
    orientation?: 'portrait' | 'landscape';
    pageSize?: 'A4' | 'Letter' | 'Legal' | 'Tabloid';
    margins?: {
        top: number;
        right: number;
        bottom: number;
        left: number;
    };
    watermark?: string;
    password?: string;
    parameters?: Record<string, any>;
    showTotals?: boolean;
    showGrid?: boolean;
    font?: string;
    fontSize?: number;
    colors?: Record<string, string>;
}