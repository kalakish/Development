import { ConnectionPool, config as SQLConfig, IResult, Transaction, ISOLATION_LEVEL, Table as SqlTable } from 'mssql';
import { EventEmitter } from 'events';
import { SQLServerConnection } from '@nova/core/database/sqlserver-connection';
import { SQLServerMapper } from './sqlserver-mapper';
import { SQLServerBulkOperations } from './sqlserver-bulk-operations';
import { ORMEvents } from './events/orm-events';

export interface SQLServerProviderConfig {
    connection: SQLServerConnection;
    pool?: {
        max?: number;
        min?: number;
        idleTimeout?: number;
        acquireTimeout?: number;
    };
    options?: {
        encrypt?: boolean;
        trustServerCertificate?: boolean;
        enableArithAbort?: boolean;
        useUTC?: boolean;
    };
}

export class SQLServerProvider extends EventEmitter {
    private connection: SQLServerConnection;
    private pool: ConnectionPool;
    private mapper: SQLServerMapper;
    private bulkOps: SQLServerBulkOperations;
    private ormEvents: ORMEvents;
    private initialized: boolean = false;
    private metrics: SQLServerMetrics = {
        totalQueries: 0,
        totalTransactions: 0,
        totalErrors: 0,
        averageQueryTime: 0,
        activeConnections: 0,
        poolSize: 0,
        waitingRequests: 0
    };

    constructor(config: SQLServerProviderConfig) {
        super();
        this.connection = config.connection;
        this.mapper = new SQLServerMapper();
        this.bulkOps = new SQLServerBulkOperations(this.connection);
        this.ormEvents = new ORMEvents();
    }

    async initialize(): Promise<void> {
        if (this.initialized) return;

        try {
            // Get underlying pool from connection
            this.pool = (this.connection as any).pool;
            
            if (!this.pool) {
                throw new Error('Connection pool not available');
            }

            this.initialized = true;
            this.emit('initialized', { timestamp: new Date() });
            
            console.log('✅ SQLServerProvider initialized successfully');
        } catch (error) {
            this.emit('error', { error, timestamp: new Date() });
            throw new Error(`Failed to initialize SQLServerProvider: ${error.message}`);
        }
    }

    // ============ Query Execution ============

    async executeQuery<T = any>(
        query: string,
        params?: any[],
        options?: QueryOptions
    ): Promise<IResult<T>> {
        this.checkInitialized();
        
        const startTime = Date.now();
        this.metrics.totalQueries++;

        try {
            const request = this.pool.request();
            
            // Add parameters
            if (params) {
                params.forEach((param, index) => {
                    const sqlType = this.mapper.toSqlType(param);
                    request.input(`p${index}`, sqlType, param);
                });
            }

            // Set timeout if specified
            if (options?.timeout) {
                request.queryTimeout = options.timeout;
            }

            // Execute query
            const result = await request.query(query);

            // Update metrics
            const queryTime = Date.now() - startTime;
            this.metrics.averageQueryTime = 
                (this.metrics.averageQueryTime * (this.metrics.totalQueries - 1) + queryTime) / 
                this.metrics.totalQueries;

            // Emit event
            await this.ormEvents.emit('queryExecuted', {
                query,
                params,
                duration: queryTime,
                rowCount: result.rowsAffected?.[0] || 0,
                timestamp: new Date()
            });

            return result;

        } catch (error) {
            this.metrics.totalErrors++;
            
            await this.ormEvents.emit('queryFailed', {
                query,
                params,
                error: error.message,
                timestamp: new Date()
            });

            throw new SQLServerProviderError(`Query execution failed: ${error.message}`);
        }
    }

    async executeProcedure<T = any>(
        procedureName: string,
        params?: Record<string, any>,
        options?: QueryOptions
    ): Promise<IResult<T>> {
        this.checkInitialized();
        
        const startTime = Date.now();

        try {
            const request = this.pool.request();
            
            // Add parameters
            if (params) {
                Object.entries(params).forEach(([key, value]) => {
                    const sqlType = this.mapper.toSqlType(value);
                    request.input(key, sqlType, value);
                });
            }

            // Set timeout if specified
            if (options?.timeout) {
                request.queryTimeout = options.timeout;
            }

            // Execute procedure
            const result = await request.execute(procedureName);

            await this.ormEvents.emit('procedureExecuted', {
                procedure: procedureName,
                params,
                duration: Date.now() - startTime,
                rowCount: result.rowsAffected?.[0] || 0,
                timestamp: new Date()
            });

            return result;

        } catch (error) {
            this.metrics.totalErrors++;
            
            await this.ormEvents.emit('procedureFailed', {
                procedure: procedureName,
                params,
                error: error.message,
                timestamp: new Date()
            });

            throw new SQLServerProviderError(`Procedure execution failed: ${error.message}`);
        }
    }

    async executeBatch(queries: string[]): Promise<IResult<any>[]> {
        this.checkInitialized();
        
        const results: IResult<any>[] = [];
        const transaction = await this.beginTransaction();

        try {
            for (const query of queries) {
                const result = await transaction.request().query(query);
                results.push(result);
            }

            await this.commitTransaction(transaction);
            return results;

        } catch (error) {
            await this.rollbackTransaction(transaction);
            throw new SQLServerProviderError(`Batch execution failed: ${error.message}`);
        }
    }

    // ============ Transaction Management ============

    async beginTransaction(isolationLevel?: IsolationLevel): Promise<Transaction> {
        this.checkInitialized();
        
        this.metrics.totalTransactions++;
        
        const transaction = this.pool.transaction();
        
        try {
            if (isolationLevel) {
                await transaction.begin(this.mapIsolationLevel(isolationLevel));
            } else {
                await transaction.begin();
            }

            await this.ormEvents.emit('transactionStarted', {
                isolationLevel,
                timestamp: new Date()
            });

            return transaction;
        } catch (error) {
            throw new SQLServerProviderError(`Failed to begin transaction: ${error.message}`);
        }
    }

    async commitTransaction(transaction: Transaction): Promise<void> {
        this.checkInitialized();
        
        await transaction.commit();
        
        await this.ormEvents.emit('transactionCommitted', {
            timestamp: new Date()
        });
    }

    async rollbackTransaction(transaction: Transaction): Promise<void> {
        this.checkInitialized();
        
        await transaction.rollback();
        
        await this.ormEvents.emit('transactionRolledBack', {
            timestamp: new Date()
        });
    }

    async withTransaction<T>(
        callback: (transaction: Transaction) => Promise<T>,
        isolationLevel?: IsolationLevel
    ): Promise<T> {
        this.checkInitialized();
        
        const transaction = await this.beginTransaction(isolationLevel);

        try {
            const result = await callback(transaction);
            await this.commitTransaction(transaction);
            return result;
        } catch (error) {
            await this.rollbackTransaction(transaction);
            throw error;
        }
    }

    // ============ Bulk Operations (Delegated) ============

    async bulkInsert(tableName: string, records: any[]): Promise<BulkInsertResult> {
        this.checkInitialized();
        return this.bulkOps.bulkInsert(tableName, records);
    }

    async bulkUpsert(tableName: string, records: any[], keyColumns: string[]): Promise<BulkUpsertResult> {
        this.checkInitialized();
        return this.bulkOps.bulkUpsert(tableName, records, keyColumns);
    }

    async bulkDelete(tableName: string, ids: any[], idColumn: string): Promise<BulkDeleteResult> {
        this.checkInitialized();
        return this.bulkOps.bulkDelete(tableName, ids, idColumn);
    }

    async bulkInsertWithIdentity(tableName: string, records: any[], identityColumn: string): Promise<BulkInsertResult> {
        this.checkInitialized();
        return this.bulkOps.bulkInsertWithIdentity(tableName, records, identityColumn);
    }

    // ============ Schema Operations ============

    async tableExists(tableName: string): Promise<boolean> {
        this.checkInitialized();
        
        const result = await this.executeQuery(`
            SELECT 1 FROM sys.tables 
            WHERE [name] = @p0
        `, [tableName.replace('[', '').replace(']', '')]);

        return result.recordset.length > 0;
    }

    async getTableSchema(tableName: string): Promise<TableSchema> {
        this.checkInitialized();
        
        const cleanName = tableName.replace('[', '').replace(']', '');
        
        const columns = await this.executeQuery(`
            SELECT 
                c.[name] AS COLUMN_NAME,
                t.[name] AS DATA_TYPE,
                c.[max_length] AS CHARACTER_MAXIMUM_LENGTH,
                c.[precision] AS NUMERIC_PRECISION,
                c.[scale] AS NUMERIC_SCALE,
                c.[is_nullable] AS IS_NULLABLE,
                c.[is_identity] AS IS_IDENTITY,
                OBJECT_DEFINITION(c.[default_object_id]) AS COLUMN_DEFAULT,
                c.[is_computed] AS IS_COMPUTED
            FROM sys.columns c
            INNER JOIN sys.types t ON c.[user_type_id] = t.[user_type_id]
            WHERE c.[object_id] = OBJECT_ID(@p0)
            ORDER BY c.[column_id]
        `, [cleanName]);

        const indexes = await this.executeQuery(`
            SELECT 
                i.[name] AS index_name,
                i.[is_primary_key] AS is_primary_key,
                i.[is_unique] AS is_unique,
                i.[type_desc] AS index_type,
                STUFF((
                    SELECT ',' + c.[name]
                    FROM sys.index_columns ic
                    JOIN sys.columns c ON ic.[object_id] = c.[object_id] AND ic.[column_id] = c.[column_id]
                    WHERE ic.[object_id] = i.[object_id] 
                        AND ic.[index_id] = i.[index_id]
                        AND ic.[is_included_column] = 0
                    ORDER BY ic.[key_ordinal]
                    FOR XML PATH('')
                ), 1, 1, '') AS columns
            FROM sys.indexes i
            WHERE i.[object_id] = OBJECT_ID(@p0)
                AND i.[is_hypothetical] = 0
                AND i.[type] > 0
        `, [cleanName]);

        return {
            name: tableName,
            columns: columns.recordset,
            indexes: indexes.recordset,
            primaryKey: indexes.recordset.find(i => i.is_primary_key)?.columns
        };
    }

    async getDatabaseSize(): Promise<DatabaseSize> {
        this.checkInitialized();
        
        const result = await this.executeQuery(`
            SELECT 
                SUM(size * 8.0 / 1024) AS total_mb,
                SUM(CASE WHEN type = 0 THEN size * 8.0 / 1024 ELSE 0 END) AS data_mb,
                SUM(CASE WHEN type = 1 THEN size * 8.0 / 1024 ELSE 0 END) AS log_mb
            FROM sys.database_files
        `);

        const row = result.recordset[0];
        return {
            total: row.total_mb * 1024 * 1024,
            data: row.data_mb * 1024 * 1024,
            log: row.log_mb * 1024 * 1024,
            totalMB: row.total_mb,
            dataMB: row.data_mb,
            logMB: row.log_mb
        };
    }

    // ============ Performance Monitoring ============

    async getPerformanceMetrics(): Promise<PerformanceMetrics> {
        this.checkInitialized();
        
        const queryStats = await this.executeQuery(`
            SELECT TOP 10
                qs.execution_count,
                qs.total_worker_time / qs.execution_count / 1000 AS avg_cpu_time_ms,
                qs.total_elapsed_time / qs.execution_count / 1000 AS avg_duration_ms,
                qs.total_logical_reads / qs.execution_count AS avg_logical_reads,
                qs.total_logical_writes / qs.execution_count AS avg_logical_writes,
                SUBSTRING(st.[text], 
                    (qs.statement_start_offset/2) + 1,
                    ((CASE qs.statement_end_offset
                        WHEN -1 THEN DATALENGTH(st.[text])
                        ELSE qs.statement_end_offset
                    END - qs.statement_start_offset)/2) + 1) AS query_text
            FROM sys.dm_exec_query_stats qs
            CROSS APPLY sys.dm_exec_sql_text(qs.[sql_handle]) st
            ORDER BY qs.total_worker_time DESC
        `);

        const indexStats = await this.executeQuery(`
            SELECT 
                OBJECT_NAME(s.[object_id]) AS table_name,
                i.[name] AS index_name,
                s.[avg_fragmentation_in_percent],
                s.[page_count],
                s.[fragment_count]
            FROM sys.dm_db_index_physical_stats(
                DB_ID(), NULL, NULL, NULL, 'LIMITED') s
            INNER JOIN sys.indexes i 
                ON s.[object_id] = i.[object_id] 
                AND s.[index_id] = i.[index_id]
            WHERE s.[avg_fragmentation_in_percent] > 10
            ORDER BY s.[avg_fragmentation_in_percent] DESC
        `);

        return {
            queryPerformance: queryStats.recordset,
            indexFragmentation: indexStats.recordset,
            metrics: this.metrics
        };
    }

    async getConnectionPoolStats(): Promise<PoolStats> {
        this.checkInitialized();
        
        return {
            totalConnections: this.pool.size,
            activeConnections: this.pool.size - this.pool.available,
            idleConnections: this.pool.available,
            waitingRequests: this.pool.waitingCount,
            metrics: this.metrics
        };
    }

    // ============ Utility Methods ============

    private mapIsolationLevel(level: IsolationLevel): ISOLATION_LEVEL {
        const map: Record<string, ISOLATION_LEVEL> = {
            'READ UNCOMMITTED': ISOLATION_LEVEL.READ_UNCOMMITTED,
            'READ COMMITTED': ISOLATION_LEVEL.READ_COMMITTED,
            'REPEATABLE READ': ISOLATION_LEVEL.REPEATABLE_READ,
            'SERIALIZABLE': ISOLATION_LEVEL.SERIALIZABLE,
            'SNAPSHOT': ISOLATION_LEVEL.SNAPSHOT
        };
        return map[level] || ISOLATION_LEVEL.READ_COMMITTED;
    }

    private checkInitialized(): void {
        if (!this.initialized) {
            throw new Error('SQLServerProvider not initialized. Call initialize() first.');
        }
    }

    async healthCheck(): Promise<HealthStatus> {
        try {
            this.checkInitialized();
            
            const startTime = Date.now();
            await this.executeQuery('SELECT 1');
            const duration = Date.now() - startTime;

            return {
                status: 'healthy',
                latency: duration,
                timestamp: new Date(),
                metrics: {
                    totalQueries: this.metrics.totalQueries,
                    totalErrors: this.metrics.totalErrors,
                    averageQueryTime: this.metrics.averageQueryTime
                }
            };
        } catch (error) {
            return {
                status: 'unhealthy',
                error: error.message,
                timestamp: new Date()
            };
        }
    }

    async reset(): Promise<void> {
        this.checkInitialized();
        
        // Clear connection pool
        await this.pool.close();
        await this.pool.connect();
        
        // Reset metrics
        this.metrics = {
            totalQueries: 0,
            totalTransactions: 0,
            totalErrors: 0,
            averageQueryTime: 0,
            activeConnections: 0,
            poolSize: this.pool.size,
            waitingRequests: 0
        };

        this.emit('reset', { timestamp: new Date() });
    }

    async dispose(): Promise<void> {
        if (this.pool) {
            await this.pool.close();
        }
        this.initialized = false;
        this.emit('disposed', { timestamp: new Date() });
    }

    // ============ Getters ============

    getMapper(): SQLServerMapper {
        return this.mapper;
    }

    getBulkOperations(): SQLServerBulkOperations {
        return this.bulkOps;
    }

    getORMEvents(): ORMEvents {
        return this.ormEvents;
    }

    getMetrics(): SQLServerMetrics {
        return { ...this.metrics };
    }

    isInitialized(): boolean {
        return this.initialized;
    }

    getConnection(): SQLServerConnection {
        return this.connection;
    }

    getPool(): ConnectionPool {
        return this.pool;
    }
}

// ============ Interfaces ============

export interface QueryOptions {
    timeout?: number;
    retry?: number;
    retryDelay?: number;
}

export interface TableSchema {
    name: string;
    columns: any[];
    indexes: any[];
    primaryKey?: string;
}

export interface DatabaseSize {
    total: number;
    data: number;
    log: number;
    totalMB: number;
    dataMB: number;
    logMB: number;
}

export interface SQLServerMetrics {
    totalQueries: number;
    totalTransactions: number;
    totalErrors: number;
    averageQueryTime: number;
    activeConnections: number;
    poolSize: number;
    waitingRequests: number;
}

export interface PerformanceMetrics {
    queryPerformance: any[];
    indexFragmentation: any[];
    metrics: SQLServerMetrics;
}

export interface PoolStats {
    totalConnections: number;
    activeConnections: number;
    idleConnections: number;
    waitingRequests: number;
    metrics: SQLServerMetrics;
}

export interface HealthStatus {
    status: 'healthy' | 'unhealthy' | 'degraded';
    latency?: number;
    error?: string;
    timestamp: Date;
    metrics?: Partial<SQLServerMetrics>;
}

export enum IsolationLevel {
    ReadUncommitted = 'READ UNCOMMITTED',
    ReadCommitted = 'READ COMMITTED',
    RepeatableRead = 'REPEATABLE READ',
    Serializable = 'SERIALIZABLE',
    Snapshot = 'SNAPSHOT'
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

export class SQLServerProviderError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'SQLServerProviderError';
    }
}