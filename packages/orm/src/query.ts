import { SQLServerConnection } from '@nova/core/database/sqlserver-connection';
import { SQLServerQueryBuilder } from './database/sqlserver-query-builder';
import { Session } from '@nova/core/session';

export class Query<T = any> {
    private connection: SQLServerConnection;
    private session: Session;
    private builder: SQLServerQueryBuilder;
    private metadata: QueryMetadata;
    private parameters: Map<string, any> = new Map();
    private results: T[] = [];
    private totalCount: number = 0;
    private executed: boolean = false;

    constructor(metadata: QueryMetadata, session: Session) {
        this.metadata = metadata;
        this.session = session;
        this.connection = session['connection'];
        this.builder = new SQLServerQueryBuilder(this.getMainTable());
    }

    // ============ Execution ============

    async execute(parameters?: Record<string, any>): Promise<T[]> {
        // Apply parameters
        if (parameters) {
            Object.entries(parameters).forEach(([key, value]) => {
                this.parameters.set(key, value);
            });
        }

        // Build query
        this.buildQuery();

        // Execute
        const query = this.builder.build();
        const result = await this.connection.query(query.sql, query.params);

        this.results = result.recordset;
        this.executed = true;

        // Get total count for pagination
        if (this.parameters.has('page') || this.parameters.has('pageSize')) {
            await this.getTotalCount();
        }

        return this.results;
    }

    async executeSingle(): Promise<T | null> {
        this.builder.top(1);
        const results = await this.execute();
        return results.length > 0 ? results[0] : null;
    }

    async paginate(page: number, pageSize: number): Promise<PaginatedResult<T>> {
        this.parameters.set('page', page);
        this.parameters.set('pageSize', pageSize);
        
        const results = await this.execute();
        const total = await this.getTotalCount();

        return {
            data: results,
            total,
            page,
            pageSize,
            totalPages: Math.ceil(total / pageSize),
            hasNext: page < Math.ceil(total / pageSize),
            hasPrevious: page > 1
        };
    }

    // ============ Query Building ============

    private buildQuery(): void {
        // Add SELECT columns
        this.addSelectColumns();

        // Add FROM/JOIN clauses
        this.addDataItems();

        // Add WHERE filters
        this.addFilters();

        // Add GROUP BY
        this.addGroupBy();

        // Add HAVING
        this.addHaving();

        // Add ORDER BY
        this.addOrderBy();

        // Add pagination
        this.addPagination();
    }

    private addSelectColumns(): void {
        const columns: string[] = [];

        for (const element of this.metadata.elements) {
            if (element.type === 'column') {
                columns.push(`[${element.table}].[${element.field}] AS [${element.alias || element.field}]`);
            } else if (element.type === 'aggregate') {
                columns.push(`${element.function}(${element.field}) AS [${element.alias}]`);
            } else if (element.type === 'expression') {
                columns.push(`${element.expression} AS [${element.alias}]`);
            }
        }

        if (columns.length === 0) {
            this.builder.select(['*']);
        } else {
            this.builder.select(columns);
        }
    }

    private addDataItems(): void {
        let mainTable = '';

        for (const element of this.metadata.elements) {
            if (element.type === 'dataitem') {
                if (!mainTable) {
                    // Main table
                    mainTable = element.tableName;
                    this.builder = new SQLServerQueryBuilder(mainTable);
                } else {
                    // Joined table
                    if (element.link) {
                        this.builder.leftJoin(
                            `[${element.tableName}]`,
                            `${this.resolveField(element.link.from)} = ${this.resolveField(element.link.to)}`
                        );
                    }
                }
            }
        }
    }

    private addFilters(): void {
        // Predefined filters from metadata
        for (const filter of this.metadata.filters || []) {
            let condition = filter.condition;
            
            // Replace parameter placeholders
            filter.parameters?.forEach((param, index) => {
                const value = this.parameters.get(param.name);
                if (value !== undefined) {
                    condition = condition.replace(`@${param.name}`, this.formatValue(value));
                }
            });

            this.builder.where(condition);
        }

        // Runtime filters
        if (this.parameters.has('filters')) {
            const filters = this.parameters.get('filters') as any[];
            filters.forEach(filter => {
                if (filter.condition) {
                    this.builder.where(filter.condition, filter.params);
                }
            });
        }
    }

    private addGroupBy(): void {
        if (this.metadata.groupBy && this.metadata.groupBy.length > 0) {
            const fields = this.metadata.groupBy.map(f => this.resolveField(f));
            this.builder.groupBy(fields);
        }
    }

    private addHaving(): void {
        if (this.metadata.having) {
            this.builder.having(this.metadata.having);
        }
    }

    private addOrderBy(): void {
        // Predefined order
        for (const order of this.metadata.orderBy || []) {
            this.builder.orderBy(
                this.resolveField(order.field),
                order.direction as 'ASC' | 'DESC'
            );
        }

        // Runtime order
        if (this.parameters.has('orderBy')) {
            const orders = this.parameters.get('orderBy') as any[];
            orders.forEach(order => {
                this.builder.orderBy(
                    this.resolveField(order.field),
                    order.direction as 'ASC' | 'DESC'
                );
            });
        }
    }

    private addPagination(): void {
        if (this.parameters.has('page') && this.parameters.has('pageSize')) {
            const page = this.parameters.get('page') as number;
            const pageSize = this.parameters.get('pageSize') as number;
            this.builder.offset((page - 1) * pageSize);
            this.builder.fetch(pageSize);
        } else if (this.parameters.has('limit')) {
            this.builder.top(this.parameters.get('limit') as number);
        }
    }

    private async getTotalCount(): Promise<number> {
        if (this.totalCount > 0) {
            return this.totalCount;
        }

        const countBuilder = this.builder.buildCount();
        const result = await this.connection.query(countBuilder.sql, countBuilder.params);
        
        this.totalCount = result.recordset[0].TotalCount;
        return this.totalCount;
    }

    private resolveField(field: string): string {
        if (field.includes('.')) {
            const [table, column] = field.split('.');
            return `[${table}].[${column}]`;
        }
        return `[${field}]`;
    }

    private formatValue(value: any): string {
        if (typeof value === 'string') return `'${value.replace(/'/g, "''")}'`;
        if (value instanceof Date) return `'${value.toISOString()}'`;
        if (typeof value === 'boolean') return value ? '1' : '0';
        if (value === null) return 'NULL';
        return value.toString();
    }

    private getMainTable(): string {
        for (const element of this.metadata.elements) {
            if (element.type === 'dataitem') {
                return element.tableName;
            }
        }
        throw new Error('No main table found in query');
    }

    // ============ Parameter Setters ============

    setParameter(name: string, value: any): this {
        this.parameters.set(name, value);
        return this;
    }

    setParameters(params: Record<string, any>): this {
        Object.entries(params).forEach(([key, value]) => {
            this.parameters.set(key, value);
        });
        return this;
    }

    setFilter(condition: string, params?: any[]): this {
        if (!this.parameters.has('filters')) {
            this.parameters.set('filters', []);
        }
        const filters = this.parameters.get('filters');
        filters.push({ condition, params });
        return this;
    }

    setOrderBy(field: string, direction: 'asc' | 'desc' = 'asc'): this {
        if (!this.parameters.has('orderBy')) {
            this.parameters.set('orderBy', []);
        }
        const orders = this.parameters.get('orderBy');
        orders.push({ field, direction: direction.toUpperCase() });
        return this;
    }

    setLimit(limit: number): this {
        this.parameters.set('limit', limit);
        return this;
    }

    setPage(page: number, pageSize: number = 50): this {
        this.parameters.set('page', page);
        this.parameters.set('pageSize', pageSize);
        return this;
    }

    // ============ Result Methods ============

    getResults(): T[] {
        return this.results;
    }

    getFirst(): T | null {
        return this.results.length > 0 ? this.results[0] : null;
    }

    getLast(): T | null {
        return this.results.length > 0 ? this.results[this.results.length - 1] : null;
    }

    isEmpty(): boolean {
        return this.results.length === 0;
    }

    count(): number {
        return this.results.length;
    }

    total(): number {
        return this.totalCount;
    }

    hasExecuted(): boolean {
        return this.executed;
    }

    // ============ Export Methods ============

    async toJSON(): Promise<string> {
        if (!this.executed) {
            await this.execute();
        }
        return JSON.stringify(this.results, null, 2);
    }

    async toCSV(): Promise<string> {
        if (!this.executed) {
            await this.execute();
        }

        if (this.results.length === 0) return '';

        const headers = Object.keys(this.results[0]);
        const rows = this.results.map(row =>
            headers.map(h => {
                const value = row[h];
                if (value === null || value === undefined) return '';
                if (typeof value === 'string') return `"${value.replace(/"/g, '""')}"`;
                return value;
            }).join(',')
        );

        return [headers.join(','), ...rows].join('\n');
    }

    async toXML(): Promise<string> {
        if (!this.executed) {
            await this.execute();
        }

        let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
        xml += '<QueryResult>\n';
        xml += `  <RecordCount>${this.results.length}</RecordCount>\n`;
        xml += '  <Records>\n';

        this.results.forEach((row, index) => {
            xml += `    <Record index="${index + 1}">\n`;
            Object.entries(row).forEach(([key, value]) => {
                xml += `      <${key}>${this.escapeXML(String(value))}</${key}>\n`;
            });
            xml += '    </Record>\n';
        });

        xml += '  </Records>\n';
        xml += '</QueryResult>';

        return xml;
    }

    private escapeXML(str: string): string {
        return str
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&apos;');
    }

    // ============ Reset Methods ============

    reset(): void {
        this.parameters.clear();
        this.results = [];
        this.totalCount = 0;
        this.executed = false;
        this.builder = new SQLServerQueryBuilder(this.getMainTable());
    }

    // ============ Metadata ============

    getMetadata(): QueryMetadata {
        return this.metadata;
    }

    getParameters(): Record<string, any> {
        return Object.fromEntries(this.parameters);
    }

    getSQL(): string {
        const query = this.builder.build();
        return query.sql;
    }
}

export interface QueryMetadata {
    id: number;
    name: string;
    description?: string;
    elements: QueryElement[];
    filters?: QueryFilter[];
    groupBy?: string[];
    having?: string;
    orderBy?: QueryOrder[];
    parameters?: QueryParameter[];
}

export type QueryElement = 
    | QueryDataItem
    | QueryColumn
    | QueryAggregate
    | QueryExpression;

export interface QueryDataItem {
    type: 'dataitem';
    name: string;
    tableName: string;
    link?: QueryLink;
}

export interface QueryColumn {
    type: 'column';
    name: string;
    table: string;
    field: string;
    alias?: string;
}

export interface QueryAggregate {
    type: 'aggregate';
    name: string;
    function: 'SUM' | 'AVG' | 'COUNT' | 'MIN' | 'MAX';
    field: string;
    alias: string;
}

export interface QueryExpression {
    type: 'expression';
    name: string;
    expression: string;
    alias: string;
}

export interface QueryLink {
    from: string;
    to: string;
}

export interface QueryFilter {
    name?: string;
    condition: string;
    parameters?: QueryParameter[];
}

export interface QueryParameter {
    name: string;
    type: string;
    required?: boolean;
    defaultValue?: any;
}

export interface QueryOrder {
    field: string;
    direction: 'ASC' | 'DESC';
}

export interface PaginatedResult<T> {
    data: T[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
    hasNext: boolean;
    hasPrevious: boolean;
}

export enum QueryType {
    Normal = 'normal',
    Static = 'static',
    API = 'api',
    Report = 'report'
}