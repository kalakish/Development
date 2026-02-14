import { Pool, PoolClient, QueryResult, QueryConfig } from 'pg';
import { EventEmitter } from 'events';
import { Transaction } from './transaction';

export class DatabaseConnection extends EventEmitter {
    private pool: Pool;
    private client?: PoolClient;
    private isConnected: boolean = false;
    private connectionId: string;
    private metrics: DatabaseMetrics;

    constructor(private config: DatabaseConfig) {
        super();
        this.connectionId = this.generateConnectionId();
        this.metrics = {
            queries: 0,
            transactions: 0,
            errors: 0,
            totalTime: 0
        };
        
        this.pool = new Pool({
            host: config.host,
            port: config.port,
            database: config.database,
            user: config.user,
            password: config.password,
            max: config.poolSize || 20,
            idleTimeoutMillis: 30000,
            connectionTimeoutMillis: 2000,
            ssl: config.ssl
        });
    }

    async connect(): Promise<void> {
        try {
            this.client = await this.pool.connect();
            this.isConnected = true;
            
            // Initialize connection settings
            await this.initializeConnection();
            
            this.emit('connected', {
                connectionId: this.connectionId,
                timestamp: new Date()
            });
            
        } catch (error) {
            this.emit('error', error);
            throw new DatabaseConnectionError(`Failed to connect: ${error.message}`);
        }
    }

    async disconnect(): Promise<void> {
        if (this.client) {
            this.client.release();
            this.isConnected = false;
            
            await this.pool.end();
            
            this.emit('disconnected', {
                connectionId: this.connectionId,
                timestamp: new Date()
            });
        }
    }

    async query<T = any>(query: string | QueryConfig, params?: any[]): Promise<QueryResult<T>> {
        const startTime = Date.now();
        
        try {
            this.checkConnection();
            
            const result = await this.pool.query(query, params);
            
            // Update metrics
            this.metrics.queries++;
            this.metrics.totalTime += Date.now() - startTime;
            
            return result;
            
        } catch (error) {
            this.metrics.errors++;
            this.emit('queryError', { error, query, params });
            throw new DatabaseQueryError(error.message);
        }
    }

    async beginTransaction(isolationLevel?: IsolationLevel): Promise<Transaction> {
        const client = await this.pool.connect();
        
        await client.query('BEGIN');
        
        if (isolationLevel) {
            await client.query(`SET TRANSACTION ISOLATION LEVEL ${isolationLevel}`);
        }
        
        this.metrics.transactions++;
        
        return new Transaction(client, this);
    }

    async acquireLock(resource: string, mode: LockMode, sessionId: string): Promise<boolean> {
        const lockId = this.hashLockResource(resource);
        
        const result = await this.query(
            'SELECT pg_try_advisory_lock($1) as acquired',
            [lockId]
        );
        
        return result.rows[0].acquired;
    }

    async releaseLock(resource: string, sessionId: string): Promise<void> {
        const lockId = this.hashLockResource(resource);
        
        await this.query(
            'SELECT pg_advisory_unlock($1)',
            [lockId]
        );
    }

    private async initializeConnection(): Promise<void> {
        // Set connection encoding
        await this.query("SET client_encoding TO 'UTF8'");
        
        // Set timezone
        await this.query("SET timezone TO 'UTC'");
        
        // Set statement timeout
        if (this.config.statementTimeout) {
            await this.query(`SET statement_timeout TO ${this.config.statementTimeout}`);
        }
        
        // Set lock timeout
        if (this.config.lockTimeout) {
            await this.query(`SET lock_timeout TO ${this.config.lockTimeout}`);
        }
    }

    private checkConnection(): void {
        if (!this.isConnected) {
            throw new Error('Database not connected');
        }
    }

    private generateConnectionId(): string {
        return `conn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    private hashLockResource(resource: string): number {
        // Simple hash function for advisory lock ID
        let hash = 0;
        for (let i = 0; i < resource.length; i++) {
            hash = ((hash << 5) - hash) + resource.charCodeAt(i);
            hash |= 0; // Convert to 32-bit integer
        }
        return Math.abs(hash);
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

    // Pool management
    async resetPool(): Promise<void> {
        await this.pool.end();
        this.pool = new Pool(this.config);
    }
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

export class DatabaseConnectionError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'DatabaseConnectionError';
    }
}

export class DatabaseQueryError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'DatabaseQueryError';
    }
}