#!/usr/bin/env node

import sql from 'mssql';
import * as fs from 'fs-extra';
import * as path from 'path';
import chalk from 'chalk';
import { program } from 'commander';
import dotenv from 'dotenv';
import { format } from 'date-fns';
import Table from 'cli-table3';

dotenv.config();

class MigrateStatus {
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
        } catch (error) {
            console.error(chalk.red('❌ Failed to connect to SQL Server:'), error.message);
            process.exit(1);
        }
    }

    async showStatus(options: StatusOptions = {}): Promise<void> {
        console.log(chalk.cyan('\n📋 Database Migration Status'));
        console.log(chalk.cyan('========================================\n'));

        // Database info
        await this.showDatabaseInfo();

        // Migration summary
        await this.showMigrationSummary();

        // Migration history
        if (options.history) {
            await this.showMigrationHistory(options.limit || 20);
        } else {
            await this.showMigrationTable(options.limit || 10);
        }

        // Pending migrations
        await this.showPendingMigrations();

        // Migration statistics
        if (options.stats) {
            await this.showMigrationStats();
        }
    }

    private async showDatabaseInfo(): Promise<void> {
        const result = await this.pool.request().query(`
            SELECT 
                DB_NAME() AS DatabaseName,
                compatibility_level,
                collation_name,
                user_access_desc AS UserAccess,
                recovery_model_desc AS RecoveryModel,
                state_desc AS State
            FROM sys.databases
            WHERE database_id = DB_ID()
        `);

        const db = result.recordset[0];

        console.log(chalk.white('Database Information:'));
        console.log(chalk.white(`  • Name: ${chalk.cyan(db.DatabaseName)}`));
        console.log(chalk.white(`  • State: ${chalk.green(db.State)}`));
        console.log(chalk.white(`  • Compatibility: ${chalk.yellow(db.compatibility_level)}`));
        console.log(chalk.white(`  • Collation: ${chalk.yellow(db.collation_name)}`));
        console.log(chalk.white(`  • Recovery Model: ${chalk.yellow(db.RecoveryModel)}`));
        console.log(chalk.white(`  • User Access: ${chalk.yellow(db.UserAccess)}`));
        console.log('');
    }

    private async showMigrationSummary(): Promise<void> {
        const result = await this.pool.request().query(`
            SELECT 
                COUNT(*) AS Total,
                SUM(CASE WHEN [Status] = 'Success' THEN 1 ELSE 0 END) AS Successful,
                SUM(CASE WHEN [Status] = 'Failed' THEN 1 ELSE 0 END) AS Failed,
                ISNULL(MAX([Batch]), 0) AS CurrentBatch,
                COUNT(DISTINCT [Batch]) AS TotalBatches,
                MIN([AppliedAt]) AS FirstMigration,
                MAX([AppliedAt]) AS LastMigration,
                SUM([Duration]) AS TotalDuration
            FROM [__Migrations]
        `);

        const stats = result.recordset[0];
        const pending = await this.countPendingMigrations();

        console.log(chalk.white('Migration Summary:'));
        console.log(chalk.white(`  • Total Migrations: ${chalk.cyan(stats.Total || 0)}`));
        console.log(chalk.white(`    - Successful: ${chalk.green(stats.Successful || 0)}`));
        console.log(chalk.white(`    - Failed: ${chalk.red(stats.Failed || 0)}`));
        console.log(chalk.white(`    - Pending: ${chalk.yellow(pending)}`));
        console.log(chalk.white(`  • Current Batch: ${chalk.cyan(stats.CurrentBatch || 0)}`));
        console.log(chalk.white(`  • Total Batches: ${chalk.cyan(stats.TotalBatches || 0)}`));
        
        if (stats.FirstMigration) {
            console.log(chalk.white(`  • First Migration: ${chalk.yellow(format(new Date(stats.FirstMigration), 'yyyy-MM-dd HH:mm:ss'))}`));
        }
        if (stats.LastMigration) {
            console.log(chalk.white(`  • Last Migration: ${chalk.yellow(format(new Date(stats.LastMigration), 'yyyy-MM-dd HH:mm:ss'))}`));
        }
        if (stats.TotalDuration) {
            console.log(chalk.white(`  • Total Duration: ${chalk.yellow(this.formatDuration(stats.TotalDuration))}`));
        }
        console.log('');
    }

    private async showMigrationTable(limit: number = 10): Promise<void> {
        const result = await this.pool.request()
            .input('Limit', sql.Int, limit)
            .query(`
                SELECT TOP (@Limit)
                    [MigrationId],
                    [Name],
                    [Version],
                    [Batch],
                    [AppliedAt],
                    [Duration],
                    [Status],
                    [Error]
                FROM [__Migrations]
                ORDER BY [Id] DESC
            `);

        const migrations = result.recordset;

        if (migrations.length === 0) {
            console.log(chalk.yellow('⚠️  No migrations have been applied yet'));
            return;
        }

        const table = new Table({
            head: [
                chalk.cyan('Status'),
                chalk.cyan('Migration ID'),
                chalk.cyan('Name'),
                chalk.cyan('Batch'),
                chalk.cyan('Applied At'),
                chalk.cyan('Duration')
            ],
            colWidths: [8, 25, 30, 8, 20, 12],
            wordWrap: true
        });

        migrations.forEach(m => {
            const status = m.Status === 'Success' 
                ? chalk.green('✓') 
                : m.Status === 'Failed' 
                    ? chalk.red('✗') 
                    : chalk.yellow('?');
            
            const date = format(new Date(m.AppliedAt), 'yyyy-MM-dd HH:mm:ss');
            const duration = this.formatDuration(m.Duration);
            
            table.push([
                status,
                m.MigrationId.substring(0, 20) + '...',
                m.Name.substring(0, 27) + '...',
                m.Batch,
                date,
                duration
            ]);
        });

        console.log(chalk.white('Recent Migrations:'));
        console.log(table.toString());
        console.log('');
    }

    private async showMigrationHistory(limit: number = 20): Promise<void> {
        const result = await this.pool.request()
            .input('Limit', sql.Int, limit)
            .query(`
                SELECT 
                    [MigrationId],
                    [Name],
                    [Version],
                    [Batch],
                    [AppliedAt],
                    [Duration],
                    [Status],
                    [Error],
                    [AppliedBy]
                FROM [__Migrations]
                ORDER BY [Id] DESC
            `);

        const migrations = result.recordset;

        console.log(chalk.white('Migration History:'));
        
        migrations.forEach((m, i) => {
            const status = m.Status === 'Success' ? chalk.green('✓') : chalk.red('✗');
            const date = format(new Date(m.AppliedAt), 'yyyy-MM-dd HH:mm:ss');
            
            console.log(chalk.white(`  ${i + 1}. ${status} ${m.MigrationId}`));
            console.log(chalk.white(`     Name: ${m.Name}`));
            console.log(chalk.white(`     Version: ${m.Version}`));
            console.log(chalk.white(`     Batch: #${m.Batch}`));
            console.log(chalk.white(`     Applied: ${date}`));
            console.log(chalk.white(`     Duration: ${this.formatDuration(m.Duration)}`));
            console.log(chalk.white(`     Applied By: ${m.AppliedBy || 'system'}`));
            
            if (m.Status === 'Failed' && m.Error) {
                console.log(chalk.red(`     Error: ${m.Error}`));
            }
            
            if (i < migrations.length - 1) {
                console.log(chalk.gray('     ---'));
            }
        });
        
        console.log('');
    }

    private async showPendingMigrations(): Promise<void> {
        await fs.ensureDir(this.migrationsDir);
        
        const files = await fs.readdir(this.migrationsDir);
        const applied = await this.getAppliedMigrationIds();
        
        const pending = files
            .filter(f => f.endsWith('.sql') && f.match(/^\d{14}_.+\.sql$/))
            .filter(f => !applied.has(f.replace('.sql', '')))
            .sort();

        console.log(chalk.white(`Pending Migrations (${pending.length}):`));
        
        if (pending.length === 0) {
            console.log(chalk.green('  ✓ No pending migrations'));
        } else {
            pending.forEach((f, i) => {
                const match = f.match(/^(\d{14})_(.+)\.sql$/);
                const version = match ? match[1] : 'unknown';
                console.log(chalk.yellow(`  ${i + 1}. ${f} (${version})`));
            });
        }
        
        console.log('');
    }

    private async showMigrationStats(): Promise<void> {
        const result = await this.pool.request().query(`
            SELECT 
                DATEPART(year, [AppliedAt]) AS Year,
                DATEPART(month, [AppliedAt]) AS Month,
                COUNT(*) AS Count,
                SUM([Duration]) AS TotalDuration,
                AVG([Duration]) AS AvgDuration
            FROM [__Migrations]
            WHERE [Status] = 'Success'
            GROUP BY DATEPART(year, [AppliedAt]), DATEPART(month, [AppliedAt])
            ORDER BY Year DESC, Month DESC
        `);

        const stats = result.recordset;

        if (stats.length === 0) return;

        console.log(chalk.white('Migration Statistics by Month:'));

        const table = new Table({
            head: [
                chalk.cyan('Year'),
                chalk.cyan('Month'),
                chalk.cyan('Count'),
                chalk.cyan('Total Time'),
                chalk.cyan('Avg Time')
            ],
            colWidths: [8, 10, 10, 15, 15]
        });

        stats.forEach(s => {
            const monthName = format(new Date(s.Year, s.Month - 1), 'MMMM');
            table.push([
                s.Year,
                monthName,
                s.Count,
                this.formatDuration(s.TotalDuration),
                this.formatDuration(s.AvgDuration)
            ]);
        });

        console.log(table.toString());
        console.log('');
    }

    private async countPendingMigrations(): Promise<number> {
        await fs.ensureDir(this.migrationsDir);
        
        const files = await fs.readdir(this.migrationsDir);
        const applied = await this.getAppliedMigrationIds();
        
        return files
            .filter(f => f.endsWith('.sql') && f.match(/^\d{14}_.+\.sql$/))
            .filter(f => !applied.has(f.replace('.sql', '')))
            .length;
    }

    private async getAppliedMigrationIds(): Promise<Set<string>> {
        const result = await this.pool.request().query(`
            SELECT [MigrationId] FROM [__Migrations] WHERE [Status] = 'Success'
        `);
        
        return new Set(result.recordset.map(r => r.MigrationId));
    }

    private formatDuration(ms: number): string {
        if (ms < 1000) return `${ms}ms`;
        if (ms < 60000) return `${(ms / 1000).toFixed(2)}s`;
        const minutes = Math.floor(ms / 60000);
        const seconds = ((ms % 60000) / 1000).toFixed(0);
        return `${minutes}m ${seconds}s`;
    }

    async close(): Promise<void> {
        await this.pool.close();
    }
}

interface StatusOptions {
    history?: boolean;
    stats?: boolean;
    limit?: number;
}

// CLI Interface
async function main() {
    program
        .name('migrate-status')
        .description('Show database migration status')
        .version('1.0.0');

    program
        .command('status')
        .description('Show migration status')
        .option('-h, --history', 'Show full migration history')
        .option('-s, --stats', 'Show migration statistics')
        .option('-l, --limit <number>', 'Limit number of migrations shown', '10')
        .action(async (options) => {
            const status = new MigrateStatus();
            try {
                await status.initialize();
                await status.showStatus({
                    history: options.history,
                    stats: options.stats,
                    limit: parseInt(options.limit)
                });
            } finally {
                await status.close();
            }
        });

    program.parse(process.argv);
}

if (require.main === module) {
    main().catch(console.error);
}

export default MigrateStatus;