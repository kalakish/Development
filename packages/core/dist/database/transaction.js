"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.IsolationLevel = exports.Transaction = void 0;
const events_1 = require("events");
class Transaction extends events_1.EventEmitter {
    client;
    connection;
    isActive = true;
    savepoints = new Map();
    metrics = {
        operations: 0,
        startTime: Date.now(),
        endTime: 0
    };
    constructor(client, connection) {
        super();
        this.client = client;
        this.connection = connection;
        this.emit('begin', {
            timestamp: new Date()
        });
    }
    async query(query, params) {
        this.checkActive();
        try {
            const result = await this.client.query(query, params);
            this.metrics.operations++;
            return result;
        }
        catch (error) {
            await this.rollback();
            throw error;
        }
    }
    async commit() {
        this.checkActive();
        try {
            await this.client.query('COMMIT');
            this.isActive = false;
            this.metrics.endTime = Date.now();
            this.emit('commit', {
                metrics: this.metrics,
                timestamp: new Date()
            });
        }
        finally {
            this.client.release();
        }
    }
    async rollback() {
        if (!this.isActive)
            return;
        try {
            await this.client.query('ROLLBACK');
            this.isActive = false;
            this.metrics.endTime = Date.now();
            this.emit('rollback', {
                metrics: this.metrics,
                timestamp: new Date()
            });
        }
        finally {
            this.client.release();
        }
    }
    async savepoint(name) {
        this.checkActive();
        await this.client.query(`SAVEPOINT ${name}`);
        this.savepoints.set(name, this.metrics.operations);
        this.emit('savepoint', { name, timestamp: new Date() });
    }
    async rollbackToSavepoint(name) {
        this.checkActive();
        if (!this.savepoints.has(name)) {
            throw new Error(`Savepoint '${name}' does not exist`);
        }
        await this.client.query(`ROLLBACK TO SAVEPOINT ${name}`);
        this.emit('rollbackToSavepoint', { name, timestamp: new Date() });
    }
    async releaseSavepoint(name) {
        this.checkActive();
        if (!this.savepoints.has(name)) {
            throw new Error(`Savepoint '${name}' does not exist`);
        }
        await this.client.query(`RELEASE SAVEPOINT ${name}`);
        this.savepoints.delete(name);
        this.emit('releaseSavepoint', { name, timestamp: new Date() });
    }
    checkActive() {
        if (!this.isActive) {
            throw new Error('Transaction is no longer active');
        }
    }
    getMetrics() {
        return { ...this.metrics };
    }
    getDuration() {
        const end = this.metrics.endTime || Date.now();
        return end - this.metrics.startTime;
    }
}
exports.Transaction = Transaction;
var IsolationLevel;
(function (IsolationLevel) {
    IsolationLevel["ReadUncommitted"] = "READ UNCOMMITTED";
    IsolationLevel["ReadCommitted"] = "READ COMMITTED";
    IsolationLevel["RepeatableRead"] = "REPEATABLE READ";
    IsolationLevel["Serializable"] = "SERIALIZABLE";
})(IsolationLevel || (exports.IsolationLevel = IsolationLevel = {}));
//# sourceMappingURL=transaction.js.map