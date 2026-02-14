export interface TableColumn {
    key: string;
    title: string;
    type?: 'string' | 'number' | 'date' | 'boolean' | 'currency' | 'percentage';
    format?: string;
    width?: number;
    align?: 'left' | 'center' | 'right';
    visible?: boolean;
    sortable?: boolean;
    filterable?: boolean;
}

export interface TableOptions {
    title?: string;
    subtitle?: string;
    columns?: TableColumn[];
    showHeader?: boolean;
    showFooter?: boolean;
    showTotals?: boolean;
    striped?: boolean;
    hoverable?: boolean;
    bordered?: boolean;
    compact?: boolean;
    pageSize?: number;
    sortable?: boolean;
    filterable?: boolean;
    exportable?: boolean;
}

export class TableChart {
    generate(data: any[], options?: Partial<TableOptions>): TableData {
        const config = this.getConfig(options);
        const columns = this.getColumns(data, config);
        const rows = this.processRows(data, columns);
        const totals = config.showTotals ? this.calculateTotals(rows, columns) : undefined;

        return {
            columns,
            rows,
            totals,
            title: config.title,
            subtitle: config.subtitle,
            rowCount: rows.length,
            columnCount: columns.length
        };
    }

    generateGrouped(
        data: any[],
        groupBy: string,
        options?: Partial<TableOptions>
    ): GroupedTableData {
        const groups = this.groupData(data, groupBy);
        const result: GroupedTableData = {
            groups: [],
            totalRows: data.length
        };

        Object.entries(groups).forEach(([key, groupData]) => {
            result.groups.push({
                key,
                data: this.generate(groupData, options),
                count: groupData.length
            });
        });

        return result;
    }

    generatePivot(
        data: any[],
        rows: string[],
        columns: string[],
        values: string,
        aggregation: 'sum' | 'avg' | 'count' | 'min' | 'max' = 'sum'
    ): PivotTableData {
        const pivotData: PivotTableData = {
            rows: [],
            columns: [],
            values: {},
            rowTotals: {},
            columnTotals: {}
        };

        // Get unique row and column values
        const rowValues = [...new Set(data.map(d => d[rows[0]]))];
        const colValues = [...new Set(data.map(d => d[columns[0]]))];

        pivotData.rows = rowValues;
        pivotData.columns = colValues;

        // Calculate pivot values
        rowValues.forEach(rowVal => {
            pivotData.rowTotals[rowVal] = 0;
            
            colValues.forEach(colVal => {
                const cellData = data.filter(d => 
                    d[rows[0]] === rowVal && d[columns[0]] === colVal
                );

                let value: number;
                switch (aggregation) {
                    case 'sum':
                        value = cellData.reduce((sum, d) => sum + (d[values] || 0), 0);
                        break;
                    case 'avg':
                        value = cellData.length > 0 
                            ? cellData.reduce((sum, d) => sum + (d[values] || 0), 0) / cellData.length 
                            : 0;
                        break;
                    case 'count':
                        value = cellData.length;
                        break;
                    case 'min':
                        value = cellData.length > 0 
                            ? Math.min(...cellData.map(d => d[values] || 0)) 
                            : 0;
                        break;
                    case 'max':
                        value = cellData.length > 0 
                            ? Math.max(...cellData.map(d => d[values] || 0)) 
                            : 0;
                        break;
                }

                if (!pivotData.values[rowVal]) {
                    pivotData.values[rowVal] = {};
                }
                pivotData.values[rowVal][colVal] = value;
                pivotData.rowTotals[rowVal] += value;
            });
        });

        // Calculate column totals
        colValues.forEach(colVal => {
            pivotData.columnTotals[colVal] = rowValues.reduce((sum, rowVal) => 
                sum + (pivotData.values[rowVal]?.[colVal] || 0), 0
            );
        });

        return pivotData;
    }

    private getConfig(options?: Partial<TableOptions>): TableOptions {
        return {
            showHeader: options?.showHeader !== false,
            showFooter: options?.showFooter || false,
            showTotals: options?.showTotals || false,
            striped: options?.striped !== false,
            hoverable: options?.hoverable !== false,
            bordered: options?.bordered !== false,
            compact: options?.compact || false,
            pageSize: options?.pageSize,
            sortable: options?.sortable !== false,
            filterable: options?.filterable || false,
            exportable: options?.exportable || false,
            title: options?.title,
            subtitle: options?.subtitle,
            columns: options?.columns
        };
    }

    private getColumns(data: any[], options: TableOptions): TableColumn[] {
        if (options.columns) {
            return options.columns;
        }

        if (data.length === 0) {
            return [];
        }

        return Object.keys(data[0]).map(key => ({
            key,
            title: this.formatColumnTitle(key),
            type: this.inferType(data[0][key]),
            align: this.inferAlignment(this.inferType(data[0][key])),
            sortable: options.sortable,
            filterable: options.filterable
        }));
    }

    private processRows(data: any[], columns: TableColumn[]): TableRow[] {
        return data.map((row, index) => ({
            id: index,
            cells: columns.map(col => ({
                key: col.key,
                value: row[col.key],
                formattedValue: this.formatValue(row[col.key], col)
            }))
        }));
    }

    private groupData(data: any[], field: string): Record<string, any[]> {
        const groups: Record<string, any[]> = {};

        data.forEach(row => {
            const key = String(row[field]);
            if (!groups[key]) {
                groups[key] = [];
            }
            groups[key].push(row);
        });

        return groups;
    }

    private calculateTotals(rows: TableRow[], columns: TableColumn[]): TableRow {
        const totals: TableRow = {
            id: 'totals',
            cells: columns.map(col => {
                if (col.type === 'number' || col.type === 'currency' || col.type === 'percentage') {
                    const sum = rows.reduce((total, row) => {
                        const cell = row.cells.find(c => c.key === col.key);
                        return total + (typeof cell?.value === 'number' ? cell.value : 0);
                    }, 0);
                    
                    return {
                        key: col.key,
                        value: sum,
                        formattedValue: this.formatValue(sum, col)
                    };
                }

                return {
                    key: col.key,
                    value: null,
                    formattedValue: ''
                };
            })
        };

        // Set first cell to "Total"
        if (totals.cells.length > 0) {
            totals.cells[0].value = 'Total';
            totals.cells[0].formattedValue = 'Total';
        }

        return totals;
    }

    private inferType(value: any): 'string' | 'number' | 'date' | 'boolean' {
        if (value === null || value === undefined) return 'string';
        if (value instanceof Date) return 'date';
        if (typeof value === 'boolean') return 'boolean';
        if (typeof value === 'number') return 'number';
        if (typeof value === 'string' && !isNaN(Date.parse(value))) return 'date';
        return 'string';
    }

    private inferAlignment(type: string): 'left' | 'center' | 'right' {
        switch (type) {
            case 'number':
            case 'currency':
            case 'percentage':
                return 'right';
            case 'boolean':
                return 'center';
            default:
                return 'left';
        }
    }

    private formatColumnTitle(key: string): string {
        return key
            .replace(/([A-Z])/g, ' $1')
            .replace(/^./, str => str.toUpperCase())
            .trim();
    }

    private formatValue(value: any, column: TableColumn): string {
        if (value === null || value === undefined) {
            return '';
        }

        switch (column.type) {
            case 'number':
                if (column.format === 'decimal') {
                    return value.toFixed(2);
                }
                return value.toLocaleString();

            case 'currency':
                return new Intl.NumberFormat('en-US', {
                    style: 'currency',
                    currency: 'USD'
                }).format(value);

            case 'percentage':
                return `${(value * 100).toFixed(1)}%`;

            case 'date':
                const date = new Date(value);
                if (column.format === 'short') {
                    return date.toLocaleDateString();
                }
                return date.toLocaleString();

            case 'boolean':
                return value ? 'Yes' : 'No';

            default:
                return String(value);
        }
    }
}

export interface TableData {
    columns: TableColumn[];
    rows: TableRow[];
    totals?: TableRow;
    title?: string;
    subtitle?: string;
    rowCount: number;
    columnCount: number;
}

export interface TableRow {
    id: string | number;
    cells: TableCell[];
}

export interface TableCell {
    key: string;
    value: any;
    formattedValue: string;
}

export interface GroupedTableData {
    groups: TableGroup[];
    totalRows: number;
}

export interface TableGroup {
    key: string;
    data: TableData;
    count: number;
}

export interface PivotTableData {
    rows: any[];
    columns: any[];
    values: Record<string, Record<string, number>>;
    rowTotals: Record<string, number>;
    columnTotals: Record<string, number>;
}