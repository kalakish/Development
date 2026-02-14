import { EventEmitter } from 'events';
import { SQLServerConnection, SQLServerConfig } from '../database/sqlserver-connection';
import { Company } from './company';
import { Session } from './session';
import { v4 as uuidv4 } from 'uuid';

export class TenantManager {
    private static instance: TenantManager;
    private tenants: Map<string, Tenant> = new Map();
    private tenantConnections: Map<string, SQLServerConnection> = new Map();
    private defaultConnection?: SQLServerConnection;

    private constructor() {}

    static getInstance(): TenantManager {
        if (!TenantManager.instance) {
            TenantManager.instance = new TenantManager();
        }
        return TenantManager.instance;
    }

    async initialize(connection: SQLServerConnection): Promise<void> {
        this.defaultConnection = connection;
        await this.ensureTenantTables();
        await this.loadTenants();
    }

    private async ensureTenantTables(): Promise<void> {
        await this.defaultConnection?.query(`
            IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Tenant')
            BEGIN
                CREATE TABLE [Tenant] (
                    [Id] INT IDENTITY(1,1) NOT NULL,
                    [SystemId] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [DF_Tenant_SystemId] DEFAULT NEWID(),
                    [Name] NVARCHAR(100) NOT NULL,
                    [Code] NVARCHAR(50) NOT NULL,
                    [DisplayName] NVARCHAR(100) NULL,
                    [Status] NVARCHAR(20) NOT NULL CONSTRAINT [DF_Tenant_Status] DEFAULT 'active',
                    [DatabaseName] NVARCHAR(128) NOT NULL,
                    [DatabaseServer] NVARCHAR(128) NOT NULL,
                    [Settings] NVARCHAR(MAX) NULL,
                    [Features] NVARCHAR(MAX) NULL,
                    [Domains] NVARCHAR(MAX) NULL,
                    [Version] NVARCHAR(50) NOT NULL,
                    [SystemCreatedAt] DATETIME2 NOT NULL CONSTRAINT [DF_Tenant_CreatedAt] DEFAULT GETUTCDATE(),
                    [SystemModifiedAt] DATETIME2 NULL,
                    [SystemDeletedAt] DATETIME2 NULL,
                    CONSTRAINT [PK_Tenant] PRIMARY KEY CLUSTERED ([Id])
                );

                CREATE UNIQUE INDEX [UX_Tenant_SystemId] ON [Tenant] ([SystemId]);
                CREATE UNIQUE INDEX [UX_Tenant_Code] ON [Tenant] ([Code]) WHERE [SystemDeletedAt] IS NULL;
                CREATE INDEX [IX_Tenant_Status] ON [Tenant] ([Status]);
            END
        `);
    }

    private async loadTenants(): Promise<void> {
        const result = await this.defaultConnection?.query(`
            SELECT * FROM [Tenant] WHERE [SystemDeletedAt] IS NULL
        `);

        if (result) {
            for (const row of result.recordset) {
                const tenant = new Tenant({
                    id: row.SystemId,
                    name: row.Name,
                    code: row.Code,
                    displayName: row.DisplayName,
                    database: {
                        server: row.DatabaseServer,
                        database: row.DatabaseName
                    },
                    status: row.Status,
                    settings: JSON.parse(row.Settings || '{}'),
                    features: JSON.parse(row.Features || '[]'),
                    domains: JSON.parse(row.Domains || '[]'),
                    version: row.Version
                });
                
                this.tenants.set(tenant.id, tenant);
            }
        }
    }

    async registerTenant(config: TenantConfig): Promise<Tenant> {
        const tenantId = uuidv4();
        const databaseName = `Tenant_${config.code}`;

        // Create tenant database
        await this.createTenantDatabase(databaseName, config.database);

        const tenant = new Tenant({
            id: tenantId,
            name: config.name,
            code: config.code,
            displayName: config.displayName,
            database: {
                server: config.database?.server || this.defaultConnection?.['config'].server,
                database: databaseName
            },
            status: TenantStatus.Active,
            settings: config.settings || {},
            features: config.features || [],
            domains: config.domains || [],
            version: config.version || '1.0.0'
        });

        // Store in database
        await this.defaultConnection?.query(`
            INSERT INTO [Tenant] (
                [SystemId], [Name], [Code], [DisplayName], [Status],
                [DatabaseName], [DatabaseServer], [Settings], [Features], [Domains], [Version]
            ) VALUES (
                @SystemId, @Name, @Code, @DisplayName, @Status,
                @DatabaseName, @DatabaseServer, @Settings, @Features, @Domains, @Version
            )
        `, [
            tenant.id,
            tenant.name,
            tenant.code,
            tenant.displayName,
            tenant.status,
            tenant.database.database,
            tenant.database.server,
            JSON.stringify(tenant.settings),
            JSON.stringify(tenant.features),
            JSON.stringify(tenant.domains),
            tenant.version
        ]);

        this.tenants.set(tenant.id, tenant);
        
        return tenant;
    }

    private async createTenantDatabase(databaseName: string, config?: Partial<SQLServerConfig>): Promise<void> {
        const connection = this.defaultConnection;
        
        await connection?.query(`
            CREATE DATABASE [${databaseName}]
        `);
    }

    async getTenant(tenantId: string): Promise<Tenant | undefined> {
        return this.tenants.get(tenantId);
    }

    async getTenantByCode(code: string): Promise<Tenant | undefined> {
        for (const tenant of this.tenants.values()) {
            if (tenant.code === code) {
                return tenant;
            }
        }
        return undefined;
    }

    async getTenantByDomain(domain: string): Promise<Tenant | undefined> {
        for (const tenant of this.tenants.values()) {
            if (tenant.domains.includes(domain)) {
                return tenant;
            }
        }
        return undefined;
    }

    async getTenants(): Promise<Tenant[]> {
        return Array.from(this.tenants.values());
    }

    async getTenantConnection(tenantId: string): Promise<SQLServerConnection> {
        const tenant = await this.getTenant(tenantId);
        
        if (!tenant) {
            throw new Error(`Tenant not found: ${tenantId}`);
        }

        if (!this.tenantConnections.has(tenantId)) {
            const baseConfig = this.defaultConnection?.['config'];
            
            const connection = new SQLServerConnection({
                ...baseConfig,
                database: tenant.database.database
            });
            
            await connection.connect();
            this.tenantConnections.set(tenantId, connection);
        }

        return this.tenantConnections.get(tenantId)!;
    }
}

export class Tenant extends EventEmitter {
    public readonly id: string;
    public readonly name: string;
    public readonly code: string;
    public readonly displayName: string;
    public readonly database: TenantDatabase;
    public status: TenantStatus;
    public settings: Record<string, any>;
    public features: string[];
    public domains: string[];
    public version: string;
    
    private initialized: boolean = false;
    private companies: Map<string, Company> = new Map();
    private activeSessions: Set<string> = new Set();

    constructor(options: TenantOptions) {
        super();
        this.id = options.id;
        this.name = options.name;
        this.code = options.code;
        this.displayName = options.displayName || options.name;
        this.database = options.database;
        this.status = options.status || TenantStatus.Active;
        this.settings = options.settings || {};
        this.features = options.features || [];
        this.domains = options.domains || [];
        this.version = options.version || '1.0.0';
    }

    async initialize(): Promise<void> {
        if (this.initialized) return;
        
        await this.ensureTenantSchema();
        await this.loadCompanies();
        
        this.initialized = true;
        this.emit('initialized');
    }

    async setContext(session: Session): Promise<void> {
        this.activeSessions.add(session.id);
        
        session.once('closed', () => {
            this.activeSessions.delete(session.id);
        });
        
        // Set tenant context
        const connection = await this.getConnection();
        await connection.query(`USE [${this.database.database}]`);
    }

    async getConnection(): Promise<SQLServerConnection> {
        return TenantManager.getInstance().getTenantConnection(this.id);
    }

    private async ensureTenantSchema(): Promise<void> {
        const connection = await this.getConnection();

        // Create tenant system tables
        await connection.query(`
            IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'TenantSettings')
            BEGIN
                CREATE TABLE [TenantSettings] (
                    [Id] INT IDENTITY(1,1) NOT NULL,
                    [SystemId] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [DF_TenantSettings_SystemId] DEFAULT NEWID(),
                    [SettingKey] NVARCHAR(100) NOT NULL,
                    [SettingValue] NVARCHAR(MAX) NULL,
                    [SettingType] NVARCHAR(50) NOT NULL,
                    [IsSystem] BIT NOT NULL CONSTRAINT [DF_TenantSettings_IsSystem] DEFAULT 0,
                    [SystemCreatedAt] DATETIME2 NOT NULL CONSTRAINT [DF_TenantSettings_CreatedAt] DEFAULT GETUTCDATE(),
                    [SystemModifiedAt] DATETIME2 NULL,
                    CONSTRAINT [PK_TenantSettings] PRIMARY KEY CLUSTERED ([Id])
                );
            END
        `);
    }

    private async loadCompanies(): Promise<void> {
        const connection = await this.getConnection();
        
        const result = await connection.query(`
            SELECT * FROM [Company] WHERE [TenantId] = @tenantId AND [SystemDeletedAt] IS NULL
        `, [this.id]);

        for (const row of result.recordset) {
            const company = new Company({
                id: row.SystemId,
                name: row.Name,
                displayName: row.DisplayName,
                database: row.DatabaseName,
                status: row.Status,
                settings: JSON.parse(row.Settings || '{}'),
                tenantId: this.id
            });
            
            this.companies.set(company.id, company);
        }
    }

    async createCompany(options: CompanyOptions): Promise<Company> {
        const company = new Company({
            ...options,
            tenantId: this.id
        });

        await company.initialize(this as any);
        
        const connection = await this.getConnection();
        
        await connection.query(`
            INSERT INTO [Company] (
                [SystemId], [Name], [DisplayName], [DatabaseName], [Status], [Settings], [TenantId]
            ) VALUES (
                @SystemId, @Name, @DisplayName, @DatabaseName, @Status, @Settings, @TenantId
            )
        `, [
            company.id,
            company.name,
            company.displayName,
            company.database,
            company.status,
            JSON.stringify(company.settings),
            this.id
        ]);

        this.companies.set(company.id, company);
        
        return company;
    }

    async getCompanies(): Promise<Company[]> {
        return Array.from(this.companies.values());
    }

    async getCompany(companyId: string): Promise<Company | undefined> {
        return this.companies.get(companyId);
    }

    hasFeature(featureName: string): boolean {
        return this.features.includes(featureName);
    }

    async updateSettings(settings: Record<string, any>): Promise<void> {
        this.settings = { ...this.settings, ...settings };
        
        const connection = await this.getConnection();
        
        for (const [key, value] of Object.entries(settings)) {
            await connection.query(`
                MERGE INTO [TenantSettings] AS target
                USING (SELECT @key AS [SettingKey]) AS source
                ON target.[SettingKey] = source.[SettingKey]
                WHEN MATCHED THEN
                    UPDATE SET 
                        [SettingValue] = @value,
                        [SettingType] = @type,
                        [SystemModifiedAt] = GETUTCDATE()
                WHEN NOT MATCHED THEN
                    INSERT ([SystemId], [SettingKey], [SettingValue], [SettingType], [IsSystem])
                    VALUES (NEWID(), @key, @value, @type, 0);
            `, [
                key,
                String(value),
                typeof value === 'number' ? (Number.isInteger(value) ? 'Integer' : 'Decimal') :
                typeof value === 'boolean' ? 'Boolean' : 'String'
            ]);
        }
    }

    isInitialized(): boolean {
        return this.initialized;
    }

    getActiveSessionCount(): number {
        return this.activeSessions.size;
    }

    toJSON(): object {
        return {
            id: this.id,
            name: this.name,
            code: this.code,
            displayName: this.displayName,
            database: this.database,
            status: this.status,
            settings: this.settings,
            features: this.features,
            domains: this.domains,
            version: this.version,
            initialized: this.initialized,
            activeSessions: this.activeSessions.size,
            companyCount: this.companies.size
        };
    }
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

export enum TenantStatus {
    Active = 'active',
    Inactive = 'inactive',
    Suspended = 'suspended',
    Migrating = 'migrating'
}