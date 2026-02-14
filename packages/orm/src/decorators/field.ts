import 'reflect-metadata';

export const FIELD_METADATA_KEY = 'nova:field';

export interface FieldOptions {
    id: number;
    name: string;
    dataType: string;
    length?: number;
    precision?: number;
    scale?: number;
    primaryKey?: boolean;
    nullable?: boolean;
    defaultValue?: any;
    caption?: string;
    editable?: boolean;
    visible?: boolean;
    optionMembers?: string[];
    optionCaptions?: string[];
    optionOrdinalValues?: number[];
    calculationFormula?: string;
    calculationType?: 'Sum' | 'Count' | 'Average' | 'Min' | 'Max' | 'Lookup';
    isFlowField?: boolean;
    isFilterField?: boolean;
    tableRelation?: string;
    validate?: (value: any) => boolean;
    onValidate?: (value: any) => void;
}

export function Field(id: number, name: string, dataType: string, options?: Partial<FieldOptions>): PropertyDecorator {
    return (target: any, propertyKey: string | symbol) => {
        const metadata: FieldOptions = {
            id,
            name,
            dataType,
            length: options?.length,
            precision: options?.precision,
            scale: options?.scale,
            primaryKey: options?.primaryKey || false,
            nullable: options?.nullable ?? true,
            defaultValue: options?.defaultValue,
            caption: options?.caption || name,
            editable: options?.editable ?? true,
            visible: options?.visible ?? true,
            optionMembers: options?.optionMembers,
            optionCaptions: options?.optionCaptions,
            optionOrdinalValues: options?.optionOrdinalValues,
            calculationFormula: options?.calculationFormula,
            calculationType: options?.calculationType,
            isFlowField: options?.isFlowField || false,
            isFilterField: options?.isFilterField || false,
            tableRelation: options?.tableRelation
        };

        Reflect.defineMetadata(FIELD_METADATA_KEY, metadata, target, propertyKey);
    };
}

export function getFieldMetadata(target: any, propertyKey: string): FieldOptions | undefined {
    return Reflect.getMetadata(FIELD_METADATA_KEY, target, propertyKey);
}

export function getAllFieldMetadata(target: any): Record<string, FieldOptions> {
    const fields: Record<string, FieldOptions> = {};
    const metadata = Reflect.getMetadata(FIELD_METADATA_KEY, target) || {};
    
    Object.keys(target.prototype || {}).forEach(key => {
        const fieldMetadata = getFieldMetadata(target.prototype, key);
        if (fieldMetadata) {
            fields[key] = fieldMetadata;
        }
    });

    return fields;
}