import { parse } from 'csv-parse';
import { stringify } from 'csv-stringify';

export class CSVTransformer {
    async toJSON(csv: string, options?: any): Promise<any[]> {
        return new Promise((resolve, reject) => {
            parse(csv, {
                columns: true,
                skip_empty_lines: true,
                trim: true,
                ...options
            }, (err, records) => {
                if (err) reject(err);
                else resolve(records);
            });
        });
    }

    async toCSV(data: any[], options?: any): Promise<string> {
        return new Promise((resolve, reject) => {
            stringify(data, {
                header: true,
                ...options
            }, (err, output) => {
                if (err) reject(err);
                else resolve(output);
            });
        });
    }

    transform(data: any[], mapping: CSVTransformMapping): any[] {
        return data.map(row => {
            const transformed: any = {};

            Object.entries(mapping).forEach(([targetField, sourceField]) => {
                const value = this.getNestedValue(row, sourceField);
                if (value !== undefined) {
                    transformed[targetField] = value;
                }
            });

            return transformed;
        });
    }

    private getNestedValue(obj: any, path: string): any {
        return path.split('.').reduce((current, key) => 
            current && current[key] !== undefined ? current[key] : undefined, obj
        );
    }
}

export interface CSVTransformMapping {
    [targetField: string]: string; // source field path
}