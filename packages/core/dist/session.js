"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.IsolationLevel = exports.LockMode = exports.Session = void 0;
const events_1 = require("events");
const permission_1 = require("@nova/security/permission");
const uuid_1 = require("uuid");
class Session extends events_1.EventEmitter {
    id;
    user;
    company;
    tenant;
    application;
    createdAt;
    lastActivity;
    transaction;
    permissions;
    variables = new Map();
    locks = new Map();
    isActive = true;
    context = {};
    constructor(options) {
        super();
        this.id = options.id;
        this.user = options.user;
        this.company = options.company;
        this.tenant = options.tenant;
        this.application = options.application;
        this.createdAt = options.createdAt;
        this.lastActivity = new Date();
        this.permissions = new permission_1.PermissionSet();
    }
    async initialize() {
        // Load user permissions
        this.permissions = await this.application.getSecurityManager()
            .getUserPermissionSet(this.user);
        // Set company context
        await this.company.setContext(this);
        // Set tenant context if available
        if (this.tenant) {
            await this.tenant.setContext(this);
        }
        this.emit('initialized', {
            sessionId: this.id,
            userId: this.user.id,
            companyId: this.company.id,
            tenantId: this.tenant?.id
        });
    }
    async close() {
        // Rollback any active transaction
        if (this.transaction) {
            await this.transaction.rollback();
        }
        // Release all locks
        await this.releaseAllLocks();
        this.isActive = false;
        this.emit('closed');
    }
    // ============ Transaction Management ============
    async beginTransaction(isolationLevel) {
        this.checkActive();
        if (this.transaction) {
            throw new Error('Transaction already active in this session');
        }
        const connection = await this.company.getConnection();
        this.transaction = await connection.beginTransaction(isolationLevel);
        this.transaction.on('commit', () => {
            this.transaction = undefined;
        });
        this.transaction.on('rollback', () => {
            this.transaction = undefined;
        });
        return this.transaction;
    }
    async commitTransaction() {
        this.checkActive();
        if (!this.transaction) {
            throw new Error('No active transaction to commit');
        }
        await this.transaction.commit();
    }
    async rollbackTransaction() {
        this.checkActive();
        if (!this.transaction) {
            throw new Error('No active transaction to rollback');
        }
        await this.transaction.rollback();
    }
    inTransaction() {
        return this.transaction !== undefined;
    }
    getTransaction() {
        return this.transaction;
    }
    // ============ Record Operations ============
    createRecord(tableName) {
        this.checkActive();
        const Record = require('@nova/orm/record').Record;
        return new Record(tableName, this);
    }
    // ============ Lock Management ============
    async lock(resource, mode = LockMode.Exclusive) {
        this.checkActive();
        if (this.locks.has(resource)) {
            return false;
        }
        const lock = {
            resource,
            mode,
            acquiredAt: new Date(),
            sessionId: this.id,
            id: (0, uuid_1.v4)()
        };
        // Acquire lock in database
        const acquired = await this.application.getDatabase()
            .acquireLock(resource, mode, this.id);
        if (acquired) {
            this.locks.set(resource, lock);
            this.emit('lockAcquired', lock);
        }
        return acquired;
    }
    async releaseLock(resource) {
        const lock = this.locks.get(resource);
        if (lock) {
            await this.application.getDatabase()
                .releaseLock(resource, this.id);
            this.locks.delete(resource);
            this.emit('lockReleased', lock);
        }
    }
    async releaseAllLocks() {
        for (const resource of this.locks.keys()) {
            await this.releaseLock(resource);
        }
    }
    // ============ Session Variables ============
    setVariable(name, value) {
        this.variables.set(name, value);
    }
    getVariable(name) {
        return this.variables.get(name);
    }
    clearVariable(name) {
        this.variables.delete(name);
    }
    clearAllVariables() {
        this.variables.clear();
    }
    // ============ Context Management ============
    setContext(key, value) {
        this.context[key] = value;
    }
    getContext(key) {
        return this.context[key];
    }
    clearContext(key) {
        if (key) {
            delete this.context[key];
        }
        else {
            this.context = {};
        }
    }
    // ============ Permission Checks ============
    hasPermission(permission, resource) {
        return this.permissions.hasPermission(permission, resource);
    }
    async checkPermission(permission, resource) {
        return this.application.getSecurityManager()
            .authorize(this, permission, resource);
    }
    getPermissions() {
        return this.permissions;
    }
    // ============ Tenant & Company ============
    async switchCompany(companyId) {
        const company = this.application.getCompany(companyId);
        if (!company) {
            throw new Error(`Company not found: ${companyId}`);
        }
        await company.setContext(this);
        this.company['current'] = company;
        this.emit('companySwitched', {
            companyId,
            timestamp: new Date()
        });
    }
    async switchTenant(tenantId) {
        const tenant = this.application.getTenant(tenantId);
        if (!tenant) {
            throw new Error(`Tenant not found: ${tenantId}`);
        }
        await tenant.setContext(this);
        this.tenant = tenant;
        this.emit('tenantSwitched', {
            tenantId,
            timestamp: new Date()
        });
    }
    // ============ Utility ============
    refreshActivity() {
        this.lastActivity = new Date();
    }
    checkActive() {
        if (!this.isActive) {
            throw new Error('Session is no longer active');
        }
    }
    // ============ Serialization ============
    toJSON() {
        return {
            id: this.id,
            user: {
                id: this.user.id,
                username: this.user.username,
                displayName: this.user.displayName,
                email: this.user.email,
                roles: this.user.roles,
                isSuperAdmin: this.user.isSuperAdmin
            },
            company: this.company.toJSON(),
            tenant: this.tenant?.toJSON(),
            createdAt: this.createdAt,
            lastActivity: this.lastActivity,
            isActive: this.isActive,
            inTransaction: this.inTransaction(),
            variableCount: this.variables.size,
            lockCount: this.locks.size
        };
    }
}
exports.Session = Session;
var LockMode;
(function (LockMode) {
    LockMode["Shared"] = "shared";
    LockMode["Exclusive"] = "exclusive";
    LockMode["Update"] = "update";
})(LockMode || (exports.LockMode = LockMode = {}));
var sqlserver_connection_1 = require("../database/sqlserver-connection");
Object.defineProperty(exports, "IsolationLevel", { enumerable: true, get: function () { return sqlserver_connection_1.IsolationLevel; } });
//# sourceMappingURL=session.js.map