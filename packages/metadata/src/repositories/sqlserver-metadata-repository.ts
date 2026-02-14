import { ConnectionPool, IRecordSet } from 'mssql';
import { MetadataRepository, ObjectReference, ObjectVersionInfo, ExtensionMetadata, DependencyValidationResult, ImportResult } from './metadata-repository';
import { ObjectMetadata, ObjectType } from '../models/object-metadata';
import { TableMetadata } from '../models/table-metadata';
import { PageMetadata } from '../models/page-metadata';
import { CodeunitMetadata } from '../models/codeunit-metadata';
import { ReportMetadata } from '../models/report-metadata';
import { XMLPortMetadata } from '../models/xmlport-metadata';
import { QueryMetadata } from '../models/query-metadata';
import { EnumMetadata } from '../models/enum-metadata';
import { SQLServerConnection } from '@nova/core/database/sqlserver-connection';
import { v4 as uuidv4 } from 'uuid';

export class SQLServerMetadataRepository implements MetadataRepository {
    private connection: SQLServerConnection;
    private transaction: any = null;

    constructor(connection: SQLServerConnection) {
        this.connection = connection;
    }

    // ============ Initialization ============

    async initialize(): Promise<void> {
        await this.ensureMetadataTables();
    }

    private async ensureMetadataTables(): Promise<void> {
        // Create ObjectMetadata table
        await this.connection.query(`
            IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'ObjectMetadata')
            BEGIN
                CREATE TABLE [ObjectMetadata] (
                    [Id] INT IDENTITY(1,1) NOT NULL,
                    [SystemId] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [DF_ObjectMetadata_SystemId] DEFAULT NEWID(),
                    [ObjectId] INT NOT NULL,
                    [ObjectType] NVARCHAR(50) NOT NULL,
                    [Name] NVARCHAR(128) NOT NULL,
                    [Extension] NVARCHAR(128) NULL,
                    [Properties] NVARCHAR(MAX) NULL,
                    [Definition] NVARCHAR(MAX) NULL,
                    [Version] INT NOT NULL CONSTRAINT [DF_ObjectMetadata_Version] DEFAULT 1,
                    [IsDeleted] BIT NOT NULL CONSTRAINT [DF_ObjectMetadata_IsDeleted] DEFAULT 0,
                    [SystemCreatedAt] DATETIME2 NOT NULL CONSTRAINT [DF_ObjectMetadata_CreatedAt] DEFAULT GETUTCDATE(),
                    [SystemCreatedBy] NVARCHAR(100) NULL,
                    [SystemModifiedAt] DATETIME2 NULL,
                    [SystemModifiedBy] NVARCHAR(100) NULL,
                    CONSTRAINT [PK_ObjectMetadata] PRIMARY KEY CLUSTERED ([Id])
                );

                CREATE UNIQUE INDEX [UX_ObjectMetadata_SystemId] ON [ObjectMetadata] ([SystemId]);
                CREATE UNIQUE INDEX [UX_ObjectMetadata_Object] ON [ObjectMetadata] ([ObjectType], [ObjectId]) WHERE [IsDeleted] = 0;
                CREATE INDEX [IX_ObjectMetadata_Name] ON [ObjectMetadata] ([Name]);
                CREATE INDEX [IX_ObjectMetadata_Extension] ON [ObjectMetadata] ([Extension]);
                
                PRINT '✅ Created ObjectMetadata table';
            END
        `);

        // Create ObjectVersion table
        await this.connection.query(`
            IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'ObjectVersion')
            BEGIN
                CREATE TABLE [ObjectVersion] (
                    [Id] INT IDENTITY(1,1) NOT NULL,
                    [SystemId] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [DF_ObjectVersion_SystemId] DEFAULT NEWID(),
                    [ObjectId] INT NOT NULL,
                    [ObjectType] NVARCHAR(50) NOT NULL,
                    [Version] INT NOT NULL,
                    [Properties] NVARCHAR(MAX) NULL,
                    [Definition] NVARCHAR(MAX) NULL,
                    [Comment] NVARCHAR(500) NULL,
                    [Size] INT NOT NULL,
                    [SystemCreatedAt] DATETIME2 NOT NULL CONSTRAINT [DF_ObjectVersion_CreatedAt] DEFAULT GETUTCDATE(),
                    [SystemCreatedBy] NVARCHAR(100) NULL,
                    CONSTRAINT [PK_ObjectVersion] PRIMARY KEY CLUSTERED ([Id])
                );

                CREATE UNIQUE INDEX [UX_ObjectVersion] ON [ObjectVersion] ([ObjectType], [ObjectId], [Version]);
                CREATE INDEX [IX_ObjectVersion_Object] ON [ObjectVersion] ([ObjectType], [ObjectId]);
                
                PRINT '✅ Created ObjectVersion table';
            END
        `);

        // Create ObjectDependency table
        await this.connection.query(`
            IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'ObjectDependency')
            BEGIN
                CREATE TABLE [ObjectDependency] (
                    [Id] INT IDENTITY(1,1) NOT NULL,
                    [SystemId] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [DF_ObjectDependency_SystemId] DEFAULT NEWID(),
                    [SourceObjectId] INT NOT NULL,
                    [SourceObjectType] NVARCHAR(50) NOT NULL,
                    [TargetObjectId] INT NOT NULL,
                    [TargetObjectType] NVARCHAR(50) NOT NULL,
                    [TargetObjectName] NVARCHAR(128) NOT NULL,
                    [ReferenceType] NVARCHAR(20) NOT NULL,
                    [ReferenceDetails] NVARCHAR(500) NULL,
                    [SystemCreatedAt] DATETIME2 NOT NULL CONSTRAINT [DF_ObjectDependency_CreatedAt] DEFAULT GETUTCDATE(),
                    CONSTRAINT [PK_ObjectDependency] PRIMARY KEY CLUSTERED ([Id])
                );

                CREATE INDEX [IX_ObjectDependency_Source] ON [ObjectDependency] ([SourceObjectType], [SourceObjectId]);
                CREATE INDEX [IX_ObjectDependency_Target] ON [ObjectDependency] ([TargetObjectType], [TargetObjectId]);
                
                PRINT '✅ Created ObjectDependency table';
            END
        `);

        // Create ExtensionMetadata table
        await this.connection.query(`
            IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'ExtensionMetadata')
            BEGIN
                CREATE TABLE [ExtensionMetadata] (
                    [Id] INT IDENTITY(1,1) NOT NULL,
                    [SystemId] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [DF_ExtensionMetadata_SystemId] DEFAULT NEWID(),
                    [ExtensionId] NVARCHAR(128) NOT NULL,
                    [Name] NVARCHAR(255) NOT NULL,
                    [Version] NVARCHAR(50) NOT NULL,
                    [Publisher] NVARCHAR(255) NOT NULL,
                    [Description] NVARCHAR(MAX) NULL,
                    [Dependencies] NVARCHAR(MAX) NULL,
                    [Objects] NVARCHAR(MAX) NULL,
                    [InstalledAt] DATETIME2 NOT NULL,
                    [UpdatedAt] DATETIME2 NOT NULL,
                    [SystemCreatedAt] DATETIME2 NOT NULL CONSTRAINT [DF_ExtensionMetadata_CreatedAt] DEFAULT GETUTCDATE(),
                    [SystemModifiedAt] DATETIME2 NULL,
                    CONSTRAINT [PK_ExtensionMetadata] PRIMARY KEY CLUSTERED ([Id])
                );

                CREATE UNIQUE INDEX [UX_ExtensionMetadata_ExtensionId] ON [ExtensionMetadata] ([ExtensionId]);
                
                PRINT '✅ Created ExtensionMetadata table';
            END
        `);

        // Create TableMetadata specific table
        await this.connection.query(`
            IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'TableMetadata')
            BEGIN
                CREATE TABLE [TableMetadata] (
                    [Id] INT IDENTITY(1,1) NOT NULL,
                    [SystemId] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [DF_TableMetadata_SystemId] DEFAULT NEWID(),
                    [ObjectId] INT NOT NULL,
                    [Fields] NVARCHAR(MAX) NULL,
                    [Keys] NVARCHAR(MAX) NULL,
                    [Triggers] NVARCHAR(MAX) NULL,
                    [DataPerCompany] BIT NOT NULL CONSTRAINT [DF_TableMetadata_DataPerCompany] DEFAULT 1,
                    [Extensible] BIT NOT NULL CONSTRAINT [DF_TableMetadata_Extensible] DEFAULT 0,
                    CONSTRAINT [PK_TableMetadata] PRIMARY KEY CLUSTERED ([Id])
                );

                CREATE UNIQUE INDEX [UX_TableMetadata_ObjectId] ON [TableMetadata] ([ObjectId]);
                
                PRINT '✅ Created TableMetadata table';
            END
        `);

        // Create PageMetadata specific table
        await this.connection.query(`
            IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'PageMetadata')
            BEGIN
                CREATE TABLE [PageMetadata] (
                    [Id] INT IDENTITY(1,1) NOT NULL,
                    [SystemId] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [DF_PageMetadata_SystemId] DEFAULT NEWID(),
                    [ObjectId] INT NOT NULL,
                    [PageType] NVARCHAR(50) NOT NULL,
                    [SourceTable] NVARCHAR(128) NULL,
                    [Layout] NVARCHAR(MAX) NULL,
                    [Actions] NVARCHAR(MAX) NULL,
                    [Triggers] NVARCHAR(MAX) NULL,
                    [Editable] BIT NOT NULL CONSTRAINT [DF_PageMetadata_Editable] DEFAULT 1,
                    [InsertAllowed] BIT NOT NULL CONSTRAINT [DF_PageMetadata_InsertAllowed] DEFAULT 1,
                    [ModifyAllowed] BIT NOT NULL CONSTRAINT [DF_PageMetadata_ModifyAllowed] DEFAULT 1,
                    [DeleteAllowed] BIT NOT NULL CONSTRAINT [DF_PageMetadata_DeleteAllowed] DEFAULT 1,
                    CONSTRAINT [PK_PageMetadata] PRIMARY KEY CLUSTERED ([Id])
                );

                CREATE UNIQUE INDEX [UX_PageMetadata_ObjectId] ON [PageMetadata] ([ObjectId]);
                
                PRINT '✅ Created PageMetadata table';
            END
        `);
    }

    // ============ Object Operations ============

    async saveObject<T extends ObjectMetadata>(metadata: T): Promise<void> {
        const exists = await this.objectExists(metadata.objectType, metadata.id);
        
        if (exists) {
            await this.updateObject(metadata);
        } else {
            await this.insertObject(metadata);
        }

        // Save specific metadata based on type
        await this.saveSpecificMetadata(metadata);
        
        // Update dependencies
        await this.updateDependencies(metadata);
        
        // Save version
        await this.saveObjectVersion(metadata);
    }

    private async insertObject<T extends ObjectMetadata>(metadata: T): Promise<void> {
        const query = `
            INSERT INTO [ObjectMetadata] (
                [ObjectId], [ObjectType], [Name], [Extension], 
                [Properties], [Definition], [Version],
                [SystemCreatedBy]
            ) VALUES (
                @ObjectId, @ObjectType, @Name, @Extension,
                @Properties, @Definition, @Version,
                @SystemCreatedBy
            )
        `;

        await this.executeQuery(query, [
            metadata.id,
            metadata.objectType,
            metadata.name,
            metadata.extension || null,
            JSON.stringify(metadata.properties || {}),
            metadata.definition || null,
            metadata.version || 1,
            metadata.createdBy || 'system'
        ]);
    }

    private async updateObject<T extends ObjectMetadata>(metadata: T): Promise<void> {
        const query = `
            UPDATE [ObjectMetadata]
            SET [Name] = @Name,
                [Extension] = @Extension,
                [Properties] = @Properties,
                [Definition] = @Definition,
                [Version] = @Version,
                [SystemModifiedAt] = GETUTCDATE(),
                [SystemModifiedBy] = @SystemModifiedBy
            WHERE [ObjectType] = @ObjectType 
                AND [ObjectId] = @ObjectId 
                AND [IsDeleted] = 0
        `;

        await this.executeQuery(query, [
            metadata.name,
            metadata.extension || null,
            JSON.stringify(metadata.properties || {}),
            metadata.definition || null,
            metadata.version || 1,
            metadata.modifiedBy || 'system',
            metadata.objectType,
            metadata.id
        ]);
    }

    async getObject<T extends ObjectMetadata>(
        objectType: ObjectType,
        objectId: number
    ): Promise<T | null> {
        const query = `
            SELECT * FROM [ObjectMetadata]
            WHERE [ObjectType] = @ObjectType 
                AND [ObjectId] = @ObjectId 
                AND [IsDeleted] = 0
        `;

        const result = await this.executeQuery(query, [objectType, objectId]);
        
        if (result.recordset.length === 0) {
            return null;
        }

        const row = result.recordset[0];
        const metadata = await this.loadSpecificMetadata<T>(objectType, objectId);
        
        return {
            ...metadata,
            id: row.ObjectId,
            name: row.Name,
            objectType: row.ObjectType,
            extension: row.Extension,
            properties: JSON.parse(row.Properties || '{}'),
            definition: row.Definition,
            version: row.Version,
            createdAt: row.SystemCreatedAt,
            modifiedAt: row.SystemModifiedAt,
            createdBy: row.SystemCreatedBy,
            modifiedBy: row.SystemModifiedBy
        } as T;
    }

    async getObjectByName<T extends ObjectMetadata>(
        objectType: ObjectType,
        name: string
    ): Promise<T | null> {
        const query = `
            SELECT * FROM [ObjectMetadata]
            WHERE [ObjectType] = @ObjectType 
                AND [Name] = @Name 
                AND [IsDeleted] = 0
        `;

        const result = await this.executeQuery(query, [objectType, name]);
        
        if (result.recordset.length === 0) {
            return null;
        }

        const row = result.recordset[0];
        return this.getObject<T>(objectType, row.ObjectId);
    }

    async deleteObject(objectType: ObjectType, objectId: number): Promise<void> {
        const query = `
            UPDATE [ObjectMetadata]
            SET [IsDeleted] = 1,
                [SystemModifiedAt] = GETUTCDATE()
            WHERE [ObjectType] = @ObjectType 
                AND [ObjectId] = @ObjectId
        `;

        await this.executeQuery(query, [objectType, objectId]);
    }

    async objectExists(objectType: ObjectType, objectId: number): Promise<boolean> {
        const query = `
            SELECT 1 FROM [ObjectMetadata]
            WHERE [ObjectType] = @ObjectType 
                AND [ObjectId] = @ObjectId 
                AND [IsDeleted] = 0
        `;

        const result = await this.executeQuery(query, [objectType, objectId]);
        return result.recordset.length > 0;
    }

    // ============ Specific Metadata Operations ============

    private async saveSpecificMetadata(metadata: ObjectMetadata): Promise<void> {
        switch (metadata.objectType) {
            case ObjectType.Table:
                await this.saveTableMetadata(metadata as TableMetadata);
                break;
            case ObjectType.Page:
                await this.savePageMetadata(metadata as PageMetadata);
                break;
            case ObjectType.Codeunit:
                await this.saveCodeunitMetadata(metadata as CodeunitMetadata);
                break;
            case ObjectType.Report:
                await this.saveReportMetadata(metadata as ReportMetadata);
                break;
            case ObjectType.XMLPort:
                await this.saveXMLPortMetadata(metadata as XMLPortMetadata);
                break;
            case ObjectType.Query:
                await this.saveQueryMetadata(metadata as QueryMetadata);
                break;
            case ObjectType.Enum:
                await this.saveEnumMetadata(metadata as EnumMetadata);
                break;
        }
    }

    private async loadSpecificMetadata<T extends ObjectMetadata>(
        objectType: ObjectType,
        objectId: number
    ): Promise<T> {
        switch (objectType) {
            case ObjectType.Table:
                return this.loadTableMetadata(objectId) as T;
            case ObjectType.Page:
                return this.loadPageMetadata(objectId) as T;
            case ObjectType.Codeunit:
                return this.loadCodeunitMetadata(objectId) as T;
            case ObjectType.Report:
                return this.loadReportMetadata(objectId) as T;
            case ObjectType.XMLPort:
                return this.loadXMLPortMetadata(objectId) as T;
            case ObjectType.Query:
                return this.loadQueryMetadata(objectId) as T;
            case ObjectType.Enum:
                return this.loadEnumMetadata(objectId) as T;
            default:
                return {} as T;
        }
    }

    private async saveTableMetadata(metadata: TableMetadata): Promise<void> {
        const query = `
            MERGE INTO [TableMetadata] AS target
            USING (SELECT @ObjectId AS ObjectId) AS source
            ON target.[ObjectId] = source.[ObjectId]
            WHEN MATCHED THEN
                UPDATE SET 
                    [Fields] = @Fields,
                    [Keys] = @Keys,
                    [Triggers] = @Triggers,
                    [DataPerCompany] = @DataPerCompany,
                    [Extensible] = @Extensible
            WHEN NOT MATCHED THEN
                INSERT ([ObjectId], [Fields], [Keys], [Triggers], [DataPerCompany], [Extensible])
                VALUES (@ObjectId, @Fields, @Keys, @Triggers, @DataPerCompany, @Extensible);
        `;

        await this.executeQuery(query, [
            metadata.id,
            JSON.stringify(metadata.fields || []),
            JSON.stringify(metadata.keys || []),
            JSON.stringify(metadata.triggers || []),
            metadata.dataPerCompany ? 1 : 0,
            metadata.extensible ? 1 : 0
        ]);
    }

    private async loadTableMetadata(objectId: number): Promise<TableMetadata> {
        const query = `
            SELECT * FROM [TableMetadata] WHERE [ObjectId] = @ObjectId
        `;

        const result = await this.executeQuery(query, [objectId]);
        
        if (result.recordset.length === 0) {
            return {
                fields: [],
                keys: [],
                triggers: [],
                dataPerCompany: true,
                extensible: false
            } as TableMetadata;
        }

        const row = result.recordset[0];
        return {
            fields: JSON.parse(row.Fields || '[]'),
            keys: JSON.parse(row.Keys || '[]'),
            triggers: JSON.parse(row.Triggers || '[]'),
            dataPerCompany: row.DataPerCompany === 1,
            extensible: row.Extensible === 1
        } as TableMetadata;
    }

    private async savePageMetadata(metadata: PageMetadata): Promise<void> {
        const query = `
            MERGE INTO [PageMetadata] AS target
            USING (SELECT @ObjectId AS ObjectId) AS source
            ON target.[ObjectId] = source.[ObjectId]
            WHEN MATCHED THEN
                UPDATE SET 
                    [PageType] = @PageType,
                    [SourceTable] = @SourceTable,
                    [Layout] = @Layout,
                    [Actions] = @Actions,
                    [Triggers] = @Triggers,
                    [Editable] = @Editable,
                    [InsertAllowed] = @InsertAllowed,
                    [ModifyAllowed] = @ModifyAllowed,
                    [DeleteAllowed] = @DeleteAllowed
            WHEN NOT MATCHED THEN
                INSERT ([ObjectId], [PageType], [SourceTable], [Layout], [Actions], 
                        [Triggers], [Editable], [InsertAllowed], [ModifyAllowed], [DeleteAllowed])
                VALUES (@ObjectId, @PageType, @SourceTable, @Layout, @Actions,
                        @Triggers, @Editable, @InsertAllowed, @ModifyAllowed, @DeleteAllowed);
        `;

        await this.executeQuery(query, [
            metadata.id,
            metadata.pageType,
            metadata.sourceTable || null,
            JSON.stringify(metadata.layout || {}),
            JSON.stringify(metadata.actions || []),
            JSON.stringify(metadata.triggers || []),
            metadata.editable ? 1 : 0,
            metadata.insertAllowed ? 1 : 0,
            metadata.modifyAllowed ? 1 : 0,
            metadata.deleteAllowed ? 1 : 0
        ]);
    }

    private async loadPageMetadata(objectId: number): Promise<PageMetadata> {
        const query = `
            SELECT * FROM [PageMetadata] WHERE [ObjectId] = @ObjectId
        `;

        const result = await this.executeQuery(query, [objectId]);
        
        if (result.recordset.length === 0) {
            return {
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

    private async saveCodeunitMetadata(metadata: CodeunitMetadata): Promise<void> {
        // Codeunit specific storage
        const query = `
            UPDATE [ObjectMetadata]
            SET [Properties] = @Properties
            WHERE [ObjectType] = 'Codeunit' AND [ObjectId] = @ObjectId
        `;

        await this.executeQuery(query, [
            JSON.stringify({
                procedures: metadata.procedures,
                eventSubscribers: metadata.eventSubscribers,
                ...metadata.properties
            }),
            metadata.id
        ]);
    }

    private async loadCodeunitMetadata(objectId: number): Promise<CodeunitMetadata> {
        const query = `
            SELECT [Properties] FROM [ObjectMetadata]
            WHERE [ObjectType] = 'Codeunit' AND [ObjectId] = @ObjectId AND [IsDeleted] = 0
        `;

        const result = await this.executeQuery(query, [objectId]);
        
        if (result.recordset.length === 0) {
            return {
                procedures: [],
                eventSubscribers: []
            } as CodeunitMetadata;
        }

        const props = JSON.parse(result.recordset[0].Properties || '{}');
        return {
            procedures: props.procedures || [],
            eventSubscribers: props.eventSubscribers || []
        } as CodeunitMetadata;
    }

    private async saveReportMetadata(metadata: ReportMetadata): Promise<void> {
        const query = `
            UPDATE [ObjectMetadata]
            SET [Properties] = @Properties
            WHERE [ObjectType] = 'Report' AND [ObjectId] = @ObjectId
        `;

        await this.executeQuery(query, [
            JSON.stringify({
                datasets: metadata.datasets,
                parameters: metadata.parameters,
                ...metadata.properties
            }),
            metadata.id
        ]);
    }

    private async loadReportMetadata(objectId: number): Promise<ReportMetadata> {
        const query = `
            SELECT [Properties] FROM [ObjectMetadata]
            WHERE [ObjectType] = 'Report' AND [ObjectId] = @ObjectId AND [IsDeleted] = 0
        `;

        const result = await this.executeQuery(query, [objectId]);
        
        if (result.recordset.length === 0) {
            return {
                datasets: [],
                parameters: []
            } as ReportMetadata;
        }

        const props = JSON.parse(result.recordset[0].Properties || '{}');
        return {
            datasets: props.datasets || [],
            parameters: props.parameters || []
        } as ReportMetadata;
    }

    private async saveXMLPortMetadata(metadata: XMLPortMetadata): Promise<void> {
        const query = `
            UPDATE [ObjectMetadata]
            SET [Properties] = @Properties
            WHERE [ObjectType] = 'XMLPort' AND [ObjectId] = @ObjectId
        `;

        await this.executeQuery(query, [
            JSON.stringify({
                schema: metadata.schema,
                fieldMappings: metadata.fieldMappings,
                ...metadata.properties
            }),
            metadata.id
        ]);
    }

    private async loadXMLPortMetadata(objectId: number): Promise<XMLPortMetadata> {
        const query = `
            SELECT [Properties] FROM [ObjectMetadata]
            WHERE [ObjectType] = 'XMLPort' AND [ObjectId] = @ObjectId AND [IsDeleted] = 0
        `;

        const result = await this.executeQuery(query, [objectId]);
        
        if (result.recordset.length === 0) {
            return {
                schema: { tables: [] },
                fieldMappings: []
            } as XMLPortMetadata;
        }

        const props = JSON.parse(result.recordset[0].Properties || '{}');
        return {
            schema: props.schema || { tables: [] },
            fieldMappings: props.fieldMappings || []
        } as XMLPortMetadata;
    }

    private async saveQueryMetadata(metadata: QueryMetadata): Promise<void> {
        const query = `
            UPDATE [ObjectMetadata]
            SET [Properties] = @Properties
            WHERE [ObjectType] = 'Query' AND [ObjectId] = @ObjectId
        `;

        await this.executeQuery(query, [
            JSON.stringify({
                elements: metadata.elements,
                filters: metadata.filters,
                orderBy: metadata.orderBy,
                ...metadata.properties
            }),
            metadata.id
        ]);
    }

    private async loadQueryMetadata(objectId: number): Promise<QueryMetadata> {
        const query = `
            SELECT [Properties] FROM [ObjectMetadata]
            WHERE [ObjectType] = 'Query' AND [ObjectId] = @ObjectId AND [IsDeleted] = 0
        `;

        const result = await this.executeQuery(query, [objectId]);
        
        if (result.recordset.length === 0) {
            return {
                elements: [],
                filters: [],
                orderBy: []
            } as QueryMetadata;
        }

        const props = JSON.parse(result.recordset[0].Properties || '{}');
        return {
            elements: props.elements || [],
            filters: props.filters || [],
            orderBy: props.orderBy || []
        } as QueryMetadata;
    }

    private async saveEnumMetadata(metadata: EnumMetadata): Promise<void> {
        const query = `
            UPDATE [ObjectMetadata]
            SET [Properties] = @Properties
            WHERE [ObjectType] = 'Enum' AND [ObjectId] = @ObjectId
        `;

        await this.executeQuery(query, [
            JSON.stringify({
                values: metadata.values,
                extensible: metadata.extensible,
                ...metadata.properties
            }),
            metadata.id
        ]);
    }

    private async loadEnumMetadata(objectId: number): Promise<EnumMetadata> {
        const query = `
            SELECT [Properties] FROM [ObjectMetadata]
            WHERE [ObjectType] = 'Enum' AND [ObjectId] = @ObjectId AND [IsDeleted] = 0
        `;

        const result = await this.executeQuery(query, [objectId]);
        
        if (result.recordset.length === 0) {
            return {
                values: [],
                extensible: false
            } as EnumMetadata;
        }

        const props = JSON.parse(result.recordset[0].Properties || '{}');
        return {
            values: props.values || [],
            extensible: props.extensible || false
        } as EnumMetadata;
    }

    // ============ Dependency Operations ============

    private async updateDependencies(metadata: ObjectMetadata): Promise<void> {
        // Delete existing dependencies
        await this.executeQuery(`
            DELETE FROM [ObjectDependency]
            WHERE [SourceObjectType] = @ObjectType AND [SourceObjectId] = @ObjectId
        `, [metadata.objectType, metadata.id]);

        // Extract and save new dependencies
        const dependencies = await this.extractDependencies(metadata);
        
        for (const dep of dependencies) {
            await this.executeQuery(`
                INSERT INTO [ObjectDependency] (
                    [SourceObjectId], [SourceObjectType], 
                    [TargetObjectId], [TargetObjectType], [TargetObjectName],
                    [ReferenceType], [ReferenceDetails]
                ) VALUES (
                    @SourceObjectId, @SourceObjectType,
                    @TargetObjectId, @TargetObjectType, @TargetObjectName,
                    @ReferenceType, @ReferenceDetails
                )
            `, [
                metadata.id,
                metadata.objectType,
                dep.objectId,
                dep.objectType,
                dep.objectName,
                dep.referenceType,
                dep.referenceDetails || null
            ]);
        }
    }

    private async extractDependencies(metadata: ObjectMetadata): Promise<ObjectReference[]> {
        const dependencies: ObjectReference[] = [];

        // Extract based on object type
        switch (metadata.objectType) {
            case ObjectType.Table:
                // Extract field references, keys, triggers
                break;
            case ObjectType.Page:
                // Extract source table references
                const pageMeta = metadata as PageMetadata;
                if (pageMeta.sourceTable) {
                    const tableObj = await this.getObjectByName(ObjectType.Table, pageMeta.sourceTable);
                    if (tableObj) {
                        dependencies.push({
                            objectId: tableObj.id,
                            objectType: ObjectType.Table,
                            objectName: tableObj.name,
                            referenceType: 'direct',
                            referenceDetails: 'SourceTable'
                        });
                    }
                }
                break;
            case ObjectType.Codeunit:
                // Extract event subscribers, function calls
                break;
        }

        return dependencies;
    }

    async getObjectDependencies(
        objectId: number,
        objectType: ObjectType
    ): Promise<ObjectReference[]> {
        const query = `
            SELECT 
                [TargetObjectId] AS objectId,
                [TargetObjectType] AS objectType,
                [TargetObjectName] AS objectName,
                [ReferenceType] AS referenceType,
                [ReferenceDetails] AS referenceDetails
            FROM [ObjectDependency]
            WHERE [SourceObjectType] = @ObjectType AND [SourceObjectId] = @ObjectId
        `;

        const result = await this.executeQuery(query, [objectType, objectId]);
        
        return result.recordset.map(row => ({
            objectId: row.objectId,
            objectType: row.objectType,
            objectName: row.objectName,
            referenceType: row.referenceType,
            referenceDetails: row.referenceDetails
        }));
    }

    async getObjectDependents(
        objectId: number,
        objectType: ObjectType
    ): Promise<ObjectReference[]> {
        const query = `
            SELECT 
                [SourceObjectId] AS objectId,
                [SourceObjectType] AS objectType,
                [TargetObjectName] AS objectName,
                [ReferenceType] AS referenceType,
                [ReferenceDetails] AS referenceDetails
            FROM [ObjectDependency]
            WHERE [TargetObjectType] = @ObjectType AND [TargetObjectId] = @ObjectId
        `;

        const result = await this.executeQuery(query, [objectType, objectId]);
        
        return result.recordset.map(row => ({
            objectId: row.objectId,
            objectType: row.objectType,
            objectName: row.objectName,
            referenceType: row.referenceType,
            referenceDetails: row.referenceDetails
        }));
    }

    // ============ Version Operations ============

    async saveObjectVersion<T extends ObjectMetadata>(metadata: T): Promise<void> {
        const query = `
            INSERT INTO [ObjectVersion] (
                [ObjectId], [ObjectType], [Version],
                [Properties], [Definition], [Comment], [Size],
                [SystemCreatedBy]
            ) VALUES (
                @ObjectId, @ObjectType, @Version,
                @Properties, @Definition, @Comment, @Size,
                @SystemCreatedBy
            )
        `;

        await this.executeQuery(query, [
            metadata.id,
            metadata.objectType,
            metadata.version || 1,
            JSON.stringify(metadata.properties || {}),
            metadata.definition || null,
            metadata.versionComment || null,
            JSON.stringify(metadata).length,
            metadata.modifiedBy || 'system'
        ]);
    }

    async getObjectVersion<T extends ObjectMetadata>(
        objectType: ObjectType,
        objectId: number,
        version: number
    ): Promise<T | null> {
        const query = `
            SELECT * FROM [ObjectVersion]
            WHERE [ObjectType] = @ObjectType 
                AND [ObjectId] = @ObjectId 
                AND [Version] = @Version
        `;

        const result = await this.executeQuery(query, [objectType, objectId, version]);
        
        if (result.recordset.length === 0) {
            return null;
        }

        const row = result.recordset[0];
        const metadata = await this.getObject<T>(objectType, objectId);
        
        if (metadata) {
            metadata.properties = JSON.parse(row.Properties || '{}');
            metadata.definition = row.Definition;
            metadata.version = row.Version;
            metadata.versionComment = row.Comment;
        }

        return metadata;
    }

    async getObjectVersions(
        objectType: ObjectType,
        objectId: number
    ): Promise<ObjectVersionInfo[]> {
        const query = `
            SELECT 
                [Version],
                [SystemCreatedAt] AS createdAt,
                [SystemCreatedBy] AS createdBy,
                [Comment],
                [Size]
            FROM [ObjectVersion]
            WHERE [ObjectType] = @ObjectType AND [ObjectId] = @ObjectId
            ORDER BY [Version] DESC
        `;

        const result = await this.executeQuery(query, [objectType, objectId]);
        
        return result.recordset.map(row => ({
            version: row.Version,
            createdAt: row.createdAt,
            createdBy: row.createdBy,
            comment: row.Comment,
            size: row.Size
        }));
    }

    // ============ Query Operations ============

    async getAllObjects(objectType?: ObjectType): Promise<ObjectMetadata[]> {
        let query = `
            SELECT * FROM [ObjectMetadata]
            WHERE [IsDeleted] = 0
        `;
        
        const params: any[] = [];
        
        if (objectType) {
            query += ` AND [ObjectType] = @ObjectType`;
            params.push(objectType);
        }

        query += ` ORDER BY [ObjectType], [ObjectId]`;

        const result = await this.executeQuery(query, params);
        const objects: ObjectMetadata[] = [];

        for (const row of result.recordset) {
            const metadata = await this.getObject(
                row.ObjectType as ObjectType,
                row.ObjectId
            );
            if (metadata) {
                objects.push(metadata);
            }
        }

        return objects;
    }

    async getObjectsByType(objectType: ObjectType): Promise<ObjectMetadata[]> {
        return this.getAllObjects(objectType);
    }

    async getObjectsByExtension(extensionId: string): Promise<ObjectMetadata[]> {
        const query = `
            SELECT * FROM [ObjectMetadata]
            WHERE [Extension] = @ExtensionId AND [IsDeleted] = 0
            ORDER BY [ObjectType], [ObjectId]
        `;

        const result = await this.executeQuery(query, [extensionId]);
        const objects: ObjectMetadata[] = [];

        for (const row of result.recordset) {
            const metadata = await this.getObject(
                row.ObjectType as ObjectType,
                row.ObjectId
            );
            if (metadata) {
                objects.push(metadata);
            }
        }

        return objects;
    }

    async getObjectsModifiedSince(timestamp: Date): Promise<ObjectMetadata[]> {
        const query = `
            SELECT * FROM [ObjectMetadata]
            WHERE [SystemModifiedAt] >= @Timestamp 
                AND [IsDeleted] = 0
            ORDER BY [ObjectType], [ObjectId]
        `;

        const result = await this.executeQuery(query, [timestamp]);
        const objects: ObjectMetadata[] = [];

        for (const row of result.recordset) {
            const metadata = await this.getObject(
                row.ObjectType as ObjectType,
                row.ObjectId
            );
            if (metadata) {
                objects.push(metadata);
            }
        }

        return objects;
    }

    // ============ Search Operations ============

    async searchObjects(query: string, objectType?: ObjectType): Promise<ObjectMetadata[]> {
        let sql = `
            SELECT * FROM [ObjectMetadata]
            WHERE [IsDeleted] = 0
                AND ([Name] LIKE @SearchPattern 
                    OR CAST([ObjectId] AS NVARCHAR) LIKE @SearchPattern
                    OR [Extension] LIKE @SearchPattern)
        `;
        
        const params: any[] = [`%${query}%`];
        
        if (objectType) {
            sql += ` AND [ObjectType] = @ObjectType`;
            params.push(objectType);
        }

        sql += ` ORDER BY [ObjectType], [ObjectId]`;

        const result = await this.executeQuery(sql, params);
        const objects: ObjectMetadata[] = [];

        for (const row of result.recordset) {
            const metadata = await this.getObject(
                row.ObjectType as ObjectType,
                row.ObjectId
            );
            if (metadata) {
                objects.push(metadata);
            }
        }

        return objects;
    }

    async findObjectsByProperty(
        objectType: ObjectType,
        property: string,
        value: any
    ): Promise<ObjectMetadata[]> {
        // This is a simplified implementation
        // In production, you'd want to index specific properties
        const objects = await this.getObjectsByType(objectType);
        
        return objects.filter(obj => {
            const propValue = obj.properties?.[property];
            return propValue === value;
        });
    }

    // ============ Extension Operations ============

    async saveExtensionMetadata(metadata: ExtensionMetadata): Promise<void> {
        const query = `
            MERGE INTO [ExtensionMetadata] AS target
            USING (SELECT @ExtensionId AS ExtensionId) AS source
            ON target.[ExtensionId] = source.[ExtensionId]
            WHEN MATCHED THEN
                UPDATE SET 
                    [Name] = @Name,
                    [Version] = @Version,
                    [Publisher] = @Publisher,
                    [Description] = @Description,
                    [Dependencies] = @Dependencies,
                    [Objects] = @Objects,
                    [UpdatedAt] = GETUTCDATE(),
                    [SystemModifiedAt] = GETUTCDATE()
            WHEN NOT MATCHED THEN
                INSERT ([ExtensionId], [Name], [Version], [Publisher], 
                        [Description], [Dependencies], [Objects], 
                        [InstalledAt], [UpdatedAt])
                VALUES (@ExtensionId, @Name, @Version, @Publisher,
                        @Description, @Dependencies, @Objects,
                        GETUTCDATE(), GETUTCDATE());
        `;

        await this.executeQuery(query, [
            metadata.id,
            metadata.name,
            metadata.version,
            metadata.publisher,
            metadata.description || null,
            JSON.stringify(metadata.dependencies),
            JSON.stringify(metadata.objects),
        ]);
    }

    async getExtensionMetadata(extensionId: string): Promise<ExtensionMetadata | null> {
        const query = `
            SELECT * FROM [ExtensionMetadata]
            WHERE [ExtensionId] = @ExtensionId
        `;

        const result = await this.executeQuery(query, [extensionId]);
        
        if (result.recordset.length === 0) {
            return null;
        }

        const row = result.recordset[0];
        return {
            id: row.ExtensionId,
            name: row.Name,
            version: row.Version,
            publisher: row.Publisher,
            description: row.Description,
            dependencies: JSON.parse(row.Dependencies || '[]'),
            objects: JSON.parse(row.Objects || '[]'),
            installedAt: row.InstalledAt,
            updatedAt: row.UpdatedAt
        };
    }

    async getExtensions(): Promise<ExtensionMetadata[]> {
        const query = `
            SELECT * FROM [ExtensionMetadata]
            ORDER BY [Name]
        `;

        const result = await this.executeQuery(query);
        
        return result.recordset.map(row => ({
            id: row.ExtensionId,
            name: row.Name,
            version: row.Version,
            publisher: row.Publisher,
            description: row.Description,
            dependencies: JSON.parse(row.Dependencies || '[]'),
            objects: JSON.parse(row.Objects || '[]'),
            installedAt: row.InstalledAt,
            updatedAt: row.UpdatedAt
        }));
    }

    // ============ Validation Operations ============

    async validateObjectDependencies(metadata: ObjectMetadata): Promise<DependencyValidationResult> {
        const dependencies = await this.extractDependencies(metadata);
        const missing: ObjectReference[] = [];
        const circular: ObjectReference[] = [];
        const warnings: string[] = [];

        for (const dep of dependencies) {
            const exists = await this.objectExists(dep.objectType, dep.objectId);
            
            if (!exists) {
                missing.push(dep);
            }
        }

        // Check for circular dependencies
        const visited = new Set<string>();
        const stack = new Set<string>();

        const checkCircular = async (objId: number, objType: ObjectType): Promise<boolean> => {
            const key = `${objType}:${objId}`;
            
            if (stack.has(key)) {
                return true;
            }
            
            if (visited.has(key)) {
                return false;
            }

            visited.add(key);
            stack.add(key);

            const deps = await this.getObjectDependencies(objId, objType);
            
            for (const dep of deps) {
                if (await checkCircular(dep.objectId, dep.objectType)) {
                    circular.push(dep);
                    return true;
                }
            }

            stack.delete(key);
            return false;
        };

        await checkCircular(metadata.id, metadata.objectType);

        return {
            valid: missing.length === 0 && circular.length === 0,
            missing,
            circular,
            warnings
        };
    }

    // ============ Batch Operations ============

    async saveObjectsBatch(objects: ObjectMetadata[]): Promise<void> {
        for (const obj of objects) {
            await this.saveObject(obj);
        }
    }

    async deleteObjectsBatch(objectIds: Array<{ type: ObjectType; id: number }>): Promise<void> {
        for (const { type, id } of objectIds) {
            await this.deleteObject(type, id);
        }
    }

    // ============ Import/Export ============

    async exportObjects(objectIds: Array<{ type: ObjectType; id: number }>): Promise<string> {
        const exportData: any[] = [];

        for (const { type, id } of objectIds) {
            const metadata = await this.getObject(type, id);
            if (metadata) {
                exportData.push({
                    objectType: metadata.objectType,
                    objectId: metadata.id,
                    name: metadata.name,
                    extension: metadata.extension,
                    properties: metadata.properties,
                    definition: metadata.definition,
                    version: metadata.version
                });
            }
        }

        return JSON.stringify(exportData, null, 2);
    }

    async importObjects(data: string): Promise<ImportResult> {
        const result: ImportResult = {
            success: true,
            imported: 0,
            skipped: 0,
            failed: 0,
            errors: []
        };

        try {
            const objects = JSON.parse(data);

            for (const obj of objects) {
                try {
                    const exists = await this.objectExists(obj.objectType, obj.objectId);
                    
                    if (exists && !obj.force) {
                        result.skipped++;
                        continue;
                    }

                    // Reconstruct metadata object
                    const metadata = {
                        id: obj.objectId,
                        name: obj.name,
                        objectType: obj.objectType,
                        extension: obj.extension,
                        properties: obj.properties,
                        definition: obj.definition,
                        version: obj.version || 1
                    } as ObjectMetadata;

                    await this.saveObject(metadata);
                    result.imported++;

                } catch (error) {
                    result.failed++;
                    result.errors.push({
                        object: `${obj.objectType}:${obj.objectId}`,
                        error: error.message
                    });
                    result.success = false;
                }
            }

        } catch (error) {
            result.success = false;
            result.errors.push({
                object: 'Import file',
                error: error.message
            });
        }

        return result;
    }

    // ============ Transaction Support ============

    async beginTransaction(): Promise<void> {
        this.transaction = await this.connection['pool'].transaction();
        await this.transaction.begin();
    }

    async commitTransaction(): Promise<void> {
        if (this.transaction) {
            await this.transaction.commit();
            this.transaction = null;
        }
    }

    async rollbackTransaction(): Promise<void> {
        if (this.transaction) {
            await this.transaction.rollback();
            this.transaction = null;
        }
    }

    inTransaction(): boolean {
        return this.transaction !== null;
    }

    // ============ Helper Methods ============

    private async executeQuery(sql: string, params?: any[]): Promise<any> {
        if (this.transaction) {
            const request = this.transaction.request();
            
            if (params) {
                params.forEach((param, index) => {
                    request.input(`p${index}`, param);
                });
            }
            
            return request.query(sql);
        } else {
            return this.connection.query(sql, params);
        }
    }
}