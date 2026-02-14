import { ObjectMetadata, ObjectType } from './object-metadata';

export interface TableMetadata extends ObjectMetadata {
    objectType: ObjectType.Table;
    fields: TableField[];
    keys: TableKey[];
    triggers?: TableTrigger[];
    dataPerCompany: boolean;
    extensible: boolean;
    caption?: string;
    lookupPageId?: number;
}

export interface TableField {
    id: number;
    name: string;
    dataType: string;
    length?: number;
    precision?: number;
    scale?: number;
    isPrimaryKey?: boolean;
    isNullable?: boolean;
    isFlowField?: boolean;
    isFilterField?: boolean;
    defaultValue?: any;
    caption?: string;
    editable?: boolean;
    visible?: boolean;
    optionMembers?: string[];
    optionCaptions?: string[];
    optionOrdinalValues?: number[];
    calculationFormula?: string;
    calculationType?: 'Sum' | 'Count' | 'Average' | 'Min' | 'Max' | 'Lookup';
    tableRelation?: string;
    triggers?: FieldTrigger[];
    properties?: Record<string, any>;
}

export interface TableKey {
    name: string;
    fields: string[];
    clustered: boolean;
    unique: boolean;
    enabled?: boolean;
    properties?: Record<string, any>;
}

export interface TableTrigger {
    name: 'OnInsert' | 'OnModify' | 'OnDelete' | 'OnRename' | 'OnValidate';
    enabled: boolean;
    body?: string;
    properties?: Record<string, any>;
}

export interface FieldTrigger {
    event: 'OnValidate';
    field: string;
    body?: string;
    enabled?: boolean;
}