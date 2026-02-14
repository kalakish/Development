/// <reference types="node" />
import { EventEmitter } from 'events';
import { Session } from './session';
import { NovaApplication } from './application';
import { SQLServerConnection } from '../database/sqlserver-connection';
export declare class Company extends EventEmitter {
    readonly id: string;
    readonly name: string;
    readonly displayName: string;
    readonly database: string;
    readonly status: CompanyStatus;
    readonly settings: CompanySettings;
    readonly tenantId?: string;
    private initialized;
    private connection?;
    private application?;
    private activeSessions;
    private metadata;
    constructor(options: CompanyOptions);
    initialize(app: NovaApplication): Promise<void>;
    setContext(session: Session): Promise<void>;
    getConnection(): Promise<SQLServerConnection>;
    private ensureDatabaseSchema;
    private initializeCompanySchema;
    getSetting(key: string): Promise<any>;
    setSetting(key: string, value: any): Promise<void>;
    shutdown(): Promise<void>;
    getActiveSessionCount(): number;
    isInitialized(): boolean;
    toJSON(): object;
}
export declare enum CompanyStatus {
    Active = "active",
    Inactive = "inactive",
    Suspended = "suspended",
    Pending = "pending",
    Deleted = "deleted"
}
export interface CompanySettings {
    currency: string;
    dateFormat: string;
    timeZone: string;
    language: string;
    fiscalYearStart: string;
    [key: string]: any;
}
export interface CompanyOptions {
    id?: string;
    name: string;
    displayName?: string;
    database?: string;
    status?: CompanyStatus;
    settings?: Partial<CompanySettings>;
    tenantId?: string;
}
//# sourceMappingURL=company.d.ts.map