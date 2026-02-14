/// <reference types="node" />
import sql, { IResult } from 'mssql';
import { EventEmitter } from 'events';
export declare class SQLServerConnection extends EventEmitter {
    private config;
    private pool;
    private isConnected;
    private connectionId;
    private metrics;
    constructor(config: SQLServerConfig);
    connect(): Promise<void>;
    disconnect(): Promise<void>;
    query<T = any>(query: string, params?: any[]): Promise<IResult<T>>;
    executeProc<T = any>(procedureName: string, params?: Record<string, any>): Promise<IResult<T>>;
    beginTransaction(isolationLevel?: IsolationLevel): Promise<SQLServerTransaction>;
    private mapIsolationLevel;
    private getSQLType;
    private initializeConnection;
    private checkConnection;
    private generateConnectionId;
    tableExists(tableName: string): Promise<boolean>;
    getTableSchema(tableName: string): Promise<any>;
    getIdentityColumn(tableName: string): Promise<string | null>;
    getMetrics(): DatabaseMetrics;
    healthCheck(): Promise<boolean>;
}
export declare class SQLServerTransaction {
    private transaction;
    private connection;
    private isActive;
    constructor(transaction: sql.Transaction, connection: SQLServerConnection);
    query<T = any>(query: string, params?: any[]): Promise<IResult<T>>;
    commit(): Promise<void>;
    rollback(): Promise<void>;
    savepoint(name: string): Promise<void>;
    rollbackToSavepoint(name: string): Promise<void>;
    private checkActive;
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
export declare class SQLServerConnectionError extends Error {
    constructor(message: string);
}
export declare class SQLServerQueryError extends Error {
    constructor(message: string);
}
export declare enum IsolationLevel {
    ReadUncommitted = "READ UNCOMMITTED",
    ReadCommitted = "READ COMMITTED",
    RepeatableRead = "REPEATABLE READ",
    Serializable = "SERIALIZABLE",
    Snapshot = "SNAPSHOT"
}
export interface DatabaseMetrics {
    queries: number;
    transactions: number;
    errors: number;
    totalTime: number;
}
//# sourceMappingURL=sqlserver-connection.d.ts.map