import { Record } from './record';
import { FieldRef } from './fieldref';
import { SQLServerConnection } from '@nova/core/database/sqlserver-connection';
import { TableMetadata } from '@nova/metadata';

export class RecordRef {
    private tableId: number;
    private tableName: string;
    private connection: SQLServerConnection;
    private currentRecord?: Record<any>;
    private filters: Map<string, any> = new Map();
    private currentPosition: number = -1;
    private recordSet: any[] = [];

    constructor(tableId: number, tableName: string, connection: SQLServerConnection) {
        this.tableId = tableId;
        this.tableName = tableName;
        this.connection = connection;
    }

    // ============ Record Operations ============

    async get(recordId: string): Promise<boolean> {
        try {
            const result = await this.connection.query(
                `SELECT * FROM [${this.tableName}] 
                 WHERE [SystemId] = @param0 
                 AND [SystemDeletedAt] IS NULL`,
                [recordId]
            );

            if (result.recordset.length > 0) {
                this.currentRecord = new Record(
                    await this.getTableMetadata(),
                    null as any
                );
                this.currentRecord['data'] = result.recordset[0];
                this.currentRecord['originalData'] = { ...result.recordset[0] };
                this.currentRecord['isNew'] = false;
                return true;
            }

            return false;
        } catch (error) {
            throw new Error(`Failed to get record: ${error.message}`);
        }
    }

    async find(filter?: string): Promise<boolean> {
        try {
            let query = `SELECT * FROM [${this.tableName}] WHERE [SystemDeletedAt] IS NULL`;
            const params: any[] = [];

            // Apply filters
            if (filter) {
                query += ` AND ${filter}`;
            }

            this.filters.forEach((value, field) => {
                query += ` AND [${field}] = @param${params.length}`;
                params.push(value);
            });

            const result = await this.connection.query(query, params);

            if (result.recordset.length > 0) {
                this.recordSet = result.recordset;
                this.currentPosition = 0;
                this.currentRecord = new Record(
                    await this.getTableMetadata(),
                    null as any
                );
                this.currentRecord['data'] = result.recordset[0];
                this.currentRecord['originalData'] = { ...result.recordset[0] };
                this.currentRecord['isNew'] = false;
                return true;
            }

            return false;
        } catch (error) {
            throw new Error(`Failed to find record: ${error.message}`);
        }
    }

    async findSet(filter?: string): Promise<any[]> {
        try {
            let query = `SELECT * FROM [${this.tableName}] WHERE [SystemDeletedAt] IS NULL`;
            const params: any[] = [];

            if (filter) {
                query += ` AND ${filter}`;
            }

            this.filters.forEach((value, field) => {
                query += ` AND [${field}] = @param${params.length}`;
                params.push(value);
            });

            const result = await this.connection.query(query, params);
            this.recordSet = result.recordset;
            return this.recordSet;
        } catch (error) {
            throw new Error(`Failed to find record set: ${error.message}`);
        }
    }

    async next(): Promise<boolean> {
        if (this.currentPosition === -1 || this.currentPosition >= this.recordSet.length - 1) {
            return false;
        }

        this.currentPosition++;
        
        if (!this.currentRecord) {
            this.currentRecord = new Record(
                await this.getTableMetadata(),
                null as any
            );
        }

        this.currentRecord['data'] = this.recordSet[this.currentPosition];
        this.currentRecord['originalData'] = { ...this.recordSet[this.currentPosition] };
        
        return true;
    }

    async previous(): Promise<boolean> {
        if (this.currentPosition <= 0) {
            return false;
        }

        this.currentPosition--;
        
        if (!this.currentRecord) {
            this.currentRecord = new Record(
                await this.getTableMetadata(),
                null as any
            );
        }

        this.currentRecord['data'] = this.recordSet[this.currentPosition];
        this.currentRecord['originalData'] = { ...this.recordSet[this.currentPosition] };
        
        return true;
    }

    async first(): Promise<boolean> {
        if (this.recordSet.length === 0) {
            return false;
        }

        this.currentPosition = 0;
        
        if (!this.currentRecord) {
            this.currentRecord = new Record(
                await this.getTableMetadata(),
                null as any
            );
        }

        this.currentRecord['data'] = this.recordSet[0];
        this.currentRecord['originalData'] = { ...this.recordSet[0] };
        
        return true;
    }

    async last(): Promise<boolean> {
        if (this.recordSet.length === 0) {
            return false;
        }

        this.currentPosition = this.recordSet.length - 1;
        
        if (!this.currentRecord) {
            this.currentRecord = new Record(
                await this.getTableMetadata(),
                null as any
            );
        }

        this.currentRecord['data'] = this.recordSet[this.currentPosition];
        this.currentRecord['originalData'] = { ...this.recordSet[this.currentPosition] };
        
        return true;
    }

    // ============ Field Operations ============

    field(index: number): FieldRef {
        if (!this.currentRecord) {
            throw new Error('No record loaded');
        }

        const metadata = this.currentRecord.getMetadata();
        const field = metadata.fields[index - 1];

        if (!field) {
            throw new Error(`Field at index ${index} does not exist`);
        }

        return this.currentRecord.field(field.name);
    }

    fieldByName(name: string): FieldRef {
        if (!this.currentRecord) {
            throw new Error('No record loaded');
        }

        return this.currentRecord.field(name);
    }

    // ============ Filter Operations ============

    setFilter(field: string, value: any): this {
        this.filters.set(field, value);
        return this;
    }

    setRange(field: string, fromValue: any, toValue?: any): this {
        this.filters.set(field, { from: fromValue, to: toValue });
        return this;
    }

    clearFilters(): this {
        this.filters.clear();
        return this;
    }

    // ============ Record State ============

    getRecord(): Record<any> | undefined {
        return this.currentRecord;
    }

    async count(): Promise<number> {
        try {
            const result = await this.connection.query(
                `SELECT COUNT(*) AS Count FROM [${this.tableName}] 
                 WHERE [SystemDeletedAt] IS NULL`
            );
            return result.recordset[0].Count;
        } catch (error) {
            throw new Error(`Failed to count records: ${error.message}`);
        }
    }

    isEmpty(): boolean {
        return !this.currentRecord;
    }

    isNull(): boolean {
        return !this.currentRecord;
    }

    // ============ Navigation ============

    async reset(): Promise<void> {
        this.currentRecord = undefined;
        this.currentPosition = -1;
        this.recordSet = [];
    }

    // ============ Metadata ============

    private async getTableMetadata(): Promise<TableMetadata> {
        // This would load from metadata manager
        return {
            id: this.tableId,
            name: this.tableName,
            fields: [],
            properties: {}
        } as TableMetadata;
    }

    // ============ Utility ============

    getPosition(): number {
        return this.currentPosition;
    }

    getRecordCount(): number {
        return this.recordSet.length;
    }

    getFilters(): Map<string, any> {
        return new Map(this.filters);
    }

    // ============ Reset Operations ============

    clear(): void {
        this.currentRecord = undefined;
        this.currentPosition = -1;
        this.recordSet = [];
        this.filters.clear();
    }
}