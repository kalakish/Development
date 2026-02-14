import { ExportOptions } from '../export';

export interface JSONOptions {
    pretty?: boolean;
    indent?: number;
    includeMetadata?: boolean;
    dateFormat?: 'iso' | 'timestamp' | 'string';
    circular?: 'error' | 'ignore' | 'null';
}

export class JSONRenderer {
    private options: JSONOptions;

    constructor(options?: JSONOptions) {
        this.options = {
            pretty: options?.pretty !== false,
            indent: options?.indent || 2,
            includeMetadata: options?.includeMetadata !== false,
            dateFormat: options?.dateFormat || 'iso',
            circular: options?.circular || 'error'
        };
    }

    render(datasets: Record<string, any[]>, options?: ExportOptions): string {
        const output: any = {};

        // Add metadata
        if (this.options.includeMetadata) {
            output.metadata = {
                title: options?.title || 'Report',
                generatedAt: options?.generatedAt?.toISOString() || new Date().toISOString(),
                generatedBy: options?.author || 'NOVA Framework',
                parameters: options?.parameters || {}
            };
        }

        // Add summary
        output.summary = {
            totalDatasets: Object.keys(datasets).length,
            totalRows: Object.values(datasets).reduce((sum, d) => sum + d.length, 0)
        };

        // Add datasets
        output.datasets = {};
        
        for (const [name, data] of Object.entries(datasets)) {
            output.datasets[name] = {
                rowCount: data.length,
                rows: this.processData(data)
            };
        }

        // Stringify with circular reference handling
        return this.stringify(output);
    }

    private processData(data: any[]): any[] {
        return data.map(row => {
            const processed: any = {};
            
            for (const [key, value] of Object.entries(row)) {
                processed[key] = this.processValue(value);
            }
            
            return processed;
        });
    }

    private processValue(value: any): any {
        if (value === null || value === undefined) {
            return null;
        }

        if (value instanceof Date) {
            return this.formatDate(value);
        }

        if (Buffer.isBuffer(value)) {
            return {
                __type: 'Buffer',
                data: value.toString('base64')
            };
        }

        if (typeof value === 'object') {
            if (this.isCircular(value)) {
                switch (this.options.circular) {
                    case 'ignore':
                        return undefined;
                    case 'null':
                        return null;
                    case 'error':
                        throw new Error('Circular reference detected');
                }
            }

            const processed: any = {};
            for (const [k, v] of Object.entries(value)) {
                processed[k] = this.processValue(v);
            }
            return processed;
        }

        return value;
    }

    private formatDate(date: Date): string {
        switch (this.options.dateFormat) {
            case 'iso':
                return date.toISOString();
            case 'timestamp':
                return date.getTime().toString();
            case 'string':
                return date.toLocaleString();
            default:
                return date.toISOString();
        }
    }

    private isCircular(obj: any): boolean {
        try {
            JSON.stringify(obj);
            return false;
        } catch {
            return true;
        }
    }

    private stringify(obj: any): string {
        if (this.options.pretty) {
            return JSON.stringify(obj, null, this.options.indent);
        }
        return JSON.stringify(obj);
    }

    renderSingleDataset(data: any[], options?: ExportOptions): string {
        return this.render({ 'Data': data }, options);
    }

    renderJSON(jsonData: any): string {
        if (Array.isArray(jsonData)) {
            return this.renderSingleDataset(jsonData);
        }
        
        return this.render({ 'Data': [jsonData] });
    }

    parse<T = any>(jsonString: string): T {
        return JSON.parse(jsonString);
    }

    async stream(
        datasets: Record<string, any[]>,
        options?: ExportOptions & { chunkSize?: number }
    ): Promise<NodeJS.ReadableStream> {
        const { Readable } = require('stream');
        const chunkSize = options?.chunkSize || 100;

        const data = this.processStreamData(datasets, options);
        const chunks = this.chunkArray(data, chunkSize);

        return Readable.from((async function* () {
            yield '[\n';
            
            for (let i = 0; i < chunks.length; i++) {
                const chunk = chunks[i];
                yield JSON.stringify(chunk, null, 2)
                    .slice(1, -1) // Remove outer brackets
                    .trim();
                
                if (i < chunks.length - 1) {
                    yield ',\n';
                }
            }
            
            yield '\n]';
        })());
    }

    private processStreamData(
        datasets: Record<string, any[]>,
        options?: ExportOptions
    ): any[] {
        const result: any[] = [];

        for (const [name, data] of Object.entries(datasets)) {
            for (const row of data) {
                result.push({
                    dataset: name,
                    ...this.processValue(row)
                });
            }
        }

        return result;
    }

    private chunkArray<T>(array: T[], size: number): T[][] {
        const chunks: T[][] = [];
        
        for (let i = 0; i < array.length; i += size) {
            chunks.push(array.slice(i, i + size));
        }
        
        return chunks;
    }
}