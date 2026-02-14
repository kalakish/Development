export class QueryBuilder {
    private table: string;
    private selectFields: string[] = [];
    private whereConditions: string[] = [];
    private whereParams: any[] = [];
    private joinClauses: string[] = [];
    private orderFields: string[] = [];
    private groupFields: string[] = [];
    private havingConditions: string[] = [];
    private limitValue?: number;
    private offsetValue?: number;
    private forUpdate: boolean = false;

    constructor(table: string) {
        this.table = table;
    }

    select(fields: string | string[]): this {
        if (typeof fields === 'string') {
            this.selectFields = fields.split(',').map(f => f.trim());
        } else {
            this.selectFields = fields;
        }
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
        this.joinClauses.push(`${type} JOIN ${table} ON ${condition}`);
        return this;
    }

    leftJoin(table: string, condition: string): this {
        return this.join(table, condition, 'LEFT');
    }

    orderBy(field: string, direction: 'ASC' | 'DESC' = 'ASC'): this {
        this.orderFields.push(`${field} ${direction}`);
        return this;
    }

    groupBy(fields: string | string[]): this {
        if (typeof fields === 'string') {
            this.groupFields = fields.split(',').map(f => f.trim());
        } else {
            this.groupFields = fields;
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

    limit(limit: number): this {
        this.limitValue = limit;
        return this;
    }

    offset(offset: number): this {
        this.offsetValue = offset;
        return this;
    }

    forUpdate(): this {
        this.forUpdate = true;
        return this;
    }

    build(): Query {
        let sql = 'SELECT ';
        
        // SELECT clause
        if (this.selectFields.length === 0) {
            sql += '*';
        } else {
            sql += this.selectFields.join(', ');
        }
        
        // FROM clause
        sql += ` FROM "${this.table}"`;
        
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
        
        // LIMIT clause
        if (this.limitValue !== undefined) {
            sql += ` LIMIT ${this.limitValue}`;
        }
        
        // OFFSET clause
        if (this.offsetValue !== undefined) {
            sql += ` OFFSET ${this.offsetValue}`;
        }
        
        // FOR UPDATE clause
        if (this.forUpdate) {
            sql += ' FOR UPDATE';
        }
        
        return {
            sql,
            params: [...this.whereParams]
        };
    }

    buildCount(): Query {
        const selectBackup = [...this.selectFields];
        
        this.selectFields = ['COUNT(*)'];
        
        const query = this.build();
        
        this.selectFields = selectBackup;
        
        return query;
    }

    buildInsert(data: Record<string, any>): Query {
        const fields = Object.keys(data);
        const values = fields.map((_, i) => `$${i + 1}`);
        const params = fields.map(f => data[f]);
        
        const sql = `INSERT INTO "${this.table}" (${fields.map(f => `"${f}"`).join(', ')}) 
                     VALUES (${values.join(', ')}) 
                     RETURNING *`;
        
        return { sql, params };
    }

    buildUpdate(data: Record<string, any>, primaryKey: string | string[]): Query {
        const fields = Object.keys(data);
        const setClause = fields.map((f, i) => `"${f}" = $${i + 1}`).join(', ');
        const params = fields.map(f => data[f]);
        
        let whereClause = '';
        let paramIndex = fields.length + 1;
        
        if (typeof primaryKey === 'string') {
            whereClause = `"${primaryKey}" = $${paramIndex}`;
            params.push(data[primaryKey]);
        } else {
            whereClause = primaryKey.map((key, i) => 
                `"${key}" = $${paramIndex + i}`
            ).join(' AND ');
            primaryKey.forEach(key => params.push(data[key]));
        }
        
        const sql = `UPDATE "${this.table}" SET ${setClause} 
                     WHERE ${whereClause} 
                     RETURNING *`;
        
        return { sql, params };
    }

    buildDelete(primaryKey: string | string[]): Query {
        let whereClause = '';
        const params: any[] = [];
        
        if (typeof primaryKey === 'string') {
            whereClause = `"${primaryKey}" = $1`;
        } else {
            whereClause = primaryKey.map((key, i) => 
                `"${key}" = $${i + 1}`
            ).join(' AND ');
        }
        
        const sql = `DELETE FROM "${this.table}" WHERE ${whereClause} RETURNING *`;
        
        return { sql, params };
    }
}

export interface Query {
    sql: string;
    params: any[];
}