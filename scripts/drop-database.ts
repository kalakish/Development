import sql from 'mssql';
import dotenv from 'dotenv';
import readline from 'readline';

dotenv.config();

export class SQLServerDatabaseDrop {
    private pool: sql.ConnectionPool;

    constructor() {
        this.pool = new sql.ConnectionPool({
            server: process.env.SQL_SERVER || 'localhost',
            port: parseInt(process.env.SQL_PORT || '1433'),
            database: 'master', // Connect to master to drop databases
            user: process.env.SQL_USER || 'sa',
            password: process.env.SQL_PASSWORD || '',
            options: {
                encrypt: process.env.SQL_ENCRYPT === 'true',
                trustServerCertificate: process.env.SQL_TRUST_SERVER_CERTIFICATE === 'true',
                enableArithAbort: true,
                connectionTimeout: 30000,
                requestTimeout: 30000
            }
        });
    }

    async initialize(): Promise<void> {
        try {
            await this.pool.connect();
            console.log('✅ Connected to SQL Server master database');
        } catch (error) {
            console.error('❌ Failed to connect to SQL Server:', error.message);
            throw error;
        }
    }

    async dropDatabase(
        databaseName: string,
        options: DropOptions = {}
    ): Promise<DropResult> {
        console.log(`\n🗑️  Preparing to drop database: ${databaseName}`);

        // Confirm deletion
        if (!options.force && !await this.confirmDeletion(databaseName)) {
            return {
                success: false,
                database: databaseName,
                error: 'Operation cancelled by user',
                timestamp: new Date()
            };
        }

        try {
            // Check if database exists
            const exists = await this.databaseExists(databaseName);
            if (!exists) {
                console.log(`⚠️  Database ${databaseName} does not exist`);
                return {
                    success: true,
                    database: databaseName,
                    skipped: true,
                    timestamp: new Date()
                };
            }

            // Get database size for reporting
            const dbSize = await this.getDatabaseSize(databaseName);

            // Create backup if requested
            if (options.backup) {
                await this.backupBeforeDrop(databaseName);
            }

            // Set database to SINGLE_USER mode and kill connections
            console.log(`   Closing all connections to ${databaseName}...`);
            await this.setSingleUserMode(databaseName);

            // Drop the database
            console.log(`   Dropping database ${databaseName}...`);
            await this.pool.request()
                .input('DatabaseName', sql.NVarChar, databaseName)
                .query(`
                    DROP DATABASE IF EXISTS [${databaseName}]
                `);

            console.log(`✅ Database ${databaseName} dropped successfully`);

            // Remove from metadata cache if exists
            await this.cleanupMetadata(databaseName);

            return {
                success: true,
                database: databaseName,
                size: dbSize,
                timestamp: new Date()
            };

        } catch (error) {
            console.error(`❌ Failed to drop database ${databaseName}:`, error.message);
            
            // Try to set back to MULTI_USER on error
            try {
                await this.setMultiUserMode(databaseName);
            } catch {}

            return {
                success: false,
                database: databaseName,
                error: error.message,
                timestamp: new Date()
            };
        }
    }

    async dropAllUserDatabases(options: DropOptions = {}): Promise<DropResult[]> {
        console.log('\n🗑️  Preparing to drop ALL user databases...');
        
        // Get all user databases
        const result = await this.pool.request().query(`
            SELECT [name] 
            FROM sys.databases 
            WHERE [name] NOT IN ('master', 'model', 'msdb', 'tempdb')
            AND state = 0
        `);

        const databases = result.recordset.map(r => r.name);
        
        if (databases.length === 0) {
            console.log('📭 No user databases found');
            return [];
        }

        console.log(`\n📋 Found ${databases.length} user database(s):`);
        databases.forEach((db, i) => {
            console.log(`   ${i + 1}. ${db}`);
        });

        // Double confirmation for dropping all databases
        if (!options.force) {
            const confirm = await this.confirmBulkDeletion(databases.length);
            if (!confirm) {
                return [{
                    success: false,
                    database: 'all',
                    error: 'Operation cancelled by user',
                    timestamp: new Date()
                }];
            }
        }

        // Drop each database
        const results: DropResult[] = [];
        for (const db of databases) {
            const result = await this.dropDatabase(db, { ...options, force: true });
            results.push(result);
        }

        return results;
    }

    async dropMetadataDatabase(): Promise<DropResult> {
        const metadataDb = process.env.METADATA_DATABASE || 'NOVA_Metadata';
        return this.dropDatabase(metadataDb, { backup: true });
    }

    async dropTenantDatabase(tenantId: string): Promise<DropResult> {
        const tenantDb = `tenant_${tenantId}`;
        return this.dropDatabase(tenantDb, { backup: true });
    }

    async dropAllTenantDatabases(): Promise<DropResult[]> {
        const result = await this.pool.request().query(`
            SELECT [name] 
            FROM sys.databases 
            WHERE [name] LIKE 'tenant_%'
        `);

        const results: DropResult[] = [];
        for (const db of result.recordset) {
            const result = await this.dropDatabase(db.name, { backup: true });
            results.push(result);
        }

        return results;
    }

    async dropCompanyDatabases(companyIds?: string[]): Promise<DropResult[]> {
        let query = `
            SELECT [DatabaseName] 
            FROM [${process.env.SQL_DATABASE || 'NOVA_DB'}].[dbo].[Company]
            WHERE [SystemDeletedAt] IS NULL
        `;

        if (companyIds && companyIds.length > 0) {
            const ids = companyIds.map(id => `'${id}'`).join(',');
            query += ` AND [SystemId] IN (${ids})`;
        }

        const result = await this.pool.request().query(query);
        
        const results: DropResult[] = [];
        for (const row of result.recordset) {
            const result = await this.dropDatabase(row.DatabaseName, { backup: true });
            results.push(result);
        }

        return results;
    }

    async forceDropDatabase(databaseName: string): Promise<DropResult> {
        console.log(`\n⚠️  Force dropping database: ${databaseName}`);

        try {
            // Kill all connections with immediate rollback
            await this.pool.request()
                .input('DatabaseName', sql.NVarChar, databaseName)
                .query(`
                    DECLARE @kill varchar(8000) = '';
                    SELECT @kill = @kill + 'kill ' + CONVERT(varchar(5), session_id) + ';'
                    FROM sys.dm_exec_sessions
                    WHERE database_id = DB_ID(@DatabaseName);
                    EXEC(@kill);
                `);

            // Set offline first
            await this.pool.request()
                .input('DatabaseName', sql.NVarChar, databaseName)
                .query(`
                    ALTER DATABASE [${databaseName}] SET OFFLINE WITH ROLLBACK IMMEDIATE;
                    ALTER DATABASE [${databaseName}] SET ONLINE;
                `);

            // Drop database
            await this.pool.request()
                .input('DatabaseName', sql.NVarChar, databaseName)
                .query(`
                    DROP DATABASE IF EXISTS [${databaseName}]
                `);

            console.log(`✅ Database ${databaseName} force dropped successfully`);
            
            return {
                success: true,
                database: databaseName,
                forced: true,
                timestamp: new Date()
            };

        } catch (error) {
            console.error(`❌ Force drop failed:`, error.message);
            return {
                success: false,
                database: databaseName,
                error: error.message,
                timestamp: new Date()
            };
        }
    }

    async dropWithCleanup(databaseName: string): Promise<DropResult> {
        const result = await this.dropDatabase(databaseName, { backup: true });
        
        if (result.success) {
            // Cleanup related resources
            await this.cleanupDatabaseFiles(databaseName);
            await this.cleanupBackupFiles(databaseName);
            await this.cleanupMetadata(databaseName);
        }

        return result;
    }

    private async databaseExists(databaseName: string): Promise<boolean> {
        const result = await this.pool.request()
            .input('DatabaseName', sql.NVarChar, databaseName)
            .query(`
                SELECT 1 FROM sys.databases 
                WHERE [name] = @DatabaseName
            `);

        return result.recordset.length > 0;
    }

    private async getDatabaseSize(databaseName: string): Promise<number> {
        try {
            await this.pool.request()
                .input('DatabaseName', sql.NVarChar, databaseName)
                .query(`USE [${databaseName}]`);

            const result = await this.pool.request().query(`
                SELECT 
                    SUM(size * 8.0 / 1024) AS SizeMB
                FROM sys.database_files
            `);

            return result.recordset[0]?.SizeMB * 1024 * 1024 || 0;
        } catch {
            return 0;
        } finally {
            // Switch back to master
            this.pool.config.database = 'master';
        }
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
    }

    private async backupBeforeDrop(databaseName: string): Promise<void> {
        const timestamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '');
        const backupFile = `${databaseName}_pre_drop_${timestamp}.bak`;
        const backupPath = process.env.SQL_BACKUP_DIR || '/var/opt/mssql/backup';

        try {
            console.log(`   Creating backup before drop: ${backupFile}`);
            
            await this.pool.request()
                .input('DatabaseName', sql.NVarChar, databaseName)
                .input('BackupFile', sql.NVarChar, backupFile)
                .query(`
                    BACKUP DATABASE [${databaseName}]
                    TO DISK = '${backupPath}/${backupFile}'
                    WITH COMPRESSION, CHECKSUM, INIT;
                `);

            console.log(`   ✅ Pre-drop backup created`);
        } catch (error) {
            console.warn(`   ⚠️  Pre-drop backup failed: ${error.message}`);
        }
    }

    private async cleanupDatabaseFiles(databaseName: string): Promise<void> {
        // Remove physical database files if they exist
        const dataPath = process.env.SQL_DATA_PATH || '/var/opt/mssql/data';
        
        try {
            const fs = require('fs-extra');
            const mdfPath = `${dataPath}/${databaseName}.mdf`;
            const ldfPath = `${dataPath}/${databaseName}_log.ldf`;

            if (await fs.pathExists(mdfPath)) {
                await fs.remove(mdfPath);
                console.log(`   Removed data file: ${mdfPath}`);
            }
            if (await fs.pathExists(ldfPath)) {
                await fs.remove(ldfPath);
                console.log(`   Removed log file: ${ldfPath}`);
            }
        } catch (error) {
            console.warn(`   ⚠️  Could not remove physical files: ${error.message}`);
        }
    }

    private async cleanupBackupFiles(databaseName: string): Promise<void> {
        // Clean up associated backup files older than 1 day
        const backupDir = path.join(process.cwd(), 'backups');
        const fs = require('fs-extra');
        
        try {
            if (await fs.pathExists(backupDir)) {
                const files = await fs.readdir(backupDir);
                const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000);

                for (const file of files) {
                    if (file.startsWith(databaseName) && file.endsWith('.bak')) {
                        const filePath = path.join(backupDir, file);
                        const stats = await fs.stat(filePath);
                        
                        if (stats.mtimeMs < oneDayAgo) {
                            await fs.remove(filePath);
                            console.log(`   Cleaned up old backup: ${file}`);
                        }
                    }
                }
            }
        } catch (error) {
            console.warn(`   ⚠️  Could not cleanup backup files: ${error.message}`);
        }
    }

    private async cleanupMetadata(databaseName: string): Promise<void> {
        // Remove from metadata tables if they exist
        try {
            const mainDb = process.env.SQL_DATABASE || 'NOVA_DB';
            
            // Switch to main database
            this.pool.config.database = mainDb;
            
            // Check if Company table exists and remove entries
            await this.pool.request()
                .input('DatabaseName', sql.NVarChar, databaseName)
                .query(`
                    IF EXISTS (SELECT 1 FROM sys.tables WHERE name = 'Company')
                    BEGIN
                        UPDATE [Company] 
                        SET [Status] = 'Deleted', 
                            [SystemDeletedAt] = GETUTCDATE()
                        WHERE [DatabaseName] = @DatabaseName
                    END
                `);

            console.log(`   Cleaned up metadata entries`);
        } catch (error) {
            console.warn(`   ⚠️  Could not cleanup metadata: ${error.message}`);
        } finally {
            // Switch back to master
            this.pool.config.database = 'master';
        }
    }

    private async confirmDeletion(databaseName: string): Promise<boolean> {
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });

        return new Promise((resolve) => {
            rl.question(`\n⚠️  Are you sure you want to drop database '${databaseName}'? (yes/no): `, (answer) => {
                rl.close();
                resolve(answer.toLowerCase() === 'yes' || answer.toLowerCase() === 'y');
            });
        });
    }

    private async confirmBulkDeletion(count: number): Promise<boolean> {
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });

        return new Promise((resolve) => {
            rl.question(`\n⚠️  Are you sure you want to drop ALL ${count} databases? (type 'DELETE ALL' to confirm): `, (answer) => {
                rl.close();
                resolve(answer === 'DELETE ALL');
            });
        });
    }

    async getDroppableDatabases(): Promise<any[]> {
        const result = await this.pool.request().query(`
            SELECT 
                [name] AS DatabaseName,
                database_id AS DatabaseId,
                create_date AS CreateDate,
                compatibility_level,
                state_desc AS State,
                recovery_model_desc AS RecoveryModel,
                user_access_desc AS UserAccess
            FROM sys.databases
            WHERE [name] NOT IN ('master', 'model', 'msdb', 'tempdb')
            ORDER BY [name]
        `);

        return result.recordset;
    }

    async getDatabaseConnections(databaseName: string): Promise<any[]> {
        const result = await this.pool.request()
            .input('DatabaseName', sql.NVarChar, databaseName)
            .query(`
                SELECT 
                    session_id,
                    login_name,
                    host_name,
                    program_name,
                    client_interface_name,
                    login_time,
                    status
                FROM sys.dm_exec_sessions
                WHERE database_id = DB_ID(@DatabaseName)
            `);

        return result.recordset;
    }

    async close(): Promise<void> {
        await this.pool.close();
    }
}

export interface DropOptions {
    force?: boolean;
    backup?: boolean;
    cleanup?: boolean;
    ignoreConnections?: boolean;
}

export interface DropResult {
    success: boolean;
    database: string;
    size?: number;
    error?: string;
    skipped?: boolean;
    forced?: boolean;
    timestamp: Date;
}

// CLI Interface
async function main() {
    const command = process.argv[2];
    const databaseName = process.argv[3];
    const force = process.argv.includes('--force') || process.argv.includes('-f');
    const backup = process.argv.includes('--backup') || process.argv.includes('-b');
    const cleanup = process.argv.includes('--cleanup') || process.argv.includes('-c');

    const dropper = new SQLServerDatabaseDrop();

    try {
        await dropper.initialize();

        switch (command) {
            case 'list':
            case 'ls':
                const databases = await dropper.getDroppableDatabases();
                console.log('\n📋 Droppable Databases:');
                console.log('='.repeat(100));
                databases.forEach((db, i) => {
                    console.log(`${i + 1}. ${db.DatabaseName}`);
                    console.log(`   Created: ${new Date(db.CreateDate).toLocaleDateString()}`);
                    console.log(`   State: ${db.State}`);
                    console.log(`   Recovery Model: ${db.RecoveryModel}`);
                    console.log(`   Access: ${db.UserAccess}`);
                    console.log('---');
                });
                break;

            case 'connections':
                if (!databaseName) {
                    console.error('❌ Please specify database name');
                    process.exit(1);
                }
                const connections = await dropper.getDatabaseConnections(databaseName);
                console.log(`\n🔌 Active connections to ${databaseName}:`);
                console.log('='.repeat(80));
                if (connections.length === 0) {
                    console.log('   No active connections');
                } else {
                    connections.forEach((conn, i) => {
                        console.log(`${i + 1}. Session ID: ${conn.session_id}`);
                        console.log(`   Login: ${conn.login_name}`);
                        console.log(`   Host: ${conn.host_name}`);
                        console.log(`   Program: ${conn.program_name}`);
                        console.log(`   Login Time: ${new Date(conn.login_time).toLocaleString()}`);
                        console.log(`   Status: ${conn.status}`);
                        console.log('---');
                    });
                }
                break;

            case 'drop':
                if (!databaseName) {
                    console.error('❌ Please specify database name');
                    process.exit(1);
                }
                await dropper.dropDatabase(databaseName, { 
                    force, 
                    backup, 
                    cleanup 
                });
                break;

            case 'drop:all':
                await dropper.dropAllUserDatabases({ force, backup });
                break;

            case 'drop:tenant':
                if (!databaseName) {
                    console.error('❌ Please specify tenant ID');
                    process.exit(1);
                }
                await dropper.dropTenantDatabase(databaseName);
                break;

            case 'drop:tenants':
                await dropper.dropAllTenantDatabases();
                break;

            case 'drop:metadata':
                await dropper.dropMetadataDatabase();
                break;

            case 'drop:force':
                if (!databaseName) {
                    console.error('❌ Please specify database name');
                    process.exit(1);
                }
                await dropper.forceDropDatabase(databaseName);
                break;

            case 'drop:clean':
                if (!databaseName) {
                    console.error('❌ Please specify database name');
                    process.exit(1);
                }
                await dropper.dropWithCleanup(databaseName);
                break;

            case 'drop:companies':
                const companyIds = process.argv.slice(3);
                await dropper.dropCompanyDatabases(companyIds.length > 0 ? companyIds : undefined);
                break;

            default:
                console.log(`
🗑️  SQL Server Database Drop Tool

Usage:
  npm run db:drop list                              List all droppable databases
  npm run db:drop connections <database>            Show active connections
  npm run db:drop drop <database> [options]        Drop a database
  npm run db:drop drop:all [options]               Drop ALL user databases
  npm run db:drop drop:tenant <tenantId>           Drop tenant database
  npm run db:drop drop:tenants                     Drop ALL tenant databases
  npm run db:drop drop:metadata                    Drop metadata database
  npm run db:drop drop:force <database>            Force drop database (kill connections)
  npm run db:drop drop:clean <database>            Drop and cleanup all associated files
  npm run db:drop drop:companies [ids...]          Drop company databases

Options:
  --force, -f     Skip confirmation prompts
  --backup, -b    Create backup before dropping
  --cleanup, -c   Cleanup physical files and metadata

Examples:
  npm run db:drop drop NOVA_DB --backup
  npm run db:drop drop:all --force
  npm run db:drop drop:tenant tnt_123456789
  npm run db:drop drop:force NOVA_DB
  npm run db:drop connections NOVA_DB
                `);
        }

    } catch (error) {
        console.error('❌ Database drop operation failed:', error.message);
        process.exit(1);
    } finally {
        await dropper.close();
    }
}

// Allow script to be run directly or imported
if (require.main === module) {
    main().catch(console.error);
}

export default SQLServerDatabaseDrop;