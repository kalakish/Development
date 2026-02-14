import 'reflect-metadata';

export const TRIGGER_METADATA_KEY = 'nova:triggers';

export type TriggerType = 
    | 'OnInsert' 
    | 'OnModify' 
    | 'OnDelete' 
    | 'OnRename' 
    | 'OnValidate'
    | 'OnAfterInsert'
    | 'OnAfterModify'
    | 'OnAfterDelete'
    | 'OnAfterRename';

export interface TriggerOptions {
    name: TriggerType;
    method: string;
    order?: number;
    field?: string;
}

export function OnInsert(): MethodDecorator {
    return createTriggerDecorator('OnInsert');
}

export function OnModify(): MethodDecorator {
    return createTriggerDecorator('OnModify');
}

export function OnDelete(): MethodDecorator {
    return createTriggerDecorator('OnDelete');
}

export function OnRename(): MethodDecorator {
    return createTriggerDecorator('OnRename');
}

export function OnAfterInsert(): MethodDecorator {
    return createTriggerDecorator('OnAfterInsert');
}

export function OnAfterModify(): MethodDecorator {
    return createTriggerDecorator('OnAfterModify');
}

export function OnAfterDelete(): MethodDecorator {
    return createTriggerDecorator('OnAfterDelete');
}

export function OnAfterRename(): MethodDecorator {
    return createTriggerDecorator('OnAfterRename');
}

export function OnValidate(field?: string): MethodDecorator {
    return (target: any, propertyKey: string | symbol, descriptor: PropertyDescriptor) => {
        const existingTriggers = Reflect.getMetadata(TRIGGER_METADATA_KEY, target) || [];
        
        existingTriggers.push({
            name: 'OnValidate',
            method: propertyKey as string,
            field
        });

        Reflect.defineMetadata(TRIGGER_METADATA_KEY, existingTriggers, target);
    };
}

function createTriggerDecorator(triggerName: TriggerType): MethodDecorator {
    return (target: any, propertyKey: string | symbol, descriptor: PropertyDescriptor) => {
        const existingTriggers = Reflect.getMetadata(TRIGGER_METADATA_KEY, target) || [];
        
        existingTriggers.push({
            name: triggerName,
            method: propertyKey as string
        });

        Reflect.defineMetadata(TRIGGER_METADATA_KEY, existingTriggers, target);
    };
}

export function getTriggerMetadata(target: any): TriggerOptions[] {
    return Reflect.getMetadata(TRIGGER_METADATA_KEY, target) || [];
}