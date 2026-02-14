/// <reference types="node" />
import { SQLServerConnection } from './sqlserver-connection';
import { EventEmitter } from 'events';
export declare class SQLServerRestore extends EventEmitter {
    private connection;
    constructor(connection: SQLServerConnection);
    restoreDatabase(options: RestoreOptions): Promise<RestoreResult>;
    restoreWithPointInTime(options: PointInTimeRestoreOptions): Promise<RestoreResult>;
    verifyBackup(backupPath: string): Promise<VerificationResult>;
    getBackupFileList(backupPath: string): Promise<BackupFileInfo[]>;
    getBackupHeader(backupPath: string): Promise<BackupHeader>;
    restoreWithStandby(options: StandbyRestoreOptions): Promise<RestoreResult>;
    restoreTransactionLog(options: LogRestoreOptions): Promise<RestoreResult>;
    getRestoreHistory(database: string, limit?: number): Promise<RestoreHistoryEntry[]>;
    cancelRestore(database: string): Promise<void>;
}
export interface RestoreOptions {
    database: string;
    backupPath: string;
    dataPath?: string;
    logPath?: string;
    moveFiles?: boolean;
    recovery?: boolean;
    replace?: boolean;
}
export interface PointInTimeRestoreOptions extends RestoreOptions {
    pointInTime: Date;
}
export interface StandbyRestoreOptions extends RestoreOptions {
    standbyFile: string;
}
export interface LogRestoreOptions {
    database: string;
    backupPath: string;
    recovery?: boolean;
    stopAt?: Date;
    stopAtMark?: string;
}
export interface RestoreResult {
    database: string;
    backupPath: string;
    success: boolean;
    pointInTime?: Date;
    standbyFile?: string;
    timestamp: Date;
}
export interface VerificationResult {
    isValid: boolean;
    backupInfo?: any;
    error?: string;
    timestamp: Date;
}
export interface BackupFileInfo {
    LogicalName: string;
    PhysicalName: string;
    Type: string;
    FileGroupName: string;
    Size: number;
    MaxSize: number;
    FileId: number;
    CreateLSN: number;
    DropLSN: number;
}
export interface BackupHeader {
    BackupName: string;
    BackupDescription: string;
    BackupType: number;
    ExpirationDate: Date;
    Position: number;
    DeviceType: number;
    UserName: string;
    ServerName: string;
    DatabaseName: string;
    DatabaseVersion: number;
    DatabaseCreationDate: Date;
    BackupSize: number;
    FirstLSN: number;
    LastLSN: number;
    CheckpointLSN: number;
    RecoveryModel: string;
}
export interface RestoreHistoryEntry {
    restore_history_id: number;
    restore_date: Date;
    destination_database_name: string;
    user_name: string;
    backup_set_id: number;
    restore_type: string;
    replace: boolean;
    recovery: boolean;
    stop_at: Date;
    stop_at_mark_name: string;
}
//# sourceMappingURL=sqlserver-restore.d.ts.map