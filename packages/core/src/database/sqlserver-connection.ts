import sql, { ConnectionPool, config as SQLConfig, IResult } from 'mssql';
import { EventEmitter } from 'events';

export class SQLServerConnection extends EventEmitter {
    private pool: ConnectionPool;
    private isConnected: boolean = false;
    private connectionId: string;
    private metrics: DatabaseMetrics;

    constructor(private config: SQLServerConfig) {
        super();
        this.connectionId = this.generateConnectionId();
        this.metrics = {
            queries: 0,
            transactions: 0,
            errors: 0,
            totalTime: 0
        };

        const sqlConfig: SQLConfig = {
            user: config.user,
            password: config.password,
            server: config.server,
            port: config.port,
            database: config.database,
            pool: {
                max: config.poolSize || 10,
                min: 0,
                idleTimeoutMillis: 30000
            },
            options: {
                encrypt: config.encrypt || true,
                trustServerCertificate: config.trustServerCertificate || false,
                enableArithAbort: true,
                useUTC: true
            }
        };

        this.pool = new ConnectionPool(sqlConfig);
    }

    async connect(): Promise<void> {
        try {
            await this.pool.connect();
            this.isConnected = true;
            
            await this.initializeConnection();
            
            this.emit('connected', {
                connectionId: this.connectionId,
                timestamp: new Date()
            });
            
            console.log(`✅ SQL Server connected: ${this.config.server}/${this.config.database}`);
        } catch (error) {
            this.emit('error', error);
            throw new SQLServerConnectionError(`Failed to connect: ${error.message}`);
        }
    }

    async disconnect(): Promise<void> {
        if (this.pool) {
            await this.pool.close();
            this.isConnected = false;
            this.emit('disconnected', {
                connectionId: this.connectionId,
                timestamp: new Date()
            });
        }
    }

    async query<T = any>(query: string, params?: any[]): Promise<IResult<T>> {
        const startTime = Date.now();
        
        try {
            this.checkConnection();
            
            const request = this.pool.request();
            
            // Add parameters
            if (params) {
                params.forEach((param, index) => {
                    request.input(`param${index}`, this.getSQLType(param), param);
                });
            }
            
            const result = await request.query(query);
            
            this.metrics.queries++;
            this.metrics.totalTime += Date.now() - startTime;
            
            return result;
        } catch (error) {
            this.metrics.errors++;
            this.emit('queryError', { error, query, params });
            throw new SQLServerQueryError(error.message);
        }
    }

    async executeProc<T = any>(procedureName: string, params?: Record<string, any>): Promise<IResult<T>> {
        try {
            this.checkConnection();
            
            const request = this.pool.request();
            
            if (params) {
                Object.entries(params).forEach(([key, value]) => {
                    request.input(key, this.getSQLType(value), value);
                });
            }
            
            return await request.execute(procedureName);
        } catch (error) {
            this.metrics.errors++;
            throw new SQLServerQueryError(`Procedure execution failed: ${error.message}`);
        }
    }

    async beginTransaction(isolationLevel?: IsolationLevel): Promise<SQLServerTransaction> {
        const transaction = this.pool.transaction();
        
        if (isolationLevel) {
            await transaction.begin(this.mapIsolationLevel(isolationLevel));
        } else {
            await transaction.begin();
        }
        
        this.metrics.transactions++;
        
        return new SQLServerTransaction(transaction, this);
    }

    private mapIsolationLevel(level: IsolationLevel): sql.ISOLATION_LEVEL {
        const map = {
            'READ UNCOMMITTED': sql.ISOLATION_LEVEL.READ_UNCOMMITTED,
            'READ COMMITTED': sql.ISOLATION_LEVEL.READ_COMMITTED,
            'REPEATABLE READ': sql.ISOLATION_LEVEL.REPEATABLE_READ,
            'SERIALIZABLE': sql.ISOLATION_LEVEL.SERIALIZABLE,
            'SNAPSHOT': sql.ISOLATION_LEVEL.SNAPSHOT
        };
        return map[level] || sql.ISOLATION_LEVEL.READ_COMMITTED;
    }

    private getSQLType(value: any): sql.ISqlType {
        if (value === null || value === undefined) return sql.NVarChar;
        
        switch (typeof value) {
            case 'string':
                return value.length > 4000 ? sql.NVarChar(sql.MAX) : sql.NVarChar;
            case 'number':
                return Number.isInteger(value) ? sql.Int : sql.Decimal(18, 2);
            case 'boolean':
                return sql.Bit;
            case 'object':
                if (value instanceof Date) return sql.DateTime;
                if (Buffer.isBuffer(value)) return sql.VarBinary;
                return sql.NVarChar(sql.MAX);
            default:
                return sql.NVarChar;
        }
    }

    private async initializeConnection(): Promise<void> {
        // Set connection settings for SQL Server
        await this.query(`
            SET ANSI_NULLS ON;
            SET ANSI_PADDING ON;
            SET ANSI_WARNINGS ON;
            SET ARITHABORT ON;
            SET CONCAT_NULL_YIELDS_NULL ON;
            SET NUMERIC_ROUNDABORT OFF;
            SET QUOTED_IDENTIFIER ON;
        `);
    }

    private checkConnection(): void {
        if (!this.isConnected) {
            throw new Error('Database not connected');
        }
    }

    private generateConnectionId(): string {
        return `sql_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    // Utility methods
    async tableExists(tableName: string): Promise<boolean> {
        const result = await this.query(`
            SELECT 1 FROM INFORMATION_SCHEMA.TABLES 
            WHERE TABLE_NAME = @param0 AND TABLE_TYPE = 'BASE TABLE'
        `, [tableName]);
        return result.recordset.length > 0;
    }

    async getTableSchema(tableName: string): Promise<any> {
        const result = await this.query(`
            SELECT 
                COLUMN_NAME,
                DATA_TYPE,
                CHARACTER_MAXIMUM_LENGTH,
                NUMERIC_PRECISION,
                NUMERIC_SCALE,
                IS_NULLABLE,
                COLUMN_DEFAULT
            FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_NAME = @param0
            ORDER BY ORDINAL_POSITION
        `, [tableName]);
        return result.recordset;
    }

    async getIdentityColumn(tableName: string): Promise<string | null> {
        const result = await this.query(`
            SELECT COLUMN_NAME
            FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_NAME = @param0
            AND COLUMNPROPERTY(OBJECT_ID(@param0), COLUMN_NAME, 'IsIdentity') = 1
        `, [tableName]);
        return result.recordset[0]?.COLUMN_NAME || null;
    }

    // Metrics
    getMetrics(): DatabaseMetrics {
        return { ...this.metrics };
    }

    // Health check
    async healthCheck(): Promise<boolean> {
        try {
            await this.query('SELECT 1');
            return true;
        } catch {
            return false;
        }
    }
}

export class SQLServerTransaction {
    private transaction: sql.Transaction;
    private connection: SQLServerConnection;
    private isActive: boolean = true;

    constructor(transaction: sql.Transaction, connection: SQLServerConnection) {
        this.transaction = transaction;
        this.connection = connection;
    }

    async query<T = any>(query: string, params?: any[]): Promise<IResult<T>> {
        this.checkActive();
        
        const request = this.transaction.request();
        
        if (params) {
            params.forEach((param, index) => {
                request.input(`param${index}`, this.connection['getSQLType'](param), param);
            });
        }
        
        return await request.query(query);
    }

    async commit(): Promise<void> {
        this.checkActive();
        await this.transaction.commit();
        this.isActive = false;
    }

    async rollback(): Promise<void> {
        this.checkActive();
        await this.transaction.rollback();
        this.isActive = false;
    }

    async savepoint(name: string): Promise<void> {
        this.checkActive();
        await this.transaction.request().query(`SAVE TRANSACTION ${name}`);
    }

    async rollbackToSavepoint(name: string): Promise<void> {
        this.checkActive();
        await this.transaction.request().query(`ROLLBACK TRANSACTION ${name}`);
    }

    private checkActive(): void {
        if (!this.isActive) {
            throw new Error('Transaction is no longer active');
        }
    }
}

export interface SQLServerConfig {
    server: string;
    port?: number;
    database: string;
    user: string;
    password: string;
    poolSize?: number;
    encrypt?: boolean;
    trustServerCertificate?: boolean;
    azure?: boolean;
    requestTimeout?: number;
    connectionTimeout?: number;
}

export class SQLServerConnectionError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'SQLServerConnectionError';
    }
}

export class SQLServerQueryError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'SQLServerQueryError';
    }
}

export enum IsolationLevel {
    ReadUncommitted = 'READ UNCOMMITTED',
    ReadCommitted = 'READ COMMITTED',
    RepeatableRead = 'REPEATABLE READ',
    Serializable = 'SERIALIZABLE',
    Snapshot = 'SNAPSHOT'
}

export interface DatabaseMetrics {
    queries: number;
    transactions: number;
    errors: number;
    totalTime: number;
}