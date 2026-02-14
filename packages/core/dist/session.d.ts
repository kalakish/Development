/// <reference types="node" />
import { EventEmitter } from 'events';
import { NovaApplication, User } from './application';
import { Company } from './company';
import { Tenant } from './tenant';
import { SQLServerTransaction, IsolationLevel } from '../database/sqlserver-connection';
import { Record } from '@nova/orm/record';
import { PermissionSet } from '@nova/security/permission';
export declare class Session extends EventEmitter {
    readonly id: string;
    readonly user: User;
    readonly company: Company;
    readonly tenant?: Tenant;
    readonly application: NovaApplication;
    readonly createdAt: Date;
    lastActivity: Date;
    private transaction?;
    private permissions;
    private variables;
    private locks;
    private isActive;
    private context;
    constructor(options: SessionOptions);
    initialize(): Promise<void>;
    close(): Promise<void>;
    beginTransaction(isolationLevel?: IsolationLevel): Promise<SQLServerTransaction>;
    commitTransaction(): Promise<void>;
    rollbackTransaction(): Promise<void>;
    inTransaction(): boolean;
    getTransaction(): SQLServerTransaction | undefined;
    createRecord<T = any>(tableName: string): Record<T>;
    lock(resource: string, mode?: LockMode): Promise<boolean>;
    releaseLock(resource: string): Promise<void>;
    private releaseAllLocks;
    setVariable(name: string, value: any): void;
    getVariable<T = any>(name: string): T | undefined;
    clearVariable(name: string): void;
    clearAllVariables(): void;
    setContext(key: string, value: any): void;
    getContext<T = any>(key: string): T | undefined;
    clearContext(key?: string): void;
    hasPermission(permission: string, resource?: string): boolean;
    checkPermission(permission: string, resource?: string): Promise<boolean>;
    getPermissions(): PermissionSet;
    switchCompany(companyId: string): Promise<void>;
    switchTenant(tenantId: string): Promise<void>;
    refreshActivity(): void;
    private checkActive;
    toJSON(): object;
}
export interface SessionOptions {
    id: string;
    user: User;
    company: Company;
    tenant?: Tenant;
    application: NovaApplication;
    createdAt: Date;
}
export declare enum LockMode {
    Shared = "shared",
    Exclusive = "exclusive",
    Update = "update"
}
export interface Lock {
    id: string;
    resource: string;
    mode: LockMode;
    acquiredAt: Date;
    sessionId: string;
}
export { IsolationLevel } from '../database/sqlserver-connection';
//# sourceMappingURL=session.d.ts.map