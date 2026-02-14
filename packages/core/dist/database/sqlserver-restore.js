"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SQLServerRestore = void 0;
const events_1 = require("events");
class SQLServerRestore extends events_1.EventEmitter {
    connection;
    constructor(connection) {
        super();
        this.connection = connection;
    }
    async restoreDatabase(options) {
        this.emit('restoreStarted', {
            database: options.database,
            source: options.backupPath
        });
        let restoreScript = `
            RESTORE DATABASE [${options.database}]
            FROM DISK = '${options.backupPath}'
            WITH 
                REPLACE,
                STATS = 10
        `;
        if (options.moveFiles) {
            // Get file list from backup
            const fileList = await this.getBackupFileList(options.backupPath);
            const moveClauses = fileList.map(file => `MOVE '${file.LogicalName}' TO '${options.dataPath}\\${file.PhysicalName}'`).join(', ');
            restoreScript += `, ${moveClauses}`;
        }
        if (options.recovery) {
            restoreScript += ', RECOVERY';
        }
        else {
            restoreScript += ', NORECOVERY';
        }
        try {
            await this.connection.query(restoreScript);
            const result = {
                database: options.database,
                backupPath: options.backupPath,
                success: true,
                timestamp: new Date()
            };
            this.emit('restoreCompleted', result);
            return result;
        }
        catch (error) {
            this.emit('restoreFailed', {
                database: options.database,
                error: error.message
            });
            throw error;
        }
    }
    async restoreWithPointInTime(options) {
        const restoreScript = `
            RESTORE DATABASE [${options.database}]
            FROM DISK = '${options.backupPath}'
            WITH 
                REPLACE,
                RECOVERY,
                STOPAT = '${options.pointInTime.toISOString()}'
        `;
        const result = await this.connection.query(restoreScript);
        return {
            database: options.database,
            backupPath: options.backupPath,
            success: true,
            pointInTime: options.pointInTime,
            timestamp: new Date()
        };
    }
    async verifyBackup(backupPath) {
        try {
            // Check if backup file exists and is valid
            const result = await this.connection.query(`
                RESTORE VERIFYONLY
                FROM DISK = '${backupPath}'
            `);
            // Get backup header
            const header = await this.connection.query(`
                RESTORE HEADERONLY
                FROM DISK = '${backupPath}'
            `);
            return {
                isValid: true,
                backupInfo: header.recordset[0],
                timestamp: new Date()
            };
        }
        catch (error) {
            return {
                isValid: false,
                error: error.message,
                timestamp: new Date()
            };
        }
    }
    async getBackupFileList(backupPath) {
        const result = await this.connection.query(`
            RESTORE FILELISTONLY
            FROM DISK = '${backupPath}'
        `);
        return result.recordset.map(row => ({
            LogicalName: row.LogicalName,
            PhysicalName: row.PhysicalName,
            Type: row.Type,
            FileGroupName: row.FileGroupName,
            Size: row.Size,
            MaxSize: row.MaxSize,
            FileId: row.FileId,
            CreateLSN: row.CreateLSN,
            DropLSN: row.DropLSN
        }));
    }
    async getBackupHeader(backupPath) {
        const result = await this.connection.query(`
            RESTORE HEADERONLY
            FROM DISK = '${backupPath}'
        `);
        return result.recordset[0];
    }
    async restoreWithStandby(options) {
        const restoreScript = `
            RESTORE DATABASE [${options.database}]
            FROM DISK = '${options.backupPath}'
            WITH 
                STANDBY = '${options.standbyFile}',
                REPLACE
        `;
        await this.connection.query(restoreScript);
        return {
            database: options.database,
            backupPath: options.backupPath,
            success: true,
            standbyFile: options.standbyFile,
            timestamp: new Date()
        };
    }
    async restoreTransactionLog(options) {
        const restoreScript = `
            RESTORE LOG [${options.database}]
            FROM DISK = '${options.backupPath}'
            WITH 
                ${options.recovery ? 'RECOVERY' : 'NORECOVERY'},
                STATS = 10
        `;
        if (options.stopAt) {
            restoreScript += `, STOPAT = '${options.stopAt.toISOString()}'`;
        }
        if (options.stopAtMark) {
            restoreScript += `, STOPATMARK = '${options.stopAtMark}'`;
        }
        await this.connection.query(restoreScript);
        return {
            database: options.database,
            backupPath: options.backupPath,
            success: true,
            timestamp: new Date()
        };
    }
    async getRestoreHistory(database, limit = 10) {
        const result = await this.connection.query(`
            SELECT TOP ${limit}
                restore_history_id,
                restore_date,
                destination_database_name,
                user_name,
                backup_set_id,
                restore_type,
                replace,
                recovery,
                stop_at,
                stop_at_mark_name
            FROM msdb.dbo.restorehistory
            WHERE destination_database_name = '${database}'
            ORDER BY restore_date DESC
        `);
        return result.recordset;
    }
    async cancelRestore(database) {
        // Find and kill restore process
        const result = await this.connection.query(`
            SELECT session_id
            FROM sys.dm_exec_requests
            WHERE command LIKE 'RESTORE%'
                AND database_id = DB_ID('${database}')
        `);
        for (const row of result.recordset) {
            await this.connection.query(`KILL ${row.session_id}`);
        }
        this.emit('restoreCancelled', { database, timestamp: new Date() });
    }
}
exports.SQLServerRestore = SQLServerRestore;
//# sourceMappingURL=sqlserver-restore.js.map