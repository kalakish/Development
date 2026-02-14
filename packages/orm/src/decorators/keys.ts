import 'reflect-metadata';

export const KEY_METADATA_KEY = 'nova:keys';

export interface KeyOptions {
    name: string;
    fields: string[];
    clustered?: boolean;
    unique?: boolean;
}

export function Key(name: string, fields: string[], options?: Partial<KeyOptions>): ClassDecorator {
    return (target: any) => {
        const existingKeys = Reflect.getMetadata(KEY_METADATA_KEY, target) || [];
        
        const key: KeyOptions = {
            name,
            fields,
            clustered: options?.clustered || false,
            unique: options?.unique || false
        };

        existingKeys.push(key);
        Reflect.defineMetadata(KEY_METADATA_KEY, existingKeys, target);
    };
}

export function PrimaryKey(fields: string[]): ClassDecorator {
    return Key('PK', fields, { clustered: true, unique: true });
}

export function UniqueKey(name: string, fields: string[]): ClassDecorator {
    return Key(name, fields, { unique: true });
}

export function Index(name: string, fields: string[]): ClassDecorator {
    return Key(name, fields, { clustered: false, unique: false });
}

export function getKeyMetadata(target: any): KeyOptions[] {
    return Reflect.getMetadata(KEY_METADATA_KEY, target) || [];
}