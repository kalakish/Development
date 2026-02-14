import sql from 'mssql';
import fs from 'fs-extra';
import path from 'path';
import archiver from 'archiver';
import dotenv from 'dotenv';
import { format } from 'date-fns';

dotenv.config();

export class SQLServerBackup {
    private pool: sql.ConnectionPool;
    private backupDir: string;

    constructor() {
        this.pool = new sql.ConnectionPool({
            server: process.env.SQL_SERVER || 'localhost',
            port: parseInt(process.env.SQL_PORT || '1433'),
            database: 'master', // Connect to master for backup commands
            user: process.env.SQL_USER || 'sa',
            password: process.env.SQL_PASSWORD || '',
            options: {
                encrypt: process.env.SQL_ENCRYPT === 'true',
                trustServerCertificate: process.env.SQL_TRUST_SERVER_CERTIFICATE === 'true'
            }
        });

        this.backupDir = path.join(process.cwd(), 'backups');
    }

    async initialize(): Promise<void> {
        await fs.ensureDir(this.backupDir);
        await this.pool.connect();
        console.log('✅ Connected to SQL Server');
    }

    async backupDatabase(
        databaseName: string = process.env.SQL_DATABASE || 'NOVA_DB',
        options?: BackupOptions
    ): Promise<BackupResult> {
        console.log(`\n💾 Backing up database: ${databaseName}`);

        const timestamp = format(new Date(), 'yyyyMMdd_HHmmss');
        const backupFileName = `${databaseName}_${timestamp}.bak`;
        const backupFilePath = path.join(this.backupDir, backupFileName);
        const metadataFile = path.join(this.backupDir, `${databaseName}_${timestamp}.json`);

        try {
            // Ensure backup directory exists on SQL Server
            const sqlBackupDir = process.env.SQL_BACKUP_DIR || '/var/opt/mssql/backup';
            
            // Execute backup command
            const backupQuery = `
                BACKUP DATABASE [${databaseName}]
                TO DISK = '${sqlBackupDir}/${backupFileName}'
                WITH 
                    FORMAT,
                    MEDIANAME = 'NOVA_Backup',
                    NAME = 'Full Backup of ${databaseName} - ${timestamp}',
                    COMPRESSION,
                    STATS = 10,
                    CHECKSUM,
                    CONTINUE_AFTER_ERROR;
            `;

            console.log('   Starting backup...');
            
            const result = await this.pool.request().query(backupQuery);

            // Copy backup file from SQL Server container to local (if using Docker)
            if (process.env.USE_DOCKER === 'true') {
                await this.copyFromDockerContainer(sqlBackupDir, backupFileName, backupFilePath);
            } else {
                // For local SQL Server, file is already accessible
                await fs.copyFile(`${sqlBackupDir}/${backupFileName}`, backupFilePath);
            }

            // Get backup metadata
            const metadata = await this.getBackupMetadata(databaseName, backupFileName);
            
            // Save metadata JSON
            const backupMetadata: BackupMetadata = {
                name: backupFileName,
                database: databaseName,
                timestamp: new Date(),
                size: metadata.size,
                checksum: await this.calculateChecksum(backupFilePath),
                tables: metadata.tables,
                records: metadata.records,
                version: process.env.npm_package_version || '2.0.0',
                options: options || {}
            };

            await fs.writeJson(metadataFile, backupMetadata, { spaces: 2 });

            // Create archive if requested
            let archiveFile: string | undefined;
            if (options?.compress) {
                archiveFile = await this.createArchive(backupFilePath, metadataFile);
            }

            console.log(`✅ Backup completed: ${backupFileName}`);
            console.log(`   Location: ${backupFilePath}`);
            console.log(`   Size: ${this.formatBytes(backupMetadata.size)}`);

            return {
                success: true,
                backupFile: backupFilePath,
                metadataFile,
                archiveFile,
                size: backupMetadata.size,
                timestamp: backupMetadata.timestamp
            };

        } catch (error) {
            console.error(`❌ Backup failed:`, error.message);
            return {
                success: false,
                error: error.message,
                timestamp: new Date()
            };
        }
    }

    async backupAllDatabases(): Promise<BackupResult[]> {
        console.log('\n💾 Backing up all databases...');

        // Get all user databases
        const result = await this.pool.request().query(`
            SELECT [name] 
            FROM sys.databases 
            WHERE [name] NOT IN ('master', 'model', 'msdb', 'tempdb')
            AND state = 0
        `);

        const databases = result.recordset.map(r => r.name);
        const results: BackupResult[] = [];

        for (const db of databases) {
            const backupResult = await this.backupDatabase(db);
            results.push(backupResult);
        }

        return results;
    }

    async backupWithLogs(databaseName: string): Promise<BackupResult> {
        console.log(`\n💾 Backing up database with transaction logs: ${databaseName}`);

        const timestamp = format(new Date(), 'yyyyMMdd_HHmmss');
        const fullBackupFile = `${databaseName}_${timestamp}_FULL.bak`;
        const logBackupFile = `${databaseName}_${timestamp}_LOG.trn`;

        try {
            // Full backup
            await this.pool.request().query(`
                BACKUP DATABASE [${databaseName}]
                TO DISK = '/var/opt/mssql/backup/${fullBackupFile}'
                WITH INIT, COMPRESSION, CHECKSUM;
            `);

            // Transaction log backup
            await this.pool.request().query(`
                BACKUP LOG [${databaseName}]
                TO DISK = '/var/opt/mssql/backup/${logBackupFile}'
                WITH INIT, COMPRESSION, CHECKSUM;
            `);

            console.log(`✅ Full backup + Transaction logs completed`);

            return {
                success: true,
                backupFile: fullBackupFile,
                logFile: logBackupFile,
                timestamp: new Date()
            };

        } catch (error) {
            console.error(`❌ Backup with logs failed:`, error.message);
            return {
                success: false,
                error: error.message,
                timestamp: new Date()
            };
        }
    }

    async differentialBackup(databaseName: string): Promise<BackupResult> {
        console.log(`\n💾 Performing differential backup: ${databaseName}`);

        const timestamp = format(new Date(), 'yyyyMMdd_HHmmss');
        const backupFile = `${databaseName}_${timestamp}_DIFF.bak`;

        try {
            await this.pool.request().query(`
                BACKUP DATABASE [${databaseName}]
                TO DISK = '/var/opt/mssql/backup/${backupFile}'
                WITH DIFFERENTIAL, COMPRESSION, CHECKSUM;
            `);

            return {
                success: true,
                backupFile,
                timestamp: new Date()
            };

        } catch (error) {
            return {
                success: false,
                error: error.message,
                timestamp: new Date()
            };
        }
    }

    async verifyBackup(backupFile: string): Promise<boolean> {
        console.log(`\n🔍 Verifying backup: ${backupFile}`);

        try {
            const result = await this.pool.request()
                .input('BackupFile', sql.NVarChar, backupFile)
                .query(`
                    RESTORE VERIFYONLY
                    FROM DISK = @BackupFile
                    WITH CHECKSUM;
                `);

            console.log('✅ Backup verification successful');
            return true;

        } catch (error) {
            console.error('❌ Backup verification failed:', error.message);
            return false;
        }
    }

    async listBackups(databaseName?: string): Promise<BackupInfo[]> {
        const backups: BackupInfo[] = [];
        const files = await fs.readdir(this.backupDir);
        
        for (const file of files) {
            if (file.endsWith('.bak') || file.endsWith('.trn')) {
                const stats = await fs.stat(path.join(this.backupDir, file));
                
                // Parse backup info from filename
                const match = file.match(/^(.+)_(\d{8}_\d{6})_(.+)?\.(bak|trn)$/);
                
                if (match) {
                    const [_, db, timestamp, type, ext] = match;
                    
                    if (!databaseName || db === databaseName) {
                        backups.push({
                            filename: file,
                            database: db,
                            timestamp: new Date(
                                `${timestamp.substr(0,4)}-${timestamp.substr(4,2)}-${timestamp.substr(6,2)}T${timestamp.substr(9,2)}:${timestamp.substr(11,2)}:${timestamp.substr(13,2)}`
                            ),
                            type: type || 'FULL',
                            size: stats.size,
                            created: stats.birthtime
                        });
                    }
                }
            }
        }

        // Sort by timestamp descending
        return backups.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    }

    async cleanupOldBackups(retentionDays: number = 30): Promise<void> {
        console.log(`\n🧹 Cleaning up backups older than ${retentionDays} days...`);

        const files = await fs.readdir(this.backupDir);
        const now = new Date();
        let deletedCount = 0;

        for (const file of files) {
            if (file.endsWith('.bak') || file.endsWith('.trn') || file.endsWith('.json') || file.endsWith('.zip')) {
                const filePath = path.join(this.backupDir, file);
                const stats = await fs.stat(filePath);
                const ageDays = (now.getTime() - stats.mtime.getTime()) / (1000 * 60 * 60 * 24);

                if (ageDays > retentionDays) {
                    await fs.remove(filePath);
                    deletedCount++;
                    console.log(`   Deleted: ${file} (${Math.round(ageDays)} days old)`);
                }
            }
        }

        console.log(`✅ Cleaned up ${deletedCount} old backup files`);
    }

    private async getBackupMetadata(databaseName: string, backupFile: string): Promise<any> {
        // Get database size and table info
        await this.pool.request()
            .database = databaseName;

        const sizeResult = await this.pool.request().query(`
            SELECT 
                SUM(size * 8.0 / 1024) AS SizeMB
            FROM sys.database_files
            WHERE type_desc = 'ROWS'
        `);

        const tablesResult = await this.pool.request().query(`
            SELECT 
                COUNT(*) AS TableCount,
                SUM(rows) AS TotalRows
            FROM sys.tables t
            INNER JOIN sys.partitions p ON t.object_id = p.object_id
            WHERE p.index_id IN (0,1)
        `);

        return {
            size: sizeResult.recordset[0]?.SizeMB * 1024 * 1024 || 0,
            tables: tablesResult.recordset[0]?.TableCount || 0,
            records: tablesResult.recordset[0]?.TotalRows || 0
        };
    }

    private async copyFromDockerContainer(
        sqlBackupDir: string,
        backupFileName: string,
        targetPath: string
    ): Promise<void> {
        const { exec } = require('child_process');
        const util = require('util');
        const execPromise = util.promisify(exec);

        const containerName = process.env.SQL_CONTAINER_NAME || 'nova-sqlserver';
        
        await execPromise(
            `docker cp ${containerName}:${sqlBackupDir}/${backupFileName} "${targetPath}"`
        );
    }

    private async calculateChecksum(filePath: string): Promise<string> {
        const crypto = require('crypto');
        const fileBuffer = await fs.readFile(filePath);
        const hash = crypto.createHash('sha256');
        hash.update(fileBuffer);
        return hash.digest('hex');
    }

    private async createArchive(backupFile: string, metadataFile: string): Promise<string> {
        const archiveFile = backupFile.replace('.bak', '.zip');
        
        const output = fs.createWriteStream(archiveFile);
        const archive = archiver('zip', { zlib: { level: 9 } });

        archive.pipe(output);
        archive.file(backupFile, { name: path.basename(backupFile) });
        archive.file(metadataFile, { name: path.basename(metadataFile) });
        
        await archive.finalize();

        return archiveFile;
    }

    private formatBytes(bytes: number): string {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    async close(): Promise<void> {
        await this.pool.close();
    }
}

export interface BackupOptions {
    compress?: boolean;
    encrypt?: boolean;
    verify?: boolean;
    withLogs?: boolean;
    differential?: boolean;
}

export interface BackupResult {
    success: boolean;
    backupFile?: string;
    metadataFile?: string;
    archiveFile?: string;
    logFile?: string;
    size?: number;
    error?: string;
    timestamp: Date;
}

export interface BackupMetadata {
    name: string;
    database: string;
    timestamp: Date;
    size: number;
    checksum: string;
    tables: number;
    records: number;
    version: string;
    options: BackupOptions;
}

export interface BackupInfo {
    filename: string;
    database: string;
    timestamp: Date;
    type: string;
    size: number;
    created: Date;
}

// CLI Interface
async function main() {
    const command = process.argv[2];
    const database = process.argv[3] || process.env.SQL_DATABASE || 'NOVA_DB';

    const backup = new SQLServerBackup();

    try {
        await backup.initialize();

        switch (command) {
            case 'backup':
                await backup.backupDatabase(database, { compress: true, verify: true });
                break;

            case 'backup:all':
                await backup.backupAllDatabases();
                break;

            case 'backup:logs':
                await backup.backupWithLogs(database);
                break;

            case 'backup:diff':
                await backup.differentialBackup(database);
                break;

            case 'verify':
                const backupFile = process.argv[3];
                if (backupFile) {
                    await backup.verifyBackup(backupFile);
                }
                break;

            case 'list':
                const backups = await backup.listBackups(database);
                console.log('\n📋 Available Backups:');
                console.log('='.repeat(80));
                backups.forEach((b, i) => {
                    console.log(`${i + 1}. ${b.filename}`);
                    console.log(`   Database: ${b.database}`);
                    console.log(`   Type: ${b.type}`);
                    console.log(`   Date: ${b.timestamp.toLocaleString()}`);
                    console.log(`   Size: ${backup['formatBytes'](b.size)}`);
                    console.log('---');
                });
                break;

            case 'cleanup':
                const days = parseInt(process.argv[3]) || 30;
                await backup.cleanupOldBackups(days);
                break;

            default:
                console.log(`
Usage:
  npm run db:backup backup <database>      Create backup
  npm run db:backup backup:all             Backup all databases
  npm run db:backup backup:logs <db>       Backup with transaction logs
  npm run db:backup backup:diff <db>       Differential backup
  npm run db:backup verify <file>          Verify backup file
  npm run db:backup list [database]        List backups
  npm run db:backup cleanup [days]         Cleanup old backups
                `);
        }
    } catch (error) {
        console.error('Backup operation failed:', error);
        process.exit(1);
    } finally {
        await backup.close();
    }
}

if (require.main === module) {
    main().catch(console.error);
}

export default SQLServerBackup;