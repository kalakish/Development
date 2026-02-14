import { Pool } from 'pg';
import { EventEmitter } from 'events';

export class Record<T = any> extends EventEmitter {
    private data: T;
    private originalData: T;
    private isNew: boolean = true;
    private filters: Filter[] = [];
    private currentPosition: number = -1;
    private records: T[] = [];

    constructor(
        private tableName: string,
        private schema: TableSchema,
        private dbPool: Pool
    ) {
        super();
        this.data = {} as T;
        this.originalData = {} as T;
    }

    // Record Methods
    async insert(): Promise<boolean> {
        await this.trigger('OnInsert', this);
        
        const query = this.buildInsertQuery();
        const result = await this.dbPool.query(query);
        
        if (result.rowCount > 0) {
            this.isNew = false;
            this.originalData = { ...this.data };
            await this.trigger('OnAfterInsert', this);
            return true;
        }
        
        return false;
    }

    async modify(): Promise<boolean> {
        await this.trigger('OnModify', this);
        
        const query = this.buildUpdateQuery();
        const result = await this.dbPool.query(query);
        
        if (result.rowCount > 0) {
            this.originalData = { ...this.data };
            await this.trigger('OnAfterModify', this);
            return true;
        }
        
        return false;
    }

    async delete(): Promise<boolean> {
        await this.trigger('OnDelete', this);
        
        const query = this.buildDeleteQuery();
        const result = await this.dbPool.query(query);
        
        if (result.rowCount > 0) {
            await this.trigger('OnAfterDelete', this);
            return true;
        }
        
        return false;
    }

    async find(primaryKey: any): Promise<T | null> {
        const query = `SELECT * FROM ${this.tableName} WHERE id = $1`;
        const result = await this.dbPool.query(query, [primaryKey]);
        
        if (result.rows.length > 0) {
            this.data = result.rows[0];
            this.originalData = { ...this.data };
            this.isNew = false;
            await this.trigger('OnAfterGetRecord', this);
            return this.data;
        }
        
        return null;
    }

    async findSet(filter?: Filter[]): Promise<T[]> {
        let query = `SELECT * FROM ${this.tableName}`;
        const params: any[] = [];
        
        if (filter || this.filters.length > 0) {
            query += ' WHERE ' + this.buildWhereClause(filter || this.filters, params);
        }
        
        const result = await this.dbPool.query(query, params);
        this.records = result.rows;
        return this.records;
    }

    setRange(field: string, fromValue: any, toValue?: any): void {
        this.filters.push({
            field,
            operator: toValue ? 'BETWEEN' : '>=',
            value: fromValue,
            secondValue: toValue
        });
    }

    setFilter(filterExpression: string): void {
        // Parse filter expression (e.g., "Balance > 1000 AND Status = 'Open'")
        const parsedFilters = this.parseFilterExpression(filterExpression);
        this.filters.push(...parsedFilters);
    }

    validate(fieldName: string): boolean {
        const field = this.schema.fields.find(f => f.name === fieldName);
        if (!field) return true;
        
        const value = this.data[fieldName];
        
        // Run field validation triggers
        if (field.triggers?.OnValidate) {
            field.triggers.OnValidate(this, fieldName, value);
        }
        
        // Validate data type and constraints
        return this.validateFieldValue(field, value);
    }

    calcFields(...fieldNames: string[]): void {
        for (const fieldName of fieldNames) {
            const field = this.schema.fields.find(f => f.name === fieldName);
            if (field?.isFlowField) {
                this.data[fieldName] = this.calculateFlowField(field);
            }
        }
    }

    testField(fieldName: string, errorMessage?: string): void {
        if (!this.validate(fieldName)) {
            throw new Error(errorMessage || `Field ${fieldName} validation failed`);
        }
    }

    transferFields(source: Record<any>, fieldMapping?: Record<string, string>): void {
        const mapping = fieldMapping || {};
        
        for (const [sourceField, targetField] of Object.entries(mapping)) {
            if (source.data[sourceField] !== undefined) {
                this.data[targetField || sourceField] = source.data[sourceField];
            }
        }
    }

    reset(): void {
        this.data = {} as T;
        this.filters = [];
        this.currentPosition = -1;
    }

    // Private helper methods
    private async trigger(eventName: string, ...args: any[]): Promise<void> {
        const event = `${this.tableName}:${eventName}`;
        this.emit(event, ...args);
        
        // Global event dispatcher
        await EventDispatcher.getInstance().dispatch(event, ...args);
    }

    private buildInsertQuery(): string {
        const fields = Object.keys(this.data);
        const values = fields.map((_, i) => `$${i + 1}`);
        return `INSERT INTO ${this.tableName} (${fields.join(', ')}) 
                VALUES (${values.join(', ')}) RETURNING *`;
    }

    private buildUpdateQuery(): string {
        const fields = Object.keys(this.data).filter(f => this.data[f] !== this.originalData[f]);
        const setClause = fields.map((f, i) => `${f} = $${i + 2}`).join(', ');
        return `UPDATE ${this.tableName} SET ${setClause} WHERE id = $1 RETURNING *`;
    }

    private buildDeleteQuery(): string {
        return `DELETE FROM ${this.tableName} WHERE id = $1`;
    }

    private buildWhereClause(filters: Filter[], params: any[]): string {
        return filters.map((filter, index) => {
            params.push(filter.value);
            
            switch (filter.operator) {
                case 'BETWEEN':
                    params.push(filter.secondValue);
                    return `${filter.field} BETWEEN $${index * 2 + 1} AND $${index * 2 + 2}`;
                case 'LIKE':
                    return `${filter.field} LIKE $${index + 1}`;
                case 'IN':
                    return `${filter.field} = ANY($${index + 1})`;
                default:
                    return `${filter.field} ${filter.operator} $${index + 1}`;
            }
        }).join(' AND ');
    }

    private parseFilterExpression(expression: string): Filter[] {
        // Implementation of filter expression parser
        const filters: Filter[] = [];
        // Parse complex filter expressions
        return filters;
    }

    private validateFieldValue(field: FieldDefinition, value: any): boolean {
        // Data type validation
        // Length validation
        // Required field validation
        // Custom validation rules
        return true;
    }

    private calculateFlowField(field: FieldDefinition): any {
        // Calculate flow field value based on formula
        return null;
    }
}