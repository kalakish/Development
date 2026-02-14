import { SQLServerMigrationRunner } from './run-migrations';
import { SQLServerSeeder } from './seed-data';
import { SQLServerBackup } from './backup-sqlserver';
import { SQLServerRestore } from './restore-sqlserver';
import { SQLServerDatabaseDrop } from './drop-database';
import dotenv from 'dotenv';

dotenv.config();

export class DatabaseManager {
    private migration: SQLServerMigrationRunner;
    private seeder: SQLServerSeeder;
    private backup: SQLServerBackup;
    private restore: SQLServerRestore;
    private drop: SQLServerDatabaseDrop;

    constructor() {
        this.migration = new SQLServerMigrationRunner();
        this.seeder = new SQLServerSeeder();
        this.backup = new SQLServerBackup();
        this.restore = new SQLServerRestore();
        this.drop = new SQLServerDatabaseDrop();
    }

    async initialize(): Promise<void> {
        await this.migration.initialize();
        await this.seeder.initialize();
        await this.backup.initialize();
        await this.restore.initialize();
        await this.drop.initialize();
        console.log('✅ Database Manager initialized');
    }

    async reset(options: ResetOptions = {}): Promise<void> {
        console.log('\n🔄 Resetting database...');

        // Backup current state
        if (options.backup) {
            await this.backup.backupDatabase(process.env.SQL_DATABASE, {
                compress: true,
                verify: true
            });
        }

        // Drop database
        await this.drop.dropDatabase(process.env.SQL_DATABASE || 'NOVA_DB', {
            force: true,
            backup: false
        });

        // Recreate database
        const { exec } = require('child_process');
        const util = require('util');
        const execPromise = util.promisify(exec);
        
        await execPromise('npm run db:setup');

        // Run migrations
        await this.migration.migrate();

        // Seed data
        if (options.seed) {
            await this.seeder.seedAll();
        }

        console.log('✅ Database reset completed');
    }

    async clone(sourceDb: string, targetDb: string): Promise<void> {
        console.log(`\n📋 Cloning database ${sourceDb} -> ${targetDb}`);

        // Backup source
        const backup = await this.backup.backupDatabase(sourceDb);
        
        // Restore to target
        await this.restore.restoreToNewDatabase(backup.backupFile!, targetDb);
        
        console.log(`✅ Database cloned successfully`);
    }

    async export(database: string, format: 'json' | 'csv' = 'json'): Promise<void> {
        console.log(`\n📤 Exporting database ${database} to ${format}...`);
        // Implementation
    }

    async import(database: string, file: string): Promise<void> {
        console.log(`\n📥 Importing ${file} to database ${database}...`);
        // Implementation
    }

    async analyze(database: string): Promise<void> {
        console.log(`\n📊 Analyzing database ${database}...`);
        
        // Get database size
        const size = await this.drop['getDatabaseSize'](database);
        
        // Get table counts
        // Get index fragmentation
        // Get performance metrics
        
        console.log(`   Size: ${this.formatBytes(size)}`);
    }

    private formatBytes(bytes: number): string {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    async close(): Promise<void> {
        await this.migration.close();
        await this.seeder.close();
        await this.backup.close();
        await this.restore.close();
        await this.drop.close();
    }
}

export interface ResetOptions {
    backup?: boolean;
    seed?: boolean;
    force?: boolean;
}

// CLI
async function main() {
    const command = process.argv[2];
    const manager = new DatabaseManager();

    try {
        await manager.initialize();

        switch (command) {
            case 'reset':
                await manager.reset({
                    backup: process.argv.includes('--backup'),
                    seed: !process.argv.includes('--no-seed'),
                    force: process.argv.includes('--force')
                });
                break;

            case 'clone':
                const source = process.argv[3];
                const target = process.argv[4];
                if (!source || !target) {
                    console.error('❌ Please specify source and target databases');
                    process.exit(1);
                }
                await manager.clone(source, target);
                break;

            case 'analyze':
                const db = process.argv[3] || process.env.SQL_DATABASE;
                await manager.analyze(db);
                break;

            default:
                console.log(`
Database Manager

Commands:
  db:reset         Reset database (drop, recreate, migrate, seed)
  db:clone         Clone database
  db:analyze       Analyze database
                `);
        }
    } catch (error) {
        console.error('❌ Operation failed:', error);
        process.exit(1);
    } finally {
        await manager.close();
    }
}

if (require.main === module) {
    main().catch(console.error);
}