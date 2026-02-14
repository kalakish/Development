import { EventEmitter } from 'events';
import { Session } from './session';
import { NovaApplication } from './application';
import { SQLServerConnection } from '../database/sqlserver-connection';
import { v4 as uuidv4 } from 'uuid';

export class Company extends EventEmitter {
    public readonly id: string;
    public readonly name: string;
    public readonly displayName: string;
    public readonly database: string;
    public readonly status: CompanyStatus;
    public readonly settings: CompanySettings;
    public readonly tenantId?: string;
    
    private initialized: boolean = false;
    private connection?: SQLServerConnection;
    private application?: NovaApplication;
    private activeSessions: Set<string> = new Set();
    private metadata: Record<string, any> = {};

    constructor(options: CompanyOptions) {
        super();
        this.id = options.id || uuidv4();
        this.name = options.name;
        this.displayName = options.displayName || options.name;
        this.database = options.database || `Company_${this.id.replace(/-/g, '_')}`;
        this.status = options.status || CompanyStatus.Active;
        this.settings = {
            currency: options.settings?.currency || 'USD',
            dateFormat: options.settings?.dateFormat || 'MM/dd/yyyy',
            timeZone: options.settings?.timeZone || 'UTC',
            language: options.settings?.language || 'en-US',
            fiscalYearStart: options.settings?.fiscalYearStart || '01-01',
            ...options.settings
        };
        this.tenantId = options.tenantId;
    }

    async initialize(app: NovaApplication): Promise<void> {
        if (this.initialized) return;
        
        this.application = app;
        
        // Ensure company database schema exists
        await this.ensureDatabaseSchema();
        
        this.initialized = true;
        this.emit('initialized');
    }

    async setContext(session: Session): Promise<void> {
        this.activeSessions.add(session.id);
        
        session.once('closed', () => {
            this.activeSessions.delete(session.id);
        });
        
        // Set database context for SQL Server
        const connection = await this.getConnection();
        await connection.query(`USE [${this.database}]`);
    }

    async getConnection(): Promise<SQLServerConnection> {
        if (!this.initialized) {
            throw new Error('Company not initialized');
        }

        if (!this.connection) {
            if (!this.application) {
                throw new Error('Application not set');
            }

            const baseConfig = this.application.getDatabase()['config'];
            
            // Create company-specific connection
            this.connection = new SQLServerConnection({
                ...baseConfig,
                database: this.database
            });
            
            await this.connection.connect();
            
            // Initialize company schema
            await this.initializeCompanySchema();
        }
        
        return this.connection;
    }

    private async ensureDatabaseSchema(): Promise<void> {
        try {
            const adminConnection = this.application?.getDatabase();
            
            // Check if database exists
            const checkResult = await adminConnection?.query(`
                SELECT 1 FROM sys.databases WHERE [name] = @database
            `, [this.database]);

            if (!checkResult || checkResult.recordset.length === 0) {
                // Create database
                await adminConnection?.query(`
                    CREATE DATABASE [${this.database}]
                `);
                
                this.emit('databaseCreated', {
                    companyId: this.id,
                    database: this.database,
                    timestamp: new Date()
                });
            }
        } catch (error) {
            throw new Error(`Failed to ensure company database: ${error.message}`);
        }
    }

    private async initializeCompanySchema(): Promise<void> {
        if (!this.connection) return;

        // Create system tables for company
        await this.connection.query(`
            IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'CompanySettings')
            BEGIN
                CREATE TABLE [CompanySettings] (
                    [Id] INT IDENTITY(1,1) NOT NULL,
                    [SystemId] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [DF_CompanySettings_SystemId] DEFAULT NEWID(),
                    [SettingKey] NVARCHAR(100) NOT NULL,
                    [SettingValue] NVARCHAR(MAX) NULL,
                    [SettingType] NVARCHAR(50) NOT NULL,
                    [IsSystem] BIT NOT NULL CONSTRAINT [DF_CompanySettings_IsSystem] DEFAULT 0,
                    [SystemCreatedAt] DATETIME2 NOT NULL CONSTRAINT [DF_CompanySettings_CreatedAt] DEFAULT GETUTCDATE(),
                    [SystemModifiedAt] DATETIME2 NULL,
                    CONSTRAINT [PK_CompanySettings] PRIMARY KEY CLUSTERED ([Id])
                );
                
                CREATE UNIQUE INDEX [UX_CompanySettings_SystemId] ON [CompanySettings] ([SystemId]);
                CREATE INDEX [IX_CompanySettings_SettingKey] ON [CompanySettings] ([SettingKey]);
            END
        `);

        // Insert default settings
        await this.connection.query(`
            MERGE INTO [CompanySettings] AS target
            USING (VALUES 
                ('Currency', @currency, 'String', 1),
                ('DateFormat', @dateFormat, 'String', 1),
                ('TimeZone', @timeZone, 'String', 1),
                ('Language', @language, 'String', 1),
                ('FiscalYearStart', @fiscalYearStart, 'String', 1)
            ) AS source ([SettingKey], [SettingValue], [SettingType], [IsSystem])
            ON target.[SettingKey] = source.[SettingKey]
            WHEN MATCHED THEN
                UPDATE SET [SettingValue] = source.[SettingValue]
            WHEN NOT MATCHED THEN
                INSERT ([SystemId], [SettingKey], [SettingValue], [SettingType], [IsSystem])
                VALUES (NEWID(), source.[SettingKey], source.[SettingValue], source.[SettingType], source.[IsSystem]);
        `, [
            this.settings.currency,
            this.settings.dateFormat,
            this.settings.timeZone,
            this.settings.language,
            this.settings.fiscalYearStart
        ]);
    }

    async getSetting(key: string): Promise<any> {
        const connection = await this.getConnection();
        
        const result = await connection.query(`
            SELECT [SettingValue], [SettingType]
            FROM [CompanySettings]
            WHERE [SettingKey] = @key
        `, [key]);

        if (result.recordset.length === 0) {
            return null;
        }

        const { SettingValue, SettingType } = result.recordset[0];
        
        switch (SettingType) {
            case 'Integer':
                return parseInt(SettingValue, 10);
            case 'Boolean':
                return SettingValue === 'true';
            case 'Decimal':
                return parseFloat(SettingValue);
            default:
                return SettingValue;
        }
    }

    async setSetting(key: string, value: any): Promise<void> {
        const connection = await this.getConnection();
        
        let type = 'String';
        if (typeof value === 'number') {
            type = Number.isInteger(value) ? 'Integer' : 'Decimal';
        } else if (typeof value === 'boolean') {
            type = 'Boolean';
        }

        await connection.query(`
            MERGE INTO [CompanySettings] AS target
            USING (SELECT @key AS [SettingKey]) AS source
            ON target.[SettingKey] = source.[SettingKey]
            WHEN MATCHED THEN
                UPDATE SET 
                    [SettingValue] = @value,
                    [SettingType] = @type,
                    [SystemModifiedAt] = GETUTCDATE()
            WHEN NOT MATCHED THEN
                INSERT ([SystemId], [SettingKey], [SettingValue], [SettingType])
                VALUES (NEWID(), @key, @value, @type);
        `, [key, String(value), type]);
    }

    async shutdown(): Promise<void> {
        // Close all active sessions
        for (const sessionId of this.activeSessions) {
            const session = this.application?.getSession(sessionId);
            if (session) {
                await session.close();
            }
        }
        
        // Close database connection
        if (this.connection) {
            await this.connection.disconnect();
            this.connection = undefined;
        }
        
        this.emit('shutdown');
    }

    getActiveSessionCount(): number {
        return this.activeSessions.size;
    }

    isInitialized(): boolean {
        return this.initialized;
    }

    toJSON(): object {
        return {
            id: this.id,
            name: this.name,
            displayName: this.displayName,
            database: this.database,
            status: this.status,
            settings: this.settings,
            tenantId: this.tenantId,
            activeSessions: this.activeSessions.size,
            initialized: this.initialized
        };
    }
}

export enum CompanyStatus {
    Active = 'active',
    Inactive = 'inactive',
    Suspended = 'suspended',
    Pending = 'pending',
    Deleted = 'deleted'
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