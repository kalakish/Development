#!/usr/bin/env node

import sql from 'mssql';
import chalk from 'chalk';
import { program } from 'commander';
import dotenv from 'dotenv';
import { MigrateDown } from './migrate-down';
import { MigrateUp } from './migrate-up';

dotenv.config();

class MigrateReset {
    private pool: sql.ConnectionPool;

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

    async resetDatabase(options: ResetOptions = {}): Promise<void> {
        console.log(chalk.cyan('\n🔄 Resetting database...'));
        console.log(chalk.cyan('================================'));

        // Confirm reset
        if (!options.force) {
            const confirmed = await this.confirmReset();
            if (!confirmed) {
                console.log(chalk.yellow('\n⚠️  Reset cancelled'));
                return;
            }
        }

        // Backup before reset
        if (options.backup) {
            await this.backupDatabase();
        }

        // Drop and recreate database
        if (options.full) {
            await this.dropAndRecreateDatabase();
        }

        // Rollback all migrations
        console.log(chalk.blue('\n↩️  Rolling back all migrations...'));
        const migratorDown = new MigrateDown();
        await migratorDown.initialize();
        
        // Get all migrations
        const result = await this.pool.request().query(`
            SELECT [Batch] FROM [__Migrations]
            WHERE [Status] = 'Success'
            GROUP BY [Batch]
            ORDER BY [Batch] DESC
        `);

        const batches = result.recordset.map(r => r.Batch);
        
        for (const batch of batches) {
            await migratorDown.rollbackBatch(batch);
        }

        // Reapply migrations
        console.log(chalk.blue('\n⬆️  Reapplying all migrations...'));
        const migratorUp = new MigrateUp();
        await migratorUp.initialize();
        await migratorUp.migrateUp(undefined, { autoConfirm: true });

        // Reseed data
        if (options.seed) {
            await this.seedDatabase();
        }

        console.log(chalk.cyan('\n================================'));
        console.log(chalk.green('✅ Database reset completed successfully!'));
    }

    async dropAndRecreateDatabase(): Promise<void> {
        const databaseName = process.env.SQL_DATABASE || 'NOVA_DB';
        
        console.log(chalk.yellow(`\n⚠️  Dropping database: ${databaseName}`));

        try {
            // Switch to master database
            this.pool.config.database = 'master';
            
            // Kill all connections
            await this.pool.request()
                .input('DatabaseName', sql.NVarChar, databaseName)
                .query(`
                    DECLARE @kill varchar(8000) = '';
                    SELECT @kill = @kill + 'kill ' + CONVERT(varchar(5), session_id) + ';'
                    FROM sys.dm_exec_sessions
                    WHERE database_id = DB_ID(@DatabaseName);
                    EXEC(@kill);
                `);

            // Drop database
            await this.pool.request()
                .input('DatabaseName', sql.NVarChar, databaseName)
                .query(`
                    DROP DATABASE IF EXISTS [${databaseName}]
                `);

            console.log(chalk.green(`   ✅ Database dropped`));

            // Recreate database
            await this.pool.request()
                .input('DatabaseName', sql.NVarChar, databaseName)
                .query(`
                    CREATE DATABASE [${databaseName}]
                `);

            console.log(chalk.green(`   ✅ Database recreated`));

            // Switch back
            this.pool.config.database = databaseName;

        } catch (error) {
            console.error(chalk.red(`   ❌ Failed to drop/recreate database: ${error.message}`));
            throw error;
        }
    }

    private async backupDatabase(): Promise<void> {
        console.log(chalk.blue('\n💾 Creating backup before reset...'));
        
        const { SQLServerBackup } = require('./backup-sqlserver');
        const backup = new SQLServerBackup();
        
        await backup.initialize();
        await backup.backupDatabase(process.env.SQL_DATABASE, {
            compress: true,
            verify: true
        });
        await backup.close();

        console.log(chalk.green('   ✅ Backup created'));
    }

    private async seedDatabase(): Promise<void> {
        console.log(chalk.blue('\n🌱 Seeding database...'));
        
        const { SQLServerSeeder } = require('./seed-data');
        const seeder = new SQLServerSeeder();
        
        await seeder.initialize();
        await seeder.seedAll();
        await seeder.close();

        console.log(chalk.green('   ✅ Seed data loaded'));
    }

    private async confirmReset(): Promise<boolean> {
        const readline = require('readline').createInterface({
            input: process.stdin,
            output: process.stdout
        });

        return new Promise((resolve) => {
            readline.question(chalk.yellow('\n⚠️  Are you sure you want to RESET the database? (yes/no): '), (answer: string) => {
                readline.close();
                resolve(answer.toLowerCase() === 'yes');
            });
        });
    }

    async close(): Promise<void> {
        await this.pool.close();
    }
}

interface ResetOptions {
    force?: boolean;
    full?: boolean;
    backup?: boolean;
    seed?: boolean;
}

// CLI Interface
async function main() {
    program
        .name('migrate-reset')
        .description('Reset database migrations')
        .version('1.0.0');

    program
        .command('reset')
        .description('Reset database (rollback all + migrate up)')
        .option('-f, --force', 'Skip confirmation prompt')
        .option('--full', 'Drop and recreate database')
        .option('--backup', 'Create backup before reset')
        .option('--seed', 'Seed data after reset')
        .action(async (options) => {
            const reset = new MigrateReset();
            try {
                await reset.initialize();
                await reset.resetDatabase({
                    force: options.force,
                    full: options.full,
                    backup: options.backup,
                    seed: options.seed
                });
            } finally {
                await reset.close();
            }
        });

    program.parse(process.argv);
}

if (require.main === module) {
    main().catch(console.error);
}

export default MigrateReset;