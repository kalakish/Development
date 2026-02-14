import { EventEmitter } from 'events';
import { SQLServerConnection } from '../database/sqlserver-connection';
import { MetadataManager } from '@nova/metadata';
import { EventDispatcher } from '../events/event-dispatcher';
import { SecurityManager } from '@nova/security';
import { Session } from './session';
import { Company } from './company';
import { Tenant, TenantManager } from './tenant';
import { ExtensionManager } from './extension';
import { Logger } from './utils/logger';
import { v4 as uuidv4 } from 'uuid';

export class NovaApplication extends EventEmitter {
    private static instance: NovaApplication;
    private metadataManager: MetadataManager;
    private database: SQLServerConnection;
    private eventDispatcher: EventDispatcher;
    private securityManager: SecurityManager;
    private extensionManager: ExtensionManager;
    private tenantManager: TenantManager;
    private logger: Logger;
    
    private sessions: Map<string, Session> = new Map();
    private companies: Map<string, Company> = new Map();
    private tenants: Map<string, Tenant> = new Map();
    private extensions: Map<string, any> = new Map();
    
    private status: ApplicationStatus = ApplicationStatus.Initializing;
    private startTime: Date;
    private config: ApplicationConfig;
    private instanceId: string;

    private constructor(config: ApplicationConfig) {
        super();
        this.config = config;
        this.startTime = new Date();
        this.instanceId = uuidv4();
        this.logger = new Logger('NovaApplication');
    }

    static async initialize(config: ApplicationConfig): Promise<NovaApplication> {
        if (!NovaApplication.instance) {
            NovaApplication.instance = new NovaApplication(config);
            await NovaApplication.instance.start();
        }
        return NovaApplication.instance;
    }

    static getInstance(): NovaApplication {
        if (!NovaApplication.instance) {
            throw new Error('Application not initialized. Call NovaApplication.initialize() first.');
        }
        return NovaApplication.instance;
    }

    private async start(): Promise<void> {
        try {
            this.logger.info('Initializing NOVA Application...');

            // Initialize metadata manager
            this.metadataManager = MetadataManager.getInstance();
            await this.metadataManager.initialize({
                connection: this.config.metadata,
                cacheTTL: this.config.metadata?.cacheTTL || 3600
            });

            // Initialize database connection
            this.database = new SQLServerConnection(this.config.database);
            await this.database.connect();

            // Initialize event dispatcher
            this.eventDispatcher = EventDispatcher.getInstance();
            await this.eventDispatcher.initialize();

            // Initialize security manager
            this.securityManager = SecurityManager.getInstance();
            await this.securityManager.initialize(this.config.security);

            // Initialize extension manager
            this.extensionManager = new ExtensionManager();
            await this.extensionManager.loadExtensions(this.config.extensions);

            // Initialize tenant manager
            this.tenantManager = TenantManager.getInstance();
            await this.tenantManager.initialize(this.database);

            // Load companies
            await this.loadCompanies();

            // Load tenants
            await this.loadTenants();

            // Register system event handlers
            this.registerSystemEvents();

            this.status = ApplicationStatus.Running;
            this.logger.success('NOVA Application initialized successfully');
            
            this.emit('initialized', {
                instanceId: this.instanceId,
                timestamp: new Date(),
                config: this.config
            });

        } catch (error) {
            this.status = ApplicationStatus.Error;
            this.logger.error(`Failed to initialize application: ${error.message}`);
            throw error;
        }
    }

    async shutdown(): Promise<void> {
        this.logger.info('Shutting down NOVA Application...');
        
        this.status = ApplicationStatus.ShuttingDown;
        
        // Close all sessions
        for (const [id, session] of this.sessions) {
            await session.close();
            this.sessions.delete(id);
        }
        
        // Close database connection
        await this.database.disconnect();
        
        // Stop background services
        this.stopBackgroundServices();
        
        this.status = ApplicationStatus.Stopped;
        this.logger.success('NOVA Application shutdown complete');
        
        this.emit('shutdown', {
            instanceId: this.instanceId,
            timestamp: new Date(),
            uptime: this.getUptime()
        });
    }

    async createSession(user: User, companyId?: string, tenantId?: string): Promise<Session> {
        // Authenticate user
        const authenticatedUser = await this.securityManager.authenticate({
            username: user.username,
            password: user.password
        });

        // Get company
        let company: Company | undefined;
        if (companyId) {
            company = this.companies.get(companyId);
        } else {
            company = this.getDefaultCompany();
        }

        if (!company) {
            throw new Error('No company available for session');
        }

        // Get tenant
        let tenant: Tenant | undefined;
        if (tenantId) {
            tenant = this.tenants.get(tenantId);
        } else {
            tenant = this.getDefaultTenant();
        }

        // Create session
        const session = new Session({
            id: this.generateSessionId(),
            user: authenticatedUser,
            company,
            tenant,
            application: this,
            createdAt: new Date()
        });
        
        // Initialize session
        await session.initialize();
        
        // Store session
        this.sessions.set(session.id, session);
        
        // Emit event
        await this.eventDispatcher.dispatch('application:sessionCreated', {
            sessionId: session.id,
            userId: authenticatedUser.id,
            companyId: company.id,
            tenantId: tenant?.id,
            timestamp: new Date()
        });
        
        return session;
    }

    async getSession(sessionId: string): Promise<Session | undefined> {
        return this.sessions.get(sessionId);
    }

    async endSession(sessionId: string): Promise<void> {
        const session = this.sessions.get(sessionId);
        if (session) {
            await session.close();
            this.sessions.delete(sessionId);
            
            await this.eventDispatcher.dispatch('application:sessionEnded', {
                sessionId,
                timestamp: new Date()
            });
        }
    }

    private async loadCompanies(): Promise<void> {
        try {
            const result = await this.database.query(
                'SELECT * FROM [Company] WHERE [SystemDeletedAt] IS NULL'
            );
            
            for (const row of result.recordset) {
                const company = new Company({
                    id: row.SystemId,
                    name: row.Name,
                    displayName: row.DisplayName,
                    database: row.DatabaseName,
                    status: row.Status,
                    settings: JSON.parse(row.Settings || '{}'),
                    tenantId: row.TenantId
                });
                
                await company.initialize(this);
                this.companies.set(company.id, company);
            }
            
            this.logger.info(`Loaded ${this.companies.size} companies`);
        } catch (error) {
            this.logger.error(`Failed to load companies: ${error.message}`);
        }
    }

    private async loadTenants(): Promise<void> {
        try {
            const tenants = await this.tenantManager.getTenants();
            for (const tenant of tenants) {
                this.tenants.set(tenant.id, tenant);
            }
            this.logger.info(`Loaded ${this.tenants.size} tenants`);
        } catch (error) {
            this.logger.error(`Failed to load tenants: ${error.message}`);
        }
    }

    private registerSystemEvents(): void {
        // Global error handler
        process.on('uncaughtException', (error) => {
            this.logger.error(`Uncaught Exception: ${error.message}`);
            this.emit('error', { error, type: 'uncaughtException' });
        });

        process.on('unhandledRejection', (reason) => {
            this.logger.error(`Unhandled Rejection: ${reason}`);
            this.emit('error', { error: reason, type: 'unhandledRejection' });
        });

        // Graceful shutdown
        process.on('SIGTERM', () => this.shutdown());
        process.on('SIGINT', () => this.shutdown());
    }

    private startBackgroundServices(): void {
        // Session cleanup service
        setInterval(() => {
            this.cleanupSessions();
        }, 1800000); // Every 30 minutes

        // Cache cleanup service
        setInterval(() => {
            this.cleanupCache();
        }, 3600000); // Every hour
    }

    private stopBackgroundServices(): void {
        // Clear all intervals
        // Implementation would track and clear intervals
    }

    private async cleanupSessions(): Promise<void> {
        const now = Date.now();
        const sessionTimeout = this.config.security?.sessionTimeout || 3600000; // 1 hour
        
        for (const [id, session] of this.sessions) {
            if (now - session.lastActivity.getTime() > sessionTimeout) {
                await this.endSession(id);
            }
        }
    }

    private cleanupCache(): void {
        // Clear expired cache entries
        this.metadataManager.clearCache();
    }

    private generateSessionId(): string {
        return `ses_${Date.now()}_${uuidv4()}`;
    }

    private getDefaultCompany(): Company | undefined {
        return Array.from(this.companies.values())[0];
    }

    private getDefaultTenant(): Tenant | undefined {
        return Array.from(this.tenants.values())[0];
    }

    // ============ Public API ============

    getMetadataManager(): MetadataManager {
        return this.metadataManager;
    }

    getDatabase(): SQLServerConnection {
        return this.database;
    }

    getEventDispatcher(): EventDispatcher {
        return this.eventDispatcher;
    }

    getSecurityManager(): SecurityManager {
        return this.securityManager;
    }

    getExtensionManager(): ExtensionManager {
        return this.extensionManager;
    }

    getTenantManager(): TenantManager {
        return this.tenantManager;
    }

    getCompanies(): Company[] {
        return Array.from(this.companies.values());
    }

    getCompany(id: string): Company | undefined {
        return this.companies.get(id);
    }

    getTenants(): Tenant[] {
        return Array.from(this.tenants.values());
    }

    getTenant(id: string): Tenant | undefined {
        return this.tenants.get(id);
    }

    getSessions(): Session[] {
        return Array.from(this.sessions.values());
    }

    getStatus(): ApplicationStatus {
        return this.status;
    }

    getUptime(): number {
        return Date.now() - this.startTime.getTime();
    }

    getConfig(): ApplicationConfig {
        return { ...this.config };
    }

    getInstanceId(): string {
        return this.instanceId;
    }
}

export enum ApplicationStatus {
    Initializing = 'initializing',
    Running = 'running',
    ShuttingDown = 'shuttingDown',
    Stopped = 'stopped',
    Error = 'error'
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