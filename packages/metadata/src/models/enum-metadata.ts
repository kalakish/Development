import { ObjectMetadata, ObjectType } from './object-metadata';

export interface EnumMetadata extends ObjectMetadata {
    objectType: ObjectType.Enum;
    values: EnumValue[];
    extensible: boolean;
    baseType?: 'Integer' | 'String';
    properties?: Record<string, any>;
}

export interface EnumValue {
    id: number;
    name: string;
    caption?: string;
    captions?: Record<string, string>;
    color?: string;
    isDefault?: boolean;
    isSystem?: boolean;
    properties?: Record<string, any>;
}