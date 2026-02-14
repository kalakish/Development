import { EventEmitter } from 'events';
import { Logger } from '@nova/core/utils/logger';

export interface JSONPortOptions {
    pretty?: boolean;
    indent?: number;
    dateFormat?: 'iso' | 'timestamp' | 'string';
    excludeNull?: boolean;
    excludeEmpty?: boolean;
}

export interface JSONTransformOptions {
    mapFields?: Record<string, string>;
    filterFields?: string[];
    transformValue?: (key: string, value: any) => any;
}

export class JSONPort extends EventEmitter {
    private options: JSONPortOptions;
    private logger: Logger;

    constructor(options: JSONPortOptions = {}) {
        super();
        this.options = {
            pretty: true,
            indent: 2,
            dateFormat: 'iso',
            excludeNull: false,
            excludeEmpty: false,
            ...options
        };
        this.logger = new Logger('JSONPort');
    }

    // ============ Serialization ============

    serialize(data: any): string {
        const processed = this.processData(data);
        
        if (this.options.pretty) {
            return JSON.stringify(processed, null, this.options.indent);
        }
        
        return JSON.stringify(processed);
    }

    deserialize<T = any>(json: string): T {
        return JSON.parse(json);
    }

    // ============ Transformation ============

    transform(data: any, options: JSONTransformOptions = {}): any {
        if (Array.isArray(data)) {
            return data.map(item => this.transformObject(item, options));
        }
        
        return this.transformObject(data, options);
    }

    private transformObject(obj: any, options: JSONTransformOptions): any {
        if (!obj || typeof obj !== 'object') {
            return obj;
        }

        const result: any = {};

        for (let [key, value] of Object.entries(obj)) {
            // Apply field mapping
            if (options.mapFields && options.mapFields[key]) {
                key = options.mapFields[key];
            }

            // Filter fields
            if (options.filterFields && !options.filterFields.includes(key)) {
                continue;
            }

            // Transform value
            if (options.transformValue) {
                value = options.transformValue(key, value);
            }

            // Recursively transform nested objects
            if (value && typeof value === 'object') {
                value = this.transformObject(value, options);
            }

            result[key] = value;
        }

        return result;
    }

    // ============ Data Processing ============

    private processData(data: any): any {
        if (Array.isArray(data)) {
            return data.map(item => this.processValue(item));
        }
        
        if (data && typeof data === 'object') {
            const processed: any = {};
            
            for (const [key, value] of Object.entries(data)) {
                const processedValue = this.processValue(value);
                
                if (this.shouldInclude(key, processedValue)) {
                    processed[key] = processedValue;
                }
            }
            
            return processed;
        }
        
        return this.processValue(data);
    }

    private processValue(value: any): any {
        // Handle null/undefined
        if (value === null || value === undefined) {
            return this.options.excludeNull ? undefined : null;
        }

        // Handle dates
        if (value instanceof Date) {
            switch (this.options.dateFormat) {
                case 'iso':
                    return value.toISOString();
                case 'timestamp':
                    return value.getTime();
                case 'string':
                    return value.toString();
                default:
                    return value.toISOString();
            }
        }

        // Handle arrays
        if (Array.isArray(value)) {
            return value.map(item => this.processValue(item));
        }

        // Handle objects
        if (typeof value === 'object') {
            return this.processData(value);
        }

        return value;
    }

    private shouldInclude(key: string, value: any): boolean {
        if (this.options.excludeNull && (value === null || value === undefined)) {
            return false;
        }
        
        if (this.options.excludeEmpty && value === '') {
            return false;
        }
        
        return true;
    }

    // ============ Schema Validation ============

    validateSchema(data: any, schema: JSONSchema): boolean {
        // Basic schema validation
        if (schema.type === 'object') {
            if (typeof data !== 'object' || data === null) return false;
            
            if (schema.required) {
                for (const field of schema.required) {
                    if (!(field in data)) return false;
                }
            }
            
            if (schema.properties) {
                for (const [key, prop] of Object.entries(schema.properties)) {
                    if (key in data && !this.validateValue(data[key], prop as any)) {
                        return false;
                    }
                }
            }
        }
        
        return true;
    }

    private validateValue(value: any, schema: JSONSchemaProperty): boolean {
        // Type validation
        switch (schema.type) {
            case 'string':
                if (typeof value !== 'string') return false;
                if (schema.minLength && value.length < schema.minLength) return false;
                if (schema.maxLength && value.length > schema.maxLength) return false;
                if (schema.pattern && !new RegExp(schema.pattern).test(value)) return false;
                break;
                
            case 'number':
            case 'integer':
                if (typeof value !== 'number') return false;
                if (schema.minimum !== undefined && value < schema.minimum) return false;
                if (schema.maximum !== undefined && value > schema.maximum) return false;
                break;
                
            case 'boolean':
                if (typeof value !== 'boolean') return false;
                break;
                
            case 'array':
                if (!Array.isArray(value)) return false;
                if (schema.minItems && value.length < schema.minItems) return false;
                if (schema.maxItems && value.length > schema.maxItems) return false;
                break;
                
            case 'object':
                if (typeof value !== 'object' || value === null) return false;
                break;
        }
        
        return true;
    }

    // ============ Utility ============

    async importFromFile(filepath: string): Promise<any> {
        const fs = await import('fs-extra');
        const content = await fs.readFile(filepath, 'utf8');
        return this.deserialize(content);
    }

    async exportToFile(filepath: string, data: any): Promise<void> {
        const fs = await import('fs-extra');
        const content = this.serialize(data);
        await fs.writeFile(filepath, content);
    }

    clone<T>(data: T): T {
        return JSON.parse(JSON.stringify(data));
    }

    merge<T>(target: T, source: Partial<T>): T {
        return { ...target, ...source };
    }

    diff(obj1: any, obj2: any): JSONDiff {
        const changes: any[] = [];
        const added: string[] = [];
        const removed: string[] = [];
        const modified: Array<{ path: string; oldValue: any; newValue: any }> = [];

        this.deepDiff(obj1, obj2, '', changes, added, removed, modified);

        return {
            hasChanges: changes.length > 0,
            changes,
            added,
            removed,
            modified,
            summary: {
                total: changes.length,
                added: added.length,
                removed: removed.length,
                modified: modified.length
            }
        };
    }

    private deepDiff(
        obj1: any,
        obj2: any,
        path: string,
        changes: any[],
        added: string[],
        removed: string[],
        modified: Array<{ path: string; oldValue: any; newValue: any }>
    ): void {
        if (obj1 === obj2) return;

        if (!obj1) {
            changes.push({ type: 'added', path, value: obj2 });
            added.push(path);
            return;
        }

        if (!obj2) {
            changes.push({ type: 'removed', path, value: obj1 });
            removed.push(path);
            return;
        }

        if (typeof obj1 !== 'object' || typeof obj2 !== 'object') {
            if (obj1 !== obj2) {
                changes.push({ type: 'modified', path, oldValue: obj1, newValue: obj2 });
                modified.push({ path, oldValue: obj1, newValue: obj2 });
            }
            return;
        }

        const keys1 = Object.keys(obj1);
        const keys2 = Object.keys(obj2);
        const allKeys = new Set([...keys1, ...keys2]);

        for (const key of allKeys) {
            const newPath = path ? `${path}.${key}` : key;
            
            if (!keys1.includes(key)) {
                changes.push({ type: 'added', path: newPath, value: obj2[key] });
                added.push(newPath);
            } else if (!keys2.includes(key)) {
                changes.push({ type: 'removed', path: newPath, value: obj1[key] });
                removed.push(newPath);
            } else {
                this.deepDiff(obj1[key], obj2[key], newPath, changes, added, removed, modified);
            }
        }
    }
}

export interface JSONSchema {
    type: 'object';
    properties?: Record<string, JSONSchemaProperty>;
    required?: string[];
    additionalProperties?: boolean;
}

export interface JSONSchemaProperty {
    type: 'string' | 'number' | 'integer' | 'boolean' | 'array' | 'object' | 'null';
    format?: string;
    pattern?: string;
    minLength?: number;
    maxLength?: number;
    minimum?: number;
    maximum?: number;
    minItems?: number;
    maxItems?: number;
    items?: JSONSchemaProperty;
    properties?: Record<string, JSONSchemaProperty>;
}

export interface JSONDiff {
    hasChanges: boolean;
    changes: any[];
    added: string[];
    removed: string[];
    modified: Array<{ path: string; oldValue: any; newValue: any }>;
    summary: {
        total: number;
        added: number;
        removed: number;
        modified: number;
    };
}