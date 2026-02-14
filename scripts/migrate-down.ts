#!/usr/bin/env node

import sql from 'mssql';
import * as fs from 'fs-extra';
import * as path from 'path';
import chalk from 'chalk';
import { program } from 'commander';
import dotenv from 'dotenv';

dotenv.config();

class MigrateDown {
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
                trustServerCertificate: process.env.SQL_TRUST_SERVER_CERTIFICATE === 'true'
            }
        };

        try {
            this.pool = await sql.connect(config);
            console.log(chalk.green('✅ Connected to SQL Server'));
        } catch (error) {
            console.error(chalk.red('❌ Failed to connect to SQL Server:'), error.message);
            process.exit(1);
        }
    }

    async getLastBatch(): Promise<number> {
        const result = await this.pool.request().query(`
            SELECT ISNULL(MAX([Batch]), 0) AS LastBatch
            FROM [__Migrations]
            WHERE [Status] = 'Success'
        `);
        
        return result.recordset[0].LastBatch;
    }

    async getMigrationsToRollback(batch?: number, steps: number = 1): Promise<any[]> {
        let query = `
            SELECT 
                [MigrationId],
                [Filename],
                [Name],
                [Version],
                [Batch]
            FROM [__Migrations]
            WHERE [Status] = 'Success'
        `;

        if (batch) {
            query += ` AND [Batch] = @Batch`;
        } else {
            query += ` AND [Batch] = (SELECT MAX([Batch]) FROM [__Migrations] WHERE [Status] = 'Success')`;
        }

        query += ` ORDER BY [Id] DESC`;

        if (!batch) {
            query += ` OFFSET 0 ROWS FETCH NEXT ${steps} ROWS ONLY`;
        }

        const request = this.pool.request();
        if (batch) {
            request.input('Batch', sql.Int, batch);
        }

        const result = await request.query(query);
        return result.recordset;
    }

    async rollback(steps: number = 1, options: RollbackOptions = {}): Promise<void> {
        console.log(chalk.cyan('\n↩️  Rolling back migrations...'));
        console.log(chalk.cyan('================================'));

        const migrations = await this.getMigrationsToRollback(undefined, steps);

        if (migrations.length === 0) {
            console.log(chalk.yellow('⚠️  No migrations to rollback'));
            return;
        }

        console.log(chalk.blue(`\n📊 Found ${migrations.length} migration(s) to rollback:`));
        migrations.forEach((m, i) => {
            console.log(chalk.white(`   ${i + 1}. ${m.Filename} (Batch #${m.Batch})`));
        });

        if (!options.autoConfirm) {
            const confirmed = await this.confirmRollback();
            if (!confirmed) {
                console.log(chalk.yellow('\n⚠️  Rollback cancelled'));
                return;
            }
        }

        let successCount = 0;
        let failCount = 0;

        for (const migration of migrations.reverse()) {
            const success = await this.rollbackMigration(migration);
            
            if (success) {
                successCount++;
            } else {
                failCount++;
                if (options.stopOnError) {
                    console.error(chalk.red(`\n❌ Rollback stopped due to error`));
                    break;
                }
            }
        }

        console.log(chalk.cyan('\n================================'));
        console.log(chalk.green(`✅ Rollback completed: ${successCount} succeeded, ${failCount} failed`));
    }

    async rollbackBatch(batch?: number): Promise<void> {
        console.log(chalk.cyan('\n↩️  Rolling back batch...'));

        const batchNumber = batch || await this.getLastBatch();
        const migrations = await this.getMigrationsToRollback(batchNumber);

        if (migrations.length === 0) {
            console.log(chalk.yellow(`⚠️  No migrations found in batch #${batchNumber}`));
            return;
        }

        console.log(chalk.blue(`\n📊 Rolling back batch #${batchNumber} (${migrations.length} migrations)`));

        for (const migration of migrations.reverse()) {
            await this.rollbackMigration(migration);
        }
    }

    async rollbackToVersion(targetVersion: string): Promise<void> {
        console.log(chalk.cyan(`\n↩️  Rolling back to version: ${targetVersion}`));

        const result = await this.pool.request()
            .input('TargetVersion', sql.NVarChar, targetVersion)
            .query(`
                SELECT 
                    [MigrationId],
                    [Filename],
                    [Name],
                    [Version],
                    [Batch]
                FROM [__Migrations]
                WHERE [Status] = 'Success'
                    AND [Version] > @TargetVersion
                ORDER BY [Id] DESC
            `);

        const migrations = result.recordset;

        if (migrations.length === 0) {
            console.log(chalk.yellow(`⚠️  Database is already at or below version ${targetVersion}`));
            return;
        }

        console.log(chalk.blue(`\n📊 Found ${migrations.length} migration(s) to rollback`));

        for (const migration of migrations.reverse()) {
            await this.rollbackMigration(migration);
        }

        console.log(chalk.green(`✅ Rolled back to version ${targetVersion}`));
    }

    private async rollbackMigration(migration: any): Promise<boolean> {
        console.log(chalk.cyan(`\n↩️  Rolling back: ${migration.Filename}`));

        const filePath = path.join(this.migrationsDir, migration.Filename);
        
        if (!await fs.pathExists(filePath)) {
            console.error(chalk.red(`   ❌ Migration file not found: ${migration.Filename}`));
            return false;
        }

        const script = await fs.readFile(filePath, 'utf8');
        const downScript = this.extractDownScript(script);

        if (!downScript || downScript.trim().length === 0) {
            console.log(chalk.yellow(`   ⚠️  No DOWN migration found, skipping`));
            return true;
        }

        const request = this.pool.request();

        try {
            // Execute down script in transaction
            await request.query('BEGIN TRANSACTION');
            await request.query(downScript);
            await request.query('COMMIT TRANSACTION');

            // Remove migration record
            await request.query(`
                DELETE FROM [__Migrations]
                WHERE [MigrationId] = @MigrationId
            `, [
                { name: 'MigrationId', value: migration.MigrationId }
            ]);

            console.log(chalk.green(`   ✅ Rollback successful`));
            return true;

        } catch (error) {
            await request.query('ROLLBACK TRANSACTION');
            console.error(chalk.red(`   ❌ Rollback failed: ${error.message}`));
            return false;
        }
    }

    private extractDownScript(fullScript: string): string | null {
        const downMarker = '-- ====================================================\n-- DOWN Migration';
        const index = fullScript.indexOf(downMarker);
        
        if (index === -1) return null;
        
        // Extract everything after the DOWN marker
        let downScript = fullScript.substring(index + downMarker.length);
        
        // Remove any trailing comments and GO statements
        downScript = downScript.replace(/\/\*[\s\S]*?\*\//g, '');
        downScript = downScript.replace(/GO\s*$/g, '');
        
        return downScript.trim();
    }

    private async confirmRollback(): Promise<boolean> {
        const readline = require('readline').createInterface({
            input: process.stdin,
            output: process.stdout
        });

        return new Promise((resolve) => {
            readline.question(chalk.yellow('\n⚠️  Are you sure you want to rollback these migrations? (yes/no): '), (answer: string) => {
                readline.close();
                resolve(answer.toLowerCase() === 'yes' || answer.toLowerCase() === 'y');
            });
        });
    }

    async close(): Promise<void> {
        await this.pool.close();
    }
}

interface RollbackOptions {
    autoConfirm?: boolean;
    stopOnError?: boolean;
}

// CLI Interface
async function main() {
    program
        .name('migrate-down')
        .description('Rollback database migrations')
        .version('1.0.0');

    program
        .command('rollback')
        .description('Rollback the last N migrations')
        .option('-s, --steps <number>', 'Number of migrations to rollback', '1')
        .option('-y, --yes', 'Auto-confirm without prompt')
        .option('--stop-on-error', 'Stop execution on first error')
        .action(async (options) => {
            const migrator = new MigrateDown();
            try {
                await migrator.initialize();
                const steps = parseInt(options.steps);
                await migrator.rollback(steps, {
                    autoConfirm: options.yes,
                    stopOnError: options.stopOnError
                });
            } finally {
                await migrator.close();
            }
        });

    program
        .command('batch')
        .description('Rollback an entire batch')
        .option('-b, --batch <number>', 'Batch number to rollback')
        .action(async (options) => {
            const migrator = new MigrateDown();
            try {
                await migrator.initialize();
                await migrator.rollbackBatch(options.batch ? parseInt(options.batch) : undefined);
            } finally {
                await migrator.close();
            }
        });

    program
        .command('to')
        .description('Rollback to a specific version')
        .requiredOption('-v, --version <version>', 'Target version')
        .action(async (options) => {
            const migrator = new MigrateDown();
            try {
                await migrator.initialize();
                await migrator.rollbackToVersion(options.version);
            } finally {
                await migrator.close();
            }
        });

    program.parse(process.argv);
}

if (require.main === module) {
    main().catch(console.error);
}

export default MigrateDown;