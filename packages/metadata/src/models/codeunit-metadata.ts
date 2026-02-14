import { ObjectMetadata, ObjectType } from './object-metadata';

export interface CodeunitMetadata extends ObjectMetadata {
    objectType: ObjectType.Codeunit;
    procedures: CodeunitProcedure[];
    eventSubscribers: EventSubscriber[];
    properties?: Record<string, any>;
}

export interface CodeunitProcedure {
    id?: string;
    name: string;
    parameters: ProcedureParameter[];
    returnType?: string;
    isEvent: boolean;
    isIntegration: boolean;
    isLocal?: boolean;
    isSystem?: boolean;
    body?: string;
    properties?: Record<string, any>;
}

export interface ProcedureParameter {
    name: string;
    type: string;
    isVar: boolean;
    defaultValue?: any;
    properties?: Record<string, any>;
}

export interface EventSubscriber {
    id: string;
    eventName: string;
    procedureName: string;
    priority: number;
    enabled: boolean;
    properties?: Record<string, any>;
}