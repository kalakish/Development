"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.IsolationLevel = exports.SQLServerQueryError = exports.SQLServerConnectionError = exports.SQLServerTransaction = exports.SQLServerConnection = void 0;
const mssql_1 = __importStar(require("mssql"));
const events_1 = require("events");
class SQLServerConnection extends events_1.EventEmitter {
    config;
    pool;
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
        const sqlConfig = {
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
        this.pool = new mssql_1.ConnectionPool(sqlConfig);
    }
    async connect() {
        try {
            await this.pool.connect();
            this.isConnected = true;
            await this.initializeConnection();
            this.emit('connected', {
                connectionId: this.connectionId,
                timestamp: new Date()
            });
            console.log(`✅ SQL Server connected: ${this.config.server}/${this.config.database}`);
        }
        catch (error) {
            this.emit('error', error);
            throw new SQLServerConnectionError(`Failed to connect: ${error.message}`);
        }
    }
    async disconnect() {
        if (this.pool) {
            await this.pool.close();
            this.isConnected = false;
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
        }
        catch (error) {
            this.metrics.errors++;
            this.emit('queryError', { error, query, params });
            throw new SQLServerQueryError(error.message);
        }
    }
    async executeProc(procedureName, params) {
        try {
            this.checkConnection();
            const request = this.pool.request();
            if (params) {
                Object.entries(params).forEach(([key, value]) => {
                    request.input(key, this.getSQLType(value), value);
                });
            }
            return await request.execute(procedureName);
        }
        catch (error) {
            this.metrics.errors++;
            throw new SQLServerQueryError(`Procedure execution failed: ${error.message}`);
        }
    }
    async beginTransaction(isolationLevel) {
        const transaction = this.pool.transaction();
        if (isolationLevel) {
            await transaction.begin(this.mapIsolationLevel(isolationLevel));
        }
        else {
            await transaction.begin();
        }
        this.metrics.transactions++;
        return new SQLServerTransaction(transaction, this);
    }
    mapIsolationLevel(level) {
        const map = {
            'READ UNCOMMITTED': mssql_1.default.ISOLATION_LEVEL.READ_UNCOMMITTED,
            'READ COMMITTED': mssql_1.default.ISOLATION_LEVEL.READ_COMMITTED,
            'REPEATABLE READ': mssql_1.default.ISOLATION_LEVEL.REPEATABLE_READ,
            'SERIALIZABLE': mssql_1.default.ISOLATION_LEVEL.SERIALIZABLE,
            'SNAPSHOT': mssql_1.default.ISOLATION_LEVEL.SNAPSHOT
        };
        return map[level] || mssql_1.default.ISOLATION_LEVEL.READ_COMMITTED;
    }
    getSQLType(value) {
        if (value === null || value === undefined)
            return mssql_1.default.NVarChar;
        switch (typeof value) {
            case 'string':
                return value.length > 4000 ? mssql_1.default.NVarChar(mssql_1.default.MAX) : mssql_1.default.NVarChar;
            case 'number':
                return Number.isInteger(value) ? mssql_1.default.Int : mssql_1.default.Decimal(18, 2);
            case 'boolean':
                return mssql_1.default.Bit;
            case 'object':
                if (value instanceof Date)
                    return mssql_1.default.DateTime;
                if (Buffer.isBuffer(value))
                    return mssql_1.default.VarBinary;
                return mssql_1.default.NVarChar(mssql_1.default.MAX);
            default:
                return mssql_1.default.NVarChar;
        }
    }
    async initializeConnection() {
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
    checkConnection() {
        if (!this.isConnected) {
            throw new Error('Database not connected');
        }
    }
    generateConnectionId() {
        return `sql_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
    // Utility methods
    async tableExists(tableName) {
        const result = await this.query(`
            SELECT 1 FROM INFORMATION_SCHEMA.TABLES 
            WHERE TABLE_NAME = @param0 AND TABLE_TYPE = 'BASE TABLE'
        `, [tableName]);
        return result.recordset.length > 0;
    }
    async getTableSchema(tableName) {
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
    async getIdentityColumn(tableName) {
        const result = await this.query(`
            SELECT COLUMN_NAME
            FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_NAME = @param0
            AND COLUMNPROPERTY(OBJECT_ID(@param0), COLUMN_NAME, 'IsIdentity') = 1
        `, [tableName]);
        return result.recordset[0]?.COLUMN_NAME || null;
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
}
exports.SQLServerConnection = SQLServerConnection;
class SQLServerTransaction {
    transaction;
    connection;
    isActive = true;
    constructor(transaction, connection) {
        this.transaction = transaction;
        this.connection = connection;
    }
    async query(query, params) {
        this.checkActive();
        const request = this.transaction.request();
        if (params) {
            params.forEach((param, index) => {
                request.input(`param${index}`, this.connection['getSQLType'](param), param);
            });
        }
        return await request.query(query);
    }
    async commit() {
        this.checkActive();
        await this.transaction.commit();
        this.isActive = false;
    }
    async rollback() {
        this.checkActive();
        await this.transaction.rollback();
        this.isActive = false;
    }
    async savepoint(name) {
        this.checkActive();
        await this.transaction.request().query(`SAVE TRANSACTION ${name}`);
    }
    async rollbackToSavepoint(name) {
        this.checkActive();
        await this.transaction.request().query(`ROLLBACK TRANSACTION ${name}`);
    }
    checkActive() {
        if (!this.isActive) {
            throw new Error('Transaction is no longer active');
        }
    }
}
exports.SQLServerTransaction = SQLServerTransaction;
class SQLServerConnectionError extends Error {
    constructor(message) {
        super(message);
        this.name = 'SQLServerConnectionError';
    }
}
exports.SQLServerConnectionError = SQLServerConnectionError;
class SQLServerQueryError extends Error {
    constructor(message) {
        super(message);
        this.name = 'SQLServerQueryError';
    }
}
exports.SQLServerQueryError = SQLServerQueryError;
var IsolationLevel;
(function (IsolationLevel) {
    IsolationLevel["ReadUncommitted"] = "READ UNCOMMITTED";
    IsolationLevel["ReadCommitted"] = "READ COMMITTED";
    IsolationLevel["RepeatableRead"] = "REPEATABLE READ";
    IsolationLevel["Serializable"] = "SERIALIZABLE";
    IsolationLevel["Snapshot"] = "SNAPSHOT";
})(IsolationLevel || (exports.IsolationLevel = IsolationLevel = {}));
//# sourceMappingURL=sqlserver-connection.js.map