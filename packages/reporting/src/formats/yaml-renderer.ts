import YAML from 'yaml';
import { ExportOptions } from '../export';

export interface YAMLOptions {
    indent?: number;
    schema?: 'core' | 'failsafe' | 'json' | 'yaml-1.1';
    version?: '1.1' | '1.2';
    pretty?: boolean;
    dateFormat?: 'iso' | 'timestamp';
}

export class YAMLRenderer {
    private options: YAMLOptions;

    constructor(options?: YAMLOptions) {
        this.options = {
            indent: options?.indent || 2,
            schema: options?.schema || 'yaml-1.1',
            version: options?.version || '1.2',
            pretty: options?.pretty !== false,
            dateFormat: options?.dateFormat || 'iso'
        };
    }

    render(datasets: Record<string, any[]>, options?: ExportOptions): string {
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
            datasets: {}
        };

        for (const [name, data] of Object.entries(datasets)) {
            output.datasets[name] = {
                rowCount: data.length,
                rows: this.processData(data)
            };
        }

        return YAML.stringify(output, {
            indent: this.options.indent,
            schema: this.options.schema,
            version: this.options.version
        });
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
            default:
                return date.toISOString();
        }
    }

    renderSingleDataset(data: any[], options?: ExportOptions): string {
        return this.render({ 'Data': data }, options);
    }

    parse<T = any>(yamlString: string): T {
        return YAML.parse(yamlString);
    }

    async parseFromFile(filePath: string): Promise<any> {
        const fs = await import('fs-extra');
        const content = await fs.readFile(filePath, 'utf8');
        return this.parse(content);
    }
}