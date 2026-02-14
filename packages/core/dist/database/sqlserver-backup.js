"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SQLServerBackup = void 0;
const events_1 = require("events");
const fs = __importStar(require("fs-extra"));
const path = __importStar(require("path"));
class SQLServerBackup extends events_1.EventEmitter {
    connection;
    constructor(connection) {
        super();
        this.connection = connection;
    }
    async createBackup(options) {
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
        const backupResult = {
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
    async createFullBackup(database, backupPath) {
        return this.createBackup({
            database,
            backupPath,
            type: 'full',
            description: `Full backup of ${database}`
        });
    }
    async createDifferentialBackup(database, backupPath) {
        return this.createBackup({
            database,
            backupPath,
            type: 'differential',
            description: `Differential backup of ${database}`
        });
    }
    async createTransactionLogBackup(database, backupPath) {
        return this.createBackup({
            database,
            backupPath,
            type: 'log',
            description: `Transaction log backup of ${database}`
        });
    }
    async verifyBackup(backupPath) {
        try {
            const result = await this.connection.query(`
                RESTORE VERIFYONLY
                FROM DISK = '${backupPath}'
            `);
            return true;
        }
        catch (error) {
            this.emit('backupVerificationFailed', { path: backupPath, error: error.message });
            return false;
        }
    }
    async getBackupHistory(database, limit = 10) {
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
    getBackupType(code) {
        const types = {
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
    async scheduleBackup(options) {
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
    getFrequencyType(frequency) {
        const types = {
            'daily': 4,
            'weekly': 8,
            'monthly': 16
        };
        return types[frequency] || 4;
    }
}
exports.SQLServerBackup = SQLServerBackup;
//# sourceMappingURL=sqlserver-backup.js.map