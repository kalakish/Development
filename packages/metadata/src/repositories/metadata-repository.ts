import { ObjectMetadata, ObjectType } from '../models/object-metadata';
import { TableMetadata } from '../models/table-metadata';
import { PageMetadata } from '../models/page-metadata';
import { CodeunitMetadata } from '../models/codeunit-metadata';
import { ReportMetadata } from '../models/report-metadata';
import { XMLPortMetadata } from '../models/xmlport-metadata';
import { QueryMetadata } from '../models/query-metadata';
import { EnumMetadata } from '../models/enum-metadata';

export interface MetadataRepository {
    // ============ Object Operations ============

    saveObject<T extends ObjectMetadata>(metadata: T): Promise<void>;
    getObject<T extends ObjectMetadata>(objectType: ObjectType, objectId: number): Promise<T | null>;
    getObjectByName<T extends ObjectMetadata>(objectType: ObjectType, name: string): Promise<T | null>;
    deleteObject(objectType: ObjectType, objectId: number): Promise<void>;
    objectExists(objectType: ObjectType, objectId: number): Promise<boolean>;
    
    // ============ Query Operations ============

    getAllObjects(objectType?: ObjectType): Promise<ObjectMetadata[]>;
    getObjectsByType(objectType: ObjectType): Promise<ObjectMetadata[]>;
    getObjectsByExtension(extensionId: string): Promise<ObjectMetadata[]>;
    getObjectsModifiedSince(timestamp: Date): Promise<ObjectMetadata[]>;
    
    // ============ Search Operations ============

    searchObjects(query: string, objectType?: ObjectType): Promise<ObjectMetadata[]>;
    findObjectsByProperty(objectType: ObjectType, property: string, value: any): Promise<ObjectMetadata[]>;
    
    // ============ Dependency Operations ============

    getObjectDependencies(objectId: number, objectType: ObjectType): Promise<ObjectReference[]>;
    getObjectDependents(objectId: number, objectType: ObjectType): Promise<ObjectReference[]>;
    
    // ============ Version Operations ============

    saveObjectVersion<T extends ObjectMetadata>(metadata: T): Promise<void>;
    getObjectVersion<T extends ObjectMetadata>(objectType: ObjectType, objectId: number, version: number): Promise<T | null>;
    getObjectVersions(objectType: ObjectType, objectId: number): Promise<ObjectVersionInfo[]>;
    
    // ============ Extension Operations ============

    saveExtensionMetadata(extensionId: string, metadata: ExtensionMetadata): Promise<void>;
    getExtensionMetadata(extensionId: string): Promise<ExtensionMetadata | null>;
    getExtensions(): Promise<ExtensionMetadata[]>;
    
    // ============ Validation Operations ============

    validateObjectDependencies(metadata: ObjectMetadata): Promise<DependencyValidationResult>;
    
    // ============ Batch Operations ============

    saveObjectsBatch(objects: ObjectMetadata[]): Promise<void>;
    deleteObjectsBatch(objectIds: Array<{ type: ObjectType; id: number }>): Promise<void>;
    
    // ============ Import/Export ============

    exportObjects(objectIds: Array<{ type: ObjectType; id: number }>): Promise<string>;
    importObjects(data: string): Promise<ImportResult>;
    
    // ============ Transaction Support ============

    beginTransaction(): Promise<void>;
    commitTransaction(): Promise<void>;
    rollbackTransaction(): Promise<void>;
    inTransaction(): boolean;
}

export interface ObjectReference {
    objectId: number;
    objectType: ObjectType;
    objectName: string;
    referenceType: 'direct' | 'indirect' | 'event';
    referenceDetails?: string;
}

export interface ObjectVersionInfo {
    version: number;
    createdAt: Date;
    createdBy: string;
    comment?: string;
    size: number;
}

export interface ExtensionMetadata {
    id: string;
    name: string;
    version: string;
    publisher: string;
    description?: string;
    dependencies: string[];
    objects: Array<{ type: ObjectType; id: number; name: string }>;
    installedAt: Date;
    updatedAt: Date;
}

export interface DependencyValidationResult {
    valid: boolean;
    missing: ObjectReference[];
    circular: ObjectReference[];
    warnings: string[];
}

export interface ImportResult {
    success: boolean;
    imported: number;
    skipped: number;
    failed: number;
    errors: Array<{ object: string; error: string }>;
}