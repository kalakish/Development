import { EventEmitter } from 'events';
import { NovaApplication, User } from './application';
import { Company } from './company';
import { Tenant } from './tenant';
import { SQLServerTransaction, IsolationLevel } from '../database/sqlserver-connection';
import { Record } from '@nova/orm/record';
import { PermissionSet } from '@nova/security/permission';
import { v4 as uuidv4 } from 'uuid';

export class Session extends EventEmitter {
    public readonly id: string;
    public readonly user: User;
    public readonly company: Company;
    public readonly tenant?: Tenant;
    public readonly application: NovaApplication;
    public readonly createdAt: Date;
    public lastActivity: Date;
    
    private transaction?: SQLServerTransaction;
    private permissions: PermissionSet;
    private variables: Map<string, any> = new Map();
    private locks: Map<string, Lock> = new Map();
    private isActive: boolean = true;
    private context: Record<string, any> = {};

    constructor(options: SessionOptions) {
        super();
        this.id = options.id;
        this.user = options.user;
        this.company = options.company;
        this.tenant = options.tenant;
        this.application = options.application;
        this.createdAt = options.createdAt;
        this.lastActivity = new Date();
        
        this.permissions = new PermissionSet();
    }

    async initialize(): Promise<void> {
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

    async close(): Promise<void> {
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

    async beginTransaction(isolationLevel?: IsolationLevel): Promise<SQLServerTransaction> {
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

    async commitTransaction(): Promise<void> {
        this.checkActive();
        
        if (!this.transaction) {
            throw new Error('No active transaction to commit');
        }
        
        await this.transaction.commit();
    }

    async rollbackTransaction(): Promise<void> {
        this.checkActive();
        
        if (!this.transaction) {
            throw new Error('No active transaction to rollback');
        }
        
        await this.transaction.rollback();
    }

    inTransaction(): boolean {
        return this.transaction !== undefined;
    }

    getTransaction(): SQLServerTransaction | undefined {
        return this.transaction;
    }

    // ============ Record Operations ============

    createRecord<T = any>(tableName: string): Record<T> {
        this.checkActive();
        
        const Record = require('@nova/orm/record').Record;
        return new Record(tableName, this);
    }

    // ============ Lock Management ============

    async lock(resource: string, mode: LockMode = LockMode.Exclusive): Promise<boolean> {
        this.checkActive();
        
        if (this.locks.has(resource)) {
            return false;
        }
        
        const lock: Lock = {
            resource,
            mode,
            acquiredAt: new Date(),
            sessionId: this.id,
            id: uuidv4()
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

    async releaseLock(resource: string): Promise<void> {
        const lock = this.locks.get(resource);
        
        if (lock) {
            await this.application.getDatabase()
                .releaseLock(resource, this.id);
            this.locks.delete(resource);
            this.emit('lockReleased', lock);
        }
    }

    private async releaseAllLocks(): Promise<void> {
        for (const resource of this.locks.keys()) {
            await this.releaseLock(resource);
        }
    }

    // ============ Session Variables ============

    setVariable(name: string, value: any): void {
        this.variables.set(name, value);
    }

    getVariable<T = any>(name: string): T | undefined {
        return this.variables.get(name);
    }

    clearVariable(name: string): void {
        this.variables.delete(name);
    }

    clearAllVariables(): void {
        this.variables.clear();
    }

    // ============ Context Management ============

    setContext(key: string, value: any): void {
        this.context[key] = value;
    }

    getContext<T = any>(key: string): T | undefined {
        return this.context[key];
    }

    clearContext(key?: string): void {
        if (key) {
            delete this.context[key];
        } else {
            this.context = {};
        }
    }

    // ============ Permission Checks ============

    hasPermission(permission: string, resource?: string): boolean {
        return this.permissions.hasPermission(permission, resource);
    }

    async checkPermission(permission: string, resource?: string): Promise<boolean> {
        return this.application.getSecurityManager()
            .authorize(this, permission, resource);
    }

    getPermissions(): PermissionSet {
        return this.permissions;
    }

    // ============ Tenant & Company ============

    async switchCompany(companyId: string): Promise<void> {
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

    async switchTenant(tenantId: string): Promise<void> {
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

    refreshActivity(): void {
        this.lastActivity = new Date();
    }

    private checkActive(): void {
        if (!this.isActive) {
            throw new Error('Session is no longer active');
        }
    }

    // ============ Serialization ============

    toJSON(): object {
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

export interface SessionOptions {
    id: string;
    user: User;
    company: Company;
    tenant?: Tenant;
    application: NovaApplication;
    createdAt: Date;
}

export enum LockMode {
    Shared = 'shared',
    Exclusive = 'exclusive',
    Update = 'update'
}

export interface Lock {
    id: string;
    resource: string;
    mode: LockMode;
    acquiredAt: Date;
    sessionId: string;
}

export { IsolationLevel } from '../database/sqlserver-connection';