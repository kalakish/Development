import PDFDocument from 'pdfkit';
import { ExportOptions } from '../export';
import { ChartGenerator } from '../visualizations/chart-generator';

export class PDFRenderer {
    private doc: PDFDocument;
    private options: ExportOptions;
    private chartGenerator: ChartGenerator;

    constructor(options?: ExportOptions) {
        this.options = options || {};
        this.chartGenerator = new ChartGenerator();
        
        this.doc = new PDFDocument({
            size: this.options.pageSize || 'A4',
            layout: this.options.orientation || 'portrait',
            margins: this.options.margins || {
                top: 50,
                bottom: 50,
                left: 50,
                right: 50
            },
            info: {
                Title: this.options.title || 'Report',
                Author: this.options.author || 'NOVA Framework',
                CreationDate: new Date()
            }
        });
    }

    async render(datasets: Record<string, any[]>, options?: ExportOptions): Promise<Buffer> {
        return new Promise((resolve) => {
            const chunks: Buffer[] = [];

            this.doc.on('data', chunk => chunks.push(chunk));
            this.doc.on('end', () => resolve(Buffer.concat(chunks)));

            // Render report elements
            this.renderHeader();
            this.renderMetadata();
            this.renderDatasets(datasets);
            this.renderFooter();

            this.doc.end();
        });
    }

    private renderHeader(): void {
        if (this.options.title) {
            this.doc
                .fontSize(24)
                .font('Helvetica-Bold')
                .text(this.options.title, { align: 'center' })
                .moveDown();
        }

        if (this.options.subtitle) {
            this.doc
                .fontSize(16)
                .font('Helvetica')
                .text(this.options.subtitle, { align: 'center' })
                .moveDown();
        }
    }

    private renderMetadata(): void {
        this.doc
            .fontSize(10)
            .font('Helvetica')
            .text(`Generated: ${new Date().toLocaleString()}`, { align: 'right' })
            .moveDown();

        if (this.options.parameters) {
            this.doc
                .fontSize(12)
                .font('Helvetica-Bold')
                .text('Parameters')
                .moveDown(0.5);

            for (const [key, value] of Object.entries(this.options.parameters)) {
                this.doc
                    .fontSize(10)
                    .font('Helvetica')
                    .text(`${key}: ${JSON.stringify(value)}`);
            }
            this.doc.moveDown();
        }
    }

    private renderDatasets(datasets: Record<string, any[]>): void {
        let datasetCount = 0;

        for (const [name, data] of Object.entries(datasets)) {
            if (data.length === 0) continue;

            datasetCount++;

            // Dataset title
            this.doc
                .fontSize(16)
                .font('Helvetica-Bold')
                .text(name)
                .moveDown(0.5);

            // Add new page for each dataset except first
            if (datasetCount > 1) {
                this.doc.addPage();
            }

            // Render table
            this.renderTable(data);

            // Render charts if data is suitable
            if (data.length > 0 && Object.keys(data[0]).length >= 2) {
                this.renderCharts(name, data);
            }
        }
    }

    private renderTable(data: any[]): void {
        if (data.length === 0) return;

        const columns = Object.keys(data[0]);
        const cellPadding = 5;
        const cellWidth = (this.doc.page.width - 100) / Math.min(columns.length, 6);
        let currentY = this.doc.y;

        // Headers
        this.doc.font('Helvetica-Bold');
        columns.forEach((col, i) => {
            this.doc.text(
                this.formatColumnHeader(col),
                50 + i * cellWidth,
                currentY,
                {
                    width: cellWidth,
                    align: 'left'
                }
            );
        });

        // Rows
        this.doc.font('Helvetica');
        data.forEach((row) => {
            currentY += 20;
            
            // Check if need new page
            if (currentY > this.doc.page.height - 50) {
                this.doc.addPage();
                currentY = 50;
                
                // Repeat headers
                this.doc.font('Helvetica-Bold');
                columns.forEach((col, i) => {
                    this.doc.text(
                        this.formatColumnHeader(col),
                        50 + i * cellWidth,
                        currentY,
                        {
                            width: cellWidth,
                            align: 'left'
                        }
                    );
                });
                this.doc.font('Helvetica');
                currentY += 20;
            }

            row.forEach((cell: any, i: number) => {
                let text = this.formatCellValue(cell);
                
                // Truncate if too long
                if (text.length > 20) {
                    text = text.substring(0, 18) + '...';
                }

                this.doc.text(
                    text,
                    50 + i * cellWidth,
                    currentY,
                    {
                        width: cellWidth,
                        align: 'left'
                    }
                );
            });
        });

        this.doc.moveDown(2);
    }

    private async renderCharts(datasetName: string, data: any[]): Promise<void> {
        this.doc.addPage();

        this.doc
            .fontSize(14)
            .font('Helvetica-Bold')
            .text(`${datasetName} - Chart View`)
            .moveDown();

        // Generate bar chart
        const numericColumns = this.getNumericColumns(data);
        
        if (numericColumns.length > 0) {
            const firstColumn = Object.keys(data[0])[0];
            const chartConfig = {
                type: 'bar' as const,
                title: `${datasetName} - ${numericColumns[0]}`,
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
            
            // Embed chart in PDF
            this.doc.image(chartBuffer, {
                fit: [500, 300],
                align: 'center'
            });
        }
    }

    private renderFooter(): void {
        const pages = this.doc.bufferedPageRange();
        
        for (let i = 0; i < pages.count; i++) {
            this.doc.switchToPage(i);
            
            this.doc
                .fontSize(8)
                .font('Helvetica')
                .text(
                    `Page ${i + 1} of ${pages.count}`,
                    50,
                    this.doc.page.height - 50,
                    { align: 'center' }
                );
        }

        // Watermark
        if (this.options.watermark) {
            this.doc.save();
            this.doc
                .fontSize(40)
                .fillColor('gray')
                .opacity(0.3)
                .rotate(-45, { origin: [this.doc.page.width / 2, this.doc.page.height / 2] })
                .text(
                    this.options.watermark,
                    this.doc.page.width / 2,
                    this.doc.page.height / 2,
                    {
                        align: 'center',
                        valign: 'center'
                    }
                )
                .restore();
        }
    }

    private formatColumnHeader(header: string): string {
        return header
            .replace(/([A-Z])/g, ' $1')
            .replace(/^./, str => str.toUpperCase())
            .trim();
    }

    private formatCellValue(value: any): string {
        if (value === null || value === undefined) return '';
        if (value instanceof Date) return value.toLocaleDateString();
        if (typeof value === 'object') return JSON.stringify(value);
        return String(value);
    }

    private getNumericColumns(data: any[]): string[] {
        if (data.length === 0) return [];
        
        return Object.keys(data[0]).filter(key => 
            typeof data[0][key] === 'number'
        );
    }

    getPDFDocument(): PDFDocument {
        return this.doc;
    }
}