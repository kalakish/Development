import { PoolClient, QueryResult } from 'pg';
import { EventEmitter } from 'events';
import { DatabaseConnection } from './connection';

export class Transaction extends EventEmitter {
    private client: PoolClient;
    private connection: DatabaseConnection;
    private isActive: boolean = true;
    private savepoints: Map<string, number> = new Map();
    
    private metrics: TransactionMetrics = {
        operations: 0,
        startTime: Date.now(),
        endTime: 0
    };

    constructor(client: PoolClient, connection: DatabaseConnection) {
        super();
        this.client = client;
        this.connection = connection;
        
        this.emit('begin', {
            timestamp: new Date()
        });
    }

    async query<T = any>(query: string, params?: any[]): Promise<QueryResult<T>> {
        this.checkActive();
        
        try {
            const result = await this.client.query(query, params);
            this.metrics.operations++;
            return result;
        } catch (error) {
            await this.rollback();
            throw error;
        }
    }

    async commit(): Promise<void> {
        this.checkActive();
        
        try {
            await this.client.query('COMMIT');
            this.isActive = false;
            this.metrics.endTime = Date.now();
            
            this.emit('commit', {
                metrics: this.metrics,
                timestamp: new Date()
            });
            
        } finally {
            this.client.release();
        }
    }

    async rollback(): Promise<void> {
        if (!this.isActive) return;
        
        try {
            await this.client.query('ROLLBACK');
            this.isActive = false;
            this.metrics.endTime = Date.now();
            
            this.emit('rollback', {
                metrics: this.metrics,
                timestamp: new Date()
            });
            
        } finally {
            this.client.release();
        }
    }

    async savepoint(name: string): Promise<void> {
        this.checkActive();
        
        await this.client.query(`SAVEPOINT ${name}`);
        this.savepoints.set(name, this.metrics.operations);
        
        this.emit('savepoint', { name, timestamp: new Date() });
    }

    async rollbackToSavepoint(name: string): Promise<void> {
        this.checkActive();
        
        if (!this.savepoints.has(name)) {
            throw new Error(`Savepoint '${name}' does not exist`);
        }
        
        await this.client.query(`ROLLBACK TO SAVEPOINT ${name}`);
        
        this.emit('rollbackToSavepoint', { name, timestamp: new Date() });
    }

    async releaseSavepoint(name: string): Promise<void> {
        this.checkActive();
        
        if (!this.savepoints.has(name)) {
            throw new Error(`Savepoint '${name}' does not exist`);
        }
        
        await this.client.query(`RELEASE SAVEPOINT ${name}`);
        this.savepoints.delete(name);
        
        this.emit('releaseSavepoint', { name, timestamp: new Date() });
    }

    private checkActive(): void {
        if (!this.isActive) {
            throw new Error('Transaction is no longer active');
        }
    }

    getMetrics(): TransactionMetrics {
        return { ...this.metrics };
    }

    getDuration(): number {
        const end = this.metrics.endTime || Date.now();
        return end - this.metrics.startTime;
    }
}

export interface TransactionMetrics {
    operations: number;
    startTime: number;
    endTime: number;
}

export enum IsolationLevel {
    ReadUncommitted = 'READ UNCOMMITTED',
    ReadCommitted = 'READ COMMITTED',
    RepeatableRead = 'REPEATABLE READ',
    Serializable = 'SERIALIZABLE'
}