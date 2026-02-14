import { SQLServerConnection } from './sqlserver-connection';
import { EventEmitter } from 'events';
import * as fs from 'fs-extra';
import * as path from 'path';

export class SQLServerBackup extends EventEmitter {
    private connection: SQLServerConnection;

    constructor(connection: SQLServerConnection) {
        super();
        this.connection = connection;
    }

    async createBackup(options: BackupOptions): Promise<BackupResult> {
        const timestamp = new Date().toISOString().replace(/[-:.]/g, '');
        const backupFileName = `${options.database}_${timestamp}.bak`;
        const backupPath = path.join(options.backupPath || './backups', backupFileName);

        // Ensure backup directory exists
        await fs.ensureDir(path.dirname(backupPath));

        const query = `
            BACKUP DATABASE [${options.database}]
            TO DISK = '${backupPath}'
            WITH 
                FORMAT,
                INIT,
                NAME = '${options.description || `Backup of ${options.database}`}',
                SKIP,
                NOREWIND,
                NOUNLOAD,
                STATS = 10
        `;

        this.emit('backupStarted', { database: options.database, path: backupPath });

        const result = await this.connection.query(query);
        
        // Get backup info
        const info = await this.connection.query(`
            SELECT 
                backup_set_id,
                name,
                backup_start_date,
                backup_finish_date,
                backup_size,
                compressed_backup_size
            FROM msdb.dbo.backupset
            WHERE database_name = '${options.database}'
            ORDER BY backup_start_date DESC
        `);

        const backupResult: BackupResult = {
            id: info.recordset[0]?.backup_set_id,
            database: options.database,
            path: backupPath,
            size: info.recordset[0]?.backup_size,
            compressedSize: info.recordset[0]?.compressed_backup_size,
            startTime: info.recordset[0]?.backup_start_date,
            endTime: info.recordset[0]?.backup_finish_date,
            success: true
        };

        this.emit('backupCompleted', backupResult);
        return backupResult;
    }

    async createFullBackup(database: string, backupPath?: string): Promise<BackupResult> {
        return this.createBackup({
            database,
            backupPath,
            type: 'full',
            description: `Full backup of ${database}`
        });
    }

    async createDifferentialBackup(database: string, backupPath?: string): Promise<BackupResult> {
        return this.createBackup({
            database,
            backupPath,
            type: 'differential',
            description: `Differential backup of ${database}`
        });
    }

    async createTransactionLogBackup(database: string, backupPath?: string): Promise<BackupResult> {
        return this.createBackup({
            database,
            backupPath,
            type: 'log',
            description: `Transaction log backup of ${database}`
        });
    }

    async verifyBackup(backupPath: string): Promise<boolean> {
        try {
            const result = await this.connection.query(`
                RESTORE VERIFYONLY
                FROM DISK = '${backupPath}'
            `);
            return true;
        } catch (error) {
            this.emit('backupVerificationFailed', { path: backupPath, error: error.message });
            return false;
        }
    }

    async getBackupHistory(database: string, limit: number = 10): Promise<BackupHistoryEntry[]> {
        const result = await this.connection.query(`
            SELECT TOP ${limit}
                backup_set_id,
                name,
                description,
                backup_start_date,
                backup_finish_date,
                backup_size,
                compressed_backup_size,
                position,
                database_name,
                server_name,
                recovery_model,
                type
            FROM msdb.dbo.backupset
            WHERE database_name = '${database}'
            ORDER BY backup_start_date DESC
        `);

        return result.recordset.map(row => ({
            id: row.backup_set_id,
            name: row.name,
            description: row.description,
            startTime: row.backup_start_date,
            endTime: row.backup_finish_date,
            size: row.backup_size,
            compressedSize: row.compressed_backup_size,
            type: this.getBackupType(row.type),
            database: row.database_name,
            server: row.server_name
        }));
    }

    private getBackupType(code: string): string {
        const types: Record<string, string> = {
            'D': 'Full',
            'I': 'Differential',
            'L': 'Log',
            'F': 'File',
            'G': 'File Differential',
            'P': 'Partial',
            'Q': 'Partial Differential'
        };
        return types[code] || 'Unknown';
    }

    async scheduleBackup(options: ScheduledBackupOptions): Promise<string> {
        const jobId = `Backup_${options.database}_${Date.now()}`;
        
        // Create SQL Server Agent job
        await this.connection.query(`
            USE msdb;
            EXEC dbo.sp_add_job
                @job_name = N'${jobId}',
                @enabled = 1,
                @description = N'${options.description || `Scheduled backup for ${options.database}`}';
            
            EXEC dbo.sp_add_jobstep
                @job_name = N'${jobId}',
                @step_name = N'Backup',
                @subsystem = N'TSQL',
                @command = N'BACKUP DATABASE [${options.database}] TO DISK = ''${options.backupPath}\\${options.database}_${options.type}_' + REPLACE(CONVERT(NVARCHAR(20), GETDATE(), 120), ':', '') + '.bak''',
                @retry_attempts = 5,
                @retry_interval = 5;
            
            EXEC dbo.sp_add_schedule
                @schedule_name = N'${jobId}_Schedule',
                @freq_type = ${this.getFrequencyType(options.frequency)},
                @freq_interval = ${options.interval || 1},
                @active_start_time = ${options.startTime || 230000};
            
            EXEC dbo.sp_attach_schedule
                @job_name = N'${jobId}',
                @schedule_name = N'${jobId}_Schedule';
            
            EXEC dbo.sp_add_jobserver
                @job_name = N'${jobId}';
        `);

        return jobId;
    }

    private getFrequencyType(frequency: string): number {
        const types: Record<string, number> = {
            'daily': 4,
            'weekly': 8,
            'monthly': 16
        };
        return types[frequency] || 4;
    }
}

export interface BackupOptions {
    database: string;
    backupPath?: string;
    type?: 'full' | 'differential' | 'log';
    description?: string;
    compression?: boolean;
    encryption?: boolean;
}

export interface BackupResult {
    id: number;
    database: string;
    path: string;
    size: number;
    compressedSize?: number;
    startTime: Date;
    endTime: Date;
    success: boolean;
}

export interface BackupHistoryEntry {
    id: number;
    name: string;
    description?: string;
    startTime: Date;
    endTime: Date;
    size: number;
    compressedSize?: number;
    type: string;
    database: string;
    server: string;
}

export interface ScheduledBackupOptions {
    database: string;
    backupPath: string;
    type: 'full' | 'differential' | 'log';
    frequency: 'daily' | 'weekly' | 'monthly';
    interval?: number;
    startTime?: number;
    description?: string;
}