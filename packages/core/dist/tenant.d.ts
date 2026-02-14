import { EventEmitter } from 'events';
import { SQLServerConnection, SQLServerConfig } from '../database/sqlserver-connection';
import { Company } from './company';
import { Session } from './session';
export declare class TenantManager {
    private static instance;
    private tenants;
    private tenantConnections;
    private defaultConnection?;
    private constructor();
    static getInstance(): TenantManager;
    initialize(connection: SQLServerConnection): Promise<void>;
    private ensureTenantTables;
    private loadTenants;
    registerTenant(config: TenantConfig): Promise<Tenant>;
    private createTenantDatabase;
    getTenant(tenantId: string): Promise<Tenant | undefined>;
    getTenantByCode(code: string): Promise<Tenant | undefined>;
    getTenantByDomain(domain: string): Promise<Tenant | undefined>;
    getTenants(): Promise<Tenant[]>;
    getTenantConnection(tenantId: string): Promise<SQLServerConnection>;
}
export declare class Tenant extends EventEmitter {
    readonly id: string;
    readonly name: string;
    readonly code: string;
    readonly displayName: string;
    readonly database: TenantDatabase;
    status: TenantStatus;
    settings: Record<string, any>;
    features: string[];
    domains: string[];
    version: string;
    private initialized;
    private companies;
    private activeSessions;
    constructor(options: TenantOptions);
    initialize(): Promise<void>;
    setContext(session: Session): Promise<void>;
    getConnection(): Promise<SQLServerConnection>;
    private ensureTenantSchema;
    private loadCompanies;
    createCompany(options: CompanyOptions): Promise<Company>;
    getCompanies(): Promise<Company[]>;
    getCompany(companyId: string): Promise<Company | undefined>;
    hasFeature(featureName: string): boolean;
    updateSettings(settings: Record<string, any>): Promise<void>;
    isInitialized(): boolean;
    getActiveSessionCount(): number;
    toJSON(): object;
}
export interface TenantConfig {
    name: string;
    code: string;
    displayName?: string;
    database?: Partial<SQLServerConfig>;
    settings?: Record<string, any>;
    features?: string[];
    domains?: string[];
    version?: string;
}
export interface TenantDatabase {
    server: string;
    database: string;
}
export interface TenantOptions {
    id: string;
    name: string;
    code: string;
    displayName?: string;
    database: TenantDatabase;
    status?: TenantStatus;
    settings?: Record<string, any>;
    features?: string[];
    domains?: string[];
    version?: string;
}
export declare enum TenantStatus {
    Active = "active",
    Inactive = "inactive",
    Suspended = "suspended",
    Migrating = "migrating"
}
//# sourceMappingURL=tenant.d.ts.map