"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DatabaseQueryError = exports.DatabaseConnectionError = exports.DatabaseConnection = void 0;
const pg_1 = require("pg");
const events_1 = require("events");
const transaction_1 = require("./transaction");
class DatabaseConnection extends events_1.EventEmitter {
    config;
    pool;
    client;
    isConnected = false;
    connectionId;
    metrics;
    constructor(config) {
        super();
        this.config = config;
        this.connectionId = this.generateConnectionId();
        this.metrics = {
            queries: 0,
            transactions: 0,
            errors: 0,
            totalTime: 0
        };
        this.pool = new pg_1.Pool({
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
    async connect() {
        try {
            this.client = await this.pool.connect();
            this.isConnected = true;
            // Initialize connection settings
            await this.initializeConnection();
            this.emit('connected', {
                connectionId: this.connectionId,
                timestamp: new Date()
            });
        }
        catch (error) {
            this.emit('error', error);
            throw new DatabaseConnectionError(`Failed to connect: ${error.message}`);
        }
    }
    async disconnect() {
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
    async query(query, params) {
        const startTime = Date.now();
        try {
            this.checkConnection();
            const result = await this.pool.query(query, params);
            // Update metrics
            this.metrics.queries++;
            this.metrics.totalTime += Date.now() - startTime;
            return result;
        }
        catch (error) {
            this.metrics.errors++;
            this.emit('queryError', { error, query, params });
            throw new DatabaseQueryError(error.message);
        }
    }
    async beginTransaction(isolationLevel) {
        const client = await this.pool.connect();
        await client.query('BEGIN');
        if (isolationLevel) {
            await client.query(`SET TRANSACTION ISOLATION LEVEL ${isolationLevel}`);
        }
        this.metrics.transactions++;
        return new transaction_1.Transaction(client, this);
    }
    async acquireLock(resource, mode, sessionId) {
        const lockId = this.hashLockResource(resource);
        const result = await this.query('SELECT pg_try_advisory_lock($1) as acquired', [lockId]);
        return result.rows[0].acquired;
    }
    async releaseLock(resource, sessionId) {
        const lockId = this.hashLockResource(resource);
        await this.query('SELECT pg_advisory_unlock($1)', [lockId]);
    }
    async initializeConnection() {
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
    checkConnection() {
        if (!this.isConnected) {
            throw new Error('Database not connected');
        }
    }
    generateConnectionId() {
        return `conn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
    hashLockResource(resource) {
        // Simple hash function for advisory lock ID
        let hash = 0;
        for (let i = 0; i < resource.length; i++) {
            hash = ((hash << 5) - hash) + resource.charCodeAt(i);
            hash |= 0; // Convert to 32-bit integer
        }
        return Math.abs(hash);
    }
    // Metrics
    getMetrics() {
        return { ...this.metrics };
    }
    // Health check
    async healthCheck() {
        try {
            await this.query('SELECT 1');
            return true;
        }
        catch {
            return false;
        }
    }
    // Pool management
    async resetPool() {
        await this.pool.end();
        this.pool = new pg_1.Pool(this.config);
    }
}
exports.DatabaseConnection = DatabaseConnection;
class DatabaseConnectionError extends Error {
    constructor(message) {
        super(message);
        this.name = 'DatabaseConnectionError';
    }
}
exports.DatabaseConnectionError = DatabaseConnectionError;
class DatabaseQueryError extends Error {
    constructor(message) {
        super(message);
        this.name = 'DatabaseQueryError';
    }
}
exports.DatabaseQueryError = DatabaseQueryError;
//# sourceMappingURL=connection.js.map