import { TYPES, ISqlType, IResult, ISOLATION_LEVEL } from 'mssql';
import { Record } from './record';
import { SQLServerConnection } from '@nova/core/database/sqlserver-connection';

export class SQLServerMapper {
    
    // ============ Type Mapping ============

    /**
     * Convert JavaScript value to SQL Server parameter type
     */
    toSQLType(value: any): ISqlType {
        if (value === null || value === undefined) {
            return TYPES.NVarChar(255);
        }

        switch (typeof value) {
            case 'string':
                if (this.isGuid(value)) {
                    return TYPES.UniqueIdentifier;
                }
                if (value.length > 4000) {
                    return TYPES.NVarChar(TYPES.MAX);
                }
                return TYPES.NVarChar(value.length || 255);
            
            case 'number':
                if (Number.isInteger(value)) {
                    if (value >= -2147483648 && value <= 2147483647) {
                        return TYPES.Int;
                    }
                    return TYPES.BigInt;
                }
                return TYPES.Decimal(18, 2);
            
            case 'boolean':
                return TYPES.Bit;
            
            case 'object':
                if (value === null) {
                    return TYPES.NVarChar(255);
                }
                if (value instanceof Date) {
                    return TYPES.DateTime2;
                }
                if (Buffer.isBuffer(value)) {
                    return TYPES.VarBinary(TYPES.MAX);
                }
                if (value instanceof Array) {
                    return TYPES.NVarChar(TYPES.MAX);
                }
                if (typeof value === 'object') {
                    return TYPES.NVarChar(TYPES.MAX);
                }
                return TYPES.NVarChar(255);
            
            default:
                return TYPES.NVarChar(255);
        }
    }

    /**
     * Convert NOVA data type to SQL Server data type
     */
    toSQLServerType(dataType: string, length?: number, precision?: number, scale?: number): ISqlType {
        switch (dataType) {
            case 'Integer':
                return TYPES.Int;
            case 'BigInteger':
                return TYPES.BigInt;
            case 'Decimal':
                return TYPES.Decimal(precision || 18, scale || 2);
            case 'Boolean':
                return TYPES.Bit;
            case 'Text':
                if (length && length > 0) {
                    if (length > 4000) {
                        return TYPES.NVarChar(TYPES.MAX);
                    }
                    return TYPES.NVarChar(length);
                }
                return TYPES.NVarChar(TYPES.MAX);
            case 'Code':
                return length ? TYPES.NChar(length) : TYPES.NChar(20);
            case 'Date':
                return TYPES.Date;
            case 'DateTime':
                return TYPES.DateTime2;
            case 'Time':
                return TYPES.Time;
            case 'Guid':
                return TYPES.UniqueIdentifier;
            case 'Blob':
            case 'Media':
                return TYPES.VarBinary(TYPES.MAX);
            case 'MediaSet':
                return TYPES.NVarChar(TYPES.MAX);
            case 'Option':
                return TYPES.Int;
            default:
                return TYPES.NVarChar(TYPES.MAX);
        }
    }

    /**
     * Convert SQL Server type to NOVA data type
     */
    toNovaDataType(sqlType: string): string {
        const type = sqlType.toLowerCase();
        
        if (type.includes('int') && !type.includes('unique')) {
            return 'Integer';
        }
        if (type.includes('bigint')) {
            return 'BigInteger';
        }
        if (type.includes('decimal') || type.includes('numeric') || type.includes('money')) {
            return 'Decimal';
        }
        if (type.includes('bit')) {
            return 'Boolean';
        }
        if (type.includes('date') && !type.includes('time')) {
            return 'Date';
        }
        if (type.includes('time') && !type.includes('date')) {
            return 'Time';
        }
        if (type.includes('datetime')) {
            return 'DateTime';
        }
        if (type.includes('uniqueidentifier')) {
            return 'Guid';
        }
        if (type.includes('char') || type.includes('text')) {
            return 'Text';
        }
        if (type.includes('binary') || type.includes('image') || type.includes('varbinary')) {
            return 'Blob';
        }
        
        return 'Text';
    }

    /**
     * Convert SQL Server value to JavaScript value
     */
    toJavaScriptValue(sqlType: string, value: any): any {
        if (value === null || value === undefined) {
            return null;
        }

        const type = sqlType.toLowerCase();
        
        // Numeric types
        if (['int', 'bigint', 'smallint', 'tinyint'].includes(type)) {
            return parseInt(value, 10);
        }
        
        if (['decimal', 'numeric', 'float', 'real', 'money', 'smallmoney'].includes(type)) {
            return parseFloat(value);
        }
        
        // Boolean
        if (type === 'bit') {
            return value === 1 || value === true;
        }
        
        // Date/Time
        if (['date', 'datetime', 'datetime2', 'smalldatetime', 'datetimeoffset'].includes(type)) {
            return value instanceof Date ? value : new Date(value);
        }
        
        // GUID
        if (type === 'uniqueidentifier') {
            return value.toString();
        }
        
        // Binary
        if (['binary', 'varbinary', 'image'].includes(type)) {
            return Buffer.isBuffer(value) ? value : Buffer.from(value);
        }
        
        // Default
        return value;
    }

    /**
     * Convert NOVA property name to SQL Server column name
     */
    toSQLColumnName(propertyName: string): string {
        // Add brackets and convert PascalCase to UPPER_SNAKE_CASE
        const columnName = propertyName
            .replace(/([A-Z])/g, '_$1')
            .toUpperCase()
            .replace(/^_/, '');
        
        return `[${columnName}]`;
    }

    /**
     * Convert SQL Server column name to NOVA property name
     */
    toNovaPropertyName(columnName: string): string {
        // Remove brackets and convert UPPER_SNAKE_CASE to PascalCase
        const name = columnName.replace(/\[|\]/g, '');
        return name
            .split('_')
            .map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
            .join('');
    }

    /**
     * Convert SQL Server table name to NOVA table name
     */
    toNovaTableName(sqlTableName: string): string {
        // Remove 'tbl_' prefix and brackets
        let name = sqlTableName.replace(/\[|\]/g, '');
        name = name.replace(/^tbl_/i, '');
        
        // Convert to PascalCase
        return name
            .split('_')
            .map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
            .join('');
    }

    /**
     * Convert NOVA table name to SQL Server table name
     */
    toSQLTableName(tableName: string): string {
        // Add 'tbl_' prefix and convert to PascalCase
        return `[tbl_${tableName}]`;
    }

    /**
     * Convert to SQL Server procedure name
     */
    toSQLProcedureName(name: string): string {
        return `[sp_${name}]`;
    }

    /**
     * Convert to SQL Server function name
     */
    toSQLFunctionName(name: string): string {
        return `[fn_${name}]`;
    }

    /**
     * Convert to SQL Server view name
     */
    toSQLViewName(name: string): string {
        return `[vw_${name}]`;
    }

    // ============ Query Building ============

    /**
     * Build SELECT query
     */
    buildSelectQuery(
        tableName: string, 
        columns?: string[], 
        where?: string, 
        orderBy?: string, 
        top?: number,
        offset?: number,
        fetch?: number,
        useNolock: boolean = true
    ): string {
        let query = 'SELECT ';
        
        // Add TOP clause
        if (top && top > 0) {
            query += `TOP ${top} `;
        }
        
        // Add columns
        if (columns && columns.length > 0) {
            query += columns.map(c => this.toSQLColumnName(c)).join(', ');
        } else {
            query += '*';
        }

        query += ` FROM ${this.toSQLTableName(tableName)}`;

        // WITH (NOLOCK) hint for read performance
        if (useNolock) {
            query += ' WITH (NOLOCK)';
        }

        // WHERE clause
        if (where) {
            query += ` WHERE ${where}`;
        }

        // ORDER BY clause
        if (orderBy) {
            query += ` ORDER BY ${orderBy}`;
        }

        // OFFSET/FETCH for pagination
        if (offset !== undefined && fetch !== undefined) {
            query += ` OFFSET ${offset} ROWS FETCH NEXT ${fetch} ROWS ONLY`;
        }

        return query;
    }

    /**
     * Build SELECT with column list
     */
    buildSelectWithColumns(
        tableName: string,
        columns: string[],
        where?: string,
        orderBy?: string,
        offset?: number,
        fetch?: number
    ): string {
        const selectColumns = columns.map(c => {
            if (c.includes(' as ') || c.includes('AS')) {
                return c; // Already has alias
            }
            return `${this.toSQLColumnName(c)} AS ${c}`;
        }).join(', ');

        return this.buildSelectQuery(tableName, [selectColumns], where, orderBy, undefined, offset, fetch);
    }

    /**
     * Build INSERT query
     */
    buildInsertQuery(
        tableName: string, 
        data: Record<string, any>, 
        outputIdentity: boolean = true
    ): { sql: string; params: any[] } {
        const columns = Object.keys(data);
        const values = columns.map((_, i) => `@p${i}`);
        const params = Object.values(data);

        let sql = `
            INSERT INTO ${this.toSQLTableName(tableName)} 
            (${columns.map(c => this.toSQLColumnName(c)).join(', ')})
            VALUES (${values.join(', ')})
        `;

        if (outputIdentity) {
            sql += '; SELECT SCOPE_IDENTITY() AS Id;';
        } else {
            sql += ';';
        }

        return { sql, params };
    }

    /**
     * Build INSERT query with OUTPUT clause
     */
    buildInsertWithOutput(
        tableName: string,
        data: Record<string, any>,
        outputColumns: string[]
    ): { sql: string; params: any[] } {
        const columns = Object.keys(data);
        const values = columns.map((_, i) => `@p${i}`);
        const params = Object.values(data);

        const outputClause = outputColumns
            .map(c => `INSERTED.${this.toSQLColumnName(c)} AS ${c}`)
            .join(', ');

        const sql = `
            INSERT INTO ${this.toSQLTableName(tableName)} 
            (${columns.map(c => this.toSQLColumnName(c)).join(', ')})
            OUTPUT ${outputClause}
            VALUES (${values.join(', ')});
        `;

        return { sql, params };
    }

    /**
     * Build INSERT BULK query using table-valued parameters
     */
    buildBulkInsertQuery(
        tableName: string, 
        records: Record<string, any>[]
    ): { sql: string; params: any[] } {
        if (records.length === 0) {
            throw new Error('No records to insert');
        }

        const columns = Object.keys(records[0]);
        const valueStrings: string[] = [];
        const params: any[] = [];

        records.forEach((record, recordIndex) => {
            const recordValues = columns.map((_, fieldIndex) => {
                const paramName = `@p${recordIndex}_${fieldIndex}`;
                params.push(record[columns[fieldIndex]]);
                return paramName;
            });
            valueStrings.push(`(${recordValues.join(', ')})`);
        });

        const sql = `
            INSERT INTO ${this.toSQLTableName(tableName)} 
            (${columns.map(c => this.toSQLColumnName(c)).join(', ')})
            VALUES ${valueStrings.join(', ')};
        `;

        return { sql, params };
    }

    /**
     * Build UPDATE query
     */
    buildUpdateQuery(
        tableName: string, 
        data: Record<string, any>, 
        where: string
    ): { sql: string; params: any[] } {
        const columns = Object.keys(data);
        const setClause = columns.map((col, i) => 
            `${this.toSQLColumnName(col)} = @p${i}`
        ).join(', ');
        
        const params = Object.values(data);

        const sql = `
            UPDATE ${this.toSQLTableName(tableName)} 
            SET ${setClause} 
            WHERE ${where};
        `;

        return { sql, params };
    }

    /**
     * Build UPDATE with OUTPUT clause
     */
    buildUpdateWithOutput(
        tableName: string,
        data: Record<string, any>,
        where: string,
        outputColumns: string[]
    ): { sql: string; params: any[] } {
        const columns = Object.keys(data);
        const setClause = columns.map((col, i) => 
            `${this.toSQLColumnName(col)} = @p${i}`
        ).join(', ');
        
        const params = Object.values(data);

        const outputClause = outputColumns
            .map(c => `INSERTED.${this.toSQLColumnName(c)} AS ${c}`)
            .join(', ');

        const sql = `
            UPDATE ${this.toSQLTableName(tableName)} 
            SET ${setClause} 
            OUTPUT ${outputClause}
            WHERE ${where};
        `;

        return { sql, params };
    }

    /**
     * Build DELETE query
     */
    buildDeleteQuery(
        tableName: string, 
        where: string
    ): string {
        return `DELETE FROM ${this.toSQLTableName(tableName)} WHERE ${where};`;
    }

    /**
     * Build DELETE with OUTPUT clause
     */
    buildDeleteWithOutput(
        tableName: string,
        where: string,
        outputColumns: string[]
    ): string {
        const outputClause = outputColumns
            .map(c => `DELETED.${this.toSQLColumnName(c)} AS ${c}`)
            .join(', ');

        return `
            DELETE FROM ${this.toSQLTableName(tableName)} 
            OUTPUT ${outputClause}
            WHERE ${where};
        `;
    }

    /**
     * Build SOFT DELETE query
     */
    buildSoftDeleteQuery(
        tableName: string, 
        where: string,
        deletedBy?: string
    ): { sql: string; params: any[] } {
        const params: any[] = [];
        let setClause = `[SystemDeletedAt] = GETUTCDATE()`;
        
        if (deletedBy) {
            setClause += `, [SystemDeletedBy] = @p0`;
            params.push(deletedBy);
        }

        const sql = `
            UPDATE ${this.toSQLTableName(tableName)} 
            SET ${setClause} 
            WHERE ${where};
        `;

        return { sql, params };
    }

    /**
     * Build RESTORE (undelete) query
     */
    buildRestoreQuery(
        tableName: string,
        where: string
    ): string {
        return `
            UPDATE ${this.toSQLTableName(tableName)} 
            SET [SystemDeletedAt] = NULL, [SystemDeletedBy] = NULL
            WHERE ${where};
        `;
    }

    /**
     * Build UPSERT query using MERGE
     */
    buildUpsertQuery(
        tableName: string, 
        data: Record<string, any>, 
        keyFields: string[]
    ): { sql: string; params: any[] } {
        const columns = Object.keys(data);
        const values = columns.map((_, i) => `@p${i}`);
        const params = Object.values(data);

        const updateColumns = columns
            .filter(col => !keyFields.includes(col) && col !== 'SystemCreatedAt' && col !== 'SystemId');

        const updateSet = updateColumns.length > 0 
            ? updateColumns.map(col => 
                `target.${this.toSQLColumnName(col)} = source.${this.toSQLColumnName(col)}`
              ).join(', ')
            : 'target.SystemModifiedAt = GETUTCDATE()';

        const sql = `
            MERGE INTO ${this.toSQLTableName(tableName)} AS target
            USING (SELECT ${values.join(', ')}) AS source (${columns.map(c => this.toSQLColumnName(c)).join(', ')})
            ON ${keyFields.map(f => `target.${this.toSQLColumnName(f)} = source.${this.toSQLColumnName(f)}`).join(' AND ')}
            WHEN MATCHED THEN
                UPDATE SET ${updateSet}, target.SystemModifiedAt = GETUTCDATE()
            WHEN NOT MATCHED THEN
                INSERT (${columns.map(c => this.toSQLColumnName(c)).join(', ')})
                VALUES (${columns.map(c => `source.${this.toSQLColumnName(c)}`).join(', ')})
            OUTPUT $action, INSERTED.SystemId AS Id;
        `;

        return { sql, params };
    }

    /**
     * Build MERGE query with custom logic
     */
    buildMergeQuery(
        targetTable: string,
        sourceTable: string,
        onCondition: string,
        updateSet: string,
        insertColumns: string[],
        sourceColumns: string[]
    ): string {
        return `
            MERGE INTO ${this.toSQLTableName(targetTable)} AS target
            USING ${this.toSQLTableName(sourceTable)} AS source
            ON ${onCondition}
            WHEN MATCHED THEN
                UPDATE SET ${updateSet}
            WHEN NOT MATCHED THEN
                INSERT (${insertColumns.map(c => this.toSQLColumnName(c)).join(', ')})
                VALUES (${sourceColumns.map(c => `source.${this.toSQLColumnName(c)}`).join(', ')})
            OUTPUT $action;
        `;
    }

    /**
     * Build COUNT query
     */
    buildCountQuery(
        tableName: string, 
        where?: string,
        useNolock: boolean = true
    ): string {
        let sql = `SELECT COUNT(*) AS TotalCount FROM ${this.toSQLTableName(tableName)}`;
        
        if (useNolock) {
            sql += ' WITH (NOLOCK)';
        }

        if (where) {
            sql += ` WHERE ${where}`;
        }

        return sql;
    }

    /**
     * Build EXISTS query
     */
    buildExistsQuery(
        tableName: string, 
        where: string,
        useNolock: boolean = true
    ): string {
        let sql = `SELECT CASE WHEN EXISTS (SELECT 1 FROM ${this.toSQLTableName(tableName)}`;
        
        if (useNolock) {
            sql += ' WITH (NOLOCK)';
        }

        sql += ` WHERE ${where}) THEN 1 ELSE 0 END AS ExistsFlag`;

        return sql;
    }

    /**
     * Build pagination query with OFFSET/FETCH
     */
    buildPaginationQuery(
        baseQuery: string, 
        page: number, 
        pageSize: number
    ): string {
        const offset = (page - 1) * pageSize;
        return `${baseQuery} OFFSET ${offset} ROWS FETCH NEXT ${pageSize} ROWS ONLY`;
    }

    /**
     * Build datetime filter
     */
    buildDateFilter(
        column: string,
        startDate?: Date,
        endDate?: Date
    ): { condition: string; params: any[] } {
        const params: any[] = [];
        let condition = '';

        if (startDate && endDate) {
            condition = `${this.toSQLColumnName(column)} BETWEEN @p0 AND @p1`;
            params.push(startDate, endDate);
        } else if (startDate) {
            condition = `${this.toSQLColumnName(column)} >= @p0`;
            params.push(startDate);
        } else if (endDate) {
            condition = `${this.toSQLColumnName(column)} <= @p0`;
            params.push(endDate);
        }

        return { condition, params };
    }

    /**
     * Build full-text search query
     */
    buildFullTextSearchQuery(
        tableName: string,
        columns: string[],
        searchTerm: string
    ): string {
        const searchColumns = columns.map(c => this.toSQLColumnName(c)).join(', ');
        
        return `
            SELECT *, 
                   FREETEXTTABLE(${this.toSQLTableName(tableName)}, (${searchColumns}), '${searchTerm.replace(/'/g, "''")}') AS FT
            FROM ${this.toSQLTableName(tableName)} 
            INNER JOIN FREETEXTTABLE(${this.toSQLTableName(tableName)}, (${searchColumns}), '${searchTerm.replace(/'/g, "''")}') AS FT
            ON ${this.toSQLTableName(tableName)}.[SystemId] = FT.[KEY]
            ORDER BY FT.[RANK] DESC;
        `;
    }

    // ============ Result Mapping ============

    /**
     * Map SQL Server result set to NOVA Record objects
     */
    mapToRecords<T = any>(
        result: IResult<any>, 
        tableMetadata: any,
        connection: SQLServerConnection
    ): Record<T>[] {
        if (!result.recordset || result.recordset.length === 0) {
            return [];
        }

        return result.recordset.map(row => {
            const record = new Record<T>(tableMetadata, null as any);
            
            // Map each column to record field
            Object.keys(row).forEach(columnName => {
                const propertyName = this.toNovaPropertyName(columnName);
                const sqlType = this.getColumnType(result, columnName);
                const value = this.toJavaScriptValue(sqlType, row[columnName]);
                
                (record as any).data[propertyName] = value;
            });
            
            (record as any).originalData = JSON.parse(JSON.stringify((record as any).data));
            (record as any).isNew = false;
            
            return record;
        });
    }

    /**
     * Map single row to Record object
     */
    mapToRecord<T = any>(
        result: IResult<any>, 
        tableMetadata: any,
        connection: SQLServerConnection
    ): Record<T> | null {
        if (!result.recordset || result.recordset.length === 0) {
            return null;
        }
        
        return this.mapToRecords(result, tableMetadata, connection)[0];
    }

    /**
     * Map to simple array of objects
     */
    mapToObjects<T = any>(result: IResult<any>): T[] {
        if (!result.recordset || result.recordset.length === 0) {
            return [];
        }

        return result.recordset.map(row => {
            const obj: any = {};
            
            Object.keys(row).forEach(columnName => {
                const propertyName = this.toNovaPropertyName(columnName);
                const sqlType = this.getColumnType(result, columnName);
                obj[propertyName] = this.toJavaScriptValue(sqlType, row[columnName]);
            });
            
            return obj as T;
        });
    }

    /**
     * Map to scalar value
     */
    mapToScalar<T = any>(result: IResult<any>): T | null {
        if (!result.recordset || result.recordset.length === 0) {
            return null;
        }

        const firstRow = result.recordset[0];
        const firstColumn = Object.keys(firstRow)[0];
        
        if (!firstColumn) {
            return null;
        }

        const sqlType = this.getColumnType(result, firstColumn);
        return this.toJavaScriptValue(sqlType, firstRow[firstColumn]) as T;
    }

    /**
     * Map to dictionary (key-value pairs)
     */
    mapToDictionary<T = any>(result: IResult<any>, keyColumn: string, valueColumn: string): Map<string, T> {
        const map = new Map<string, T>();

        if (!result.recordset || result.recordset.length === 0) {
            return map;
        }

        result.recordset.forEach(row => {
            const key = row[keyColumn]?.toString();
            const sqlType = this.getColumnType(result, valueColumn);
            const value = this.toJavaScriptValue(sqlType, row[valueColumn]);
            
            if (key) {
                map.set(key, value as T);
            }
        });

        return map;
    }

    /**
     * Map to grouped result
     */
    mapToGrouped<T = any>(
        result: IResult<any>, 
        groupKeyColumn: string
    ): Map<string, T[]> {
        const grouped = new Map<string, T[]>();

        if (!result.recordset || result.recordset.length === 0) {
            return grouped;
        }

        result.recordset.forEach(row => {
            const key = row[groupKeyColumn]?.toString();
            const sqlType = this.getColumnType(result, groupKeyColumn);
            const value = this.toJavaScriptValue(sqlType, row);
            
            if (key) {
                if (!grouped.has(key)) {
                    grouped.set(key, []);
                }
                grouped.get(key)!.push(value as T);
            }
        });

        return grouped;
    }

    // ============ Schema Generation ============

    /**
     * Generate CREATE TABLE statement
     */
    generateCreateTableStatement(
        tableName: string, 
        columns: any[], 
        primaryKey?: string[],
        indexes?: any[]
    ): string[] {
        const statements: string[] = [];
        const columnDefinitions: string[] = [];

        // Add column definitions
        columns.forEach(column => {
            columnDefinitions.push(this.generateColumnDefinition(column));
        });

        // Add primary key constraint
        if (primaryKey && primaryKey.length > 0) {
            const pkColumns = primaryKey.map(c => this.toSQLColumnName(c)).join(', ');
            columnDefinitions.push(
                `CONSTRAINT [PK_${tableName}] PRIMARY KEY CLUSTERED (${pkColumns})`
            );
        }

        // Add system columns if not present
        if (!columns.some(c => c.name === 'SystemId')) {
            columnDefinitions.push(
                `[SystemId] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [DF_${tableName}_SystemId] DEFAULT NEWID()`
            );
        }
        if (!columns.some(c => c.name === 'SystemCreatedAt')) {
            columnDefinitions.push(
                `[SystemCreatedAt] DATETIME2 NOT NULL CONSTRAINT [DF_${tableName}_CreatedAt] DEFAULT GETUTCDATE()`
            );
        }
        if (!columns.some(c => c.name === 'SystemCreatedBy')) {
            columnDefinitions.push(
                `[SystemCreatedBy] NVARCHAR(50) NULL`
            );
        }
        if (!columns.some(c => c.name === 'SystemModifiedAt')) {
            columnDefinitions.push(
                `[SystemModifiedAt] DATETIME2 NULL`
            );
        }
        if (!columns.some(c => c.name === 'SystemModifiedBy')) {
            columnDefinitions.push(
                `[SystemModifiedBy] NVARCHAR(50) NULL`
            );
        }
        if (!columns.some(c => c.name === 'SystemDeletedAt')) {
            columnDefinitions.push(
                `[SystemDeletedAt] DATETIME2 NULL`
            );
        }
        if (!columns.some(c => c.name === 'SystemDeletedBy')) {
            columnDefinitions.push(
                `[SystemDeletedBy] NVARCHAR(50) NULL`
            );
        }
        if (!columns.some(c => c.name === 'SystemRowVersion')) {
            columnDefinitions.push(
                `[SystemRowVersion] ROWVERSION NOT NULL`
            );
        }

        // Create table statement
        statements.push(`
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'${this.toSQLTableName(tableName)}') AND type in (N'U'))
BEGIN
    CREATE TABLE ${this.toSQLTableName(tableName)} (
        ${columnDefinitions.join(',\n        ')}
    );
    
    PRINT '✅ Table ${tableName} created successfully';
END
ELSE
BEGIN
    PRINT '📁 Table ${tableName} already exists';
END`);

        // Add indexes
        if (indexes) {
            indexes.forEach(index => {
                statements.push(this.generateIndexStatement(tableName, index));
            });
        }

        // Add SystemId index if not exists
        statements.push(`
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_${tableName}_SystemId' AND object_id = OBJECT_ID('${this.toSQLTableName(tableName)}'))
BEGIN
    CREATE NONCLUSTERED INDEX [IX_${tableName}_SystemId] ON ${this.toSQLTableName(tableName)} ([SystemId]);
    PRINT '✅ Index IX_${tableName}_SystemId created';
END`);

        // Add soft delete filter index
        statements.push(`
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_${tableName}_Active' AND object_id = OBJECT_ID('${this.toSQLTableName(tableName)}'))
BEGIN
    CREATE NONCLUSTERED INDEX [IX_${tableName}_Active] ON ${this.toSQLTableName(tableName)} ([SystemDeletedAt]) 
    WHERE [SystemDeletedAt] IS NULL;
    PRINT '✅ Index IX_${tableName}_Active created';
END`);

        return statements;
    }

    /**
     * Generate column definition
     */
    generateColumnDefinition(column: any): string {
        const parts: string[] = [];

        // Column name
        parts.push(this.toSQLColumnName(column.name));

        // Data type
        const sqlType = this.getSQLTypeDefinition(column);
        parts.push(sqlType);

        // Identity
        if (column.isIdentity) {
            parts.push('IDENTITY(1,1)');
        }

        // Nullability
        if (column.isNullable === false) {
            parts.push('NOT NULL');
        } else {
            parts.push('NULL');
        }

        // Default value
        if (column.defaultValue !== undefined && column.defaultValue !== null) {
            parts.push(`CONSTRAINT [DF_${tableName}_${column.name}] DEFAULT ${this.formatDefaultValue(column.defaultValue)}`);
        }

        // Collation for text fields
        if (column.dataType === 'Text' || column.dataType === 'Code') {
            parts.push('COLLATE SQL_Latin1_General_CP1_CI_AS');
        }

        // Column description (via extended property)
        if (column.description) {
            // This will be added as a separate statement
        }

        return parts.join(' ');
    }

    /**
     * Generate index statement
     */
    generateIndexStatement(tableName: string, index: any): string {
        const indexName = `[IX_${tableName}_${index.fields.join('_')}]`;
        const unique = index.unique ? 'UNIQUE ' : '';
        const clustered = index.clustered ? 'CLUSTERED' : 'NONCLUSTERED';
        const fields = index.fields.map((f: string) => this.toSQLColumnName(f)).join(', ');
        const include = index.include?.map((f: string) => this.toSQLColumnName(f)).join(', ');
        const where = index.where ? ` WHERE ${index.where}` : '';

        return `
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = '${indexName.replace(/\[|\]/g, '')}' AND object_id = OBJECT_ID('${this.toSQLTableName(tableName)}'))
BEGIN
    CREATE ${unique}${clustered} INDEX ${indexName} ON ${this.toSQLTableName(tableName)} (${fields})${include ? ` INCLUDE (${include})` : ''}${where};
    PRINT '✅ Index ${indexName} created';
END`;
    }

    /**
     * Generate foreign key constraint
     */
    generateForeignKeyStatement(
        tableName: string,
        columnName: string,
        referencedTable: string,
        referencedColumn: string = 'SystemId'
    ): string {
        const fkName = `[FK_${tableName}_${columnName}]`;

        return `
IF NOT EXISTS (SELECT * FROM sys.foreign_keys WHERE name = '${fkName.replace(/\[|\]/g, '')}')
BEGIN
    ALTER TABLE ${this.toSQLTableName(tableName)} WITH CHECK 
    ADD CONSTRAINT ${fkName} FOREIGN KEY (${this.toSQLColumnName(columnName)})
    REFERENCES ${this.toSQLTableName(referencedTable)} (${this.toSQLColumnName(referencedColumn)})
    ON DELETE NO ACTION
    ON UPDATE NO ACTION;
    
    PRINT '✅ Foreign key ${fkName} created';
END`;
    }

    /**
     * Generate check constraint
     */
    generateCheckConstraint(
        tableName: string,
        constraintName: string,
        condition: string
    ): string {
        return `
IF NOT EXISTS (SELECT * FROM sys.check_constraints WHERE name = '${constraintName}')
BEGIN
    ALTER TABLE ${this.toSQLTableName(tableName)} WITH CHECK 
    ADD CONSTRAINT [${constraintName}] CHECK (${condition});
    
    PRINT '✅ Check constraint ${constraintName} created';
END`;
    }

    /**
     * Generate default constraint
     */
    generateDefaultConstraint(
        tableName: string,
        columnName: string,
        defaultValue: any
    ): string {
        const constraintName = `[DF_${tableName}_${columnName}]`;

        return `
IF NOT EXISTS (SELECT * FROM sys.default_constraints WHERE name = '${constraintName.replace(/\[|\]/g, '')}')
BEGIN
    ALTER TABLE ${this.toSQLTableName(tableName)} 
    ADD CONSTRAINT ${constraintName} DEFAULT ${this.formatDefaultValue(defaultValue)} FOR ${this.toSQLColumnName(columnName)};
    
    PRINT '✅ Default constraint ${constraintName} created';
END`;
    }

    /**
     * Generate stored procedure statement
     */
    generateProcedureStatement(
        procedureName: string,
        parameters: any[],
        body: string
    ): string {
        const paramDefinitions = parameters.map(p => {
            const typeDef = this.getSQLTypeDefinition(p);
            return `    @${p.name} ${typeDef}${p.isOutput ? ' OUTPUT' : ''}${p.defaultValue !== undefined ? ` = ${this.formatDefaultValue(p.defaultValue)}` : ''}`;
        }).join(',\n');

        return `
CREATE OR ALTER PROCEDURE ${this.toSQLProcedureName(procedureName)}
${paramDefinitions ? `\n${paramDefinitions}\n` : ''}
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;
    
    BEGIN TRY
        ${body}
    END TRY
    BEGIN CATCH
        DECLARE @ErrorMessage NVARCHAR(4000) = ERROR_MESSAGE();
        DECLARE @ErrorSeverity INT = ERROR_SEVERITY();
        DECLARE @ErrorState INT = ERROR_STATE();
        
        RAISERROR(@ErrorMessage, @ErrorSeverity, @ErrorState);
    END CATCH
END`;
    }

    /**
     * Generate function statement
     */
    generateFunctionStatement(
        functionName: string,
        parameters: any[],
        returnType: string,
        body: string
    ): string {
        const paramDefinitions = parameters.map(p => {
            const typeDef = this.getSQLTypeDefinition(p);
            return `    @${p.name} ${typeDef}`;
        }).join(',\n');

        return `
CREATE OR ALTER FUNCTION ${this.toSQLFunctionName(functionName)} 
(
${paramDefinitions}
)
RETURNS ${this.getSQLTypeDefinition({ dataType: returnType })}
AS
BEGIN
    ${body}
END`;
    }

    /**
     * Generate view statement
     */
    generateViewStatement(
        viewName: string,
        selectStatement: string
    ): string {
        return `
CREATE OR ALTER VIEW ${this.toSQLViewName(viewName)} 
AS
${selectStatement};
`;
    }

    /**
     * Generate trigger statement
     */
    generateTriggerStatement(
        triggerName: string,
        tableName: string,
        timing: 'AFTER' | 'INSTEAD OF',
        events: ('INSERT' | 'UPDATE' | 'DELETE')[],
        body: string
    ): string {
        return `
CREATE OR ALTER TRIGGER ${this.toSQLTriggerName(triggerName)}
ON ${this.toSQLTableName(tableName)}
${timing} ${events.join(', ')}
AS
BEGIN
    SET NOCOUNT ON;
    
    ${body}
END`;
    }

    /**
     * Convert to SQL Server trigger name
     */
    toSQLTriggerName(name: string): string {
        return `[trg_${name}]`;
    }

    // ============ Helper Methods ============

    /**
     * Check if string is a valid GUID
     */
    private isGuid(str: string): boolean {
        const guidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        return guidRegex.test(str);
    }

    /**
     * Get SQL type definition for column
     */
    private getSQLTypeDefinition(column: any): string {
        switch (column.dataType) {
            case 'Integer':
                return 'INT';
            case 'BigInteger':
                return 'BIGINT';
            case 'Decimal':
                return `DECIMAL(${column.precision || 18}, ${column.scale || 2})`;
            case 'Boolean':
                return 'BIT';
            case 'Text':
                if (column.length && column.length > 0) {
                    if (column.length > 4000) {
                        return 'NVARCHAR(MAX)';
                    }
                    return `NVARCHAR(${column.length})`;
                }
                return 'NVARCHAR(MAX)';
            case 'Code':
                return column.length ? `NCHAR(${column.length})` : 'NCHAR(20)';
            case 'Date':
                return 'DATE';
            case 'DateTime':
                return 'DATETIME2';
            case 'Time':
                return 'TIME';
            case 'Guid':
                return 'UNIQUEIDENTIFIER';
            case 'Blob':
            case 'Media':
                return 'VARBINARY(MAX)';
            case 'MediaSet':
                return 'NVARCHAR(MAX)';
            case 'Option':
                return 'INT';
            default:
                return 'NVARCHAR(MAX)';
        }
    }

    /**
     * Format default value for SQL
     */
    private formatDefaultValue(value: any): string {
        if (value === null) return 'NULL';
        if (typeof value === 'string') return `N'${value.replace(/'/g, "''")}'`;
        if (value instanceof Date) return `'${value.toISOString()}'`;
        if (typeof value === 'boolean') return value ? '1' : '0';
        if (typeof value === 'object') return `N'${JSON.stringify(value).replace(/'/g, "''")}'`;
        return value.toString();
    }

    /**
     * Get column type from result set metadata
     */
    private getColumnType(result: IResult<any>, columnName: string): string {
        if (result.columns && result.columns[columnName]) {
            return result.columns[columnName].type.declaration || 'nvarchar';
        }
        return 'nvarchar';
    }

    /**
     * Build parameter object for stored procedures
     */
    buildParameters(params: Record<string, any>): any[] {
        const parameters: any[] = [];
        
        Object.entries(params).forEach(([key, value]) => {
            parameters.push({
                name: key,
                type: this.toSQLType(value),
                value: value
            });
        });

        return parameters;
    }

    /**
     * Build TVP (Table-Valued Parameter) for bulk operations
     */
    buildTVP(tableName: string, records: Record<string, any>[]): any {
        // Implementation for table-valued parameters
        return {
            name: `@${tableName}TVP`,
            type: `dbo.${tableName}Type`,
            value: records
        };
    }

    // ============ Error Handling ============

    /**
     * Parse SQL Server error
     */
    parseError(error: any): SQLServerError {
        const parsedError: SQLServerError = {
            code: 'UNKNOWN_ERROR',
            message: error.message || 'Database error occurred',
            number: error.number,
            state: error.state,
            class: error.class,
            server: error.serverName,
            procedure: error.procName,
            lineNumber: error.lineNumber
        };

        // SQL Server specific error codes
        switch (error.number) {
            case 2627:
            case 2601:
                parsedError.code = 'DUPLICATE_KEY';
                parsedError.message = 'Duplicate key violation';
                break;
            case 547:
                parsedError.code = 'FOREIGN_KEY_VIOLATION';
                parsedError.message = 'Foreign key constraint violation';
                break;
            case 1205:
                parsedError.code = 'DEADLOCK';
                parsedError.message = 'Transaction deadlock detected';
                break;
            case 1222:
                parsedError.code = 'LOCK_TIMEOUT';
                parsedError.message = 'Lock request timeout exceeded';
                break;
            case 208:
                parsedError.code = 'INVALID_OBJECT';
                parsedError.message = 'Invalid table or view';
                break;
            case 8152:
                parsedError.code = 'STRING_TRUNCATION';
                parsedError.message = 'String or binary data would be truncated';
                break;
            case 8115:
                parsedError.code = 'ARITHMETIC_OVERFLOW';
                parsedError.message = 'Arithmetic overflow error';
                break;
            case 1202:
                parsedError.code = 'DEADLOCK_VICTIM';
                parsedError.message = 'Transaction was deadlocked';
                break;
            case 50000:
                parsedError.code = 'CUSTOM_ERROR';
                break;
            case 18456:
                parsedError.code = 'LOGIN_FAILED';
                parsedError.message = 'Login failed for user';
                break;
            case 4060:
                parsedError.code = 'INVALID_DATABASE';
                parsedError.message = 'Cannot open database requested';
                break;
        }

        return parsedError;
    }

    /**
     * Format error for user display
     */
    formatErrorMessage(error: SQLServerError): string {
        switch (error.code) {
            case 'DUPLICATE_KEY':
                return 'A record with this key already exists.';
            case 'FOREIGN_KEY_VIOLATION':
                return 'This record is referenced by other records and cannot be modified.';
            case 'DEADLOCK':
                return 'The operation was deadlocked. Please try again.';
            case 'LOCK_TIMEOUT':
                return 'The operation timed out. Please try again.';
            case 'INVALID_OBJECT':
                return 'The specified table or view does not exist.';
            case 'STRING_TRUNCATION':
                return 'The provided value exceeds the maximum length.';
            case 'ARITHMETIC_OVERFLOW':
                return 'The numeric value is too large.';
            default:
                return error.message;
        }
    }

    /**
     * Check if error is retryable
     */
    isRetryableError(error: any): boolean {
        const retryableCodes = [
            1205,  // Deadlock
            1222,  // Lock timeout
            1202,  // Deadlock victim
            4060,  // Database unavailable
            40143, // Connection error
            40197  // Service error
        ];

        return retryableCodes.includes(error.number);
    }
}

/**
 * SQL Server Error interface
 */
export interface SQLServerError {
    code: string;
    message: string;
    number?: number;
    state?: number;
    class?: number;
    server?: string;
    procedure?: string;
    lineNumber?: number;
}

/**
 * SQL Server Query Options
 */
export interface SQLServerQueryOptions {
    timeout?: number;
    readOnly?: boolean;
    isolationLevel?: keyof typeof ISOLATION_LEVEL;
    useNolock?: boolean;
    maxRows?: number;
}

/**
 * SQL Server Bulk Insert Options
 */
export interface SQLServerBulkOptions {
    batchSize?: number;
    checkConstraints?: boolean;
    fireTriggers?: boolean;
    keepNulls?: boolean;
    tableLock?: boolean;
}