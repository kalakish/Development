export enum ObjectType {
    Table = 'Table',
    Page = 'Page',
    Codeunit = 'Codeunit',
    Report = 'Report',
    XMLPort = 'XMLPort',
    Query = 'Query',
    Enum = 'Enum'
}

export interface ObjectMetadata {
    id: number;
    name: string;
    objectType: ObjectType;
    extension?: string;
    properties: Record<string, any>;
    definition?: string;
    version: number;
    versionComment?: string;
    createdAt?: Date;
    modifiedAt?: Date;
    createdBy?: string;
    modifiedBy?: string;
}

export interface ObjectDependency {
    objectId: number;
    objectType: ObjectType;
    objectName: string;
    dependentId: number;
    dependentType: ObjectType;
    dependentName: string;
    dependencyType: 'compile' | 'runtime' | 'event' | 'reference';
}