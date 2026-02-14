import { ExportOptions } from '../export';
import { Builder } from 'xml2js';

export interface XMLOptions {
    rootName?: string;
    itemName?: string;
    pretty?: boolean;
    indent?: string;
    declaration?: boolean;
    cdata?: boolean;
    dateFormat?: string;
}

export class XMLRenderer {
    private builder: Builder;
    private options: XMLOptions;

    constructor(options?: XMLOptions) {
        this.options = {
            rootName: options?.rootName || 'Report',
            itemName: options?.itemName || 'Row',
            pretty: options?.pretty !== false,
            indent: options?.indent || '  ',
            declaration: options?.declaration !== false,
            cdata: options?.cdata || false,
            dateFormat: options?.dateFormat || 'iso'
        };

        this.builder = new Builder({
            rootName: this.options.rootName,
            xmldec: this.options.declaration ? { version: '1.0', encoding: 'UTF-8' } : null,
            renderOpts: {
                pretty: this.options.pretty,
                indent: this.options.indent
            },
            cdata: this.options.cdata
        });
    }

    render(datasets: Record<string, any[]>, options?: ExportOptions): string {
        const xmlObj: any = {
            $: {
                title: options?.title || 'Report',
                generatedAt: options?.generatedAt?.toISOString() || new Date().toISOString(),
                generatedBy: options?.author || 'NOVA Framework',
                version: '1.0'
            }
        };

        // Metadata section
        if (options?.parameters) {
            xmlObj.Metadata = {
                Parameters: Object.entries(options.parameters).map(([key, value]) => ({
                    Parameter: {
                        $: { name: key },
                        _: this.formatValue(value)
                    }
                }))
            };
        }

        // Summary
        xmlObj.Summary = {
            TotalDatasets: Object.keys(datasets).length,
            TotalRows: Object.values(datasets).reduce((sum, d) => sum + d.length, 0)
        };

        // Datasets
        xmlObj.Datasets = {};

        for (const [name, data] of Object.entries(datasets)) {
            xmlObj.Datasets[name] = {
                $: { rowCount: data.length },
                [this.options.itemName!]: data.map(row => {
                    const rowObj: any = {};
                    
                    for (const [key, value] of Object.entries(row)) {
                        rowObj[key] = this.formatXMLValue(value);
                    }
                    
                    return rowObj;
                })
            };
        }

        return this.builder.buildObject(xmlObj);
    }

    private formatXMLValue(value: any): any {
        if (value === null || value === undefined) {
            return { _: '' };
        }

        if (value instanceof Date) {
            return { _: this.formatDate(value) };
        }

        if (typeof value === 'boolean') {
            return { _: value ? 'true' : 'false' };
        }

        if (typeof value === 'object') {
            if (Array.isArray(value)) {
                return {
                    Item: value.map(v => this.formatXMLValue(v))
                };
            }

            const obj: any = {};
            for (const [k, v] of Object.entries(value)) {
                obj[k] = this.formatXMLValue(v);
            }
            return obj;
        }

        return { _: String(value) };
    }

    private formatDate(date: Date): string {
        switch (this.options.dateFormat) {
            case 'iso':
                return date.toISOString();
            case 'date':
                return date.toISOString().split('T')[0];
            case 'datetime-local':
                return date.toLocaleString('sv').replace(' ', 'T');
            default:
                return date.toISOString();
        }
    }

    private formatValue(value: any): string {
        if (value === null || value === undefined) return '';
        if (value instanceof Date) return value.toISOString();
        if (typeof value === 'object') return JSON.stringify(value);
        return String(value);
    }

    renderSingleDataset(data: any[], options?: ExportOptions): string {
        return this.render({ 'Data': data }, options);
    }

    renderWithSchema(
        datasets: Record<string, any[]>,
        schema: any,
        options?: ExportOptions
    ): string {
        // Apply XSLT transformation or schema validation
        const xml = this.render(datasets, options);
        return xml;
    }

    async validate(xmlString: string, xsdPath?: string): Promise<ValidationResult> {
        // XML validation against XSD schema
        const errors: string[] = [];
        
        // Implement validation logic here
        // This would use libxmljs or similar library

        return {
            valid: errors.length === 0,
            errors
        };
    }
}

export interface ValidationResult {
    valid: boolean;
    errors: string[];
}