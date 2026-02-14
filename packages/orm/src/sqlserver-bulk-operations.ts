import { Table as SqlTable, TYPES } from 'mssql';
import { SQLServerConnection } from '@nova/core/database/sqlserver-connection';
import { BulkInsertResult, BulkUpsertResult, BulkDeleteResult } from './sqlserver-provider';

export class SQLServerBulkOperations {
    private connection: SQLServerConnection;

    constructor(connection: SQLServerConnection) {
        this.connection = connection;
    }

    async bulkInsert(tableName: string, records: any[]): Promise<BulkInsertResult> {
        if (records.length === 0) {
            return {
                tableName,
                recordsInserted: 0,
                duration: 0,
                success: true
            };
        }

        const pool = await (this.connection as any).getPool();
        const startTime = Date.now();

        try {
            // Get table schema
            const schema = await this.connection.getTableSchema(tableName);
            
            // Create SQL Server table type
            const sqlTable = new SqlTable(tableName);
            
            // Add columns to table type
            schema.forEach(column => {
                const sqlType = this.mapToSqlType(column.DATA_TYPE);
                sqlTable.columns.add(column.COLUMN_NAME, sqlType, {
                    nullable: column.IS_NULLABLE === 'YES',
                    primaryKey: false
                });
            });

            // Add rows
            records.forEach(record => {
                const row: any[] = [];
                schema.forEach(column => {
                    row.push(record[column.COLUMN_NAME] ?? null);
                });
                sqlTable.rows.add(...row);
            });

            const request = pool.request();
            request.input('data', sqlTable);

            await request.query(`
                INSERT INTO ${tableName}
                SELECT * FROM @data
            `);

            const duration = Date.now() - startTime;

            return {
                tableName,
                recordsInserted: records.length,
                duration,
                success: true
            };
        } catch (error) {
            throw new Error(`Bulk insert failed: ${error.message}`);
        }
    }

    async bulkUpsert(tableName: string, records: any[], keyColumns: string[]): Promise<BulkUpsertResult> {
        if (records.length === 0) {
            return {
                tableName,
                recordsProcessed: 0,
                keyColumns,
                duration: 0,
                success: true
            };
        }

        const pool = await (this.connection as any).getPool();
        const tempTableName = `#temp_${Date.now()}`;
        const startTime = Date.now();

        try {
            // Get schema
            const schema = await this.connection.getTableSchema(tableName);
            
            // Create temp table
            await this.createTempTable(tempTableName, schema);

            // Bulk insert to temp table
            await this.bulkInsert(tempTableName, records);

            // Build merge query
            const mergeColumns = schema
                .map(col => col.COLUMN_NAME)
                .filter(col => !keyColumns.includes(col));

            const updateSet = mergeColumns
                .map(col => `Target.[${col}] = Source.[${col}]`)
                .join(', ');

            const insertColumns = schema.map(col => `[${col.COLUMN_NAME}]`).join(', ');
            const sourceColumns = schema.map(col => `Source.[${col.COLUMN_NAME}]`).join(', ');
            const keyCondition = keyColumns
                .map(col => `Target.[${col}] = Source.[${col}]`)
                .join(' AND ');

            const mergeQuery = `
                MERGE INTO [${tableName}] AS Target
                USING [${tempTableName}] AS Source
                ON ${keyCondition}
                WHEN MATCHED THEN
                    UPDATE SET ${updateSet}
                WHEN NOT MATCHED THEN
                    INSERT (${insertColumns})
                    VALUES (${sourceColumns});
            `;

            await this.connection.query(mergeQuery);
            const duration = Date.now() - startTime;

            return {
                tableName,
                recordsProcessed: records.length,
                keyColumns,
                duration,
                success: true
            };
        } catch (error) {
            throw new Error(`Bulk upsert failed: ${error.message}`);
        } finally {
            // Drop temp table
            try {
                await this.connection.query(`DROP TABLE IF EXISTS ${tempTableName}`);
            } catch (e) {
                // Ignore cleanup errors
            }
        }
    }

    async bulkDelete(tableName: string, ids: any[], idColumn: string): Promise<BulkDeleteResult> {
        if (ids.length === 0) {
            return {
                tableName,
                recordsDeleted: 0,
                duration: 0,
                success: true
            };
        }

        const pool = await (this.connection as any).getPool();
        const startTime = Date.now();

        try {
            // Create table parameter
            const idTable = new SqlTable('#ids');
            idTable.columns.add('Id', TYPES.NVarChar(50), { nullable: false });

            ids.forEach(id => {
                idTable.rows.add(String(id));
            });

            const request = pool.request();
            request.input('ids', idTable);

            await request.query(`
                DELETE FROM [${tableName}]
                WHERE [${idColumn}] IN (SELECT Id FROM @ids)
            `);

            const duration = Date.now() - startTime;

            return {
                tableName,
                recordsDeleted: ids.length,
                duration,
                success: true
            };
        } catch (error) {
            throw new Error(`Bulk delete failed: ${error.message}`);
        }
    }

    async bulkInsertWithIdentity(tableName: string, records: any[], identityColumn: string): Promise<BulkInsertResult> {
        const startTime = Date.now();

        try {
            // Turn on identity insert
            await this.connection.query(`SET IDENTITY_INSERT [${tableName}] ON`);

            const result = await this.bulkInsert(tableName, records);
            
            return {
                ...result,
                identityInsert: true,
                duration: Date.now() - startTime
            };
        } finally {
            // Turn off identity insert
            await this.connection.query(`SET IDENTITY_INSERT [${tableName}] OFF`);
        }
    }

    async bulkExport(tableName: string, batchSize: number = 10000): Promise<AsyncGenerator<any[]>> {
        let offset = 0;
        
        return (async function* (this: SQLServerBulkOperations) {
            while (true) {
                const result = await this.connection.query(`
                    SELECT *
                    FROM [${tableName}]
                    ORDER BY (SELECT NULL)
                    OFFSET ${offset} ROWS
                    FETCH NEXT ${batchSize} ROWS ONLY
                `);
                
                if (result.recordset.length === 0) break;
                
                yield result.recordset;
                offset += batchSize;
            }
        }).call(this);
    }

    async bulkTruncate(tableName: string): Promise<void> {
        await this.connection.query(`TRUNCATE TABLE [${tableName}]`);
    }

    private async createTempTable(tempTableName: string, schema: any[]): Promise<void> {
        const columnDefinitions = schema.map(col => {
            let def = `[${col.COLUMN_NAME}] ${col.DATA_TYPE}`;
            
            if (col.CHARACTER_MAXIMUM_LENGTH) {
                if (col.CHARACTER_MAXIMUM_LENGTH === -1) {
                    def += '(MAX)';
                } else {
                    def += `(${col.CHARACTER_MAXIMUM_LENGTH})`;
                }
            }
            
            if (col.NUMERIC_PRECISION && col.NUMERIC_SCALE !== undefined) {
                def += `(${col.NUMERIC_PRECISION}, ${col.NUMERIC_SCALE})`;
            }
            
            if (col.IS_NULLABLE === 'NO') {
                def += ' NOT NULL';
            }
            
            return def;
        }).join(', ');

        await this.connection.query(`
            CREATE TABLE ${tempTableName} (
                ${columnDefinitions}
            )
        `);
    }

    private mapToSqlType(dbType: string): any {
        const type = dbType.toLowerCase();
        
        const TYPES_MAP: Record<string, any> = {
            'int': TYPES.Int,
            'bigint': TYPES.BigInt,
            'smallint': TYPES.SmallInt,
            'tinyint': TYPES.TinyInt,
            'bit': TYPES.Bit,
            'decimal': TYPES.Decimal,
            'numeric': TYPES.Numeric,
            'money': TYPES.Money,
            'smallmoney': TYPES.SmallMoney,
            'float': TYPES.Float,
            'real': TYPES.Real,
            'date': TYPES.Date,
            'datetime': TYPES.DateTime,
            'datetime2': TYPES.DateTime2,
            'smalldatetime': TYPES.SmallDateTime,
            'time': TYPES.Time,
            'datetimeoffset': TYPES.DateTimeOffset,
            'char': TYPES.Char,
            'varchar': TYPES.VarChar,
            'text': TYPES.Text,
            'nchar': TYPES.NChar,
            'nvarchar': TYPES.NVarChar,
            'ntext': TYPES.NText,
            'binary': TYPES.Binary,
            'varbinary': TYPES.VarBinary,
            'image': TYPES.Image,
            'uniqueidentifier': TYPES.UniqueIdentifier,
            'xml': TYPES.Xml,
            'sql_variant': TYPES.Variant
        };

        return TYPES_MAP[type] || TYPES.NVarChar;
    }
}

export interface BulkInsertResult {
    tableName: string;
    recordsInserted: number;
    duration: number;
    success: boolean;
    identityInsert?: boolean;
}

export interface BulkUpsertResult {
    tableName: string;
    recordsProcessed: number;
    keyColumns: string[];
    duration: number;
    success: boolean;
}

export interface BulkDeleteResult {
    tableName: string;
    recordsDeleted: number;
    duration: number;
    success: boolean;
}