/// <reference types="node" />
import { EventEmitter } from 'events';
import { SQLServerConnection } from '../database/sqlserver-connection';
import { MetadataManager } from '@nova/metadata';
import { EventDispatcher } from '../events/event-dispatcher';
import { SecurityManager } from '@nova/security';
import { Session } from './session';
import { Company } from './company';
import { Tenant, TenantManager } from './tenant';
import { ExtensionManager } from './extension';
export declare class NovaApplication extends EventEmitter {
    private static instance;
    private metadataManager;
    private database;
    private eventDispatcher;
    private securityManager;
    private extensionManager;
    private tenantManager;
    private logger;
    private sessions;
    private companies;
    private tenants;
    private extensions;
    private status;
    private startTime;
    private config;
    private instanceId;
    private constructor();
    static initialize(config: ApplicationConfig): Promise<NovaApplication>;
    static getInstance(): NovaApplication;
    private start;
    shutdown(): Promise<void>;
    createSession(user: User, companyId?: string, tenantId?: string): Promise<Session>;
    getSession(sessionId: string): Promise<Session | undefined>;
    endSession(sessionId: string): Promise<void>;
    private loadCompanies;
    private loadTenants;
    private registerSystemEvents;
    private startBackgroundServices;
    private stopBackgroundServices;
    private cleanupSessions;
    private cleanupCache;
    private generateSessionId;
    private getDefaultCompany;
    private getDefaultTenant;
    getMetadataManager(): MetadataManager;
    getDatabase(): SQLServerConnection;
    getEventDispatcher(): EventDispatcher;
    getSecurityManager(): SecurityManager;
    getExtensionManager(): ExtensionManager;
    getTenantManager(): TenantManager;
    getCompanies(): Company[];
    getCompany(id: string): Company | undefined;
    getTenants(): Tenant[];
    getTenant(id: string): Tenant | undefined;
    getSessions(): Session[];
    getStatus(): ApplicationStatus;
    getUptime(): number;
    getConfig(): ApplicationConfig;
    getInstanceId(): string;
}
export declare enum ApplicationStatus {
    Initializing = "initializing",
    Running = "running",
    ShuttingDown = "shuttingDown",
    Stopped = "stopped",
    Error = "error"
}
export interface ApplicationConfig {
    name: string;
    version: string;
    environment: 'development' | 'staging' | 'production';
    metadata?: {
        connection?: SQLServerConfig;
        cacheTTL?: number;
    };
    database: SQLServerConfig;
    security?: {
        jwtSecret: string;
        tokenExpiry: string;
        bcryptRounds: number;
        sessionTimeout: number;
        maxLoginAttempts?: number;
        lockoutDuration?: number;
    };
    extensions?: {
        paths: string[];
        autoLoad: boolean;
    };
    audit?: {
        enabled: boolean;
        retentionDays: number;
    };
    healthCheck?: boolean;
    debug?: boolean;
}
export interface User {
    id: string;
    username: string;
    password?: string;
    displayName: string;
    email: string;
    roles: string[];
    isSuperAdmin?: boolean;
    tenantId?: string;
    preferences?: Record<string, any>;
}
export interface SQLServerConfig {
    server: string;
    port?: number;
    database: string;
    user: string;
    password: string;
    poolSize?: number;
    encrypt?: boolean;
    trustServerCertificate?: boolean;
    requestTimeout?: number;
    connectionTimeout?: number;
}
//# sourceMappingURL=application.d.ts.map