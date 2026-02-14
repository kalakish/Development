/// <reference types="node" />
import { PoolClient, QueryResult } from 'pg';
import { EventEmitter } from 'events';
import { DatabaseConnection } from './connection';
export declare class Transaction extends EventEmitter {
    private client;
    private connection;
    private isActive;
    private savepoints;
    private metrics;
    constructor(client: PoolClient, connection: DatabaseConnection);
    query<T = any>(query: string, params?: any[]): Promise<QueryResult<T>>;
    commit(): Promise<void>;
    rollback(): Promise<void>;
    savepoint(name: string): Promise<void>;
    rollbackToSavepoint(name: string): Promise<void>;
    releaseSavepoint(name: string): Promise<void>;
    private checkActive;
    getMetrics(): TransactionMetrics;
    getDuration(): number;
}
export interface TransactionMetrics {
    operations: number;
    startTime: number;
    endTime: number;
}
export declare enum IsolationLevel {
    ReadUncommitted = "READ UNCOMMITTED",
    ReadCommitted = "READ COMMITTED",
    RepeatableRead = "REPEATABLE READ",
    Serializable = "SERIALIZABLE"
}
//# sourceMappingURL=transaction.d.ts.map