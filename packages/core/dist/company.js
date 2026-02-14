"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CompanyStatus = exports.Company = void 0;
const events_1 = require("events");
const sqlserver_connection_1 = require("../database/sqlserver-connection");
const uuid_1 = require("uuid");
class Company extends events_1.EventEmitter {
    id;
    name;
    displayName;
    database;
    status;
    settings;
    tenantId;
    initialized = false;
    connection;
    application;
    activeSessions = new Set();
    metadata = {};
    constructor(options) {
        super();
        this.id = options.id || (0, uuid_1.v4)();
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
    async initialize(app) {
        if (this.initialized)
            return;
        this.application = app;
        // Ensure company database schema exists
        await this.ensureDatabaseSchema();
        this.initialized = true;
        this.emit('initialized');
    }
    async setContext(session) {
        this.activeSessions.add(session.id);
        session.once('closed', () => {
            this.activeSessions.delete(session.id);
        });
        // Set database context for SQL Server
        const connection = await this.getConnection();
        await connection.query(`USE [${this.database}]`);
    }
    async getConnection() {
        if (!this.initialized) {
            throw new Error('Company not initialized');
        }
        if (!this.connection) {
            if (!this.application) {
                throw new Error('Application not set');
            }
            const baseConfig = this.application.getDatabase()['config'];
            // Create company-specific connection
            this.connection = new sqlserver_connection_1.SQLServerConnection({
                ...baseConfig,
                database: this.database
            });
            await this.connection.connect();
            // Initialize company schema
            await this.initializeCompanySchema();
        }
        return this.connection;
    }
    async ensureDatabaseSchema() {
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
        }
        catch (error) {
            throw new Error(`Failed to ensure company database: ${error.message}`);
        }
    }
    async initializeCompanySchema() {
        if (!this.connection)
            return;
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
    async getSetting(key) {
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
    async setSetting(key, value) {
        const connection = await this.getConnection();
        let type = 'String';
        if (typeof value === 'number') {
            type = Number.isInteger(value) ? 'Integer' : 'Decimal';
        }
        else if (typeof value === 'boolean') {
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
    async shutdown() {
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
    getActiveSessionCount() {
        return this.activeSessions.size;
    }
    isInitialized() {
        return this.initialized;
    }
    toJSON() {
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
exports.Company = Company;
var CompanyStatus;
(function (CompanyStatus) {
    CompanyStatus["Active"] = "active";
    CompanyStatus["Inactive"] = "inactive";
    CompanyStatus["Suspended"] = "suspended";
    CompanyStatus["Pending"] = "pending";
    CompanyStatus["Deleted"] = "deleted";
})(CompanyStatus || (exports.CompanyStatus = CompanyStatus = {}));
//# sourceMappingURL=company.js.map