export class SQLServerQueryBuilder {
    private table: string;
    private selectFields: string[] = [];
    private whereConditions: string[] = [];
    private whereParams: any[] = [];
    private joinClauses: string[] = [];
    private orderFields: string[] = [];
    private groupFields: string[] = [];
    private havingConditions: string[] = [];
    private topValue?: number;
    private offsetValue?: number;
    private fetchValue?: number;
    private withNoLock: boolean = false;

    constructor(table: string) {
        this.table = this.escapeIdentifier(table);
    }

    select(fields: string | string[]): this {
        if (typeof fields === 'string') {
            this.selectFields = fields.split(',').map(f => f.trim()).map(f => this.escapeIdentifier(f));
        } else {
            this.selectFields = fields.map(f => this.escapeIdentifier(f));
        }
        return this;
    }

    top(n: number): this {
        this.topValue = n;
        return this;
    }

    distinct(): this {
        this.selectFields = ['DISTINCT ' + (this.selectFields[0] || '*')];
        return this;
    }

    where(condition: string, params?: any[]): this {
        this.whereConditions.push(condition);
        if (params) {
            this.whereParams.push(...params);
        }
        return this;
    }

    andWhere(condition: string, params?: any[]): this {
        return this.where(condition, params);
    }

    orWhere(condition: string, params?: any[]): this {
        const lastIndex = this.whereConditions.length - 1;
        if (lastIndex >= 0) {
            this.whereConditions[lastIndex] = `(${this.whereConditions[lastIndex]} OR ${condition})`;
            if (params) {
                this.whereParams.push(...params);
            }
        } else {
            this.where(condition, params);
        }
        return this;
    }

    join(table: string, condition: string, type: 'INNER' | 'LEFT' | 'RIGHT' | 'FULL' = 'INNER'): this {
        this.joinClauses.push(`${type} JOIN ${this.escapeIdentifier(table)} ON ${condition}`);
        return this;
    }

    leftJoin(table: string, condition: string): this {
        return this.join(table, condition, 'LEFT');
    }

    rightJoin(table: string, condition: string): this {
        return this.join(table, condition, 'RIGHT');
    }

    fullJoin(table: string, condition: string): this {
        return this.join(table, condition, 'FULL');
    }

    orderBy(field: string, direction: 'ASC' | 'DESC' = 'ASC'): this {
        this.orderFields.push(`${this.escapeIdentifier(field)} ${direction}`);
        return this;
    }

    groupBy(fields: string | string[]): this {
        if (typeof fields === 'string') {
            this.groupFields = fields.split(',').map(f => f.trim()).map(f => this.escapeIdentifier(f));
        } else {
            this.groupFields = fields.map(f => this.escapeIdentifier(f));
        }
        return this;
    }

    having(condition: string, params?: any[]): this {
        this.havingConditions.push(condition);
        if (params) {
            this.whereParams.push(...params);
        }
        return this;
    }

    offset(offset: number): this {
        this.offsetValue = offset;
        return this;
    }

    fetch(fetch: number): this {
        this.fetchValue = fetch;
        return this;
    }

    withNoLock(): this {
        this.withNoLock = true;
        return this;
    }

    build(): Query {
        let sql = 'SELECT ';
        
        // TOP clause (SQL Server specific)
        if (this.topValue) {
            sql += `TOP ${this.topValue} `;
        }
        
        // SELECT clause
        if (this.selectFields.length === 0) {
            sql += '*';
        } else {
            sql += this.selectFields.join(', ');
        }
        
        // FROM clause
        sql += ` FROM ${this.table}`;
        
        // WITH (NOLOCK) hint
        if (this.withNoLock) {
            sql += ' WITH (NOLOCK)';
        }
        
        // JOIN clauses
        if (this.joinClauses.length > 0) {
            sql += ' ' + this.joinClauses.join(' ');
        }
        
        // WHERE clause
        if (this.whereConditions.length > 0) {
            sql += ' WHERE ' + this.whereConditions.join(' AND ');
        }
        
        // GROUP BY clause
        if (this.groupFields.length > 0) {
            sql += ' GROUP BY ' + this.groupFields.join(', ');
        }
        
        // HAVING clause
        if (this.havingConditions.length > 0) {
            sql += ' HAVING ' + this.havingConditions.join(' AND ');
        }
        
        // ORDER BY clause
        if (this.orderFields.length > 0) {
            sql += ' ORDER BY ' + this.orderFields.join(', ');
        }
        
        // OFFSET/FETCH clause (SQL Server 2012+)
        if (this.offsetValue !== undefined) {
            sql += ` OFFSET ${this.offsetValue} ROWS`;
            if (this.fetchValue !== undefined) {
                sql += ` FETCH NEXT ${this.fetchValue} ROWS ONLY`;
            }
        }
        
        return {
            sql,
            params: this.whereParams
        };
    }

    buildCount(): Query {
        // Save current select fields
        const selectBackup = [...this.selectFields];
        
        // Change to COUNT
        this.selectFields = ['COUNT(*) AS TotalCount'];
        
        // Remove ORDER BY for count query
        const orderBackup = [...this.orderFields];
        this.orderFields = [];
        
        const query = this.build();
        
        // Restore
        this.selectFields = selectBackup;
        this.orderFields = orderBackup;
        
        return query;
    }

    buildInsert(data: Record<string, any>, outputIdentity: boolean = true): Query {
        const fields = Object.keys(data).map(f => this.escapeIdentifier(f));
        const values = fields.map((_, i) => `@param${i}`);
        const params = Object.values(data);
        
        let sql = `INSERT INTO ${this.table} (${fields.join(', ')}) 
                   VALUES (${values.join(', ')})`;
        
        if (outputIdentity) {
            sql += '; SELECT SCOPE_IDENTITY() AS Id';
        }
        
        return { sql, params };
    }

    buildInsertBulk(records: Record<string, any>[]): Query {
        if (records.length === 0) {
            throw new Error('No records to insert');
        }

        const fields = Object.keys(records[0]).map(f => this.escapeIdentifier(f));
        const valueStrings: string[] = [];
        const params: any[] = [];

        records.forEach((record, recordIndex) => {
            const recordValues = fields.map((_, fieldIndex) => {
                const paramName = `@p${recordIndex}_${fieldIndex}`;
                params.push(record[fields[fieldIndex]]);
                return paramName;
            });
            valueStrings.push(`(${recordValues.join(', ')})`);
        });

        const sql = `INSERT INTO ${this.table} (${fields.join(', ')}) 
                     VALUES ${valueStrings.join(', ')}`;
        
        return { sql, params };
    }

    buildUpdate(data: Record<string, any>, condition: string): Query {
        const fields = Object.keys(data);
        const setClause = fields.map((f, i) => `${this.escapeIdentifier(f)} = @param${i}`).join(', ');
        const params = fields.map(f => data[f]);
        
        // Add condition parameters
        const sql = `UPDATE ${this.table} SET ${setClause} WHERE ${condition}`;
        
        return { sql, params };
    }

    buildDelete(condition: string): Query {
        const sql = `DELETE FROM ${this.table} WHERE ${condition}`;
        return { sql, params: [] };
    }

    buildTruncate(): Query {
        return {
            sql: `TRUNCATE TABLE ${this.table}`,
            params: []
        };
    }

    buildMerge(sourceTable: string, targetTable: string, matchCondition: string, updates: Record<string, string>): Query {
        let sql = `
            MERGE INTO ${this.escapeIdentifier(targetTable)} AS Target
            USING ${this.escapeIdentifier(sourceTable)} AS Source
            ON ${matchCondition}
        `;

        // WHEN MATCHED THEN UPDATE
        const updateSet = Object.entries(updates)
            .map(([target, source]) => `Target.${this.escapeIdentifier(target)} = Source.${this.escapeIdentifier(source)}`)
            .join(', ');
        
        if (updateSet) {
            sql += `\nWHEN MATCHED THEN UPDATE SET ${updateSet}`;
        }

        // WHEN NOT MATCHED THEN INSERT
        const insertFields = Object.keys(updates).map(f => this.escapeIdentifier(f)).join(', ');
        const sourceFields = Object.values(updates).map(f => `Source.${this.escapeIdentifier(f)}`).join(', ');
        
        sql += `\nWHEN NOT MATCHED THEN INSERT (${insertFields}) VALUES (${sourceFields});`;

        return { sql, params: [] };
    }

    private escapeIdentifier(identifier: string): string {
        // SQL Server uses square brackets for identifiers
        if (identifier.includes('[')) return identifier;
        return `[${identifier.replace(/\]/g, ']]')}]`;
    }
}

export interface Query {
    sql: string;
    params: any[];
}