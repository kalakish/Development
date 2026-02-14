export class JSONTransformer {
    transform<T = any>(data: any, schema: JSONTransformSchema): T {
        if (Array.isArray(data)) {
            return data.map(item => this.transformObject(item, schema)) as any;
        }
        return this.transformObject(data, schema) as any;
    }

    private transformObject(obj: any, schema: JSONTransformSchema): any {
        const result: any = {};

        for (const [key, config] of Object.entries(schema)) {
            let value = this.getNestedValue(obj, config.path || key);

            // Apply type conversion
            if (config.type && value !== undefined) {
                value = this.convertType(value, config.type);
            }

            // Apply format
            if (config.format && value !== undefined) {
                value = this.formatValue(value, config.format);
            }

            // Apply default value
            if (value === undefined && config.default !== undefined) {
                value = config.default;
            }

            // Skip null/undefined
            if (value === undefined || (value === null && config.skipNull)) {
                continue;
            }

            // Set nested path
            this.setNestedValue(result, config.target || key, value);
        }

        return result;
    }

    private getNestedValue(obj: any, path: string): any {
        return path.split('.').reduce((current, key) => 
            current && current[key] !== undefined ? current[key] : undefined, obj
        );
    }

    private setNestedValue(obj: any, path: string, value: any): void {
        const parts = path.split('.');
        const last = parts.pop()!;
        
        const target = parts.reduce((current, key) => {
            if (!current[key]) current[key] = {};
            return current[key];
        }, obj);
        
        target[last] = value;
    }

    private convertType(value: any, type: string): any {
        switch (type) {
            case 'string':
                return String(value);
            case 'number':
                return Number(value);
            case 'integer':
                return parseInt(value, 10);
            case 'boolean':
                return Boolean(value);
            case 'date':
                return new Date(value);
            case 'array':
                return Array.isArray(value) ? value : [value];
            default:
                return value;
        }
    }

    private formatValue(value: any, format: string): any {
        if (value instanceof Date) {
            switch (format) {
                case 'iso':
                    return value.toISOString();
                case 'date':
                    return value.toISOString().split('T')[0];
                case 'time':
                    return value.toTimeString().split(' ')[0];
                case 'timestamp':
                    return value.getTime();
            }
        }

        if (typeof value === 'number') {
            switch (format) {
                case 'currency':
                    return new Intl.NumberFormat('en-US', {
                        style: 'currency',
                        currency: 'USD'
                    }).format(value);
                case 'percent':
                    return `${value * 100}%`;
                case 'decimal':
                    return value.toFixed(2);
            }
        }

        return value;
    }
}

export interface JSONTransformSchema {
    [key: string]: JSONTransformField;
}

export interface JSONTransformField {
    path?: string;
    target?: string;
    type?: 'string' | 'number' | 'integer' | 'boolean' | 'date' | 'array';
    format?: string;
    default?: any;
    skipNull?: boolean;
}