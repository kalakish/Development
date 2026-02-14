const sql = require('mssql');
const fs = require('fs-extra');
const path = require('path');

async function setupSQLServer() {
    const config = {
        server: process.env.SQL_SERVER || 'localhost',
        port: parseInt(process.env.SQL_PORT || '1433'),
        user: process.env.SQL_USER || 'sa',
        password: process.env.SQL_PASSWORD || 'pass@word1',
        options: {
            encrypt: process.env.SQL_ENCRYPT === 'true',
            trustServerCertificate: process.env.SQL_TRUST_SERVER_CERTIFICATE === 'true'
        }
    };

    console.log('🔧 Setting up SQL Server databases...');

    try {
        // Connect to master database
        const masterPool = await sql.connect({
            ...config,
            database: 'master'
        });

        // Create main database
        const dbName = process.env.SQL_DATABASE || 'NOVA_DB';
        await masterPool.request()
            .query(`IF NOT EXISTS (SELECT * FROM sys.databases WHERE name = '${dbName}')
                    BEGIN
                        CREATE DATABASE [${dbName}];
                        PRINT '✅ Database ${dbName} created';
                    END
                    ELSE
                        PRINT '📁 Database ${dbName} already exists'`);

        // Create metadata database
        const metadataDbName = process.env.METADATA_DATABASE || 'NOVA_Metadata';
        await masterPool.request()
            .query(`IF NOT EXISTS (SELECT * FROM sys.databases WHERE name = '${metadataDbName}')
                    BEGIN
                        CREATE DATABASE [${metadataDbName}];
                        PRINT '✅ Database ${metadataDbName} created';
                    END
                    ELSE
                        PRINT '📁 Database ${metadataDbName} already exists'`);

        await sql.close();

        // Now connect to main database and create schema
        const mainPool = await sql.connect({
            ...config,
            database: dbName
        });

        // Create schema version table
        await mainPool.request().query(`
            IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[SchemaVersion]') AND type in (N'U'))
            BEGIN
                CREATE TABLE [SchemaVersion] (
                    [Id] INT IDENTITY(1,1) NOT NULL,
                    [Version] NVARCHAR(50) NOT NULL,
                    [AppliedAt] DATETIME2 NOT NULL CONSTRAINT [DF_SchemaVersion_AppliedAt] DEFAULT GETUTCDATE(),
                    [Description] NVARCHAR(500) NULL,
                    CONSTRAINT [PK_SchemaVersion] PRIMARY KEY CLUSTERED ([Id])
                );
                
                INSERT INTO [SchemaVersion] ([Version], [Description])
                VALUES ('1.0.0', 'Initial schema');
                
                PRINT '✅ Schema version table created';
            END
        `);

        // Create audit log table
        await mainPool.request().query(`
            IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[AuditLog]') AND type in (N'U'))
            BEGIN
                CREATE TABLE [AuditLog] (
                    [Id] BIGINT IDENTITY(1,1) NOT NULL,
                    [SystemId] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [DF_AuditLog_SystemId] DEFAULT NEWID(),
                    [TableName] NVARCHAR(128) NOT NULL,
                    [Operation] CHAR(1) NOT NULL,
                    [RecordId] UNIQUEIDENTIFIER NOT NULL,
                    [OldData] NVARCHAR(MAX) NULL,
                    [NewData] NVARCHAR(MAX) NULL,
                    [ChangedBy] NVARCHAR(50) NULL,
                    [ChangedAt] DATETIME2 NOT NULL CONSTRAINT [DF_AuditLog_ChangedAt] DEFAULT GETUTCDATE(),
                    CONSTRAINT [PK_AuditLog] PRIMARY KEY CLUSTERED ([Id])
                );
                
                CREATE INDEX [IX_AuditLog_TableName] ON [AuditLog] ([TableName]);
                CREATE INDEX [IX_AuditLog_RecordId] ON [AuditLog] ([RecordId]);
                CREATE INDEX [IX_AuditLog_ChangedAt] ON [AuditLog] ([ChangedAt]);
                
                PRINT '✅ Audit log table created';
            END
        `);

        // Create job queue table
        await mainPool.request().query(`
            IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[JobQueue]') AND type in (N'U'))
            BEGIN
                CREATE TABLE [JobQueue] (
                    [Id] BIGINT IDENTITY(1,1) NOT NULL,
                    [SystemId] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [DF_JobQueue_SystemId] DEFAULT NEWID(),
                    [JobType] NVARCHAR(100) NOT NULL,
                    [Status] NVARCHAR(20) NOT NULL,
                    [Priority] INT NOT NULL CONSTRAINT [DF_JobQueue_Priority] DEFAULT 0,
                    [Data] NVARCHAR(MAX) NULL,
                    [Result] NVARCHAR(MAX) NULL,
                    [Error] NVARCHAR(MAX) NULL,
                    [ScheduledAt] DATETIME2 NULL,
                    [StartedAt] DATETIME2 NULL,
                    [CompletedAt] DATETIME2 NULL,
                    [CreatedAt] DATETIME2 NOT NULL CONSTRAINT [DF_JobQueue_CreatedAt] DEFAULT GETUTCDATE(),
                    [CreatedBy] NVARCHAR(50) NULL,
                    CONSTRAINT [PK_JobQueue] PRIMARY KEY CLUSTERED ([Id])
                );
                
                CREATE INDEX [IX_JobQueue_Status] ON [JobQueue] ([Status]);
                CREATE INDEX [IX_JobQueue_ScheduledAt] ON [JobQueue] ([ScheduledAt]);
                
                PRINT '✅ Job queue table created';
            END
        `);

        await sql.close();
        
        console.log('\n✅ SQL Server setup completed successfully!');
        console.log('\n📊 Databases created:');
        console.log(`   - ${dbName}`);
        console.log(`   - ${metadataDbName}`);

    } catch (error) {
        console.error('❌ SQL Server setup failed:', error);
        process.exit(1);
    }
}

setupSQLServer().catch(console.error);