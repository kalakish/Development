import { FilterBuilder, FilterExpression } from './filter';

export class CriteriaBuilder<T> {
    private rootType: string;
    private filters: FilterBuilder;
    private selections: Selection[];
    private joins: Join[];
    private groupings: string[];
    private havings: string[];
    private sortings: Sort[];
    private pagination: Pagination;
    private distinct: boolean = false;

    constructor(rootType: string) {
        this.rootType = rootType;
        this.filters = FilterBuilder.create();
        this.selections = [];
        this.joins = [];
        this.groupings = [];
        this.havings = [];
        this.sortings = [];
        this.pagination = { page: 1, pageSize: 50 };
    }

    // ============ Selection ============

    select(field: string): this;
    select(fields: string[]): this;
    select(selection: Selection): this;
    select(arg: string | string[] | Selection): this {
        if (typeof arg === 'string') {
            this.selections.push({ type: 'field', field: arg });
        } else if (Array.isArray(arg)) {
            arg.forEach(f => this.selections.push({ type: 'field', field: f }));
        } else {
            this.selections.push(arg);
        }
        return this;
    }

    selectDistinct(): this {
        this.distinct = true;
        return this;
    }

    selectCount(field?: string, alias?: string): this {
        this.selections.push({
            type: 'aggregate',
            function: 'COUNT',
            field: field || '*',
            alias
        });
        return this;
    }

    selectSum(field: string, alias?: string): this {
        this.selections.push({
            type: 'aggregate',
            function: 'SUM',
            field,
            alias
        });
        return this;
    }

    selectAvg(field: string, alias?: string): this {
        this.selections.push({
            type: 'aggregate',
            function: 'AVG',
            field,
            alias
        });
        return this;
    }

    selectMin(field: string, alias?: string): this {
        this.selections.push({
            type: 'aggregate',
            function: 'MIN',
            field,
            alias
        });
        return this;
    }

    selectMax(field: string, alias?: string): this {
        this.selections.push({
            type: 'aggregate',
            function: 'MAX',
            field,
            alias
        });
        return this;
    }

    // ============ Filtering ============

    where(filter: (builder: FilterBuilder) => FilterBuilder): this;
    where(expression: string): this;
    where(filter: any): this {
        if (typeof filter === 'function') {
            this.filters = filter(this.filters);
        } else {
            this.filters.where(filter);
        }
        return this;
    }

    and(filter: (builder: FilterBuilder) => FilterBuilder): this {
        this.filters.and();
        return this.where(filter);
    }

    or(filter: (builder: FilterBuilder) => FilterBuilder): this {
        this.filters.or();
        return this.where(filter);
    }

    // ============ Joins ============

    join(table: string, condition: string): this {
        this.joins.push({ type: 'INNER', table, condition });
        return this;
    }

    leftJoin(table: string, condition: string): this {
        this.joins.push({ type: 'LEFT', table, condition });
        return this;
    }

    rightJoin(table: string, condition: string): this {
        this.joins.push({ type: 'RIGHT', table, condition });
        return this;
    }

    fullJoin(table: string, condition: string): this {
        this.joins.push({ type: 'FULL', table, condition });
        return this;
    }

    // ============ Grouping ============

    groupBy(field: string): this;
    groupBy(fields: string[]): this;
    groupBy(arg: string | string[]): this {
        if (typeof arg === 'string') {
            this.groupings.push(arg);
        } else {
            this.groupings.push(...arg);
        }
        return this;
    }

    having(condition: string): this {
        this.havings.push(condition);
        return this;
    }

    // ============ Sorting ============

    orderBy(field: string, direction: 'ASC' | 'DESC' = 'ASC'): this {
        this.sortings.push({ field, direction });
        return this;
    }

    orderByAsc(field: string): this {
        return this.orderBy(field, 'ASC');
    }

    orderByDesc(field: string): this {
        return this.orderBy(field, 'DESC');
    }

    // ============ Pagination ============

    page(page: number, pageSize?: number): this {
        this.pagination.page = page;
        if (pageSize) {
            this.pagination.pageSize = pageSize;
        }
        return this;
    }

    limit(limit: number): this {
        this.pagination.pageSize = limit;
        return this;
    }

    offset(offset: number): this {
        this.pagination.page = Math.floor(offset / (this.pagination.pageSize || 50)) + 1;
        return this;
    }

    // ============ Build ============

    build(): Criteria {
        return {
            rootType: this.rootType,
            selections: [...this.selections],
            distinct: this.distinct,
            filters: this.filters.build(),
            joins: [...this.joins],
            groupings: [...this.groupings],
            havings: [...this.havings],
            sortings: [...this.sortings],
            pagination: { ...this.pagination }
        };
    }

    toSQL(): string {
        const parts: string[] = [];

        // SELECT clause
        let selectClause = 'SELECT ';
        if (this.distinct) {
            selectClause += 'DISTINCT ';
        }

        if (this.selections.length === 0) {
            selectClause += '*';
        } else {
            const selectionParts = this.selections.map(s => {
                switch (s.type) {
                    case 'field':
                        return `[${s.field}]`;
                    case 'aggregate':
                        return `${s.function}(${s.field === '*' ? '*' : `[${s.field}]`})${s.alias ? ` AS [${s.alias}]` : ''}`;
                    case 'expression':
                        return `${s.expression}${s.alias ? ` AS [${s.alias}]` : ''}`;
                    default:
                        return '';
                }
            });
            selectClause += selectionParts.join(', ');
        }
        parts.push(selectClause);

        // FROM clause
        parts.push(`FROM [${this.rootType}]`);

        // JOIN clauses
        this.joins.forEach(join => {
            parts.push(`${join.type} JOIN [${join.table}] ON ${join.condition}`);
        });

        // WHERE clause
        const filterString = this.filters.build().toString();
        if (filterString) {
            parts.push(`WHERE ${filterString}`);
        }

        // GROUP BY clause
        if (this.groupings.length > 0) {
            parts.push(`GROUP BY ${this.groupings.map(g => `[${g}]`).join(', ')}`);
        }

        // HAVING clause
        if (this.havings.length > 0) {
            parts.push(`HAVING ${this.havings.join(' AND ')}`);
        }

        // ORDER BY clause
        if (this.sortings.length > 0) {
            parts.push(`ORDER BY ${this.sortings.map(s => `[${s.field}] ${s.direction}`).join(', ')}`);
        }

        // OFFSET/FETCH clause
        const offset = (this.pagination.page - 1) * this.pagination.pageSize;
        parts.push(`OFFSET ${offset} ROWS FETCH NEXT ${this.pagination.pageSize} ROWS ONLY`);

        return parts.join(' ');
    }
}

export interface Selection {
    type: 'field' | 'aggregate' | 'expression';
    field?: string;
    function?: 'COUNT' | 'SUM' | 'AVG' | 'MIN' | 'MAX';
    expression?: string;
    alias?: string;
}

export interface Join {
    type: 'INNER' | 'LEFT' | 'RIGHT' | 'FULL';
    table: string;
    condition: string;
}

export interface Sort {
    field: string;
    direction: 'ASC' | 'DESC';
}

export interface Pagination {
    page: number;
    pageSize: number;
}

export interface Criteria {
    rootType: string;
    selections: Selection[];
    distinct: boolean;
    filters: FilterExpression;
    joins: Join[];
    groupings: string[];
    havings: string[];
    sortings: Sort[];
    pagination: Pagination;
}