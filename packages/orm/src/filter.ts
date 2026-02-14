export class FilterBuilder {
    private conditions: FilterCondition[] = [];
    private groups: FilterGroup[] = [];

    // ============ Basic Conditions ============

    equals(field: string, value: any): this {
        this.addCondition(field, '=', value);
        return this;
    }

    notEquals(field: string, value: any): this {
        this.addCondition(field, '<>', value);
        return this;
    }

    greaterThan(field: string, value: any): this {
        this.addCondition(field, '>', value);
        return this;
    }

    greaterThanOrEqual(field: string, value: any): this {
        this.addCondition(field, '>=', value);
        return this;
    }

    lessThan(field: string, value: any): this {
        this.addCondition(field, '<', value);
        return this;
    }

    lessThanOrEqual(field: string, value: any): this {
        this.addCondition(field, '<=', value);
        return this;
    }

    like(field: string, pattern: string): this {
        this.addCondition(field, 'LIKE', pattern);
        return this;
    }

    notLike(field: string, pattern: string): this {
        this.addCondition(field, 'NOT LIKE', pattern);
        return this;
    }

    in(field: string, values: any[]): this {
        this.addCondition(field, 'IN', values);
        return this;
    }

    notIn(field: string, values: any[]): this {
        this.addCondition(field, 'NOT IN', values);
        return this;
    }

    between(field: string, fromValue: any, toValue: any): this {
        this.conditions.push({
            type: 'between',
            field,
            operator: 'BETWEEN',
            value: fromValue,
            secondValue: toValue
        });
        return this;
    }

    isNull(field: string): this {
        this.addCondition(field, 'IS NULL', null);
        return this;
    }

    isNotNull(field: string): this {
        this.addCondition(field, 'IS NOT NULL', null);
        return this;
    }

    // ============ Date Filters ============

    today(field: string): this {
        return this.between(
            field,
            new Date(new Date().setHours(0, 0, 0, 0)),
            new Date(new Date().setHours(23, 59, 59, 999))
        );
    }

    yesterday(field: string): this {
        const date = new Date();
        date.setDate(date.getDate() - 1);
        return this.between(
            field,
            new Date(date.setHours(0, 0, 0, 0)),
            new Date(date.setHours(23, 59, 59, 999))
        );
    }

    thisWeek(field: string): this {
        const start = new Date();
        start.setDate(start.getDate() - start.getDay());
        start.setHours(0, 0, 0, 0);

        const end = new Date(start);
        end.setDate(end.getDate() + 6);
        end.setHours(23, 59, 59, 999);

        return this.between(field, start, end);
    }

    thisMonth(field: string): this {
        const start = new Date();
        start.setDate(1);
        start.setHours(0, 0, 0, 0);

        const end = new Date();
        end.setMonth(end.getMonth() + 1);
        end.setDate(0);
        end.setHours(23, 59, 59, 999);

        return this.between(field, start, end);
    }

    thisYear(field: string): this {
        const start = new Date();
        start.setMonth(0, 1);
        start.setHours(0, 0, 0, 0);

        const end = new Date();
        end.setMonth(11, 31);
        end.setHours(23, 59, 59, 999);

        return this.between(field, start, end);
    }

    lastDays(field: string, days: number): this {
        const start = new Date();
        start.setDate(start.getDate() - days);
        start.setHours(0, 0, 0, 0);

        return this.greaterThanOrEqual(field, start);
    }

    // ============ Logical Operators ============

    and(): this {
        this.groups.push({
            type: 'and',
            conditions: [...this.conditions]
        });
        this.conditions = [];
        return this;
    }

    or(): this {
        this.groups.push({
            type: 'or',
            conditions: [...this.conditions]
        });
        this.conditions = [];
        return this;
    }

    // ============ Build ============

    build(): FilterExpression {
        const allConditions = [...this.conditions];
        
        if (this.groups.length > 0) {
            this.groups.forEach(group => {
                group.conditions.forEach(cond => allConditions.push(cond));
            });
        }

        return {
            type: 'filter',
            conditions: allConditions,
            groups: this.groups,
            toString: () => this.buildSQL(),
            getParameters: () => this.getParameters()
        };
    }

    buildSQL(): string {
        const parts: string[] = [];

        // Add individual conditions
        this.conditions.forEach(cond => {
            parts.push(this.conditionToSQL(cond));
        });

        // Add groups
        this.groups.forEach(group => {
            const groupConditions = group.conditions.map(c => this.conditionToSQL(c));
            if (groupConditions.length > 0) {
                parts.push(`(${groupConditions.join(` ${group.type.toUpperCase()} `)})`);
            }
        });

        return parts.join(' AND ');
    }

    private conditionToSQL(condition: FilterCondition): string {
        const field = this.escapeField(condition.field);
        
        switch (condition.type) {
            case 'between':
                return `${field} BETWEEN ? AND ?`;
            case 'in':
            case 'not in':
                const placeholders = Array(condition.value.length).fill('?').join(', ');
                return `${field} ${condition.operator} (${placeholders})`;
            default:
                if (condition.operator === 'IS NULL' || condition.operator === 'IS NOT NULL') {
                    return `${field} ${condition.operator}`;
                }
                return `${field} ${condition.operator} ?`;
        }
    }

    private getParameters(): any[] {
        const params: any[] = [];

        const addParams = (cond: FilterCondition) => {
            if (cond.type === 'between') {
                params.push(cond.value, cond.secondValue);
            } else if (cond.type === 'in' || cond.type === 'not in') {
                params.push(...cond.value);
            } else if (cond.operator !== 'IS NULL' && cond.operator !== 'IS NOT NULL') {
                params.push(cond.value);
            }
        };

        this.conditions.forEach(addParams);
        this.groups.forEach(group => {
            group.conditions.forEach(addParams);
        });

        return params;
    }

    private escapeField(field: string): string {
        if (field.includes('.')) {
            const [table, column] = field.split('.');
            return `[${table}].[${column}]`;
        }
        return `[${field}]`;
    }

    private addCondition(field: string, operator: string, value: any): void {
        this.conditions.push({
            type: operator.toLowerCase().replace(' ', '') as any,
            field,
            operator,
            value
        });
    }

    // ============ Static Factories ============

    static create(): FilterBuilder {
        return new FilterBuilder();
    }

    static parse(filterString: string): FilterExpression {
        const parser = new FilterParser();
        return parser.parse(filterString);
    }
}

export class FilterParser {
    parse(filterString: string): FilterExpression {
        // Parse AL-style filter expressions
        // Examples: 
        // - "Balance > 1000"
        // - "Status = 'Open' AND Amount > 500"
        // - "Name LIKE '*Smith*'"
        
        const conditions: FilterCondition[] = [];
        
        // Simple implementation - split by AND
        const parts = filterString.split(/\s+AND\s+/i);
        
        parts.forEach(part => {
            const condition = this.parseCondition(part.trim());
            if (condition) {
                conditions.push(condition);
            }
        });

        return {
            type: 'filter',
            conditions,
            groups: [],
            toString: () => filterString,
            getParameters: () => this.extractParameters(conditions)
        };
    }

    private parseCondition(condition: string): FilterCondition | null {
        // Match operators
        const operators = [
            { regex: /\s*=\s*/, operator: '=' },
            { regex: /\s*<>\s*/, operator: '<>' },
            { regex: /\s*>\s*/, operator: '>' },
            { regex: /\s*>=\s*/, operator: '>=' },
            { regex: /\s*<\s*/, operator: '<' },
            { regex: /\s*<=\s*/, operator: '<=' },
            { regex: /\s+LIKE\s+/i, operator: 'LIKE' },
            { regex: /\s+IN\s+/i, operator: 'IN' },
            { regex: /\s+IS NULL\s*/i, operator: 'IS NULL' },
            { regex: /\s+IS NOT NULL\s*/i, operator: 'IS NOT NULL' }
        ];

        for (const op of operators) {
            const parts = condition.split(op.regex);
            if (parts.length >= 2) {
                const field = parts[0].trim();
                let value: any = parts[1].trim();

                // Parse value
                if (value.startsWith("'") && value.endsWith("'")) {
                    value = value.slice(1, -1);
                } else if (!isNaN(Number(value))) {
                    value = Number(value);
                } else if (value.toLowerCase() === 'true') {
                    value = true;
                } else if (value.toLowerCase() === 'false') {
                    value = false;
                }

                return {
                    type: op.operator.toLowerCase().replace(' ', '') as any,
                    field,
                    operator: op.operator,
                    value
                };
            }
        }

        return null;
    }

    private extractParameters(conditions: FilterCondition[]): any[] {
        const params: any[] = [];
        conditions.forEach(cond => {
            if (cond.operator !== 'IS NULL' && cond.operator !== 'IS NOT NULL') {
                params.push(cond.value);
            }
        });
        return params;
    }
}

export interface FilterExpression {
    type: 'filter';
    conditions: FilterCondition[];
    groups: FilterGroup[];
    toString(): string;
    getParameters(): any[];
}

export interface FilterCondition {
    type: '=' | '<>' | '>' | '>=' | '<' | '<=' | 'like' | 'not like' | 'in' | 'not in' | 'between' | 'is null' | 'is not null';
    field: string;
    operator: string;
    value?: any;
    secondValue?: any;
}

export interface FilterGroup {
    type: 'and' | 'or';
    conditions: FilterCondition[];
}