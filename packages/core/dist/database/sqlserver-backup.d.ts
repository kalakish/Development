/// <reference types="node" />
import { SQLServerConnection } from './sqlserver-connection';
import { EventEmitter } from 'events';
export declare class SQLServerBackup extends EventEmitter {
    private connection;
    constructor(connection: SQLServerConnection);
    createBackup(options: BackupOptions): Promise<BackupResult>;
    createFullBackup(database: string, backupPath?: string): Promise<BackupResult>;
    createDifferentialBackup(database: string, backupPath?: string): Promise<BackupResult>;
    createTransactionLogBackup(database: string, backupPath?: string): Promise<BackupResult>;
    verifyBackup(backupPath: string): Promise<boolean>;
    getBackupHistory(database: string, limit?: number): Promise<BackupHistoryEntry[]>;
    private getBackupType;
    scheduleBackup(options: ScheduledBackupOptions): Promise<string>;
    private getFrequencyType;
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
//# sourceMappingURL=sqlserver-backup.d.ts.map