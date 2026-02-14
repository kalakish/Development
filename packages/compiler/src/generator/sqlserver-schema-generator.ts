import { ObjectMetadata } from '@nova/metadata';

export class SQLServerSchemaGenerator {
    generateCreateTable(metadata: ObjectMetadata): string[] {
        const statements: string[] = [];
        const tableName = this.escapeName(metadata.name);
        
        const fieldDefinitions = metadata.fields?.map(field => 
            this.generateFieldDefinition(field)
        ) || [];

        // Add system fields
        fieldDefinitions.push(
            `[SystemId] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [DF_${metadata.name}_SystemId] DEFAULT NEWID()`,
            `[SystemCreatedAt] DATETIME2 NOT NULL CONSTRAINT [DF_${metadata.name}_CreatedAt] DEFAULT GETUTCDATE()`,
            `[SystemCreatedBy] NVARCHAR(50) NULL`,
            `[SystemModifiedAt] DATETIME2 NULL`,
            `[SystemModifiedBy] NVARCHAR(50) NULL`,
            `[SystemRowVersion] ROWVERSION NOT NULL`,
            `[SystemDeletedAt] DATETIME2 NULL`
        );

        // Primary key
        const primaryKey = this.getPrimaryKey(metadata);
        if (primaryKey) {
            fieldDefinitions.push(
                `CONSTRAINT [PK_${metadata.name}] PRIMARY KEY CLUSTERED (${primaryKey})`
            );
        }

        const createTable = `
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'${tableName}') AND type in (N'U'))
BEGIN
    CREATE TABLE ${tableName} (
        ${fieldDefinitions.join(',\n        ')}
    );
    
    -- Default indexes
    CREATE NONCLUSTERED INDEX [IX_${metadata.name}_SystemId] ON ${tableName} ([SystemId]);
    CREATE NONCLUSTERED INDEX [IX_${metadata.name}_SystemDeletedAt] ON ${tableName} ([SystemDeletedAt]) WHERE [SystemDeletedAt] IS NULL;
END`;

        statements.push(createTable);

        // Additional indexes
        const indexes = this.generateIndexes(metadata);
        statements.push(...indexes);

        return statements;
    }

    private generateFieldDefinition(field: any): string {
        const fieldName = this.escapeName(field.name);
        const sqlType = this.mapToSQLServerType(field);
        
        let definition = `${fieldName} ${sqlType}`;
        
        // Identity/Default
        if (field.isPrimaryKey && field.dataType === 'Integer') {
            definition += ' IDENTITY(1,1)';
        } else if (field.defaultValue !== undefined) {
            definition += ` CONSTRAINT [DF_${fieldName}] DEFAULT ${this.formatDefaultValue(field.defaultValue)}`;
        }
        
        // Nullability
        if (field.isNullable === false) {
            definition += ' NOT NULL';
        } else if (!field.isPrimaryKey) {
            definition += ' NULL';
        }
        
        // Collation for text fields
        if (field.dataType === 'Text' || field.dataType === 'Code') {
            definition += ' COLLATE SQL_Latin1_General_CP1_CI_AS';
        }
        
        return definition;
    }

    private generateIndexes(metadata: ObjectMetadata): string[] {
        const indexes: string[] = [];
        const tableName = this.escapeName(metadata.name);

        // Keys defined in metadata
        for (const key of metadata.properties?.keys || []) {
            if (!key.clustered) { // Primary key already handled
                const indexName = `[IX_${metadata.name}_${key.fields.join('_')}]`;
                const unique = key.unique ? 'UNIQUE ' : '';
                const fields = key.fields.map(f => this.escapeName(f)).join(', ');
                
                indexes.push(`
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = '${indexName.replace(/\[|\]/g, '')}' AND object_id = OBJECT_ID('${tableName}'))
BEGIN
    CREATE ${unique}NONCLUSTERED INDEX ${indexName} ON ${tableName} (${fields});
END`);
            }
        }

        return indexes;
    }

    private mapToSQLServerType(field: any): string {
        switch (field.dataType) {
            case 'Integer':
                return 'INT';
            case 'BigInteger':
                return 'BIGINT';
            case 'Decimal':
                return `DECIMAL(${field.precision || 18}, ${field.scale || 2})`;
            case 'Boolean':
                return 'BIT';
            case 'Text':
                return field.length ? `NVARCHAR(${field.length})` : 'NVARCHAR(MAX)';
            case 'Code':
                return field.length ? `NCHAR(${field.length})` : 'NCHAR(20)';
            case 'Date':
                return 'DATE';
            case 'DateTime':
                return 'DATETIME2';
            case 'Time':
                return 'TIME';
            case 'Guid':
                return 'UNIQUEIDENTIFIER';
            case 'Blob':
            case 'Media':
                return 'VARBINARY(MAX)';
            case 'MediaSet':
                return 'VARBINARY(MAX)';
            default:
                return 'NVARCHAR(MAX)';
        }
    }

    generateAlterTable(oldSchema: any, newSchema: any): string[] {
        const statements: string[] = [];
        const tableName = this.escapeName(newSchema.name);

        // Add new columns
        for (const newColumn of newSchema.fields) {
            const oldColumn = oldSchema.fields?.find((f: any) => f.name === newColumn.name);
            
            if (!oldColumn) {
                const definition = this.generateFieldDefinition(newColumn);
                statements.push(`
IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = '${newSchema.name}' AND COLUMN_NAME = '${newColumn.name}')
BEGIN
    ALTER TABLE ${tableName} ADD ${definition};
END`);
            }
        }

        // Drop columns (if not system fields)
        for (const oldColumn of oldSchema.fields || []) {
            const newColumn = newSchema.fields?.find((f: any) => f.name === oldColumn.name);
            
            if (!newColumn && !oldColumn.isSystemField) {
                statements.push(`
IF EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = '${newSchema.name}' AND COLUMN_NAME = '${oldColumn.name}')
BEGIN
    ALTER TABLE ${tableName} DROP COLUMN ${this.escapeName(oldColumn.name)};
END`);
            }
        }

        return statements;
    }

    generateStoredProcedures(metadata: ObjectMetadata): string[] {
        const procedures: string[] = [];
        const tableName = this.escapeName(metadata.name);

        // SELECT procedure
        procedures.push(`
CREATE OR ALTER PROCEDURE [sp_${metadata.name}_Select]
    @Id UNIQUEIDENTIFIER = NULL,
    @Filter NVARCHAR(MAX) = NULL,
    @OrderBy NVARCHAR(MAX) = NULL,
    @PageNumber INT = 1,
    @PageSize INT = 50
AS
BEGIN
    SET NOCOUNT ON;
    
    DECLARE @Offset INT = (@PageNumber - 1) * @PageSize;
    
    SELECT *
    FROM ${tableName}
    WHERE (@Id IS NULL OR [SystemId] = @Id)
        AND [SystemDeletedAt] IS NULL
        AND (@Filter IS NULL OR @Filter = '' OR 1=1) -- Parse JSON filter here
    ORDER BY 
        CASE WHEN @OrderBy IS NULL OR @OrderBy = '' THEN [SystemCreatedAt] END DESC
    OFFSET @Offset ROWS
    FETCH NEXT @PageSize ROWS ONLY;
    
    -- Total count
    SELECT COUNT(*) AS TotalCount
    FROM ${tableName}
    WHERE (@Id IS NULL OR [SystemId] = @Id)
        AND [SystemDeletedAt] IS NULL;
END`);

        // INSERT procedure
        procedures.push(`
CREATE OR ALTER PROCEDURE [sp_${metadata.name}_Insert]
    @SystemId UNIQUEIDENTIFIER = NULL,
    @SystemCreatedBy NVARCHAR(50) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    
    DECLARE @NewId UNIQUEIDENTIFIER = ISNULL(@SystemId, NEWID());
    
    INSERT INTO ${tableName} (
        [SystemId],
        [SystemCreatedAt],
        [SystemCreatedBy]
    ) VALUES (
        @NewId,
        GETUTCDATE(),
        @SystemCreatedBy
    );
    
    SELECT * FROM ${tableName} WHERE [SystemId] = @NewId;
END`);

        // UPDATE procedure
        procedures.push(`
CREATE OR ALTER PROCEDURE [sp_${metadata.name}_Update]
    @SystemId UNIQUEIDENTIFIER,
    @SystemModifiedBy NVARCHAR(50) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    
    UPDATE ${tableName}
    SET [SystemModifiedAt] = GETUTCDATE(),
        [SystemModifiedBy] = @SystemModifiedBy
    WHERE [SystemId] = @SystemId
        AND [SystemDeletedAt] IS NULL;
    
    SELECT * FROM ${tableName} WHERE [SystemId] = @SystemId;
END`);

        // DELETE procedure (soft delete)
        procedures.push(`
CREATE OR ALTER PROCEDURE [sp_${metadata.name}_Delete]
    @SystemId UNIQUEIDENTIFIER,
    @SystemModifiedBy NVARCHAR(50) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    
    UPDATE ${tableName}
    SET [SystemDeletedAt] = GETUTCDATE(),
        [SystemModifiedAt] = GETUTCDATE(),
        [SystemModifiedBy] = @SystemModifiedBy
    WHERE [SystemId] = @SystemId
        AND [SystemDeletedAt] IS NULL;
    
    SELECT @SystemId AS DeletedId;
END`);

        return procedures;
    }

    generateViews(metadata: ObjectMetadata): string[] {
        const views: string[] = [];
        const tableName = this.escapeName(metadata.name);

        // Active records view (exclude soft deleted)
        views.push(`
CREATE OR ALTER VIEW [v_${metadata.name}_Active]
AS
    SELECT *
    FROM ${tableName}
    WHERE [SystemDeletedAt] IS NULL;`);

        return views;
    }

    generateTriggers(metadata: ObjectMetadata): string[] {
        const triggers: string[] = [];
        const tableName = this.escapeName(metadata.name);

        // Audit trigger
        triggers.push(`
CREATE OR ALTER TRIGGER [trg_${metadata.name}_Audit]
ON ${tableName}
AFTER INSERT, UPDATE, DELETE
AS
BEGIN
    SET NOCOUNT ON;
    
    DECLARE @Operation CHAR(1);
    
    IF EXISTS (SELECT * FROM inserted)
    BEGIN
        IF EXISTS (SELECT * FROM deleted)
            SET @Operation = 'U';
        ELSE
            SET @Operation = 'I';
    END
    ELSE
        SET @Operation = 'D';
    
    INSERT INTO [AuditLog] (
        [SystemId],
        [TableName],
        [Operation],
        [RecordId],
        [OldData],
        [NewData],
        [ChangedBy],
        [ChangedAt]
    )
    SELECT 
        NEWID(),
        '${metadata.name}',
        @Operation,
        ISNULL(i.[SystemId], d.[SystemId]),
        (SELECT * FROM deleted d2 WHERE d2.[SystemId] = ISNULL(i.[SystemId], d.[SystemId]) FOR JSON PATH),
        (SELECT * FROM inserted i2 WHERE i2.[SystemId] = ISNULL(i.[SystemId], d.[SystemId]) FOR JSON PATH),
        ISNULL(i.[SystemModifiedBy], d.[SystemModifiedBy]),
        GETUTCDATE()
    FROM inserted i
    FULL OUTER JOIN deleted d ON d.[SystemId] = i.[SystemId];
END`);

        return triggers;
    }

    generateSeedData(tableName: string, records: any[]): string {
        if (records.length === 0) return '';

        const escapedTable = this.escapeName(tableName);
        const columns = Object.keys(records[0]).map(c => this.escapeName(c)).join(', ');
        
        const values = records.map(record => {
            const row = Object.values(record).map(value => {
                if (value === null) return 'NULL';
                if (typeof value === 'string') return `N'${value.replace(/'/g, "''")}'`;
                if (value instanceof Date) return `'${value.toISOString()}'`;
                if (typeof value === 'boolean') return value ? '1' : '0';
                if (typeof value === 'object' && value !== null) return `N'${JSON.stringify(value).replace(/'/g, "''")}'`;
                return value;
            }).join(', ');
            return `(${row})`;
        }).join(',\n        ');

        return `
-- Seed data for ${tableName}
IF NOT EXISTS (SELECT 1 FROM ${escapedTable})
BEGIN
    SET IDENTITY_INSERT ${escapedTable} ON;
    
    INSERT INTO ${escapedTable} (${columns}) VALUES
        ${values};
    
    SET IDENTITY_INSERT ${escapedTable} OFF;
END`;
    }

    generateDatabaseSetup(): string[] {
        return [
            `
-- Create Audit Log table if not exists
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[AuditLog]') AND type in (N'U'))
BEGIN
    CREATE TABLE [AuditLog] (
        [Id] BIGINT IDENTITY(1,1) NOT NULL,
        [SystemId] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [DF_AuditLog_SystemId] DEFAULT NEWID(),
        [TableName] NVARCHAR(128) NOT NULL,
        [Operation] CHAR(1) NOT NULL,
        [RecordId] UNIQUEIDENTIFIER NOT NULL,
        [OldData] NVARCHAR(MAX) NULL,
        [NewData] NVARCHAR(MAX) NULL,
        [ChangedBy] NVARCHAR(50) NULL,
        [ChangedAt] DATETIME2 NOT NULL CONSTRAINT [DF_AuditLog_ChangedAt] DEFAULT GETUTCDATE(),
        CONSTRAINT [PK_AuditLog] PRIMARY KEY CLUSTERED ([Id])
    );
    
    CREATE INDEX [IX_AuditLog_TableName] ON [AuditLog] ([TableName]);
    CREATE INDEX [IX_AuditLog_RecordId] ON [AuditLog] ([RecordId]);
    CREATE INDEX [IX_AuditLog_ChangedAt] ON [AuditLog] ([ChangedAt]);
END;`,
            `
-- Create Job Queue table
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[JobQueue]') AND type in (N'U'))
BEGIN
    CREATE TABLE [JobQueue] (
        [Id] BIGINT IDENTITY(1,1) NOT NULL,
        [SystemId] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [DF_JobQueue_SystemId] DEFAULT NEWID(),
        [JobType] NVARCHAR(100) NOT NULL,
        [Status] NVARCHAR(20) NOT NULL,
        [Priority] INT NOT NULL CONSTRAINT [DF_JobQueue_Priority] DEFAULT 0,
        [Data] NVARCHAR(MAX) NULL,
        [Result] NVARCHAR(MAX) NULL,
        [Error] NVARCHAR(MAX) NULL,
        [ScheduledAt] DATETIME2 NULL,
        [StartedAt] DATETIME2 NULL,
        [CompletedAt] DATETIME2 NULL,
        [CreatedAt] DATETIME2 NOT NULL CONSTRAINT [DF_JobQueue_CreatedAt] DEFAULT GETUTCDATE(),
        [CreatedBy] NVARCHAR(50) NULL,
        CONSTRAINT [PK_JobQueue] PRIMARY KEY CLUSTERED ([Id])
    );
    
    CREATE INDEX [IX_JobQueue_Status] ON [JobQueue] ([Status]);
    CREATE INDEX [IX_JobQueue_ScheduledAt] ON [JobQueue] ([ScheduledAt]);
END;`
        ];
    }

    generateMigrationScript(fromVersion: string, toVersion: string, changes: any[]): string {
        return `
-- ==========================================================
-- Migration Script v${fromVersion} to v${toVersion}
-- Generated: ${new Date().toISOString()}
-- Database: SQL Server
-- ==========================================================

BEGIN TRANSACTION;

SET XACT_ABORT ON;
SET NOCOUNT ON;

PRINT N'Starting migration from v${fromVersion} to v${toVersion}...';

${changes.map(change => change.script).join('\n\n')}

PRINT N'Migration completed successfully.';

COMMIT TRANSACTION;
`;
    }

    private getPrimaryKey(metadata: ObjectMetadata): string {
        const key = metadata.properties?.keys?.find((k: any) => k.clustered);
        
        if (key) {
            return key.fields.map((f: string) => this.escapeName(f)).join(', ');
        }
        
        // Default to SystemId
        return '[SystemId]';
    }

    private escapeName(name: string): string {
        return `[${name.replace(/\]/g, ']]')}]`;
    }

    private formatDefaultValue(value: any): string {
        if (value === null) return 'NULL';
        if (typeof value === 'string') return `N'${value.replace(/'/g, "''")}'`;
        if (typeof value === 'boolean') return value ? '1' : '0';
        if (value instanceof Date) return `'${value.toISOString()}'`;
        return value.toString();
    }
}