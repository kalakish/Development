import { SQLServerConnection } from '@nova/core/database/sqlserver-connection';
import { ObjectMetadata, ObjectType } from '../models/object-metadata';
import { TableMetadata } from '../models/table-metadata';
import { PageMetadata } from '../models/page-metadata';

export class DatabaseMetadataLoader {
    private connection: SQLServerConnection;

    constructor(connection: SQLServerConnection) {
        this.connection = connection;
    }

    async loadAll(): Promise<ObjectMetadata[]> {
        const query = `
            SELECT * FROM [ObjectMetadata]
            WHERE [IsDeleted] = 0
            ORDER BY [ObjectType], [ObjectId]
        `;

        const result = await this.connection.query(query);
        const objects: ObjectMetadata[] = [];

        for (const row of result.recordset) {
            const metadata = await this.loadSpecificMetadata(
                row.ObjectType as ObjectType,
                row.ObjectId
            );
            if (metadata) {
                objects.push(metadata);
            }
        }

        return objects;
    }

    async loadByType(objectType: ObjectType): Promise<ObjectMetadata[]> {
        const query = `
            SELECT * FROM [ObjectMetadata]
            WHERE [ObjectType] = @ObjectType 
                AND [IsDeleted] = 0
            ORDER BY [ObjectId]
        `;

        const result = await this.connection.query(query, [objectType]);
        const objects: ObjectMetadata[] = [];

        for (const row of result.recordset) {
            const metadata = await this.loadSpecificMetadata(objectType, row.ObjectId);
            if (metadata) {
                objects.push(metadata);
            }
        }

        return objects;
    }

    async loadById(objectType: ObjectType, objectId: number): Promise<ObjectMetadata | null> {
        const query = `
            SELECT * FROM [ObjectMetadata]
            WHERE [ObjectType] = @ObjectType 
                AND [ObjectId] = @ObjectId 
                AND [IsDeleted] = 0
        `;

        const result = await this.connection.query(query, [objectType, objectId]);
        
        if (result.recordset.length === 0) {
            return null;
        }

        return this.loadSpecificMetadata(objectType, objectId);
    }

    async loadByName(objectType: ObjectType, name: string): Promise<ObjectMetadata | null> {
        const query = `
            SELECT * FROM [ObjectMetadata]
            WHERE [ObjectType] = @ObjectType 
                AND [Name] = @Name 
                AND [IsDeleted] = 0
        `;

        const result = await this.connection.query(query, [objectType, name]);
        
        if (result.recordset.length === 0) {
            return null;
        }

        const row = result.recordset[0];
        return this.loadById(objectType, row.ObjectId);
    }

    private async loadSpecificMetadata(
        objectType: ObjectType,
        objectId: number
    ): Promise<ObjectMetadata | null> {
        const baseQuery = `
            SELECT * FROM [ObjectMetadata]
            WHERE [ObjectType] = @ObjectType AND [ObjectId] = @ObjectId AND [IsDeleted] = 0
        `;

        const baseResult = await this.connection.query(baseQuery, [objectType, objectId]);
        
        if (baseResult.recordset.length === 0) {
            return null;
        }

        const baseRow = baseResult.recordset[0];
        const base: ObjectMetadata = {
            id: baseRow.ObjectId,
            name: baseRow.Name,
            objectType: baseRow.ObjectType,
            extension: baseRow.Extension,
            properties: JSON.parse(baseRow.Properties || '{}'),
            definition: baseRow.Definition,
            version: baseRow.Version,
            createdAt: baseRow.SystemCreatedAt,
            modifiedAt: baseRow.SystemModifiedAt,
            createdBy: baseRow.SystemCreatedBy,
            modifiedBy: baseRow.SystemModifiedBy
        };

        switch (objectType) {
            case ObjectType.Table:
                return this.loadTableMetadata(objectId, base);
            case ObjectType.Page:
                return this.loadPageMetadata(objectId, base);
            case ObjectType.Codeunit:
                return this.loadCodeunitMetadata(objectId, base);
            case ObjectType.Report:
                return this.loadReportMetadata(objectId, base);
            case ObjectType.XMLPort:
                return this.loadXMLPortMetadata(objectId, base);
            case ObjectType.Query:
                return this.loadQueryMetadata(objectId, base);
            case ObjectType.Enum:
                return this.loadEnumMetadata(objectId, base);
            default:
                return base;
        }
    }

    private async loadTableMetadata(objectId: number, base: ObjectMetadata): Promise<TableMetadata> {
        const query = `SELECT * FROM [TableMetadata] WHERE [ObjectId] = @ObjectId`;
        const result = await this.connection.query(query, [objectId]);

        if (result.recordset.length === 0) {
            return {
                ...base,
                objectType: ObjectType.Table,
                fields: [],
                keys: [],
                triggers: [],
                dataPerCompany: true,
                extensible: false
            } as TableMetadata;
        }

        const row = result.recordset[0];
        return {
            ...base,
            objectType: ObjectType.Table,
            fields: JSON.parse(row.Fields || '[]'),
            keys: JSON.parse(row.Keys || '[]'),
            triggers: JSON.parse(row.Triggers || '[]'),
            dataPerCompany: row.DataPerCompany === 1,
            extensible: row.Extensible === 1
        } as TableMetadata;
    }

    private async loadPageMetadata(objectId: number, base: ObjectMetadata): Promise<PageMetadata> {
        const query = `SELECT * FROM [PageMetadata] WHERE [ObjectId] = @ObjectId`;
        const result = await this.connection.query(query, [objectId]);

        if (result.recordset.length === 0) {
            return {
                ...base,
                objectType: ObjectType.Page,
                pageType: 'Card',
                layout: { areas: [] },
                actions: [],
                triggers: [],
                editable: true,
                insertAllowed: true,
                modifyAllowed: true,
                deleteAllowed: true
            } as PageMetadata;
        }

        const row = result.recordset[0];
        return {
            ...base,
            objectType: ObjectType.Page,
            pageType: row.PageType,
            sourceTable: row.SourceTable,
            layout: JSON.parse(row.Layout || '{"areas":[]}'),
            actions: JSON.parse(row.Actions || '[]'),
            triggers: JSON.parse(row.Triggers || '[]'),
            editable: row.Editable === 1,
            insertAllowed: row.InsertAllowed === 1,
            modifyAllowed: row.ModifyAllowed === 1,
            deleteAllowed: row.DeleteAllowed === 1
        } as PageMetadata;
    }

    private async loadCodeunitMetadata(objectId: number, base: ObjectMetadata): Promise<any> {
        const props = base.properties || {};
        return {
            ...base,
            objectType: ObjectType.Codeunit,
            procedures: props.procedures || [],
            eventSubscribers: props.eventSubscribers || []
        };
    }

    private async loadReportMetadata(objectId: number, base: ObjectMetadata): Promise<any> {
        const props = base.properties || {};
        return {
            ...base,
            objectType: ObjectType.Report,
            datasets: props.datasets || [],
            parameters: props.parameters || [],
            triggers: props.triggers || []
        };
    }

    private async loadXMLPortMetadata(objectId: number, base: ObjectMetadata): Promise<any> {
        const props = base.properties || {};
        return {
            ...base,
            objectType: ObjectType.XMLPort,
            schema: props.schema || { tables: [] },
            fieldMappings: props.fieldMappings || []
        };
    }

    private async loadQueryMetadata(objectId: number, base: ObjectMetadata): Promise<any> {
        const props = base.properties || {};
        return {
            ...base,
            objectType: ObjectType.Query,
            type: props.type || 'Normal',
            elements: props.elements || [],
            filters: props.filters || [],
            groupBy: props.groupBy || [],
            orderBy: props.orderBy || []
        };
    }

    private async loadEnumMetadata(objectId: number, base: ObjectMetadata): Promise<any> {
        const props = base.properties || {};
        return {
            ...base,
            objectType: ObjectType.Enum,
            values: props.values || [],
            extensible: props.extensible || false,
            baseType: props.baseType || 'Integer'
        };
    }
}