import { EventEmitter } from 'events';
import { Parser, Builder } from 'xml2js';
import { Session } from '../core/session';
import { Record } from '../orm/record';

export class XMLPort extends EventEmitter {
    private session: Session;
    private metadata: XMLPortMetadata;
    private parser: Parser;
    private builder: Builder;
    private mappings: Map<string, FieldMapping> = new Map();

    constructor(metadata: XMLPortMetadata, session: Session) {
        super();
        this.metadata = metadata;
        this.session = session;
        this.parser = new Parser({
            explicitArray: false,
            explicitRoot: false,
            mergeAttrs: true
        });
        this.builder = new Builder({
            rootName: this.metadata.rootName || 'Root',
            xmldec: { version: '1.0', encoding: 'UTF-8' }
        });

        this.initializeMappings();
    }

    private initializeMappings(): void {
        for (const mapping of this.metadata.fieldMappings || []) {
            this.mappings.set(mapping.xmlPath, mapping);
        }
    }

    async import(xmlData: string | Buffer, options?: ImportOptions): Promise<ImportResult> {
        const result: ImportResult = {
            success: true,
            inserted: 0,
            updated: 0,
            skipped: 0,
            errors: [],
            warnings: [],
            startTime: new Date(),
            endTime: null
        };

        try {
            // Parse XML
            const parsed = await this.parser.parseStringPromise(xmlData.toString());
            
            // Execute pre-import trigger
            await this.executeTrigger('OnBeforeImport', parsed, options);

            // Process XML according to schema
            await this.processImport(parsed, result, options);

            // Execute post-import trigger
            await this.executeTrigger('OnAfterImport', result);

            result.endTime = new Date();
            result.success = result.errors.length === 0;

            this.emit('importCompleted', result);

        } catch (error) {
            result.success = false;
            result.errors.push({
                message: error.message,
                stack: error.stack,
                severity: 'error'
            });
            
            this.emit('importFailed', error);
        }

        return result;
    }

    async export(parameters?: ExportParameters): Promise<string> {
        try {
            // Execute pre-export trigger
            await this.executeTrigger('OnBeforeExport', parameters);

            // Get data from database
            const data = await this.getExportData(parameters);

            // Transform to XML structure
            const xmlObj = this.buildExportObject(data);

            // Build XML
            const xml = this.builder.buildObject(xmlObj);

            // Execute post-export trigger
            await this.executeTrigger('OnAfterExport', xml);

            this.emit('exportCompleted', {
                rowCount: this.getRowCount(data),
                timestamp: new Date()
            });

            return xml;

        } catch (error) {
            this.emit('exportFailed', error);
            throw error;
        }
    }

    private async processImport(
        data: any,
        result: ImportResult,
        options?: ImportOptions
    ): Promise<void> {
        const schema = this.metadata.schema;
        let currentNode = data;

        // Navigate to root element
        if (schema.rootPath) {
            for (const path of schema.rootPath) {
                currentNode = currentNode[path];
                if (!currentNode) break;
            }
        }

        // Process table elements
        for (const tableDef of schema.tables) {
            const tableElements = this.getArray(currentNode, tableDef.elementName);
            
            for (const element of tableElements) {
                try {
                    await this.processRecord(tableDef, element, options);
                    
                    if (options?.dryRun) {
                        result.skipped++;
                    } else {
                        result[this.getOperationType(element)]++;
                    }

                } catch (error) {
                    result.errors.push({
                        record: element,
                        message: error.message,
                        severity: 'error'
                    });

                    if (options?.stopOnError) {
                        throw error;
                    }
                }
            }
        }
    }

    private async processRecord(
        tableDef: TableDefinition,
        element: any,
        options?: ImportOptions
    ): Promise<void> {
        // Create record
        const record = this.session.createRecord(tableDef.tableName);

        // Map XML fields to record fields
        for (const [xmlField, dbField] of this.getFieldMappings(tableDef)) {
            const value = this.getNestedValue(element, xmlField);
            if (value !== undefined) {
                record.setField(dbField, this.convertValue(value, dbField));
            }
        }

        // Validate record
        record.validateAll();

        // Check if record exists
        const existing = await this.findExistingRecord(record, tableDef.keyFields);

        if (options?.dryRun) {
            // Just validate, don't save
            return;
        }

        if (existing) {
            // Update existing record
            await record.modify();
        } else {
            // Insert new record
            await record.insert();
        }
    }

    private async getExportData(parameters?: ExportParameters): Promise<any> {
        const data: any = {};

        for (const tableDef of this.metadata.schema.tables) {
            const record = this.session.createRecord(tableDef.tableName);

            // Apply filters
            if (parameters?.filters) {
                for (const filter of parameters.filters) {
                    if (filter.table === tableDef.tableName) {
                        record.setFilter(filter.expression);
                    }
                }
            }

            // Apply limits
            if (parameters?.limit) {
                // Apply limit
            }

            const rows = await record.findSet();
            
            // Transform data according to XML structure
            data[tableDef.elementName] = rows.map(row => {
                const element: any = {};
                
                for (const [xmlField, dbField] of this.getFieldMappings(tableDef)) {
                    this.setNestedValue(element, xmlField, row[dbField]);
                }
                
                return element;
            });
        }

        return data;
    }

    private buildExportObject(data: any): any {
        const root: any = {};

        if (this.metadata.schema.rootPath) {
            let current = root;
            
            for (let i = 0; i < this.metadata.schema.rootPath.length; i++) {
                const path = this.metadata.schema.rootPath[i];
                current[path] = i === this.metadata.schema.rootPath.length - 1 ? data : {};
                current = current[path];
            }
        } else {
            Object.assign(root, data);
        }

        return root;
    }

    private getArray(obj: any, key: string): any[] {
        const value = obj[key];
        if (!value) return [];
        return Array.isArray(value) ? value : [value];
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

    private getFieldMappings(tableDef: TableDefinition): Map<string, string> {
        const mappings = new Map<string, string>();

        for (const [xmlPath, mapping] of this.mappings) {
            if (mapping.tableName === tableDef.tableName) {
                mappings.set(xmlPath, mapping.fieldName);
            }
        }

        return mappings;
    }

    private async findExistingRecord(
        record: Record<any>,
        keyFields: string[]
    ): Promise<any> {
        if (!keyFields || keyFields.length === 0) return null;

        const filter = keyFields
            .map(field => `${field} = ${record.getField(field)}`)
            .join(' AND ');

        record.clearFilters();
        record.setFilter(filter);

        return record.findFirst();
    }

    private getOperationType(element: any): 'inserted' | 'updated' {
        // Determine if record is new or update
        return 'inserted'; // Simplified
    }

    private convertValue(value: any, fieldName: string): any {
        // Convert based on field type
        if (typeof value === 'string') {
            // Handle date strings
            if (this.isDateString(value)) {
                return new Date(value);
            }
            // Handle numbers
            if (!isNaN(Number(value))) {
                return Number(value);
            }
        }
        return value;
    }

    private isDateString(value: string): boolean {
        return !isNaN(Date.parse(value));
    }

    private async executeTrigger(triggerName: string, ...args: any[]): Promise<void> {
        const trigger = this.metadata.triggers?.find(t => t.name === triggerName);
        
        if (trigger && trigger.handler) {
            await trigger.handler(this, ...args);
        }
    }

    private getRowCount(data: any): number {
        let count = 0;
        
        for (const tableDef of this.metadata.schema.tables) {
            const rows = data[tableDef.elementName];
            if (Array.isArray(rows)) {
                count += rows.length;
            }
        }
        
        return count;
    }

    // Schema management
    addFieldMapping(xmlPath: string, tableName: string, fieldName: string): void {
        this.mappings.set(xmlPath, {
            xmlPath,
            tableName,
            fieldName
        });
    }

    removeFieldMapping(xmlPath: string): void {
        this.mappings.delete(xmlPath);
    }

    getFieldMappings(): FieldMapping[] {
        return Array.from(this.mappings.values());
    }

    validateSchema(xmlData: string): ValidationResult {
        const errors: ValidationError[] = [];

        // Validate against XSD if available
        if (this.metadata.schema.xsd) {
            // XSD validation implementation
        }

        return {
            valid: errors.length === 0,
            errors
        };
    }
}

export interface XMLPortMetadata {
    id: number;
    name: string;
    rootName?: string;
    schema: XMLSchema;
    fieldMappings?: FieldMapping[];
    triggers?: XMLTrigger[];
    properties?: Record<string, any>;
}

export interface XMLSchema {
    rootPath?: string[];
    tables: TableDefinition[];
    xsd?: string;
}

export interface TableDefinition {
    tableName: string;
    elementName: string;
    keyFields?: string[];
    fieldMappings?: Record<string, string>;
}

export interface FieldMapping {
    xmlPath: string;
    tableName: string;
    fieldName: string;
    defaultValue?: any;
    required?: boolean;
    converter?: (value: any) => any;
}

export interface XMLTrigger {
    name: string;
    handler: Function;
}

export interface ImportOptions {
    dryRun?: boolean;
    stopOnError?: boolean;
    batchSize?: number;
    validateOnly?: boolean;
    encoding?: string;
}

export interface ExportParameters {
    filters?: ExportFilter[];
    limit?: number;
    encoding?: string;
    prettyPrint?: boolean;
}

export interface ExportFilter {
    table: string;
    expression: string;
}

export interface ImportResult {
    success: boolean;
    inserted: number;
    updated: number;
    skipped: number;
    errors: ImportError[];
    warnings: ImportError[];
    startTime: Date;
    endTime: Date | null;
}

export interface ImportError {
    record?: any;
    message: string;
    stack?: string;
    severity: 'error' | 'warning';
}

export interface ValidationResult {
    valid: boolean;
    errors: ValidationError[];
}

export interface ValidationError {
    path: string;
    message: string;
    severity: 'error' | 'warning';
}