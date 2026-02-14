import { EventEmitter } from 'events';
import { MetadataRepository } from '../repositories/metadata-repository';
import { RedisMetadataCache } from '../repositories/redis-metadata-cache';
import { ObjectMetadata, ObjectType } from '../models/object-metadata';
import { ObjectVersionInfo } from '../repositories/metadata-repository';
import * as semver from 'semver';

export class MetadataVersionService extends EventEmitter {
    private repository: MetadataRepository;
    private cache: RedisMetadataCache;

    constructor(repository: MetadataRepository, cache: RedisMetadataCache) {
        super();
        this.repository = repository;
        this.cache = cache;
    }

    // ============ Version Management ============

    async createVersion(
        objectType: ObjectType,
        objectId: number,
        comment?: string
    ): Promise<ObjectVersionInfo> {
        const metadata = await this.repository.getObject(objectType, objectId);
        
        if (!metadata) {
            throw new Error(`Object not found: ${objectType}:${objectId}`);
        }

        // Increment version
        metadata.version = (metadata.version || 0) + 1;
        metadata.versionComment = comment;

        // Save new version
        await this.repository.saveObjectVersion(metadata);
        await this.repository.saveObject(metadata);
        
        // Invalidate cache
        await this.cache.invalidateObject(objectType, objectId);
        await this.cache.invalidateObjectVersions(objectType, objectId);

        this.emit('versionCreated', {
            objectType,
            objectId,
            version: metadata.version,
            comment,
            timestamp: new Date()
        });

        return {
            version: metadata.version,
            createdAt: new Date(),
            createdBy: metadata.modifiedBy || 'system',
            comment,
            size: JSON.stringify(metadata).length
        };
    }

    async restoreVersion(
        objectType: ObjectType,
        objectId: number,
        version: number
    ): Promise<ObjectMetadata> {
        const metadata = await this.repository.getObjectVersion(objectType, objectId, version);
        
        if (!metadata) {
            throw new Error(`Version ${version} not found for object ${objectType}:${objectId}`);
        }

        // Create new version from restored data
        metadata.version = (metadata.version || 0) + 1;
        metadata.versionComment = `Restored from version ${version}`;

        // Save restored version
        await this.repository.saveObject(metadata);
        await this.repository.saveObjectVersion(metadata);

        // Invalidate cache
        await this.cache.invalidateObject(objectType, objectId);
        await this.cache.invalidateObjectVersions(objectType, objectId);

        this.emit('versionRestored', {
            objectType,
            objectId,
            version: metadata.version,
            restoredFrom: version,
            timestamp: new Date()
        });

        return metadata;
    }

    async compareVersions(
        objectType: ObjectType,
        objectId: number,
        version1: number,
        version2: number
    ): Promise<VersionDiff> {
        const v1 = await this.repository.getObjectVersion(objectType, objectId, version1);
        const v2 = await this.repository.getObjectVersion(objectType, objectId, version2);

        if (!v1 || !v2) {
            throw new Error('One or both versions not found');
        }

        return this.diffObjects(v1, v2);
    }

    async getVersionHistory(
        objectType: ObjectType,
        objectId: number
    ): Promise<ObjectVersionInfo[]> {
        // Check cache first
        const cached = await this.cache.getCachedObjectVersions(objectType, objectId);
        if (cached) {
            return cached;
        }

        // Load from repository
        const versions = await this.repository.getObjectVersions(objectType, objectId);
        
        // Cache for future requests
        await this.cache.cacheObjectVersions(objectType, objectId, versions);

        return versions;
    }

    async getLatestVersion(objectType: ObjectType, objectId: number): Promise<number> {
        const versions = await this.getVersionHistory(objectType, objectId);
        return versions.length > 0 ? versions[0].version : 1;
    }

    async versionExists(
        objectType: ObjectType,
        objectId: number,
        version: number
    ): Promise<boolean> {
        const versions = await this.getVersionHistory(objectType, objectId);
        return versions.some(v => v.version === version);
    }

    // ============ Version Comparison ============

    private diffObjects(obj1: any, obj2: any): VersionDiff {
        const changes: any[] = [];
        const added: string[] = [];
        const removed: string[] = [];
        const modified: Array<{ path: string; oldValue: any; newValue: any }> = [];

        this.deepDiff(obj1, obj2, '', changes, added, removed, modified);

        return {
            hasChanges: changes.length > 0,
            changes,
            added,
            removed,
            modified,
            summary: {
                total: changes.length,
                added: added.length,
                removed: removed.length,
                modified: modified.length
            }
        };
    }

    private deepDiff(
        obj1: any,
        obj2: any,
        path: string,
        changes: any[],
        added: string[],
        removed: string[],
        modified: Array<{ path: string; oldValue: any; newValue: any }>
    ): void {
        if (obj1 === obj2) return;

        if (!obj1) {
            changes.push({ type: 'added', path, value: obj2 });
            added.push(path);
            return;
        }

        if (!obj2) {
            changes.push({ type: 'removed', path, value: obj1 });
            removed.push(path);
            return;
        }

        if (typeof obj1 !== 'object' || typeof obj2 !== 'object') {
            if (obj1 !== obj2) {
                changes.push({ type: 'modified', path, oldValue: obj1, newValue: obj2 });
                modified.push({ path, oldValue: obj1, newValue: obj2 });
            }
            return;
        }

        const keys1 = Object.keys(obj1);
        const keys2 = Object.keys(obj2);
        const allKeys = new Set([...keys1, ...keys2]);

        for (const key of allKeys) {
            const newPath = path ? `${path}.${key}` : key;
            
            if (!keys1.includes(key)) {
                // Added in obj2
                changes.push({ type: 'added', path: newPath, value: obj2[key] });
                added.push(newPath);
            } else if (!keys2.includes(key)) {
                // Removed from obj2
                changes.push({ type: 'removed', path: newPath, value: obj1[key] });
                removed.push(newPath);
            } else {
                // Compare both
                this.deepDiff(obj1[key], obj2[key], newPath, changes, added, removed, modified);
            }
        }
    }

    // ============ Version Control ============

    async createBranch(
        sourceObjectType: ObjectType,
        sourceObjectId: number,
        targetObjectType: ObjectType,
        targetObjectId: number,
        branchName: string
    ): Promise<void> {
        const source = await this.repository.getObject(sourceObjectType, sourceObjectId);
        
        if (!source) {
            throw new Error(`Source object not found: ${sourceObjectType}:${sourceObjectId}`);
        }

        // Clone object with new ID
        const clone = { ...source };
        clone.id = targetObjectId;
        clone.name = `${source.name}_${branchName}`;
        clone.version = 1;
        clone.extension = branchName;
        clone.properties = { ...source.properties, branch: branchName, clonedFrom: sourceObjectId };

        await this.repository.saveObject(clone);
        await this.createVersion(targetObjectType, targetObjectId, `Created branch: ${branchName}`);

        this.emit('branchCreated', {
            sourceObject: `${sourceObjectType}:${sourceObjectId}`,
            targetObject: `${targetObjectType}:${targetObjectId}`,
            branchName,
            timestamp: new Date()
        });
    }

    async mergeChanges(
        sourceObjectType: ObjectType,
        sourceObjectId: number,
        targetObjectType: ObjectType,
        targetObjectId: number,
        options?: MergeOptions
    ): Promise<MergeResult> {
        const source = await this.repository.getObject(sourceObjectType, sourceObjectId);
        const target = await this.repository.getObject(targetObjectType, targetObjectId);

        if (!source || !target) {
            throw new Error('Source or target object not found');
        }

        const diff = this.diffObjects(source, target);
        const result: MergeResult = {
            success: true,
            conflicts: [],
            merged: [],
            skipped: []
        };

        // Resolve conflicts
        for (const change of diff.modified) {
            if (options?.resolution) {
                const resolver = options.resolution[change.path];
                if (resolver === 'source') {
                    this.applyChange(target, change.path, change.newValue);
                    result.merged.push(change.path);
                } else if (resolver === 'target') {
                    result.skipped.push(change.path);
                } else {
                    result.conflicts.push(change.path);
                    result.success = false;
                }
            } else {
                result.conflicts.push(change.path);
                result.success = false;
            }
        }

        // Apply added properties
        for (const path of diff.added) {
            const value = this.getValueAtPath(source, path);
            this.applyChange(target, path, value);
            result.merged.push(path);
        }

        if (result.success) {
            // Save merged object
            target.version = (target.version || 0) + 1;
            target.versionComment = `Merged from ${sourceObjectType}:${sourceObjectId}`;
            await this.repository.saveObject(target);
            await this.repository.saveObjectVersion(target);

            this.emit('mergeCompleted', {
                sourceObject: `${sourceObjectType}:${sourceObjectId}`,
                targetObject: `${targetObjectType}:${targetObjectId}`,
                result,
                timestamp: new Date()
            });
        }

        return result;
    }

    private getValueAtPath(obj: any, path: string): any {
        const parts = path.split('.');
        let current = obj;
        
        for (const part of parts) {
            if (!current) return null;
            current = current[part];
        }
        
        return current;
    }

    private applyChange(obj: any, path: string, value: any): void {
        const parts = path.split('.');
        const last = parts.pop()!;
        let current = obj;
        
        for (const part of parts) {
            if (!current[part]) current[part] = {};
            current = current[part];
        }
        
        current[last] = value;
    }

    // ============ Version Tagging ============

    async tagVersion(
        objectType: ObjectType,
        objectId: number,
        version: number,
        tag: string
    ): Promise<void> {
        const versions = await this.getVersionHistory(objectType, objectId);
        const versionInfo = versions.find(v => v.version === version);

        if (!versionInfo) {
            throw new Error(`Version ${version} not found`);
        }

        // Store tag in version metadata
        // This would be stored in a separate table

        this.emit('versionTagged', {
            objectType,
            objectId,
            version,
            tag,
            timestamp: new Date()
        });
    }

    async getVersionByTag(
        objectType: ObjectType,
        objectId: number,
        tag: string
    ): Promise<number | null> {
        // Retrieve tag from storage
        return null;
    }

    // ============ Version Cleanup ============

    async cleanupOldVersions(
        objectType: ObjectType,
        objectId: number,
        keepCount: number = 10
    ): Promise<number> {
        const versions = await this.getVersionHistory(objectType, objectId);
        const toDelete = versions.slice(keepCount);

        for (const version of toDelete) {
            // Delete version from repository
            // This would need a repository method
        }

        await this.cache.invalidateObjectVersions(objectType, objectId);

        this.emit('versionsCleaned', {
            objectType,
            objectId,
            deleted: toDelete.length,
            kept: keepCount,
            timestamp: new Date()
        });

        return toDelete.length;
    }
}

export interface VersionDiff {
    hasChanges: boolean;
    changes: any[];
    added: string[];
    removed: string[];
    modified: Array<{ path: string; oldValue: any; newValue: any }>;
    summary: {
        total: number;
        added: number;
        removed: number;
        modified: number;
    };
}

export interface MergeOptions {
    resolution?: Record<string, 'source' | 'target'>;
    autoResolve?: boolean;
}

export interface MergeResult {
    success: boolean;
    conflicts: string[];
    merged: string[];
    skipped: string[];
}