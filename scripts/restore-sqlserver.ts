import sql from 'mssql';
import fs from 'fs-extra';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

export class SQLServerRestore {
    private pool: sql.ConnectionPool;

    constructor() {
        this.pool = new sql.ConnectionPool({
            server: process.env.SQL_SERVER || 'localhost',
            port: parseInt(process.env.SQL_PORT || '1433'),
            database: 'master', // Connect to master for restore commands
            user: process.env.SQL_USER || 'sa',
            password: process.env.SQL_PASSWORD || '',
            options: {
                encrypt: process.env.SQL_ENCRYPT === 'true',
                trustServerCertificate: process.env.SQL_TRUST_SERVER_CERTIFICATE === 'true'
            }
        });
    }

    async initialize(): Promise<void> {
        await this.pool.connect();
        console.log('✅ Connected to SQL Server');
    }

    async restoreDatabase(
        backupFile: string,
        databaseName?: string,
        options?: RestoreOptions
    ): Promise<RestoreResult> {
        console.log(`\n🔄 Restoring database from: ${backupFile}`);

        const targetDatabase = databaseName || process.env.SQL_DATABASE || 'NOVA_DB';
        const backupPath = options?.backupPath || '/var/opt/mssql/backup';
        const dataPath = options?.dataPath || '/var/opt/mssql/data';

        try {
            // Get backup file information
            const fileList = await this.getBackupFileList(backupFile, backupPath);
            
            // Get logical file names
            const logicalDataFile = fileList.find(f => f.Type === 'D')?.LogicalName;
            const logicalLogFile = fileList.find(f => f.Type === 'L')?.LogicalName;

            if (!logicalDataFile || !logicalLogFile) {
                throw new Error('Could not determine logical file names from backup');
            }

            // Set database to SINGLE_USER mode and close connections
            if (!options?.createNew) {
                await this.setSingleUserMode(targetDatabase);
            }

            // Restore database
            const restoreQuery = `
                RESTORE DATABASE [${targetDatabase}]
                FROM DISK = '${backupPath}/${path.basename(backupFile)}'
                WITH 
                    REPLACE,
                    RECOVERY,
                    STATS = 10,
                    MOVE '${logicalDataFile}' TO '${dataPath}/${targetDatabase}.mdf',
                    MOVE '${logicalLogFile}' TO '${dataPath}/${targetDatabase}_log.ldf'
                    ${options?.pointInTime ? `, STOPAT = '${options.pointInTime}'` : ''}
            `;

            console.log('   Starting restore...');
            const result = await this.pool.request().query(restoreQuery);

            // Set database back to MULTI_USER mode
            await this.setMultiUserMode(targetDatabase);

            console.log(`✅ Database restored successfully: ${targetDatabase}`);

            // Verify restore
            if (options?.verify) {
                await this.verifyRestore(targetDatabase);
            }

            return {
                success: true,
                database: targetDatabase,
                backupFile,
                restoredAt: new Date(),
                size: await this.getDatabaseSize(targetDatabase)
            };

        } catch (error) {
            console.error(`❌ Restore failed:`, error.message);
            
            // Try to set back to MULTI_USER on error
            try {
                await this.setMultiUserMode(targetDatabase);
            } catch {}

            return {
                success: false,
                database: targetDatabase,
                backupFile,
                error: error.message,
                restoredAt: new Date()
            };
        }
    }

    async restoreWithPointInTime(
        backupFile: string,
        databaseName: string,
        pointInTime: Date
    ): Promise<RestoreResult> {
        console.log(`\n🔄 Performing point-in-time restore to: ${pointInTime.toLocaleString()}`);

        return this.restoreDatabase(backupFile, databaseName, {
            pointInTime: pointInTime.toISOString(),
            verify: true
        });
    }

    async restoreToNewDatabase(
        backupFile: string,
        newDatabaseName: string
    ): Promise<RestoreResult> {
        console.log(`\n🔄 Restoring to new database: ${newDatabaseName}`);

        return this.restoreDatabase(backupFile, newDatabaseName, {
            createNew: true,
            verify: true
        });
    }

    async restoreFromLatest(databaseName?: string): Promise<RestoreResult> {
        console.log(`\n🔄 Restoring from latest backup...`);

        const backupDir = path.join(process.cwd(), 'backups');
        const files = await fs.readdir(backupDir);
        
        const targetDb = databaseName || process.env.SQL_DATABASE || 'NOVA_DB';
        
        // Find latest full backup
        const backups = files
            .filter(f => f.endsWith('.bak') && f.startsWith(targetDb))
            .sort()
            .reverse();

        if (backups.length === 0) {
            throw new Error(`No backup found for database: ${targetDb}`);
        }

        const latestBackup = backups[0];
        console.log(`   Found latest backup: ${latestBackup}`);

        return this.restoreDatabase(latestBackup, targetDb, { verify: true });
    }

    async verifyRestore(databaseName: string): Promise<boolean> {
        console.log(`\n🔍 Verifying restored database: ${databaseName}`);

        try {
            // Switch to restored database
            this.pool.config.database = databaseName;
            
            // Check if database is accessible
            const result = await this.pool.request().query('SELECT 1 AS IsAccessible');
            
            // Check system tables
            await this.pool.request().query(`
                SELECT TOP 1 * FROM sys.tables
            `);

            console.log('✅ Database verification successful');
            return true;

        } catch (error) {
            console.error('❌ Database verification failed:', error.message);
            return false;
        } finally {
            // Switch back to master
            this.pool.config.database = 'master';
        }
    }

    async getBackupHistory(databaseName?: string): Promise<any[]> {
        const query = `
            SELECT 
                s.database_name,
                s.backup_start_date,
                s.backup_finish_date,
                s.type,
                s.backup_size / 1024 / 1024 AS size_mb,
                s.first_lsn,
                s.last_lsn,
                s.checkpoint_lsn,
                s.database_backup_lsn,
                m.physical_device_name
            FROM msdb.dbo.backupset s
            INNER JOIN msdb.dbo.backupmediafamily m 
                ON s.media_set_id = m.media_set_id
            WHERE 1=1
                ${databaseName ? `AND s.database_name = '${databaseName}'` : ''}
            ORDER BY s.backup_start_date DESC
        `;

        const result = await this.pool.request().query(query);
        return result.recordset;
    }

    private async getBackupFileList(backupFile: string, backupPath: string): Promise<any[]> {
        const query = `
            RESTORE FILELISTONLY
            FROM DISK = '${backupPath}/${path.basename(backupFile)}'
        `;

        const result = await this.pool.request().query(query);
        return result.recordset;
    }

    private async setSingleUserMode(databaseName: string): Promise<void> {
        await this.pool.request()
            .input('DatabaseName', sql.NVarChar, databaseName)
            .query(`
                ALTER DATABASE [${databaseName}] 
                SET SINGLE_USER WITH ROLLBACK IMMEDIATE
            `);
        console.log(`   Database set to SINGLE_USER mode`);
    }

    private async setMultiUserMode(databaseName: string): Promise<void> {
        await this.pool.request()
            .input('DatabaseName', sql.NVarChar, databaseName)
            .query(`
                ALTER DATABASE [${databaseName}] 
                SET MULTI_USER
            `);
        console.log(`   Database set to MULTI_USER mode`);
    }

    private async getDatabaseSize(databaseName: string): Promise<number> {
        await this.pool.request()
            .input('DatabaseName', sql.NVarChar, databaseName)
            .query(`USE [${databaseName}]`);

        const result = await this.pool.request().query(`
            SELECT 
                SUM(size * 8.0 / 1024) AS SizeMB
            FROM sys.database_files
        `);

        return result.recordset[0]?.SizeMB * 1024 * 1024 || 0;
    }

    async validateBackupFile(backupFile: string): Promise<boolean> {
        console.log(`\n🔍 Validating backup file: ${backupFile}`);

        try {
            const backupPath = '/var/opt/mssql/backup';
            
            await this.pool.request().query(`
                RESTORE VERIFYONLY
                FROM DISK = '${backupPath}/${path.basename(backupFile)}'
                WITH CHECKSUM
            `);

            console.log('✅ Backup file validation successful');
            return true;

        } catch (error) {
            console.error('❌ Backup file validation failed:', error.message);
            return false;
        }
    }

    async getRestorePlan(backupFile: string): Promise<RestorePlan> {
        const backupPath = '/var/opt/mssql/backup';
        
        // Get backup header
        const headerResult = await this.pool.request().query(`
            RESTORE HEADERONLY
            FROM DISK = '${backupPath}/${path.basename(backupFile)}'
        `);

        // Get file list
        const fileListResult = await this.pool.request().query(`
            RESTORE FILELISTONLY
            FROM DISK = '${backupPath}/${path.basename(backupFile)}'
        `);

        return {
            backupFile,
            databaseName: headerResult.recordset[0]?.DatabaseName,
            backupType: headerResult.recordset[0]?.BackupType,
            backupStartDate: headerResult.recordset[0]?.BackupStartDate,
            backupFinishDate: headerResult.recordset[0]?.BackupFinishDate,
            backupSize: headerResult.recordset[0]?.BackupSize,
            files: fileListResult.recordset,
            estimatedTime: this.estimateRestoreTime(headerResult.recordset[0]?.BackupSize)
        };
    }

    private estimateRestoreTime(backupSize: number): number {
        // Rough estimate: 100 MB per second
        const sizeMB = backupSize / 1024 / 1024;
        return Math.ceil(sizeMB / 100);
    }

    async close(): Promise<void> {
        await this.pool.close();
    }
}

export interface RestoreOptions {
    createNew?: boolean;
    pointInTime?: string;
    verify?: boolean;
    backupPath?: string;
    dataPath?: string;
}

export interface RestoreResult {
    success: boolean;
    database: string;
    backupFile: string;
    restoredAt: Date;
    size?: number;
    error?: string;
}

export interface RestorePlan {
    backupFile: string;
    databaseName: string;
    backupType: number;
    backupStartDate: Date;
    backupFinishDate: Date;
    backupSize: number;
    files: any[];
    estimatedTime: number;
}

// CLI Interface
async function main() {
    const command = process.argv[2];
    const backupFile = process.argv[3];
    const database = process.argv[4] || process.env.SQL_DATABASE || 'NOVA_DB';

    const restore = new SQLServerRestore();

    try {
        await restore.initialize();

        switch (command) {
            case 'restore':
                if (!backupFile) {
                    console.error('❌ Please specify backup file');
                    process.exit(1);
                }
                await restore.restoreDatabase(backupFile, database, { verify: true });
                break;

            case 'restore:latest':
                await restore.restoreFromLatest(database);
                break;

            case 'restore:new':
                const newDb = process.argv[4] || `${database}_restored`;
                await restore.restoreToNewDatabase(backupFile, newDb);
                break;

            case 'restore:pit':
                const pointInTime = process.argv[4];
                if (!pointInTime) {
                    console.error('❌ Please specify point in time (YYYY-MM-DD HH:MM:SS)');
                    process.exit(1);
                }
                await restore.restoreWithPointInTime(
                    backupFile,
                    database,
                    new Date(pointInTime)
                );
                break;

            case 'validate':
                if (!backupFile) {
                    console.error('❌ Please specify backup file');
                    process.exit(1);
                }
                await restore.validateBackupFile(backupFile);
                break;

            case 'plan':
                if (!backupFile) {
                    console.error('❌ Please specify backup file');
                    process.exit(1);
                }
                const plan = await restore.getRestorePlan(backupFile);
                console.log('\n📋 Restore Plan:');
                console.log('='.repeat(50));
                console.log(`Database: ${plan.databaseName}`);
                console.log(`Backup Type: ${plan.backupType === 1 ? 'Full' : 'Differential'}`);
                console.log(`Created: ${plan.backupStartDate}`);
                console.log(`Size: ${(plan.backupSize / 1024 / 1024).toFixed(2)} MB`);
                console.log(`Estimated Time: ${plan.estimatedTime} seconds`);
                console.log('\nFiles to restore:');
                plan.files.forEach(f => {
                    console.log(`   - ${f.LogicalName} (${f.Type === 'D' ? 'Data' : 'Log'})`);
                });
                break;

            case 'history':
                const history = await restore.getBackupHistory(database);
                console.log('\n📋 Backup History:');
                console.log('='.repeat(80));
                history.forEach((h, i) => {
                    console.log(`${i + 1}. ${h.database_name}`);
                    console.log(`   Date: ${h.backup_start_date}`);
                    console.log(`   Type: ${h.type === 'D' ? 'Full' : h.type === 'I' ? 'Differential' : 'Log'}`);
                    console.log(`   Size: ${h.size_mb.toFixed(2)} MB`);
                    console.log(`   File: ${h.physical_device_name}`);
                    console.log('---');
                });
                break;

            default:
                console.log(`
Usage:
  npm run db:restore restore <file> [db]        Restore database from backup
  npm run db:restore restore:latest [db]        Restore from latest backup
  npm run db:restore restore:new <file> <db>    Restore to new database
  npm run db:restore restore:pit <file> <time>  Point-in-time restore
  npm run db:restore validate <file>            Validate backup file
  npm run db:restore plan <file>               Show restore plan
  npm run db:restore history [db]              Show backup history
                `);
        }
    } catch (error) {
        console.error('Restore operation failed:', error);
        process.exit(1);
    } finally {
        await restore.close();
    }
}

if (require.main === module) {
    main().catch(console.error);
}

export default SQLServerRestore;