import { EventEmitter } from 'events';
import { Session } from '@nova/core/session';
import { Record } from '@nova/orm/record';
import { SQLServerQueryBuilder } from '@nova/orm/database/sqlserver-query-builder';

export class ReportDataset extends EventEmitter {
    private name: string;
    private tableName: string;
    private session: Session;
    private record: Record<any>;
    private data: any[] = [];
    private filteredData: any[] = [];
    private columns: DatasetColumn[] = [];
    private relations: DatasetRelation[] = [];
    private parameters: Map<string, any> = new Map();
    private filters: ReportFilter[] = [];
    private sorts: ReportSort[] = [];
    private aggregates: Map<string, Aggregate> = new Map();
    private loaded: boolean = false;
    private totalCount: number = 0;

    constructor(
        name: string,
        tableName: string,
        session: Session,
        options?: DatasetOptions
    ) {
        super();
        this.name = name;
        this.tableName = tableName;
        this.session = session;
        this.record = session.createRecord(tableName);
        this.columns = options?.columns || [];
        this.relations = options?.relations || [];
    }

    // ============ Data Loading ============

    async load(): Promise<void> {
        const queryBuilder = new SQLServerQueryBuilder(this.tableName);

        // Add selected columns
        if (this.columns.length > 0) {
            const selectColumns = this.columns.map(col => 
                `[${col.source}] AS [${col.name}]`
            );
            queryBuilder.select(selectColumns);
        }

        // Add joins
        for (const relation of this.relations) {
            const joinType = relation.type.toUpperCase();
            queryBuilder.join(
                `[${relation.table}]`,
                relation.condition,
                joinType as any
            );
        }

        // Apply filters
        for (const filter of this.filters) {
            const condition = this.buildFilterCondition(filter);
            queryBuilder.where(condition);
        }

        // Apply parameters
        for (const [key, value] of this.parameters) {
            queryBuilder.where(`[${key}] = @${key}`, [value]);
        }

        // Apply sorting
        for (const sort of this.sorts) {
            queryBuilder.orderBy(
                `[${sort.field}]`,
                sort.direction.toUpperCase() as 'ASC' | 'DESC'
            );
        }

        const query = queryBuilder.build();
        const connection = await this.session.company.getConnection();
        const result = await connection.query(query.sql, query.params);

        this.data = result.recordset;
        this.filteredData = [...this.data];
        this.totalCount = this.data.length;
        this.loaded = true;

        this.emit('loaded', {
            datasetName: this.name,
            rowCount: this.data.length,
            timestamp: new Date()
        });
    }

    async reload(): Promise<void> {
        this.loaded = false;
        await this.load();
    }

    // ============ Filter Operations ============

    filter(filter: ReportFilter): this {
        this.filters.push(filter);
        
        if (this.loaded) {
            this.applyFilter(filter);
        }
        
        return this;
    }

    private applyFilter(filter: ReportFilter): void {
        this.filteredData = this.filteredData.filter(row => 
            this.evaluateFilter(row, filter)
        );

        this.emit('filtered', {
            datasetName: this.name,
            filter,
            remainingRows: this.filteredData.length
        });
    }

    private evaluateFilter(row: any, filter: ReportFilter): boolean {
        const value = this.getNestedValue(row, filter.field);

        switch (filter.operator) {
            case 'eq':
                return value === filter.value;
            case 'neq':
                return value !== filter.value;
            case 'gt':
                return value > filter.value;
            case 'gte':
                return value >= filter.value;
            case 'lt':
                return value < filter.value;
            case 'lte':
                return value <= filter.value;
            case 'like':
                return String(value).includes(String(filter.value));
            case 'in':
                return Array.isArray(filter.value) && filter.value.includes(value);
            case 'between':
                return value >= filter.value && value <= filter.secondValue;
            case 'isnull':
                return value === null || value === undefined;
            case 'isnotnull':
                return value !== null && value !== undefined;
            default:
                return true;
        }
    }

    private buildFilterCondition(filter: ReportFilter): string {
        const field = `[${filter.field}]`;

        switch (filter.operator) {
            case 'eq':
                return `${field} = '${filter.value}'`;
            case 'neq':
                return `${field} != '${filter.value}'`;
            case 'gt':
                return `${field} > ${filter.value}`;
            case 'gte':
                return `${field} >= ${filter.value}`;
            case 'lt':
                return `${field} < ${filter.value}`;
            case 'lte':
                return `${field} <= ${filter.value}`;
            case 'like':
                return `${field} LIKE '%${filter.value}%'`;
            case 'in':
                const values = filter.value.map((v: any) => `'${v}'`).join(', ');
                return `${field} IN (${values})`;
            case 'between':
                return `${field} BETWEEN ${filter.value} AND ${filter.secondValue}`;
            case 'isnull':
                return `${field} IS NULL`;
            case 'isnotnull':
                return `${field} IS NOT NULL`;
            default:
                return '1=1';
        }
    }

    clearFilters(): this {
        this.filters = [];
        
        if (this.loaded) {
            this.filteredData = [...this.data];
        }
        
        return this;
    }

    // ============ Sort Operations ============

    sort(sort: ReportSort): this {
        this.sorts.push(sort);
        
        if (this.loaded) {
            this.applySort(sort);
        }
        
        return this;
    }

    private applySort(sort: ReportSort): void {
        this.filteredData.sort((a, b) => {
            const aVal = a[sort.field];
            const bVal = b[sort.field];

            if (aVal === bVal) return 0;
            
            const comparison = aVal < bVal ? -1 : 1;
            return sort.direction === 'asc' ? comparison : -comparison;
        });

        this.emit('sorted', {
            datasetName: this.name,
            sort,
            timestamp: new Date()
        });
    }

    clearSorts(): this {
        this.sorts = [];
        return this;
    }

    // ============ Parameter Operations ============

    setParameter(name: string, value: any): this {
        this.parameters.set(name, value);
        return this;
    }

    getParameter(name: string): any {
        return this.parameters.get(name);
    }

    clearParameters(): this {
        this.parameters.clear();
        return this;
    }

    // ============ Column Operations ============

    addColumn(column: DatasetColumn): void {
        this.columns.push(column);
    }

    removeColumn(columnName: string): void {
        const index = this.columns.findIndex(c => c.name === columnName);
        if (index > -1) {
            this.columns.splice(index, 1);
        }
    }

    select(columns: string[]): this {
        if (!this.loaded) return this;

        this.filteredData = this.filteredData.map(row => {
            const selected: any = {};
            
            for (const col of columns) {
                selected[col] = this.getNestedValue(row, col);
            }
            
            return selected;
        });

        return this;
    }

    // ============ Aggregation Operations ============

    aggregate(field: string, type: AggregateType): this {
        this.aggregates.set(field, {
            field,
            type,
            value: null
        });
        
        return this;
    }

    calculateAggregates(): Map<string, any> {
        const results = new Map<string, any>();

        for (const [field, aggregate] of this.aggregates) {
            const values = this.filteredData
                .map(row => row[field])
                .filter(v => v !== null && v !== undefined);

            if (values.length === 0) {
                results.set(field, null);
                continue;
            }

            switch (aggregate.type) {
                case 'sum':
                    results.set(field, values.reduce((a, b) => a + b, 0));
                    break;
                case 'avg':
                    results.set(field, values.reduce((a, b) => a + b, 0) / values.length);
                    break;
                case 'count':
                    results.set(field, values.length);
                    break;
                case 'min':
                    results.set(field, Math.min(...values));
                    break;
                case 'max':
                    results.set(field, Math.max(...values));
                    break;
            }
        }

        return results;
    }

    // ============ Grouping Operations ============

    groupBy(fields: string[]): Map<string, any[]> {
        const groups = new Map<string, any[]>();

        for (const row of this.filteredData) {
            const key = fields.map(f => row[f]).join('|');
            
            if (!groups.has(key)) {
                groups.set(key, []);
            }
            
            groups.get(key)!.push(row);
        }

        return groups;
    }

    // ============ Join Operations ============

    join(dataset: ReportDataset, condition: (a: any, b: any) => boolean, type: 'inner' | 'left' = 'inner'): any[] {
        const result: any[] = [];

        for (const row1 of this.filteredData) {
            let matched = false;

            for (const row2 of dataset.getData()) {
                if (condition(row1, row2)) {
                    result.push({ ...row1, ...row2 });
                    matched = true;
                }
            }

            if (type === 'left' && !matched) {
                result.push({ ...row1 });
            }
        }

        return result;
    }

    // ============ Pagination ============

    page(pageNumber: number, pageSize: number): any[] {
        const start = (pageNumber - 1) * pageSize;
        const end = start + pageSize;
        
        return this.filteredData.slice(start, end);
    }

    // ============ Export ============

    async toJSON(): Promise<string> {
        return JSON.stringify(this.filteredData, null, 2);
    }

    async toCSV(): Promise<string> {
        if (this.filteredData.length === 0) return '';

        const headers = Object.keys(this.filteredData[0]);
        const rows = this.filteredData.map(row =>
            headers.map(h => {
                const value = row[h];
                if (value === null || value === undefined) return '';
                if (typeof value === 'string') return `"${value.replace(/"/g, '""')}"`;
                return value;
            }).join(',')
        );

        return [headers.join(','), ...rows].join('\n');
    }

    // ============ Utility ============

    private getNestedValue(obj: any, path: string): any {
        return path.split('.').reduce((current, key) => 
            current && current[key] !== undefined ? current[key] : undefined, obj
        );
    }

    // ============ Getters ============

    getName(): string {
        return this.name;
    }

    getTableName(): string {
        return this.tableName;
    }

    getData(): any[] {
        return this.filteredData;
    }

    getRawData(): any[] {
        return this.data;
    }

    getRowCount(): number {
        return this.filteredData.length;
    }

    getTotalCount(): number {
        return this.totalCount;
    }

    getColumns(): DatasetColumn[] {
        return [...this.columns];
    }

    getFilters(): ReportFilter[] {
        return [...this.filters];
    }

    getSorts(): ReportSort[] {
        return [...this.sorts];
    }

    isLoaded(): boolean {
        return this.loaded;
    }

    // ============ Reset ============

    reset(): void {
        this.data = [];
        this.filteredData = [];
        this.filters = [];
        this.sorts = [];
        this.parameters.clear();
        this.aggregates.clear();
        this.loaded = false;
    }
}

export interface DatasetOptions {
    columns?: DatasetColumn[];
    relations?: DatasetRelation[];
}

export interface DatasetColumn {
    name: string;
    source: string;
    dataType: string;
    caption?: string;
    format?: string;
    width?: number;
    visible?: boolean;
}

export interface DatasetRelation {
    type: 'inner' | 'left' | 'right' | 'full';
    table: string;
    condition: string;
}

export interface ReportFilter {
    field: string;
    operator: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'like' | 'in' | 'between' | 'isnull' | 'isnotnull';
    value?: any;
    secondValue?: any;
}

export interface ReportSort {
    field: string;
    direction: 'asc' | 'desc';
}

export interface Aggregate {
    field: string;
    type: AggregateType;
    value: any;
}

export type AggregateType = 'sum' | 'avg' | 'count' | 'min' | 'max';