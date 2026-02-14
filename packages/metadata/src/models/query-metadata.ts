import { ObjectMetadata, ObjectType } from './object-metadata';

export interface QueryMetadata extends ObjectMetadata {
    objectType: ObjectType.Query;
    type: QueryType;
    elements: QueryElement[];
    filters?: QueryFilter[];
    groupBy?: string[];
    having?: string;
    orderBy?: QueryOrder[];
    parameters?: QueryParameter[];
    properties?: Record<string, any>;
}

export enum QueryType {
    Normal = 'Normal',
    Static = 'Static',
    API = 'API'
}

export type QueryElement = 
    | QueryDataItem
    | QueryColumn
    | QueryAggregate
    | QueryExpression;

export interface QueryDataItem {
    type: 'dataitem';
    name: string;
    tableName: string;
    link?: QueryLink;
    properties?: Record<string, any>;
}

export interface QueryColumn {
    type: 'column';
    name: string;
    table: string;
    field: string;
    alias?: string;
    properties?: Record<string, any>;
}

export interface QueryAggregate {
    type: 'aggregate';
    name: string;
    function: 'SUM' | 'AVG' | 'COUNT' | 'MIN' | 'MAX';
    field: string;
    alias: string;
    properties?: Record<string, any>;
}

export interface QueryExpression {
    type: 'expression';
    name: string;
    expression: string;
    alias: string;
    properties?: Record<string, any>;
}

export interface QueryLink {
    from: string;
    to: string;
    type?: 'inner' | 'left' | 'right' | 'full';
}

export interface QueryFilter {
    name?: string;
    condition: string;
    parameters?: QueryParameter[];
    properties?: Record<string, any>;
}

export interface QueryOrder {
    field: string;
    direction: 'asc' | 'desc';
}

export interface QueryParameter {
    name: string;
    type: string;
    required?: boolean;
    defaultValue?: any;
    properties?: Record<string, any>;
}