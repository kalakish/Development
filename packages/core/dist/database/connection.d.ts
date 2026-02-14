import { QueryResult, QueryConfig } from 'pg';
import { EventEmitter } from 'events';
import { Transaction } from './transaction';
export declare class DatabaseConnection extends EventEmitter {
    private config;
    private pool;
    private client?;
    private isConnected;
    private connectionId;
    private metrics;
    constructor(config: DatabaseConfig);
    connect(): Promise<void>;
    disconnect(): Promise<void>;
    query<T = any>(query: string | QueryConfig, params?: any[]): Promise<QueryResult<T>>;
    beginTransaction(isolationLevel?: IsolationLevel): Promise<Transaction>;
    acquireLock(resource: string, mode: LockMode, sessionId: string): Promise<boolean>;
    releaseLock(resource: string, sessionId: string): Promise<void>;
    private initializeConnection;
    private checkConnection;
    private generateConnectionId;
    private hashLockResource;
    getMetrics(): DatabaseMetrics;
    healthCheck(): Promise<boolean>;
    resetPool(): Promise<void>;
}
export interface DatabaseConfig {
    host: string;
    port: number;
    database: string;
    user: string;
    password: string;
    poolSize?: number;
    ssl?: boolean;
    statementTimeout?: number;
    lockTimeout?: number;
}
export interface DatabaseMetrics {
    queries: number;
    transactions: number;
    errors: number;
    totalTime: number;
}
export declare class DatabaseConnectionError extends Error {
    constructor(message: string);
}
export declare class DatabaseQueryError extends Error {
    constructor(message: string);
}
//# sourceMappingURL=connection.d.ts.map