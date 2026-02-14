#!/usr/bin/env node

import sql from 'mssql';
import * as fs from 'fs-extra';
import * as path from 'path';
import chalk from 'chalk';
import { program } from 'commander';
import dotenv from 'dotenv';
import { format } from 'date-fns';

dotenv.config();

interface Migration {
    id: string;
    filename: string;
    version: string;
    name: string;
    appliedAt?: Date;
    checksum?: string;
}

class MigrateUp {
    private pool: sql.ConnectionPool;
    private migrationsDir: string;

    constructor() {
        this.migrationsDir = path.join(process.cwd(), 'migrations');
    }

    async initialize(): Promise<void> {
        const config: sql.config = {
            server: process.env.SQL_SERVER || 'localhost',
            port: parseInt(process.env.SQL_PORT || '1433'),
            database: process.env.SQL_DATABASE || 'NOVA_DB',
            user: process.env.SQL_USER || 'sa',
            password: process.env.SQL_PASSWORD || '',
            options: {
                encrypt: process.env.SQL_ENCRYPT === 'true',
                trustServerCertificate: process.env.SQL_TRUST_SERVER_CERTIFICATE === 'true',
                enableArithAbort: true
            }
        };

        try {
            this.pool = await sql.connect(config);
            console.log(chalk.green('✅ Connected to SQL Server'));
            
            await this.ensureMigrationsTable();
        } catch (error) {
            console.error(chalk.red('❌ Failed to connect to SQL Server:'), error.message);
            process.exit(1);
        }
    }

    private async ensureMigrationsTable(): Promise<void> {
        const query = `
            IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[__Migrations]') AND type in (N'U'))
            BEGIN
                CREATE TABLE [__Migrations] (
                    [Id] INT IDENTITY(1,1) NOT NULL,
                    [MigrationId] NVARCHAR(255) NOT NULL,
                    [Filename] NVARCHAR(500) NOT NULL,
                    [Name] NVARCHAR(255) NOT NULL,
                    [Version] NVARCHAR(50) NOT NULL,
                    [Description] NVARCHAR(500) NULL,
                    [Type] NVARCHAR(50) NOT NULL,
                    [Checksum] NVARCHAR(64) NOT NULL,
                    [AppliedAt] DATETIME2 NOT NULL CONSTRAINT [DF_Migrations_AppliedAt] DEFAULT GETUTCDATE(),
                    [Duration] INT NOT NULL,
                    [Script] NVARCHAR(MAX) NULL,
                    [AppliedBy] NVARCHAR(100) NULL,
                    [Status] NVARCHAR(20) NOT NULL CONSTRAINT [DF_Migrations_Status] DEFAULT 'Success',
                    [Error] NVARCHAR(MAX) NULL,
                    [Batch] INT NOT NULL CONSTRAINT [DF_Migrations_Batch] DEFAULT 1,
                    CONSTRAINT [PK_Migrations] PRIMARY KEY CLUSTERED ([Id])
                );

                CREATE UNIQUE INDEX [UX_Migrations_MigrationId] ON [__Migrations] ([MigrationId]);
                CREATE INDEX [IX_Migrations_Version] ON [__Migrations] ([Version]);
                CREATE INDEX [IX_Migrations_AppliedAt] ON [__Migrations] ([AppliedAt]);
                
                PRINT '✅ Created migrations tracking table';
            END
        `;

        await this.pool.request().query(query);
    }

    async getCurrentBatch(): Promise<number> {
        const result = await this.pool.request().query(`
            SELECT ISNULL(MAX([Batch]), 0) + 1 AS NextBatch
            FROM [__Migrations]
        `);
        
        return result.recordset[0].NextBatch;
    }

    async getAppliedMigrations(): Promise<Map<string, any>> {
        const result = await this.pool.request().query(`
            SELECT [MigrationId], [Filename], [Checksum], [Batch]
            FROM [__Migrations]
            WHERE [Status] = 'Success'
            ORDER BY [Id]
        `);

        const applied = new Map();
        result.recordset.forEach(row => {
            applied.set(row.MigrationId, row);
        });
        
        return applied;
    }

    async getPendingMigrations(targetVersion?: string): Promise<Migration[]> {
        const applied = await this.getAppliedMigrations();
        
        // Ensure migrations directory exists
        await fs.ensureDir(this.migrationsDir);
        
        const files = await fs.readdir(this.migrationsDir);
        const pending: Migration[] = [];

        for (const file of files.sort()) {
            if (!file.endsWith('.sql')) continue;
            
            const match = file.match(/^(\d{14})_(.+)\.sql$/);
            if (!match) {
                console.log(chalk.yellow(`⚠️  Skipping invalid migration file: ${file}`));
                continue;
            }

            const [_, version, name] = match;
            const migrationId = file.replace('.sql', '');

            // Check if already applied
            if (applied.has(migrationId)) {
                // Verify checksum
                const filePath = path.join(this.migrationsDir, file);
                const content = await fs.readFile(filePath, 'utf8');
                const checksum = this.calculateChecksum(content);
                const appliedChecksum = applied.get(migrationId).Checksum;

                if (checksum !== appliedChecksum) {
                    console.error(chalk.red(`❌ Migration ${file} has been modified since it was applied!`));
                    console.error(chalk.red(`   Applied Checksum: ${appliedChecksum}`));
                    console.error(chalk.red(`   Current Checksum: ${checksum}`));
                    process.exit(1);
                }
                
                continue;
            }

            // Check if we should stop at target version
            if (targetVersion && version > targetVersion) {
                continue;
            }

            pending.push({
                id: migrationId,
                filename: file,
                version,
                name: name.replace(/_/g, ' ')
            });
        }

        return pending;
    }

    async migrateUp(targetVersion?: string, options: MigrateOptions = {}): Promise<void> {
        console.log(chalk.cyan('\n🚀 Starting migrations...'));
        console.log(chalk.cyan('================================'));

        const pending = await this.getPendingMigrations(targetVersion);
        
        if (pending.length === 0) {
            console.log(chalk.green('✅ Database is already up to date'));
            return;
        }

        console.log(chalk.blue(`\n📊 Found ${pending.length} pending migration(s):`));
        pending.forEach((m, i) => {
            console.log(chalk.white(`   ${i + 1}. ${m.filename} - ${m.name}`));
        });

        if (!options.autoConfirm) {
            const confirmed = await this.confirmMigration();
            if (!confirmed) {
                console.log(chalk.yellow('\n⚠️  Migration cancelled'));
                return;
            }
        }

        const batch = await this.getCurrentBatch();
        console.log(chalk.blue(`\n📦 Batch #${batch}`));

        let successCount = 0;
        let failCount = 0;

        for (const migration of pending) {
            const success = await this.executeMigration(migration, batch);
            
            if (success) {
                successCount++;
            } else {
                failCount++;
                
                if (options.stopOnError) {
                    console.error(chalk.red(`\n❌ Migration stopped due to error`));
                    break;
                }
            }
        }

        console.log(chalk.cyan('\n================================'));
        console.log(chalk.green(`✅ Migrations completed: ${successCount} succeeded, ${failCount} failed`));

        await this.showStatus();
    }

    private async executeMigration(migration: Migration, batch: number): Promise<boolean> {
        console.log(chalk.cyan(`\n📦 Executing: ${migration.filename}`));
        
        const filePath = path.join(this.migrationsDir, migration.filename);
        const script = await fs.readFile(filePath, 'utf8');
        const checksum = this.calculateChecksum(script);
        const startTime = Date.now();

        // Extract UP section (everything before DOWN section)
        const upScript = this.extractUpScript(script);

        const request = this.pool.request();
        
        try {
            // Execute migration
            await request.query(upScript);

            const duration = Date.now() - startTime;

            // Record successful migration
            await request.query(`
                INSERT INTO [__Migrations] (
                    [MigrationId], [Filename], [Name], [Version],
                    [Checksum], [Duration], [Script], [AppliedBy], [Status], [Batch]
                ) VALUES (
                    @MigrationId, @Filename, @Name, @Version,
                    @Checksum, @Duration, @Script, @AppliedBy, 'Success', @Batch
                )
            `, [
                { name: 'MigrationId', value: migration.id },
                { name: 'Filename', value: migration.filename },
                { name: 'Name', value: migration.name },
                { name: 'Version', value: migration.version },
                { name: 'Checksum', value: checksum },
                { name: 'Duration', value: duration },
                { name: 'Script', value: upScript },
                { name: 'AppliedBy', value: process.env.USER || 'system' },
                { name: 'Batch', value: batch }
            ]);

            console.log(chalk.green(`   ✅ Applied (${duration}ms)`));
            return true;

        } catch (error) {
            const duration = Date.now() - startTime;

            // Record failed migration
            await request.query(`
                INSERT INTO [__Migrations] (
                    [MigrationId], [Filename], [Name], [Version],
                    [Checksum], [Duration], [Script], [AppliedBy], [Status], [Error], [Batch]
                ) VALUES (
                    @MigrationId, @Filename, @Name, @Version,
                    @Checksum, @Duration, @Script, @AppliedBy, 'Failed', @Error, @Batch
                )
            `, [
                { name: 'MigrationId', value: migration.id },
                { name: 'Filename', value: migration.filename },
                { name: 'Name', value: migration.name },
                { name: 'Version', value: migration.version },
                { name: 'Checksum', value: checksum },
                { name: 'Duration', value: duration },
                { name: 'Script', value: upScript },
                { name: 'AppliedBy', value: process.env.USER || 'system' },
                { name: 'Error', value: error.message },
                { name: 'Batch', value: batch }
            ]);

            console.error(chalk.red(`   ❌ Failed: ${error.message}`));
            return false;
        }
    }

    private extractUpScript(fullScript: string): string {
        // Extract everything before the DOWN section
        const downMatch = fullScript.match(/-- ====================================================\s*-- DOWN Migration/);
        
        if (downMatch) {
            return fullScript.substring(0, downMatch.index);
        }
        
        return fullScript;
    }

    private calculateChecksum(content: string): string {
        const crypto = require('crypto');
        return crypto.createHash('sha256').update(content).digest('hex');
    }

    private async confirmMigration(): Promise<boolean> {
        const readline = require('readline').createInterface({
            input: process.stdin,
            output: process.stdout
        });

        return new Promise((resolve) => {
            readline.question(chalk.yellow('\n⚠️  Are you sure you want to apply these migrations? (yes/no): '), (answer: string) => {
                readline.close();
                resolve(answer.toLowerCase() === 'yes' || answer.toLowerCase() === 'y');
            });
        });
    }

    async showStatus(): Promise<void> {
        const result = await this.pool.request().query(`
            SELECT 
                [MigrationId],
                [Name],
                [Version],
                [AppliedAt],
                [Duration],
                [Status],
                [Error],
                [Batch]
            FROM [__Migrations]
            ORDER BY [Id] DESC
        `);

        const migrations = result.recordset;

        console.log(chalk.cyan('\n📋 Migration Status:'));
        console.log(chalk.cyan('================================'));

        if (migrations.length === 0) {
            console.log(chalk.yellow('   No migrations have been applied yet'));
            return;
        }

        const lastBatch = migrations[0].Batch;
        console.log(chalk.blue(`\n📦 Current Batch: #${lastBatch}`));
        console.log(chalk.blue(`   Total Migrations: ${migrations.length}`));

        console.log(chalk.white('\nRecent Migrations:'));
        migrations.slice(0, 5).forEach(m => {
            const status = m.Status === 'Success' ? chalk.green('✅') : chalk.red('❌');
            const date = format(new Date(m.AppliedAt), 'yyyy-MM-dd HH:mm:ss');
            console.log(chalk.white(`   ${status} ${m.MigrationId} - ${date} (${m.Duration}ms)`));
            if (m.Status === 'Failed' && m.Error) {
                console.log(chalk.red(`      Error: ${m.Error}`));
            }
        });
    }

    async close(): Promise<void> {
        await this.pool.close();
    }
}

interface MigrateOptions {
    autoConfirm?: boolean;
    stopOnError?: boolean;
    dryRun?: boolean;
}

// CLI Interface
async function main() {
    program
        .name('migrate-up')
        .description('Apply pending database migrations')
        .version('1.0.0');

    program
        .command('up')
        .description('Apply all pending migrations')
        .option('-t, --target <version>', 'Target version to migrate to')
        .option('-y, --yes', 'Auto-confirm without prompt')
        .option('--stop-on-error', 'Stop execution on first error')
        .option('--dry-run', 'Show what would be applied without executing')
        .action(async (options) => {
            const migrator = new MigrateUp();
            try {
                await migrator.initialize();
                await migrator.migrateUp(options.target, {
                    autoConfirm: options.yes,
                    stopOnError: options.stopOnError,
                    dryRun: options.dryRun
                });
            } finally {
                await migrator.close();
            }
        });

    program
        .command('status')
        .description('Show migration status')
        .action(async () => {
            const migrator = new MigrateUp();
            try {
                await migrator.initialize();
                await migrator.showStatus();
            } finally {
                await migrator.close();
            }
        });

    program
        .command('pending')
        .description('List pending migrations')
        .action(async () => {
            const migrator = new MigrateUp();
            try {
                await migrator.initialize();
                const pending = await migrator.getPendingMigrations();
                
                if (pending.length === 0) {
                    console.log(chalk.green('✅ No pending migrations'));
                } else {
                    console.log(chalk.blue(`\n📊 Pending Migrations (${pending.length}):`));
                    pending.forEach((m, i) => {
                        console.log(chalk.white(`   ${i + 1}. ${m.filename}`));
                    });
                }
            } finally {
                await migrator.close();
            }
        });

    program.parse(process.argv);
}

if (require.main === module) {
    main().catch(console.error);
}

export default MigrateUp;