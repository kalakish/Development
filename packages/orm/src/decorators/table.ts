import 'reflect-metadata';

export const TABLE_METADATA_KEY = 'nova:table';

export interface TableOptions {
    id: number;
    name: string;
    description?: string;
    dataPerCompany?: boolean;
    extensible?: boolean;
    caption?: string;
}

export function Table(id: number, name: string, options?: Partial<TableOptions>): ClassDecorator {
    return (target: any) => {
        const metadata: TableOptions = {
            id,
            name,
            description: options?.description,
            dataPerCompany: options?.dataPerCompany ?? true,
            extensible: options?.extensible ?? false,
            caption: options?.caption || name
        };

        Reflect.defineMetadata(TABLE_METADATA_KEY, metadata, target);
        Reflect.defineMetadata(TABLE_METADATA_KEY, metadata, target.prototype);
    };
}

export function getTableMetadata(target: any): TableOptions | undefined {
    return Reflect.getMetadata(TABLE_METADATA_KEY, target);
}