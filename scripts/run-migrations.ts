import sql from 'mssql';
import fs from 'fs-extra';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

interface Migration {
    id: number;
    name: string;
    version: string;
    filename: string;
    appliedAt?: Date;
}

export class SQLServerMigrationRunner {
    private pool: sql.ConnectionPool;
    private config: sql.config;

    constructor() {
        this.config = {
            server: process.env.SQL_SERVER || 'localhost',
            port: parseInt(process.env.SQL_PORT || '1433'),
            database: process.env.SQL_DATABASE || 'NOVA_DB',
            user: process.env.SQL_USER || 'sa',
            password: process.env.SQL_PASSWORD || '',
            options: {
                encrypt: process.env.SQL_ENCRYPT === 'true',
                trustServerCertificate: process.env.SQL_TRUST_SERVER_CERTIFICATE === 'true',
                enableArithAbort: true,
                useUTC: true
            },
            pool: {
                max: 10,
                min: 0,
                idleTimeoutMillis: 30000
            }
        };
    }

    async initialize(): Promise<void> {
        try {
            this.pool = await sql.connect(this.config);
            console.log('✅ Connected to SQL Server');

            // Create migrations table if not exists
            await this.createMigrationsTable();
        } catch (error) {
            console.error('❌ Failed to connect to SQL Server:', error);
            throw error;
        }
    }

    private async createMigrationsTable(): Promise<void> {
        const query = `
            IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[__Migrations]') AND type in (N'U'))
            BEGIN
                CREATE TABLE [__Migrations] (
                    [Id] INT IDENTITY(1,1) NOT NULL,
                    [MigrationId] NVARCHAR(255) NOT NULL,
                    [Name] NVARCHAR(255) NOT NULL,
                    [Version] NVARCHAR(50) NOT NULL,
                    [Filename] NVARCHAR(500) NOT NULL,
                    [AppliedAt] DATETIME2 NOT NULL CONSTRAINT [DF_Migrations_AppliedAt] DEFAULT GETUTCDATE(),
                    [Duration] INT NOT NULL,
                    [Checksum] NVARCHAR(64) NOT NULL,
                    [Script] NVARCHAR(MAX) NULL,
                    [AppliedBy] NVARCHAR(100) NULL,
                    [Status] NVARCHAR(20) NOT NULL CONSTRAINT [DF_Migrations_Status] DEFAULT 'Success',
                    [Error] NVARCHAR(MAX) NULL,
                    CONSTRAINT [PK_Migrations] PRIMARY KEY CLUSTERED ([Id])
                );

                CREATE UNIQUE INDEX [UX_Migrations_MigrationId] ON [__Migrations] ([MigrationId]);
                
                PRINT '✅ Created migrations tracking table';
            END
        `;

        await this.pool.request().query(query);
    }

    async createMigration(name: string): Promise<string> {
        const timestamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '');
        const version = timestamp.substring(0, 14);
        const migrationId = `${version}_${name.replace(/\s+/g, '_')}`;
        const filename = `${migrationId}.sql`;
        const filepath = path.join(process.cwd(), 'migrations', filename);

        // Ensure migrations directory exists
        await fs.ensureDir(path.join(process.cwd(), 'migrations'));

        // Create migration template
        const template = `-- Migration: ${name}
-- Version: ${version}
-- Created: ${new Date().toISOString()}

BEGIN TRANSACTION;
SET XACT_ABORT ON;
SET NOCOUNT ON;

PRINT N'Starting migration ${migrationId}...';

-- ==========================================================
-- UP Migration
-- ==========================================================

-- Write your migration SQL here
-- Example:
/*
CREATE TABLE [Example] (
    [Id] INT IDENTITY(1,1) NOT NULL,
    [Name] NVARCHAR(100) NOT NULL,
    [CreatedAt] DATETIME2 NOT NULL CONSTRAINT [DF_Example_CreatedAt] DEFAULT GETUTCDATE(),
    CONSTRAINT [PK_Example] PRIMARY KEY CLUSTERED ([Id])
);
*/

-- ==========================================================
-- Data Migration (if any)
-- ==========================================================

-- ==========================================================
-- Validation
-- ==========================================================

PRINT N'Migration ${migrationId} completed successfully.';

COMMIT TRANSACTION;
GO

-- ==========================================================
-- DOWN Migration (for rollback)
-- ==========================================================
/*
BEGIN TRANSACTION;
    -- Write rollback SQL here
COMMIT TRANSACTION;
*/
`;

        await fs.writeFile(filepath, template);
        console.log(`✅ Created migration: ${filename}`);

        return migrationId;
    }

    async migrate(targetVersion?: string): Promise<void> {
        console.log('\n🚀 Starting database migrations...');

        // Get applied migrations
        const applied = await this.getAppliedMigrations();
        const appliedSet = new Set(applied.map(m => m.migrationId));

        // Get all migration files
        const migrationsDir = path.join(process.cwd(), 'migrations');
        await fs.ensureDir(migrationsDir);

        const files = await fs.readdir(migrationsDir);
        const migrationFiles = files
            .filter(f => f.endsWith('.sql'))
            .sort();

        // Parse migration info
        const pendingMigrations: Migration[] = [];
        
        for (const file of migrationFiles) {
            const match = file.match(/^(\d{14})_(.+)\.sql$/);
            if (!match) continue;

            const [_, timestamp, name] = match;
            const version = timestamp;
            const migrationId = file.replace('.sql', '');

            if (!appliedSet.has(migrationId)) {
                // Check if we should stop at target version
                if (targetVersion && version > targetVersion) {
                    break;
                }

                pendingMigrations.push({
                    id: pendingMigrations.length + 1,
                    name: name.replace(/_/g, ' '),
                    version,
                    filename: file,
                    appliedAt: undefined
                });
            }
        }

        if (pendingMigrations.length === 0) {
            console.log('📊 Database is up to date');
            return;
        }

        console.log(`📊 Found ${pendingMigrations.length} pending migrations`);

        // Apply migrations in transaction
        for (const migration of pendingMigrations) {
            await this.applyMigration(migration);
        }

        console.log('✅ All migrations completed successfully');
    }

    private async applyMigration(migration: Migration): Promise<void> {
        console.log(`\n📦 Applying migration: ${migration.name} (${migration.version})`);

        const startTime = Date.now();
        const filepath = path.join(process.cwd(), 'migrations', migration.filename);
        const script = await fs.readFile(filepath, 'utf8');
        const checksum = this.calculateChecksum(script);

        try {
            // Execute migration script
            const result = await this.pool.request().query(script);

            const duration = Date.now() - startTime;

            // Record migration
            await this.recordMigration(migration, script, duration, checksum);

            console.log(`✅ Applied migration ${migration.filename} (${duration}ms)`);

        } catch (error) {
            const duration = Date.now() - startTime;
            
            // Record failed migration
            await this.recordMigrationFailed(migration, script, duration, checksum, error.message);

            console.error(`❌ Failed to apply migration ${migration.filename}:`, error.message);
            throw error;
        }
    }

    private async recordMigration(
        migration: Migration,
        script: string,
        duration: number,
        checksum: string
    ): Promise<void> {
        const query = `
            INSERT INTO [__Migrations] (
                [MigrationId], [Name], [Version], [Filename], 
                [AppliedAt], [Duration], [Checksum], [Script], 
                [AppliedBy], [Status]
            ) VALUES (
                @MigrationId, @Name, @Version, @Filename,
                GETUTCDATE(), @Duration, @Checksum, @Script,
                @AppliedBy, 'Success'
            )
        `;

        await this.pool.request()
            .input('MigrationId', sql.NVarChar, migration.filename.replace('.sql', ''))
            .input('Name', sql.NVarChar, migration.name)
            .input('Version', sql.NVarChar, migration.version)
            .input('Filename', sql.NVarChar, migration.filename)
            .input('Duration', sql.Int, duration)
            .input('Checksum', sql.NVarChar, checksum)
            .input('Script', sql.NVarChar(sql.MAX), script)
            .input('AppliedBy', sql.NVarChar, process.env.USER || 'system')
            .query(query);
    }

    private async recordMigrationFailed(
        migration: Migration,
        script: string,
        duration: number,
        checksum: string,
        error: string
    ): Promise<void> {
        const query = `
            INSERT INTO [__Migrations] (
                [MigrationId], [Name], [Version], [Filename], 
                [AppliedAt], [Duration], [Checksum], [Script], 
                [AppliedBy], [Status], [Error]
            ) VALUES (
                @MigrationId, @Name, @Version, @Filename,
                GETUTCDATE(), @Duration, @Checksum, @Script,
                @AppliedBy, 'Failed', @Error
            )
        `;

        await this.pool.request()
            .input('MigrationId', sql.NVarChar, migration.filename.replace('.sql', ''))
            .input('Name', sql.NVarChar, migration.name)
            .input('Version', sql.NVarChar, migration.version)
            .input('Filename', sql.NVarChar, migration.filename)
            .input('Duration', sql.Int, duration)
            .input('Checksum', sql.NVarChar, checksum)
            .input('Script', sql.NVarChar(sql.MAX), script)
            .input('AppliedBy', sql.NVarChar, process.env.USER || 'system')
            .input('Error', sql.NVarChar(sql.MAX), error)
            .query(query);
    }

    async rollback(steps: number = 1): Promise<void> {
        console.log(`\n↩️ Rolling back last ${steps} migration(s)...`);

        // Get last N successful migrations
        const query = `
            SELECT TOP ${steps} 
                [MigrationId], [Name], [Version], [Filename]
            FROM [__Migrations]
            WHERE [Status] = 'Success'
            ORDER BY [Id] DESC
        `;

        const result = await this.pool.request().query(query);
        const migrations = result.recordset;

        for (const migration of migrations.reverse()) {
            await this.rollbackMigration(migration);
        }
    }

    private async rollbackMigration(migration: any): Promise<void> {
        console.log(`↩️ Rolling back: ${migration.Name}`);

        const filepath = path.join(process.cwd(), 'migrations', migration.Filename);
        const script = await fs.readFile(filepath, 'utf8');

        // Extract DOWN section
        const downMatch = script.match(/-- ==========================================================\s*-- DOWN Migration.*\s-- ==========================================================\s*([\s\S]*)/);
        
        if (downMatch && downMatch[1].trim()) {
            await this.pool.request().query(downMatch[1]);
            console.log(`✅ Rolled back ${migration.Filename}`);
        } else {
            console.log(`⚠️ No down migration found for ${migration.Filename}`);
        }
    }

    async getMigrationStatus(): Promise<void> {
        const query = `
            SELECT 
                [MigrationId],
                [Name],
                [Version],
                [AppliedAt],
                [Duration],
                [Status],
                [Error]
            FROM [__Migrations]
            ORDER BY [Id] DESC
        `;

        const result = await this.pool.request().query(query);
        const migrations = result.recordset;

        console.log('\n📋 Migration Status:');
        console.log('='.repeat(100));
        console.log('Migration ID'.padEnd(35) + 'Name'.padEnd(30) + 'Applied At'.padEnd(25) + 'Status');
        console.log('='.repeat(100));

        for (const m of migrations) {
            const status = m.Status === 'Success' ? '✅' : '❌';
            const date = m.AppliedAt ? new Date(m.AppliedAt).toLocaleString() : '';
            console.log(
                m.MigrationId.padEnd(35).substring(0, 35) +
                m.Name.padEnd(30).substring(0, 30) +
                date.padEnd(25).substring(0, 25) +
                `${status} ${m.Status}`
            );
        }
    }

    private async getAppliedMigrations(): Promise<any[]> {
        const query = `
            SELECT [MigrationId], [Version], [Filename]
            FROM [__Migrations]
            WHERE [Status] = 'Success'
            ORDER BY [Id]
        `;

        const result = await this.pool.request().query(query);
        return result.recordset;
    }

    private calculateChecksum(content: string): string {
        const crypto = require('crypto');
        return crypto.createHash('sha256').update(content).digest('hex');
    }

    async close(): Promise<void> {
        await this.pool.close();
    }
}

// CLI Interface
async function main() {
    const command = process.argv[2];
    const arg = process.argv[3];

    const runner = new SQLServerMigrationRunner();

    try {
        await runner.initialize();

        switch (command) {
            case 'create':
                const name = arg || 'new_migration';
                await runner.createMigration(name);
                break;

            case 'migrate':
            case 'up':
                await runner.migrate(arg);
                break;

            case 'rollback':
            case 'down':
                const steps = parseInt(arg) || 1;
                await runner.rollback(steps);
                break;

            case 'status':
                await runner.getMigrationStatus();
                break;

            default:
                console.log(`
Usage: 
  npm run db:migrate create <name>   Create a new migration
  npm run db:migrate migrate [version]  Run pending migrations
  npm run db:migrate rollback [steps]   Rollback migrations
  npm run db:migrate status           Show migration status
                `);
        }
    } catch (error) {
        console.error('Migration failed:', error);
        process.exit(1);
    } finally {
        await runner.close();
    }
}

if (require.main === module) {
    main().catch(console.error);
}

export default SQLServerMigrationRunner;