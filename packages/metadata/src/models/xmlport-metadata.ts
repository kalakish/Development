import { ObjectMetadata, ObjectType } from './object-metadata';

export interface XMLPortMetadata extends ObjectMetadata {
    objectType: ObjectType.XMLPort;
    schema: XMLSchema;
    fieldMappings: XMLFieldMapping[];
    triggers?: XMLPortTrigger[];
    properties?: Record<string, any>;
}

export interface XMLSchema {
    rootName?: string;
    rootPath?: string[];
    tables: XMLTableDefinition[];
    xsd?: string;
    namespaces?: Record<string, string>;
}

export interface XMLTableDefinition {
    tableName: string;
    elementName: string;
    keyFields?: string[];
    fieldMappings?: Record<string, string>;
    properties?: Record<string, any>;
}

export interface XMLFieldMapping {
    xmlPath: string;
    tableName: string;
    fieldName: string;
    defaultValue?: any;
    required?: boolean;
    converter?: string;
    properties?: Record<string, any>;
}

export interface XMLPortTrigger {
    name: 'OnBeforeImport' | 'OnAfterImport' | 'OnBeforeExport' | 'OnAfterExport' | 'OnBeforeInsert' | 'OnBeforeModify';
    enabled: boolean;
    body?: string;
    properties?: Record<string, any>;
}