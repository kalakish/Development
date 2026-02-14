import * as AST from '../parser/ast';
import { TableSchema, ColumnSchema, IndexSchema } from '../generator/schema-generator';

export class QueryOptimizer {
    private statistics: QueryStatistics;
    private costEstimator: CostEstimator;

    constructor() {
        this.statistics = new QueryStatistics();
        this.costEstimator = new CostEstimator();
    }

    optimize(query: AST.QueryDefinition, schemas: Map<string, TableSchema>): OptimizedQuery {
        // Analyze query structure
        const analysis = this.analyzeQuery(query);
        
        // Apply optimization rules
        let optimized = this.applyOptimizations(query, analysis, schemas);
        
        // Generate execution plan
        const plan = this.generateExecutionPlan(optimized, schemas);
        
        // Estimate costs
        const costs = this.costEstimator.estimate(plan);
        
        return {
            originalQuery: query,
            optimizedQuery: optimized,
            executionPlan: plan,
            estimatedCost: costs,
            statistics: this.statistics
        };
    }

    private analyzeQuery(query: AST.QueryDefinition): QueryAnalysis {
        const analysis: QueryAnalysis = {
            tables: new Set(),
            joins: [],
            filters: [],
            sortColumns: [],
            aggregations: [],
            subqueries: []
        };

        for (const element of query.elements) {
            if (element.type === 'QueryDataItem') {
                analysis.tables.add(element.tableName);
                
                if (element.link) {
                    analysis.joins.push({
                        type: 'INNER',
                        left: element.link.from,
                        right: element.link.to
                    });
                }
            } else if (element.type === 'QueryColumn') {
                // Check for aggregation
                if (element.source.includes('SUM') || 
                    element.source.includes('AVG') || 
                    element.source.includes('COUNT')) {
                    analysis.aggregations.push(element);
                }
            }
        }

        for (const filter of query.filters) {
            analysis.filters.push({
                column: filter.field,
                operator: filter.value.operator,
                value: filter.value.value
            });
        }

        for (const order of query.orderBy) {
            analysis.sortColumns.push({
                column: order.field,
                direction: order.direction
            });
        }

        return analysis;
    }

    private applyOptimizations(
        query: AST.QueryDefinition,
        analysis: QueryAnalysis,
        schemas: Map<string, TableSchema>
    ): AST.QueryDefinition {
        let optimized = { ...query };

        // Optimization 1: Predicate Pushdown
        optimized = this.pushDownPredicates(optimized, analysis);
        
        // Optimization 2: Join Reordering
        optimized = this.reorderJoins(optimized, analysis, schemas);
        
        // Optimization 3: Index Selection
        optimized = this.selectIndexes(optimized, analysis, schemas);
        
        // Optimization 4: Projection Pushdown
        optimized = this.pushDownProjections(optimized, analysis);
        
        // Optimization 5: Subquery Flattening
        optimized = this.flattenSubqueries(optimized, analysis);
        
        // Optimization 6: Constant Folding
        optimized = this.foldConstants(optimized);
        
        // Optimization 7: Dead Code Elimination
        optimized = this.eliminateDeadCode(optimized);
        
        // Optimization 8: Pagination Optimization
        optimized = this.optimizePagination(optimized);

        return optimized;
    }

    private pushDownPredicates(
        query: AST.QueryDefinition,
        analysis: QueryAnalysis
    ): AST.QueryDefinition {
        // Move filters closer to their source tables
        for (const filter of analysis.filters) {
            const tableName = this.getTableFromColumn(filter.column, analysis);
            
            // Add filter to the appropriate data item
            for (const element of query.elements) {
                if (element.type === 'QueryDataItem' && 
                    element.tableName === tableName) {
                    if (!element.filters) {
                        element.filters = [];
                    }
                    element.filters.push(filter);
                }
            }
        }
        
        return query;
    }

    private reorderJoins(
        query: AST.QueryDefinition,
        analysis: QueryAnalysis,
        schemas: Map<string, TableSchema>
    ): AST.QueryDefinition {
        // Reorder joins to minimize intermediate result size
        const joinOrder = analysis.joins.sort((a, b) => {
            const tableA = this.getTableFromColumn(a.left, analysis);
            const tableB = this.getTableFromColumn(b.left, analysis);
            
            const sizeA = this.estimateTableSize(tableA, schemas);
            const sizeB = this.estimateTableSize(tableB, schemas);
            
            return sizeA - sizeB;
        });

        // Reorder data items based on join order
        const dataItems = query.elements
            .filter(e => e.type === 'QueryDataItem')
            .sort((a, b) => {
                const posA = joinOrder.findIndex(j => 
                    j.left.includes(a.tableName) || j.right.includes(a.tableName));
                const posB = joinOrder.findIndex(j => 
                    j.left.includes(b.tableName) || j.right.includes(b.tableName));
                return posA - posB;
            });

        query.elements = [...dataItems, ...query.elements.filter(e => e.type !== 'QueryDataItem')];

        return query;
    }

    private selectIndexes(
        query: AST.QueryDefinition,
        analysis: QueryAnalysis,
        schemas: Map<string, TableSchema>
    ): AST.QueryDefinition {
        // Add index hints for optimal access paths
        for (const filter of analysis.filters) {
            const tableName = this.getTableFromColumn(filter.column, analysis);
            const schema = schemas.get(tableName);
            
            if (schema) {
                const bestIndex = this.findBestIndex(schema, filter);
                if (bestIndex) {
                    // Add index hint to query
                    if (!query.hints) query.hints = [];
                    query.hints.push({
                        type: 'INDEX',
                        table: tableName,
                        index: bestIndex.name
                    });
                }
            }
        }

        return query;
    }

    private findBestIndex(schema: TableSchema, filter: any): IndexSchema | null {
        let bestIndex: IndexSchema | null = null;
        let bestScore = 0;

        for (const index of schema.indexes) {
            let score = 0;
            
            // Check if index can be used for this filter
            if (index.fields.includes(filter.column)) {
                score += 100;
                
                // Prefer indexes with exact match
                if (filter.operator === '=') {
                    score += 50;
                }
                
                // Prefer clustered indexes
                if (index.isPrimary) {
                    score += 30;
                }
                
                // Prefer unique indexes
                if (index.isUnique) {
                    score += 20;
                }
                
                // Prefer covering indexes
                if (index.include?.length) {
                    score += 10;
                }
            }

            if (score > bestScore) {
                bestScore = score;
                bestIndex = index;
            }
        }

        return bestIndex;
    }

    private pushDownProjections(
        query: AST.QueryDefinition,
        analysis: QueryAnalysis
    ): AST.QueryDefinition {
        // Limit columns to only those needed
        const usedColumns = new Set<string>();
        
        // Collect columns used in filters, joins, sorts, and output
        for (const filter of analysis.filters) {
            usedColumns.add(filter.column);
        }
        
        for (const join of analysis.joins) {
            usedColumns.add(join.left);
            usedColumns.add(join.right);
        }
        
        for (const sort of analysis.sortColumns) {
            usedColumns.add(sort.column);
        }
        
        for (const element of query.elements) {
            if (element.type === 'QueryColumn') {
                usedColumns.add(element.source);
            }
        }

        // Add primary keys and foreign keys
        for (const tableName of analysis.tables) {
            const schema = this.schemas?.get(tableName);
            if (schema) {
                for (const pk of schema.primaryKey) {
                    usedColumns.add(`${tableName}.${pk}`);
                }
            }
        }

        // Limit data item columns
        for (const element of query.elements) {
            if (element.type === 'QueryDataItem') {
                element.columns = element.columns?.filter((col: any) => 
                    usedColumns.has(col.source) || usedColumns.has(`${element.tableName}.${col.source}`)
                );
            }
        }

        return query;
    }

    private flattenSubqueries(
        query: AST.QueryDefinition,
        analysis: QueryAnalysis
    ): AST.QueryDefinition {
        // Convert correlated subqueries to joins
        // Implementation would detect and rewrite subqueries
        
        return query;
    }

    private foldConstants(query: AST.QueryDefinition): AST.QueryDefinition {
        // Evaluate constant expressions at compile time
        for (const filter of query.filters) {
            if (filter.value.type === 'Binary' && 
                filter.value.left.type === 'Literal' && 
                filter.value.right.type === 'Literal') {
                // Evaluate constant expression
                filter.value.value = this.evaluateConstantExpression(filter.value);
            }
        }

        return query;
    }

    private evaluateConstantExpression(expr: any): any {
        const left = expr.left.value;
        const right = expr.right.value;
        
        switch (expr.operator) {
            case '+': return left + right;
            case '-': return left - right;
            case '*': return left * right;
            case '/': return left / right;
            case '=': return left === right;
            case '<>': return left !== right;
            case '<': return left < right;
            case '<=': return left <= right;
            case '>': return left > right;
            case '>=': return left >= right;
            default: return expr;
        }
    }

    private eliminateDeadCode(query: AST.QueryDefinition): AST.QueryDefinition {
        // Remove unreachable query elements
        // Remove duplicate filters
        // Remove redundant joins
        
        return query;
    }

    private optimizePagination(query: AST.QueryDefinition): AST.QueryDefinition {
        // Optimize TOP/SKIP operations
        if (query.top) {
            // Convert to keyset pagination if possible
            if (query.orderBy && query.orderBy.length > 0) {
                query.useKeysetPagination = true;
            }
        }

        return query;
    }

    private estimateTableSize(tableName: string, schemas: Map<string, TableSchema>): number {
        const schema = schemas.get(tableName);
        if (!schema) return 1000; // Default estimate
        
        // Estimate based on column count and data types
        return schema.columns.length * 100;
    }

    private getTableFromColumn(columnPath: string, analysis: QueryAnalysis): string {
        const parts = columnPath.split('.');
        if (parts.length > 1) {
            return parts[0];
        }
        
        // Default to first table
        return Array.from(analysis.tables)[0] || '';
    }

    private generateExecutionPlan(
        query: AST.QueryDefinition,
        schemas: Map<string, TableSchema>
    ): ExecutionPlan {
        const plan: ExecutionPlan = {
            operations: [],
            estimatedRows: 0,
            estimatedCost: 0
        };

        // Add table scans
        for (const element of query.elements) {
            if (element.type === 'QueryDataItem') {
                const schema = schemas.get(element.tableName);
                const operation: ExecutionOperation = {
                    type: element.link ? 'NestedLoops' : 'TableScan',
                    table: element.tableName,
                    estimatedRows: schema?.columns.length || 100,
                    estimatedCost: 10
                };
                
                // Add index usage
                if (query.hints) {
                    const hint = query.hints.find(h => h.table === element.tableName);
                    if (hint) {
                        operation.type = 'IndexSeek';
                        operation.index = hint.index;
                    }
                }
                
                plan.operations.push(operation);
            }
        }

        // Add join operations
        for (let i = 1; i < plan.operations.length; i++) {
            const joinOp: ExecutionOperation = {
                type: 'HashJoin',
                estimatedRows: 50,
                estimatedCost: 5,
                children: [plan.operations[i - 1], plan.operations[i]]
            };
            plan.operations[i - 1] = joinOp;
            plan.operations.splice(i, 1);
        }

        // Add sort for ORDER BY
        if (query.orderBy && query.orderBy.length > 0) {
            plan.operations.push({
                type: 'Sort',
                estimatedRows: 50,
                estimatedCost: 10,
                sortColumns: query.orderBy.map((o: any) => o.field)
            });
        }

        return plan;
    }
}

class QueryStatistics {
    public executionTime?: number;
    public rowsScanned?: number;
    public rowsReturned?: number;
    public indexSeeks?: number;
    public tableScans?: number;
    public joins?: number;
}

class CostEstimator {
    estimate(plan: ExecutionPlan): EstimatedCost {
        let totalCost = 0;
        let totalRows = 0;

        for (const op of plan.operations) {
            totalCost += op.estimatedCost || 0;
            totalRows += op.estimatedRows || 0;
        }

        return {
            totalCost,
            totalRows,
            ioCost: totalCost * 0.7,
            cpuCost: totalCost * 0.3,
            memoryCost: totalRows * 0.1
        };
    }
}

export interface QueryAnalysis {
    tables: Set<string>;
    joins: JoinInfo[];
    filters: FilterInfo[];
    sortColumns: SortInfo[];
    aggregations: any[];
    subqueries: any[];
}

export interface JoinInfo {
    type: 'INNER' | 'LEFT' | 'RIGHT' | 'FULL';
    left: string;
    right: string;
}

export interface FilterInfo {
    column: string;
    operator: string;
    value: any;
}

export interface SortInfo {
    column: string;
    direction: 'asc' | 'desc';
}

export interface OptimizedQuery {
    originalQuery: AST.QueryDefinition;
    optimizedQuery: AST.QueryDefinition;
    executionPlan: ExecutionPlan;
    estimatedCost: EstimatedCost;
    statistics: QueryStatistics;
}

export interface ExecutionPlan {
    operations: ExecutionOperation[];
    estimatedRows: number;
    estimatedCost: number;
}

export interface ExecutionOperation {
    type: 'TableScan' | 'IndexSeek' | 'IndexScan' | 'NestedLoops' | 
          'HashJoin' | 'MergeJoin' | 'Sort' | 'Filter' | 'Aggregate';
    table?: string;
    index?: string;
    estimatedRows?: number;
    estimatedCost?: number;
    sortColumns?: string[];
    children?: ExecutionOperation[];
}

export interface EstimatedCost {
    totalCost: number;
    totalRows: number;
    ioCost: number;
    cpuCost: number;
    memoryCost: number;
}