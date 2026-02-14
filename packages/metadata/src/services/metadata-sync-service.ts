import { EventEmitter } from 'events';
import { MetadataRepository } from '../repositories/metadata-repository';
import { RedisMetadataCache } from '../repositories/redis-metadata-cache';
import { FileMetadataLoader } from '../loaders/file-metadata-loader';
import { DatabaseMetadataLoader } from '../loaders/database-metadata-loader';
import { ObjectMetadata, ObjectType } from '../models/object-metadata';
import { SQLServerConnection } from '@nova/core/database/sqlserver-connection';

export class MetadataSyncService extends EventEmitter {
    private repository: MetadataRepository;
    private cache: RedisMetadataCache;
    private fileLoader: FileMetadataLoader;
    private dbLoader: DatabaseMetadataLoader;
    private syncInterval: NodeJS.Timeout | null = null;
    private syncInProgress: boolean = false;

    constructor(
        repository: MetadataRepository,
        cache: RedisMetadataCache,
        connection: SQLServerConnection,
        basePath: string
    ) {
        super();
        this.repository = repository;
        this.cache = cache;
        this.fileLoader = new FileMetadataLoader(basePath);
        this.dbLoader = new DatabaseMetadataLoader(connection);
    }

    async syncFromFiles(options?: SyncOptions): Promise<SyncResult> {
        const result: SyncResult = {
            success: true,
            total: 0,
            added: 0,
            updated: 0,
            skipped: 0,
            failed: 0,
            errors: [],
            startTime: new Date(),
            endTime: new Date()
        };

        try {
            this.syncInProgress = true;
            this.emit('syncStarted', { source: 'files', timestamp: new Date() });

            // Load metadata from files
            const fileObjects = await this.fileLoader.loadAll();

            for (const fileObj of fileObjects) {
                try {
                    const dbObj = await this.repository.getObject(
                        fileObj.objectType,
                        fileObj.id
                    );

                    if (!dbObj) {
                        // New object
                        await this.repository.saveObject(fileObj);
                        result.added++;
                    } else if (this.shouldUpdate(dbObj, fileObj, options)) {
                        // Updated object
                        fileObj.version = (dbObj.version || 0) + 1;
                        await this.repository.saveObject(fileObj);
                        result.updated++;
                    } else {
                        // Skipped
                        result.skipped++;
                    }

                    // Invalidate cache
                    await this.cache.invalidateObject(fileObj.objectType, fileObj.id);
                    result.total++;

                } catch (error) {
                    result.failed++;
                    result.errors.push({
                        object: `${fileObj.objectType}:${fileObj.id}`,
                        error: error.message
                    });
                    result.success = false;
                }
            }

            this.emit('syncCompleted', {
                source: 'files',
                result,
                timestamp: new Date()
            });

        } finally {
            this.syncInProgress = false;
            result.endTime = new Date();
        }

        return result;
    }

    async syncFromDatabase(options?: SyncOptions): Promise<SyncResult> {
        const result: SyncResult = {
            success: true,
            total: 0,
            added: 0,
            updated: 0,
            skipped: 0,
            failed: 0,
            errors: [],
            startTime: new Date(),
            endTime: new Date()
        };

        try {
            this.syncInProgress = true;
            this.emit('syncStarted', { source: 'database', timestamp: new Date() });

            // Load metadata from database
            const dbObjects = await this.dbLoader.loadAll();

            for (const dbObj of dbObjects) {
                try {
                    // Save to file system
                    const filePath = this.getFilePath(dbObj);
                    await this.fileLoader.saveToFile(dbObj, filePath);
                    
                    result.total++;
                    result.updated++;

                    // Invalidate cache
                    await this.cache.invalidateObject(dbObj.objectType, dbObj.id);

                } catch (error) {
                    result.failed++;
                    result.errors.push({
                        object: `${dbObj.objectType}:${dbObj.id}`,
                        error: error.message
                    });
                    result.success = false;
                }
            }

            this.emit('syncCompleted', {
                source: 'database',
                result,
                timestamp: new Date()
            });

        } finally {
            this.syncInProgress = false;
            result.endTime = new Date();
        }

        return result;
    }

    async syncObject(
        objectType: ObjectType,
        objectId: number,
        direction: 'to-db' | 'to-file' = 'to-db'
    ): Promise<boolean> {
        try {
            if (direction === 'to-db') {
                // Sync from file to database
                const fileObj = await this.fileLoader.loadById(objectType, objectId);
                
                if (fileObj) {
                    await this.repository.saveObject(fileObj);
                    await this.cache.invalidateObject(objectType, objectId);
                    this.emit('objectSynced', {
                        objectType,
                        objectId,
                        direction,
                        timestamp: new Date()
                    });
                    return true;
                }
            } else {
                // Sync from database to file
                const dbObj = await this.dbLoader.loadById(objectType, objectId);
                
                if (dbObj) {
                    const filePath = this.getFilePath(dbObj);
                    await this.fileLoader.saveToFile(dbObj, filePath);
                    await this.cache.invalidateObject(objectType, objectId);
                    this.emit('objectSynced', {
                        objectType,
                        objectId,
                        direction,
                        timestamp: new Date()
                    });
                    return true;
                }
            }
        } catch (error) {
            this.emit('syncError', {
                objectType,
                objectId,
                direction,
                error: error.message,
                timestamp: new Date()
            });
        }

        return false;
    }

    async startAutoSync(intervalMs: number = 60000): Promise<void> {
        if (this.syncInterval) {
            clearInterval(this.syncInterval);
        }

        this.syncInterval = setInterval(async () => {
            if (!this.syncInProgress) {
                await this.syncFromFiles();
                await this.syncFromDatabase();
            }
        }, intervalMs);

        this.emit('autoSyncStarted', { intervalMs, timestamp: new Date() });
    }

    stopAutoSync(): void {
        if (this.syncInterval) {
            clearInterval(this.syncInterval);
            this.syncInterval = null;
            this.emit('autoSyncStopped', { timestamp: new Date() });
        }
    }

    private shouldUpdate(
        existing: ObjectMetadata,
        incoming: ObjectMetadata,
        options?: SyncOptions
    ): boolean {
        if (options?.force) return true;
        
        // Compare modification times
        if (incoming.modifiedAt && existing.modifiedAt) {
            return incoming.modifiedAt > existing.modifiedAt;
        }

        // Compare versions
        if (incoming.version && existing.version) {
            return incoming.version > existing.version;
        }

        return true;
    }

    private getFilePath(metadata: ObjectMetadata): string {
        const basePath = this.fileLoader.getBasePath();
        const typeDir = metadata.objectType.toLowerCase() + 's';
        const fileName = `${metadata.name}.al`;
        return `${basePath}/${typeDir}/${fileName}`;
    }

    getStatus(): SyncStatus {
        return {
            syncInProgress: this.syncInProgress,
            autoSyncEnabled: this.syncInterval !== null,
            lastSync: null // Track last sync time
        };
    }
}

export interface SyncOptions {
    force?: boolean;
    dryRun?: boolean;
    types?: ObjectType[];
    since?: Date;
}

export interface SyncResult {
    success: boolean;
    total: number;
    added: number;
    updated: number;
    skipped: number;
    failed: number;
    errors: Array<{ object: string; error: string }>;
    startTime: Date;
    endTime: Date;
}

export interface SyncStatus {
    syncInProgress: boolean;
    autoSyncEnabled: boolean;
    lastSync: Date | null;
}