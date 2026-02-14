import sql from 'mssql';
import dotenv from 'dotenv';
import chalk from 'chalk';
import ora from 'ora';
import { SQLServerConnection } from '../packages/core/src/database/sqlserver-connection';

dotenv.config();

export interface RepairOptions {
    checkOnly?: boolean;
    fixCorruption?: boolean;
    rebuildIndexes?: boolean;
    updateStatistics?: boolean;
    checkIntegrity?: boolean;
    repairSystemTables?: boolean;
    fixOrphanedRecords?: boolean;
    fixBrokenRelations?: boolean;
    fixDuplicateRecords?: boolean;
    fixNullConstraints?: boolean;
    fixDefaultValues?: boolean;
    database?: string;
    tables?: string[];
    backup?: boolean;
    force?: boolean;
    verbose?: boolean;
}

export interface RepairResult {
    success: boolean;
    database: string;
    operations: RepairOperation[];
    errors: RepairError[];
    warnings: string[];
    startTime: Date;
    endTime: Date;
    duration: number;
}

export interface RepairOperation {
    name: string;
    status: 'success' | 'failed' | 'skipped' | 'warning';
    message: string;
    details?: any;
    duration?: number;
}

export interface RepairError {
    operation: string;
    error: string;
    severity: 'critical' | 'high' | 'medium' | 'low';
    table?: string;
    fix?: string;
}

export class DatabaseRepair {
    private connection: SQLServerConnection;
    private spinner: ora.Ora;
    private results: RepairOperation[] = [];
    private errors: RepairError[] = [];
    private warnings: string[] = [];

    constructor(connection?: SQLServerConnection) {
        this.connection = connection || new SQLServerConnection({
            server: process.env.SQL_SERVER || 'localhost',
            port: parseInt(process.env.SQL_PORT || '1433'),
            database: process.env.SQL_DATABASE || 'NOVA_DB',
            user: process.env.SQL_USER || 'sa',
            password: process.env.SQL_PASSWORD || '',
            encrypt: process.env.SQL_ENCRYPT === 'true',
            trustServerCertificate: process.env.SQL_TRUST_SERVER_CERTIFICATE === 'true'
        });
        
        this.spinner = ora({ text: 'Initializing database repair...', color: 'blue' });
    }

    async initialize(): Promise<void> {
        this.spinner.start('Connecting to SQL Server...');
        try {
            await this.connection.connect();
            this.spinner.succeed('Connected to SQL Server successfully');
        } catch (error) {
            this.spinner.fail(`Failed to connect: ${error.message}`);
            throw error;
        }
    }

    // ============ MAIN REPAIR ENTRY POINT ============

    async repair(options: RepairOptions = {}): Promise<RepairResult> {
        const startTime = new Date();
        console.log(chalk.cyan('\n🔧 ========================================'));
        console.log(chalk.cyan('🔧   NOVA DATABASE REPAIR UTILITY'));
        console.log(chalk.cyan('🔧 ========================================\n'));

        // Validate options
        if (Object.keys(options).length === 0) {
            options = {
                checkOnly: true,
                checkIntegrity: true,
                rebuildIndexes: false,
                updateStatistics: false,
                fixCorruption: false,
                repairSystemTables: false
            };
        }

        // Create backup if requested
        if (options.backup && !options.checkOnly) {
            await this.createBackup(options.database);
        }

        // Perform repair operations
        const operations: RepairOperation[] = [];

        // 1. CHECK DATABASE INTEGRITY
        if (options.checkIntegrity) {
            operations.push(await this.checkDatabaseIntegrity(options.database, options.tables));
        }

        // 2. CHECK SYSTEM TABLES
        if (options.repairSystemTables) {
            operations.push(await this.repairSystemTables(options.database));
        }

        // 3. CHECK FOR CORRUPTION
        if (options.fixCorruption && !options.checkOnly) {
            operations.push(await this.repairCorruption(options.database));
        }

        // 4. FIX ORPHANED RECORDS
        if (options.fixOrphanedRecords && !options.checkOnly) {
            operations.push(await this.fixOrphanedRecords(options.database, options.tables));
        }

        // 5. FIX BROKEN RELATIONSHIPS
        if (options.fixBrokenRelations && !options.checkOnly) {
            operations.push(await this.fixBrokenRelations(options.database, options.tables));
        }

        // 6. FIX DUPLICATE RECORDS
        if (options.fixDuplicateRecords && !options.checkOnly) {
            operations.push(await this.fixDuplicateRecords(options.database, options.tables));
        }

        // 7. FIX NULL CONSTRAINTS
        if (options.fixNullConstraints && !options.checkOnly) {
            operations.push(await this.fixNullConstraints(options.database, options.tables));
        }

        // 8. FIX DEFAULT VALUES
        if (options.fixDefaultValues && !options.checkOnly) {
            operations.push(await this.fixDefaultValues(options.database, options.tables));
        }

        // 9. REBUILD INDEXES
        if (options.rebuildIndexes && !options.checkOnly) {
            operations.push(await this.rebuildIndexes(options.database, options.tables));
        }

        // 10. UPDATE STATISTICS
        if (options.updateStatistics && !options.checkOnly) {
            operations.push(await this.updateStatistics(options.database, options.tables));
        }

        const endTime = new Date();
        const duration = endTime.getTime() - startTime.getTime();

        // Print summary
        this.printRepairSummary(operations, duration);

        return {
            success: this.errors.length === 0,
            database: options.database || process.env.SQL_DATABASE || 'NOVA_DB',
            operations,
            errors: this.errors,
            warnings: this.warnings,
            startTime,
            endTime,
            duration
        };
    }

    // ============ 1. DATABASE INTEGRITY CHECK ============

    private async checkDatabaseIntegrity(database?: string, tables?: string[]): Promise<RepairOperation> {
        const startTime = Date.now();
        const dbName = database || process.env.SQL_DATABASE || 'NOVA_DB';
        
        this.spinner.start(`🔍 Checking database integrity for ${dbName}...`);

        try {
            // Switch to the target database
            await this.connection.query(`USE [${dbName}]`);

            // Run DBCC CHECKDB
            const checkDbResult = await this.connection.query(`
                DBCC CHECKDB ('${dbName}') WITH NO_INFOMSGS, TABLERESULTS
            `);

            // Parse results for errors
            const errors = checkDbResult.recordset?.filter((r: any) => 
                r.ErrorLevel >= 2 || r.Error?.includes('error') || r.Error?.includes('corrupt')
            ) || [];

            if (errors.length > 0) {
                this.warnings.push(`Found ${errors.length} integrity issues in database`);
                
                // Log each error
                errors.forEach((error: any) => {
                    this.errors.push({
                        operation: 'checkDatabaseIntegrity',
                        error: error.Error || error.Message || 'Unknown integrity issue',
                        severity: error.ErrorLevel >= 3 ? 'critical' : 'high',
                        table: error.ObjectName
                    });
                });

                this.spinner.warn(`Found ${errors.length} integrity issues`);
                
                return {
                    name: 'Database Integrity Check',
                    status: 'warning',
                    message: `Found ${errors.length} issues in database`,
                    details: { errors },
                    duration: Date.now() - startTime
                };
            }

            this.spinner.succeed('Database integrity check passed');
            
            return {
                name: 'Database Integrity Check',
                status: 'success',
                message: 'Database integrity check completed successfully',
                duration: Date.now() - startTime
            };

        } catch (error) {
            this.spinner.fail(`Integrity check failed: ${error.message}`);
            
            this.errors.push({
                operation: 'checkDatabaseIntegrity',
                error: error.message,
                severity: 'critical'
            });

            return {
                name: 'Database Integrity Check',
                status: 'failed',
                message: `Failed: ${error.message}`,
                duration: Date.now() - startTime
            };
        }
    }

    // ============ 2. REPAIR SYSTEM TABLES ============

    private async repairSystemTables(database?: string): Promise<RepairOperation> {
        const startTime = Date.now();
        const dbName = database || process.env.SQL_DATABASE || 'NOVA_DB';
        
        this.spinner.start(`🔧 Repairing system tables in ${dbName}...`);

        try {
            await this.connection.query(`USE [${dbName}]`);

            // Check and repair ObjectMetadata table
            await this.repairObjectMetadataTable();

            // Check and repair Migration table
            await this.repairMigrationTable();

            // Check and repair AuditLog table
            await this.repairAuditLogTable();

            // Check and repair JobQueue table
            await this.repairJobQueueTable();

            // Check and repair ExtensionMetadata table
            await this.repairExtensionMetadataTable();

            this.spinner.succeed('System tables repaired successfully');
            
            return {
                name: 'Repair System Tables',
                status: 'success',
                message: 'All system tables verified and repaired',
                duration: Date.now() - startTime
            };

        } catch (error) {
            this.spinner.fail(`System table repair failed: ${error.message}`);
            
            this.errors.push({
                operation: 'repairSystemTables',
                error: error.message,
                severity: 'high'
            });

            return {
                name: 'Repair System Tables',
                status: 'failed',
                message: `Failed: ${error.message}`,
                duration: Date.now() - startTime
            };
        }
    }

    private async repairObjectMetadataTable(): Promise<void> {
        // Check if table exists
        const tableExists = await this.connection.query(`
            SELECT 1 FROM sys.tables WHERE name = 'ObjectMetadata'
        `);

        if (tableExists.recordset.length === 0) {
            // Create ObjectMetadata table
            await this.connection.query(`
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
            `);
            
            this.warnings.push('Created missing ObjectMetadata table');
        }

        // Fix missing SystemId values
        await this.connection.query(`
            UPDATE [ObjectMetadata] 
            SET [SystemId] = NEWID() 
            WHERE [SystemId] IS NULL
        `);

        // Fix NULL versions
        await this.connection.query(`
            UPDATE [ObjectMetadata] 
            SET [Version] = 1 
            WHERE [Version] IS NULL
        `);
    }

    private async repairMigrationTable(): Promise<void> {
        const tableExists = await this.connection.query(`
            SELECT 1 FROM sys.tables WHERE name = '__Migrations'
        `);

        if (tableExists.recordset.length === 0) {
            await this.connection.query(`
                CREATE TABLE [__Migrations] (
                    [Id] INT IDENTITY(1,1) NOT NULL,
                    [MigrationId] NVARCHAR(255) NOT NULL,
                    [Name] NVARCHAR(255) NOT NULL,
                    [Version] NVARCHAR(50) NOT NULL,
                    [AppliedAt] DATETIME2 NOT NULL CONSTRAINT [DF_Migrations_AppliedAt] DEFAULT GETUTCDATE(),
                    [Duration] INT NOT NULL,
                    [Checksum] NVARCHAR(64) NOT NULL,
                    [Script] NVARCHAR(MAX) NULL,
                    [AppliedBy] NVARCHAR(100) NULL,
                    [Status] NVARCHAR(20) NOT NULL CONSTRAINT [DF_Migrations_Status] DEFAULT 'Success',
                    [Error] NVARCHAR(MAX) NULL,
                    CONSTRAINT [PK_Migrations] PRIMARY KEY CLUSTERED ([Id])
                );

                CREATE UNIQUE INDEX [UX_Migrations_MigrationId] ON [__Migrations] ([MigrationId]);
            `);
            
            this.warnings.push('Created missing Migrations table');
        }
    }

    private async repairAuditLogTable(): Promise<void> {
        const tableExists = await this.connection.query(`
            SELECT 1 FROM sys.tables WHERE name = 'AuditLog'
        `);

        if (tableExists.recordset.length === 0) {
            await this.connection.query(`
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
            `);
            
            this.warnings.push('Created missing AuditLog table');
        }
    }

    private async repairJobQueueTable(): Promise<void> {
        const tableExists = await this.connection.query(`
            SELECT 1 FROM sys.tables WHERE name = 'JobQueue'
        `);

        if (tableExists.recordset.length === 0) {
            await this.connection.query(`
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
            `);
            
            this.warnings.push('Created missing JobQueue table');
        }
    }

    private async repairExtensionMetadataTable(): Promise<void> {
        const tableExists = await this.connection.query(`
            SELECT 1 FROM sys.tables WHERE name = 'ExtensionMetadata'
        `);

        if (tableExists.recordset.length === 0) {
            await this.connection.query(`
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
            `);
            
            this.warnings.push('Created missing ExtensionMetadata table');
        }
    }

    // ============ 3. REPAIR CORRUPTION ============

    private async repairCorruption(database?: string): Promise<RepairOperation> {
        const startTime = Date.now();
        const dbName = database || process.env.SQL_DATABASE || 'NOVA_DB';
        
        this.spinner.start(`🛠️  Repairing corruption in ${dbName}...`);

        try {
            await this.connection.query(`USE [${dbName}]`);

            // DBCC CHECKDB with repair
            const repairResult = await this.connection.query(`
                DBCC CHECKDB ('${dbName}', REPAIR_ALLOW_DATA_LOSS) WITH NO_INFOMSGS
            `);

            this.spinner.succeed('Database corruption repair completed');
            
            return {
                name: 'Repair Corruption',
                status: 'success',
                message: 'Database corruption repair completed',
                details: { repairResult: repairResult.recordset },
                duration: Date.now() - startTime
            };

        } catch (error) {
            this.spinner.fail(`Corruption repair failed: ${error.message}`);
            
            this.errors.push({
                operation: 'repairCorruption',
                error: error.message,
                severity: 'critical'
            });

            return {
                name: 'Repair Corruption',
                status: 'failed',
                message: `Failed: ${error.message}`,
                duration: Date.now() - startTime
            };
        }
    }

    // ============ 4. FIX ORPHANED RECORDS ============

    private async fixOrphanedRecords(database?: string, tables?: string[]): Promise<RepairOperation> {
        const startTime = Date.now();
        const dbName = database || process.env.SQL_DATABASE || 'NOVA_DB';
        
        this.spinner.start(`👨‍👩‍👧 Fixing orphaned records in ${dbName}...`);

        try {
            await this.connection.query(`USE [${dbName}]`);

            // Get foreign key relationships
            const fks = await this.connection.query(`
                SELECT 
                    OBJECT_NAME(f.parent_object_id) AS ChildTable,
                    OBJECT_NAME(f.referenced_object_id) AS ParentTable,
                    c.name AS ChildColumn,
                    rc.name AS ParentColumn
                FROM sys.foreign_keys f
                INNER JOIN sys.foreign_key_columns fc ON f.object_id = fc.constraint_object_id
                INNER JOIN sys.columns c ON fc.parent_column_id = c.column_id 
                    AND fc.parent_object_id = c.object_id
                INNER JOIN sys.columns rc ON fc.referenced_column_id = rc.column_id 
                    AND fc.referenced_object_id = rc.object_id
                WHERE OBJECT_NAME(f.parent_object_id) NOT LIKE 'sys%'
            `);

            let totalFixed = 0;
            const fixedTables: string[] = [];

            for (const fk of fks.recordset) {
                // Skip if table not in filter
                if (tables && tables.length > 0 && !tables.includes(fk.ChildTable)) {
                    continue;
                }

                // Find orphaned records
                const orphanedResult = await this.connection.query(`
                    SELECT COUNT(*) AS Count
                    FROM [${fk.ChildTable}] c
                    LEFT JOIN [${fk.ParentTable}] p ON c.[${fk.ChildColumn}] = p.[${fk.ParentColumn}]
                    WHERE c.[${fk.ChildColumn}] IS NOT NULL 
                        AND p.[${fk.ParentColumn}] IS NULL
                        AND c.[SystemDeletedAt] IS NULL
                `);

                const orphanedCount = orphanedResult.recordset[0]?.Count || 0;

                if (orphanedCount > 0) {
                    // Option 1: Delete orphaned records
                    await this.connection.query(`
                        DELETE c
                        FROM [${fk.ChildTable}] c
                        LEFT JOIN [${fk.ParentTable}] p ON c.[${fk.ChildColumn}] = p.[${fk.ParentColumn}]
                        WHERE c.[${fk.ChildColumn}] IS NOT NULL 
                            AND p.[${fk.ParentColumn}] IS NULL
                            AND c.[SystemDeletedAt] IS NULL
                    `);

                    totalFixed += orphanedCount;
                    fixedTables.push(`${fk.ChildTable} (${orphanedCount})`);
                    
                    this.warnings.push(`Deleted ${orphanedCount} orphaned records from ${fk.ChildTable}`);
                }
            }

            this.spinner.succeed(`Fixed ${totalFixed} orphaned records`);
            
            return {
                name: 'Fix Orphaned Records',
                status: totalFixed > 0 ? 'success' : 'skipped',
                message: totalFixed > 0 
                    ? `Deleted ${totalFixed} orphaned records from ${fixedTables.join(', ')}`
                    : 'No orphaned records found',
                details: { fixed: totalFixed, tables: fixedTables },
                duration: Date.now() - startTime
            };

        } catch (error) {
            this.spinner.fail(`Orphaned record fix failed: ${error.message}`);
            
            this.errors.push({
                operation: 'fixOrphanedRecords',
                error: error.message,
                severity: 'medium'
            });

            return {
                name: 'Fix Orphaned Records',
                status: 'failed',
                message: `Failed: ${error.message}`,
                duration: Date.now() - startTime
            };
        }
    }

    // ============ 5. FIX BROKEN RELATIONSHIPS ============

    private async fixBrokenRelations(database?: string, tables?: string[]): Promise<RepairOperation> {
        const startTime = Date.now();
        const dbName = database || process.env.SQL_DATABASE || 'NOVA_DB';
        
        this.spinner.start(`🔗 Fixing broken relationships in ${dbName}...`);

        try {
            await this.connection.query(`USE [${dbName}]`);

            // Get all foreign keys
            const fks = await this.connection.query(`
                SELECT 
                    OBJECT_NAME(fk.constraint_object_id) AS ConstraintName,
                    OBJECT_NAME(fk.parent_object_id) AS ChildTable,
                    OBJECT_NAME(fk.referenced_object_id) AS ParentTable,
                    c.name AS ChildColumn,
                    rc.name AS ParentColumn
                FROM sys.foreign_key_columns fk
                INNER JOIN sys.columns c ON fk.parent_column_id = c.column_id 
                    AND fk.parent_object_id = c.object_id
                INNER JOIN sys.columns rc ON fk.referenced_column_id = rc.column_id 
                    AND fk.referenced_object_id = rc.object_id
            `);

            let fixedCount = 0;

            for (const fk of fks.recordset) {
                // Check if foreign key exists and is enabled
                const checkResult = await this.connection.query(`
                    SELECT is_disabled
                    FROM sys.foreign_keys
                    WHERE name = '${fk.ConstraintName}'
                `);

                if (checkResult.recordset.length > 0) {
                    const isDisabled = checkResult.recordset[0].is_disabled;
                    
                    if (isDisabled) {
                        // Re-enable foreign key
                        await this.connection.query(`
                            ALTER TABLE [${fk.ChildTable}] 
                            WITH CHECK CHECK CONSTRAINT [${fk.ConstraintName}]
                        `);
                        fixedCount++;
                        this.warnings.push(`Re-enabled foreign key ${fk.ConstraintName}`);
                    }
                } else {
                    // Foreign key missing - recreate it
                    this.warnings.push(`Foreign key ${fk.ConstraintName} is missing`);
                }
            }

            this.spinner.succeed(`Fixed ${fixedCount} broken relationships`);
            
            return {
                name: 'Fix Broken Relationships',
                status: fixedCount > 0 ? 'success' : 'skipped',
                message: fixedCount > 0 
                    ? `Re-enabled ${fixedCount} foreign keys`
                    : 'No broken relationships found',
                details: { fixed: fixedCount },
                duration: Date.now() - startTime
            };

        } catch (error) {
            this.spinner.fail(`Relationship fix failed: ${error.message}`);
            
            this.errors.push({
                operation: 'fixBrokenRelations',
                error: error.message,
                severity: 'medium'
            });

            return {
                name: 'Fix Broken Relationships',
                status: 'failed',
                message: `Failed: ${error.message}`,
                duration: Date.now() - startTime
            };
        }
    }

    // ============ 6. FIX DUPLICATE RECORDS ============

    private async fixDuplicateRecords(database?: string, tables?: string[]): Promise<RepairOperation> {
        const startTime = Date.now();
        const dbName = database || process.env.SQL_DATABASE || 'NOVA_DB';
        
        this.spinner.start(`🔄 Fixing duplicate records in ${dbName}...`);

        try {
            await this.connection.query(`USE [${dbName}]`);

            // Get all tables with primary keys
            const tablesResult = await this.connection.query(`
                SELECT 
                    t.name AS TableName,
                    c.name AS ColumnName
                FROM sys.tables t
                INNER JOIN sys.indexes i ON t.object_id = i.object_id
                INNER JOIN sys.index_columns ic ON i.object_id = ic.object_id AND i.index_id = ic.index_id
                INNER JOIN sys.columns c ON ic.object_id = c.object_id AND ic.column_id = c.column_id
                WHERE i.is_primary_key = 1
                    AND t.name NOT LIKE 'sys%'
            `);

            const tablePKs = new Map<string, string[]>();
            
            tablesResult.recordset.forEach(row => {
                if (!tablePKs.has(row.TableName)) {
                    tablePKs.set(row.TableName, []);
                }
                tablePKs.get(row.TableName)!.push(row.ColumnName);
            });

            let totalDuplicates = 0;
            const fixedTables: string[] = [];

            for (const [tableName, pkColumns] of tablePKs) {
                // Skip if table not in filter
                if (tables && tables.length > 0 && !tables.includes(tableName)) {
                    continue;
                }

                // Build condition for finding duplicates
                const pkCondition = pkColumns.map(col => `[${col}]`).join(', ');
                
                // Find duplicates based on all non-PK columns or SystemId
                const dupResult = await this.connection.query(`
                    SELECT 
                        COUNT(*) AS DuplicateCount,
                        MIN([SystemId]) AS KeepId
                    FROM [${tableName}]
                    GROUP BY ${pkCondition}
                    HAVING COUNT(*) > 1
                `);

                const duplicateGroups = dupResult.recordset.length;

                if (duplicateGroups > 0) {
                    // Keep the oldest record, delete newer duplicates
                    await this.connection.query(`
                        WITH Duplicates AS (
                            SELECT 
                                [SystemId],
                                ROW_NUMBER() OVER (
                                    PARTITION BY ${pkCondition} 
                                    ORDER BY [SystemCreatedAt] ASC
                                ) AS RowNum
                            FROM [${tableName}]
                        )
                        DELETE FROM [${tableName}]
                        WHERE [SystemId] IN (
                            SELECT [SystemId] 
                            FROM Duplicates 
                            WHERE RowNum > 1
                        )
                    `);

                    totalDuplicates += duplicateGroups;
                    fixedTables.push(`${tableName} (${duplicateGroups} groups)`);
                    
                    this.warnings.push(`Removed ${duplicateGroups} duplicate groups from ${tableName}`);
                }
            }

            this.spinner.succeed(`Fixed ${totalDuplicates} duplicate record groups`);
            
            return {
                name: 'Fix Duplicate Records',
                status: totalDuplicates > 0 ? 'success' : 'skipped',
                message: totalDuplicates > 0 
                    ? `Removed ${totalDuplicates} duplicate groups from ${fixedTables.join(', ')}`
                    : 'No duplicate records found',
                details: { fixed: totalDuplicates, tables: fixedTables },
                duration: Date.now() - startTime
            };

        } catch (error) {
            this.spinner.fail(`Duplicate record fix failed: ${error.message}`);
            
            this.errors.push({
                operation: 'fixDuplicateRecords',
                error: error.message,
                severity: 'medium'
            });

            return {
                name: 'Fix Duplicate Records',
                status: 'failed',
                message: `Failed: ${error.message}`,
                duration: Date.now() - startTime
            };
        }
    }

    // ============ 7. FIX NULL CONSTRAINTS ============

    private async fixNullConstraints(database?: string, tables?: string[]): Promise<RepairOperation> {
        const startTime = Date.now();
        const dbName = database || process.env.SQL_DATABASE || 'NOVA_DB';
        
        this.spinner.start(`🚫 Fixing NULL constraints in ${dbName}...`);

        try {
            await this.connection.query(`USE [${dbName}]`);

            // Get all NOT NULL columns with NULL values
            const columnsResult = await this.connection.query(`
                SELECT 
                    t.name AS TableName,
                    c.name AS ColumnName,
                    c.is_nullable,
                    t.type AS DataType,
                    c.max_length AS MaxLength
                FROM sys.tables t
                INNER JOIN sys.columns c ON t.object_id = c.object_id
                WHERE c.is_nullable = 0
                    AND t.name NOT LIKE 'sys%'
                    AND t.name NOT LIKE 'MS%'
                    AND t.name NOT IN ('__Migrations', 'AuditLog', 'JobQueue')
            `);

            let fixedCount = 0;
            const fixedColumns: string[] = [];

            for (const col of columnsResult.recordset) {
                // Skip if table not in filter
                if (tables && tables.length > 0 && !tables.includes(col.TableName)) {
                    continue;
                }

                // Check for NULL values
                const nullResult = await this.connection.query(`
                    SELECT COUNT(*) AS NullCount
                    FROM [${col.TableName}]
                    WHERE [${col.ColumnName}] IS NULL
                `);

                const nullCount = nullResult.recordset[0]?.NullCount || 0;

                if (nullCount > 0) {
                    // Determine default value based on data type
                    let defaultValue: string;
                    switch (col.DataType) {
                        case 'int':
                        case 'bigint':
                        case 'decimal':
                        case 'float':
                            defaultValue = '0';
                            break;
                        case 'bit':
                            defaultValue = '0';
                            break;
                        case 'datetime':
                        case 'datetime2':
                            defaultValue = 'GETUTCDATE()';
                            break;
                        case 'uniqueidentifier':
                            defaultValue = 'NEWID()';
                            break;
                        case 'nvarchar':
                        case 'varchar':
                        case 'nchar':
                        case 'char':
                            defaultValue = "''";
                            break;
                        default:
                            defaultValue = "''";
                    }

                    // Update NULL values with default
                    await this.connection.query(`
                        UPDATE [${col.TableName}]
                        SET [${col.ColumnName}] = ${defaultValue}
                        WHERE [${col.ColumnName}] IS NULL
                    `);

                    fixedCount += nullCount;
                    fixedColumns.push(`${col.TableName}.${col.ColumnName} (${nullCount})`);
                    
                    this.warnings.push(`Fixed ${nullCount} NULL values in ${col.TableName}.${col.ColumnName}`);
                }
            }

            this.spinner.succeed(`Fixed ${fixedCount} NULL constraint violations`);
            
            return {
                name: 'Fix NULL Constraints',
                status: fixedCount > 0 ? 'success' : 'skipped',
                message: fixedCount > 0 
                    ? `Fixed ${fixedCount} NULL values in ${fixedColumns.join(', ')}`
                    : 'No NULL constraint violations found',
                details: { fixed: fixedCount, columns: fixedColumns },
                duration: Date.now() - startTime
            };

        } catch (error) {
            this.spinner.fail(`NULL constraint fix failed: ${error.message}`);
            
            this.errors.push({
                operation: 'fixNullConstraints',
                error: error.message,
                severity: 'medium'
            });

            return {
                name: 'Fix NULL Constraints',
                status: 'failed',
                message: `Failed: ${error.message}`,
                duration: Date.now() - startTime
            };
        }
    }

    // ============ 8. FIX DEFAULT VALUES ============

    private async fixDefaultValues(database?: string, tables?: string[]): Promise<RepairOperation> {
        const startTime = Date.now();
        const dbName = database || process.env.SQL_DATABASE || 'NOVA_DB';
        
        this.spinner.start(`📝 Fixing default values in ${dbName}...`);

        try {
            await this.connection.query(`USE [${dbName}]`);

            // Get all columns with default constraints
            const defaultsResult = await this.connection.query(`
                SELECT 
                    t.name AS TableName,
                    c.name AS ColumnName,
                    dc.name AS DefaultName,
                    dc.definition AS DefaultValue
                FROM sys.tables t
                INNER JOIN sys.default_constraints dc ON t.object_id = dc.parent_object_id
                INNER JOIN sys.columns c ON dc.parent_object_id = c.object_id 
                    AND dc.parent_column_id = c.column_id
                WHERE t.name NOT LIKE 'sys%'
            `);

            let fixedCount = 0;
            const fixedDefaults: string[] = [];

            for (const def of defaultsResult.recordset) {
                // Skip if table not in filter
                if (tables && tables.length > 0 && !tables.includes(def.TableName)) {
                    continue;
                }

                // Check for NULL values where default exists
                const nullResult = await this.connection.query(`
                    SELECT COUNT(*) AS NullCount
                    FROM [${def.TableName}]
                    WHERE [${def.ColumnName}] IS NULL
                `);

                const nullCount = nullResult.recordset[0]?.NullCount || 0;

                if (nullCount > 0) {
                    // Apply default value to NULLs
                    await this.connection.query(`
                        UPDATE [${def.TableName}]
                        SET [${def.ColumnName}] = ${def.DefaultValue}
                        WHERE [${def.ColumnName}] IS NULL
                    `);

                    fixedCount += nullCount;
                    fixedDefaults.push(`${def.TableName}.${def.ColumnName} (${nullCount})`);
                    
                    this.warnings.push(`Applied default values to ${nullCount} rows in ${def.TableName}.${def.ColumnName}`);
                }
            }

            this.spinner.succeed(`Fixed ${fixedCount} default value issues`);
            
            return {
                name: 'Fix Default Values',
                status: fixedCount > 0 ? 'success' : 'skipped',
                message: fixedCount > 0 
                    ? `Applied defaults to ${fixedCount} rows in ${fixedDefaults.join(', ')}`
                    : 'No default value issues found',
                details: { fixed: fixedCount, columns: fixedDefaults },
                duration: Date.now() - startTime
            };

        } catch (error) {
            this.spinner.fail(`Default value fix failed: ${error.message}`);
            
            this.errors.push({
                operation: 'fixDefaultValues',
                error: error.message,
                severity: 'low'
            });

            return {
                name: 'Fix Default Values',
                status: 'failed',
                message: `Failed: ${error.message}`,
                duration: Date.now() - startTime
            };
        }
    }

    // ============ 9. REBUILD INDEXES ============

    private async rebuildIndexes(database?: string, tables?: string[]): Promise<RepairOperation> {
        const startTime = Date.now();
        const dbName = database || process.env.SQL_DATABASE || 'NOVA_DB';
        
        this.spinner.start(`📊 Rebuilding indexes in ${dbName}...`);

        try {
            await this.connection.query(`USE [${dbName}]`);

            // Get fragmentation info
            const fragResult = await this.connection.query(`
                SELECT 
                    OBJECT_NAME(ips.object_id) AS TableName,
                    i.name AS IndexName,
                    ips.avg_fragmentation_in_percent,
                    ips.page_count,
                    'ALTER INDEX [' + i.name + '] ON [' + OBJECT_NAME(ips.object_id) + '] ' +
                    CASE 
                        WHEN ips.avg_fragmentation_in_percent > 30 THEN 'REBUILD'
                        ELSE 'REORGANIZE'
                    END AS FixCommand
                FROM sys.dm_db_index_physical_stats(
                    DB_ID(@dbName), NULL, NULL, NULL, 'LIMITED'
                ) ips
                INNER JOIN sys.indexes i ON ips.object_id = i.object_id 
                    AND ips.index_id = i.index_id
                WHERE ips.avg_fragmentation_in_percent > 5
                    AND ips.page_count > 100
                    AND i.name IS NOT NULL
                ORDER BY ips.avg_fragmentation_in_percent DESC
            `, [dbName]);

            let rebuiltCount = 0;
            let reorganizedCount = 0;
            const processedIndexes: string[] = [];

            for (const idx of fragResult.recordset) {
                // Skip if table not in filter
                if (tables && tables.length > 0 && !tables.includes(idx.TableName)) {
                    continue;
                }

                // Execute rebuild/reorganize
                await this.connection.query(idx.FixCommand);
                
                if (idx.FixCommand.includes('REBUILD')) {
                    rebuiltCount++;
                    processedIndexes.push(`${idx.TableName}.${idx.IndexName} (${idx.avg_fragmentation_in_percent.toFixed(1)}%)`);
                } else {
                    reorganizedCount++;
                    processedIndexes.push(`${idx.TableName}.${idx.IndexName} (${idx.avg_fragmentation_in_percent.toFixed(1)}%)`);
                }
            }

            this.spinner.succeed(`Rebuilt ${rebuiltCount} indexes, reorganized ${reorganizedCount} indexes`);
            
            return {
                name: 'Rebuild Indexes',
                status: (rebuiltCount + reorganizedCount) > 0 ? 'success' : 'skipped',
                message: (rebuiltCount + reorganizedCount) > 0 
                    ? `Rebuilt ${rebuiltCount} indexes, reorganized ${reorganizedCount} indexes`
                    : 'No indexes need maintenance',
                details: { 
                    rebuilt: rebuiltCount, 
                    reorganized: reorganizedCount,
                    indexes: processedIndexes 
                },
                duration: Date.now() - startTime
            };

        } catch (error) {
            this.spinner.fail(`Index rebuild failed: ${error.message}`);
            
            this.errors.push({
                operation: 'rebuildIndexes',
                error: error.message,
                severity: 'medium'
            });

            return {
                name: 'Rebuild Indexes',
                status: 'failed',
                message: `Failed: ${error.message}`,
                duration: Date.now() - startTime
            };
        }
    }

    // ============ 10. UPDATE STATISTICS ============

    private async updateStatistics(database?: string, tables?: string[]): Promise<RepairOperation> {
        const startTime = Date.now();
        const dbName = database || process.env.SQL_DATABASE || 'NOVA_DB';
        
        this.spinner.start(`📈 Updating statistics in ${dbName}...`);

        try {
            await this.connection.query(`USE [${dbName}]`);

            // Get all user tables
            const tablesResult = await this.connection.query(`
                SELECT name AS TableName
                FROM sys.tables
                WHERE name NOT LIKE 'sys%'
                    AND name NOT LIKE 'MS%'
                    AND name NOT IN ('__Migrations', 'AuditLog', 'JobQueue')
                ORDER BY name
            `);

            let updatedCount = 0;
            const updatedTables: string[] = [];

            for (const table of tablesResult.recordset) {
                // Skip if table not in filter
                if (tables && tables.length > 0 && !tables.includes(table.TableName)) {
                    continue;
                }

                // Get last stats update
                const statsResult = await this.connection.query(`
                    SELECT 
                        name AS StatsName,
                        STATS_DATE(object_id, stats_id) AS LastUpdated
                    FROM sys.stats
                    WHERE object_id = OBJECT_ID('${table.TableName}')
                        AND auto_created = 0
                `);

                // Update statistics with full scan
                await this.connection.query(`
                    UPDATE STATISTICS [${table.TableName}] WITH FULLSCAN
                `);

                updatedCount++;
                updatedTables.push(table.TableName);
            }

            this.spinner.succeed(`Updated statistics on ${updatedCount} tables`);
            
            return {
                name: 'Update Statistics',
                status: updatedCount > 0 ? 'success' : 'skipped',
                message: updatedCount > 0 
                    ? `Updated statistics on ${updatedCount} tables`
                    : 'No tables to update',
                details: { updated: updatedCount, tables: updatedTables },
                duration: Date.now() - startTime
            };

        } catch (error) {
            this.spinner.fail(`Statistics update failed: ${error.message}`);
            
            this.errors.push({
                operation: 'updateStatistics',
                error: error.message,
                severity: 'low'
            });

            return {
                name: 'Update Statistics',
                status: 'failed',
                message: `Failed: ${error.message}`,
                duration: Date.now() - startTime
            };
        }
    }

    // ============ BACKUP BEFORE REPAIR ============

    private async createBackup(database?: string): Promise<void> {
        const dbName = database || process.env.SQL_DATABASE || 'NOVA_DB';
        const timestamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '');
        const backupFile = `${dbName}_repair_backup_${timestamp}.bak`;
        
        this.spinner.start(`💾 Creating backup before repair: ${backupFile}...`);

        try {
            await this.connection.query(`
                BACKUP DATABASE [${dbName}]
                TO DISK = '/var/opt/mssql/backup/${backupFile}'
                WITH COMPRESSION, CHECKSUM, INIT
            `);

            this.spinner.succeed(`Backup created: ${backupFile}`);
        } catch (error) {
            this.spinner.warn(`Backup failed: ${error.message}. Continuing without backup...`);
            this.warnings.push(`Pre-repair backup failed: ${error.message}`);
        }
    }

    // ============ UTILITY METHODS ============

    async getDatabaseHealth(database?: string): Promise<any> {
        const dbName = database || process.env.SQL_DATABASE || 'NOVA_DB';
        
        await this.connection.query(`USE [${dbName}]`);

        // Get database size
        const sizeResult = await this.connection.query(`
            SELECT 
                SUM(size * 8.0 / 1024) AS SizeMB,
                SUM(CASE WHEN type = 0 THEN size * 8.0 / 1024 ELSE 0 END) AS DataSizeMB,
                SUM(CASE WHEN type = 1 THEN size * 8.0 / 1024 ELSE 0 END) AS LogSizeMB
            FROM sys.database_files
        `);

        // Get table counts
        const tableResult = await this.connection.query(`
            SELECT 
                COUNT(*) AS TableCount,
                SUM(CASE WHEN is_memory_optimized = 1 THEN 1 ELSE 0 END) AS MemoryOptimizedCount
            FROM sys.tables
            WHERE name NOT LIKE 'sys%'
        `);

        // Get index health
        const indexResult = await this.connection.query(`
            SELECT 
                COUNT(*) AS IndexCount,
                SUM(CASE WHEN is_primary_key = 1 THEN 1 ELSE 0 END) AS PrimaryKeyCount,
                SUM(CASE WHEN is_unique = 1 AND is_primary_key = 0 THEN 1 ELSE 0 END) AS UniqueKeyCount
            FROM sys.indexes
            WHERE object_id IN (SELECT object_id FROM sys.tables)
        `);

        // Get fragmentation
        const fragResult = await this.connection.query(`
            SELECT 
                COUNT(*) AS FragmentedIndexCount,
                AVG(ips.avg_fragmentation_in_percent) AS AvgFragmentation
            FROM sys.dm_db_index_physical_stats(DB_ID(@dbName), NULL, NULL, NULL, 'LIMITED') ips
            WHERE ips.avg_fragmentation_in_percent > 30
        `, [dbName]);

        // Get last backup info
        const backupResult = await this.connection.query(`
            SELECT TOP 1 
                DATEDIFF(hour, backup_start_date, GETDATE()) AS HoursSinceLastBackup
            FROM msdb.dbo.backupset
            WHERE database_name = @dbName
                AND type = 'D'
            ORDER BY backup_start_date DESC
        `, [dbName]);

        return {
            database: dbName,
            size: {
                total: sizeResult.recordset[0]?.SizeMB || 0,
                data: sizeResult.recordset[0]?.DataSizeMB || 0,
                log: sizeResult.recordset[0]?.LogSizeMB || 0
            },
            tables: {
                total: tableResult.recordset[0]?.TableCount || 0,
                memoryOptimized: tableResult.recordset[0]?.MemoryOptimizedCount || 0
            },
            indexes: {
                total: indexResult.recordset[0]?.IndexCount || 0,
                primaryKeys: indexResult.recordset[0]?.PrimaryKeyCount || 0,
                uniqueKeys: indexResult.recordset[0]?.UniqueKeyCount || 0
            },
            fragmentation: {
                fragmentedIndexes: fragResult.recordset[0]?.FragmentedIndexCount || 0,
                averageFragmentation: fragResult.recordset[0]?.AvgFragmentation || 0
            },
            backup: {
                hoursSinceLastBackup: backupResult.recordset[0]?.HoursSinceLastBackup || null
            }
        };
    }

    private printRepairSummary(operations: RepairOperation[], duration: number): void {
        console.log(chalk.cyan('\n📋 ===== REPAIR SUMMARY =====\n'));

        const success = operations.filter(o => o.status === 'success').length;
        const warning = operations.filter(o => o.status === 'warning').length;
        const failed = operations.filter(o => o.status === 'failed').length;
        const skipped = operations.filter(o => o.status === 'skipped').length;

        operations.forEach(op => {
            const icon = op.status === 'success' ? '✅' : 
                        op.status === 'warning' ? '⚠️' :
                        op.status === 'failed' ? '❌' : '⏭️';
            const color = op.status === 'success' ? chalk.green :
                         op.status === 'warning' ? chalk.yellow :
                         op.status === 'failed' ? chalk.red : chalk.gray;
            
            console.log(color(`${icon} ${op.name}`));
            console.log(color(`   ${op.message}`));
            if (op.duration) {
                console.log(color(`   ⏱️  ${op.duration}ms`));
            }
            console.log('');
        });

        console.log(chalk.cyan('📊 ===== STATISTICS =====\n'));
        console.log(chalk.white(`✅ Successful: ${success}`));
        console.log(chalk.yellow(`⚠️  Warnings: ${warning}`));
        console.log(chalk.red(`❌ Failed: ${failed}`));
        console.log(chalk.gray(`⏭️  Skipped: ${skipped}`));
        console.log(chalk.cyan(`\n⏱️  Total Duration: ${duration}ms`));

        if (this.errors.length > 0) {
            console.log(chalk.red('\n❌ ===== ERRORS =====\n'));
            this.errors.forEach((err, i) => {
                console.log(chalk.red(`${i + 1}. [${err.severity}] ${err.operation}: ${err.error}`));
                if (err.table) console.log(chalk.red(`   Table: ${err.table}`));
                if (err.fix) console.log(chalk.red(`   Fix: ${err.fix}`));
            });
        }

        if (this.warnings.length > 0) {
            console.log(chalk.yellow('\n⚠️  ===== WARNINGS =====\n'));
            this.warnings.forEach((warn, i) => {
                console.log(chalk.yellow(`${i + 1}. ${warn}`));
            });
        }
    }

    async close(): Promise<void> {
        await this.connection.disconnect();
    }
}

// ============ CLI INTERFACE ============

async function main() {
    const command = process.argv[2];
    const options: RepairOptions = {
        checkOnly: process.argv.includes('--check-only'),
        fixCorruption: process.argv.includes('--fix-corruption'),
        rebuildIndexes: process.argv.includes('--rebuild-indexes'),
        updateStatistics: process.argv.includes('--update-stats'),
        checkIntegrity: process.argv.includes('--check-integrity'),
        repairSystemTables: process.argv.includes('--repair-system'),
        fixOrphanedRecords: process.argv.includes('--fix-orphaned'),
        fixBrokenRelations: process.argv.includes('--fix-relations'),
        fixDuplicateRecords: process.argv.includes('--fix-duplicates'),
        fixNullConstraints: process.argv.includes('--fix-null'),
        fixDefaultValues: process.argv.includes('--fix-defaults'),
        backup: process.argv.includes('--backup'),
        force: process.argv.includes('--force'),
        verbose: process.argv.includes('--verbose')
    };

    // Parse database name
    const dbIndex = process.argv.indexOf('--database');
    if (dbIndex !== -1 && process.argv[dbIndex + 1]) {
        options.database = process.argv[dbIndex + 1];
    }

    // Parse tables list
    const tablesIndex = process.argv.indexOf('--tables');
    if (tablesIndex !== -1 && process.argv[tablesIndex + 1]) {
        options.tables = process.argv[tablesIndex + 1].split(',');
    }

    const repair = new DatabaseRepair();

    try {
        await repair.initialize();

        switch (command) {
            case 'repair':
            case 'run':
                await repair.repair(options);
                break;

            case 'check':
                options.checkOnly = true;
                options.checkIntegrity = true;
                await repair.repair(options);
                break;

            case 'health':
                const health = await repair.getDatabaseHealth(options.database);
                console.log(chalk.cyan('\n🏥 ===== DATABASE HEALTH =====\n'));
                console.log(chalk.white(JSON.stringify(health, null, 2)));
                break;

            case 'quick':
                // Quick repair - only critical fixes
                await repair.repair({
                    checkIntegrity: true,
                    rebuildIndexes: true,
                    updateStatistics: true,
                    database: options.database
                });
                break;

            case 'full':
                // Full repair - all operations
                await repair.repair({
                    checkIntegrity: true,
                    repairSystemTables: true,
                    fixCorruption: true,
                    fixOrphanedRecords: true,
                    fixBrokenRelations: true,
                    fixDuplicateRecords: true,
                    fixNullConstraints: true,
                    fixDefaultValues: true,
                    rebuildIndexes: true,
                    updateStatistics: true,
                    backup: true,
                    database: options.database
                });
                break;

            default:
                console.log(`
🔧 NOVA Database Repair Utility

Usage:
  npm run db:repair repair [options]     Run database repair
  npm run db:repair check [options]      Check only (no changes)
  npm run db:repair health [options]     Show database health
  npm run db:repair quick [options]      Quick repair (indexes + stats)
  npm run db:repair full [options]       Full repair (all operations)

Options:
  --database <name>              Target database
  --tables <table1,table2>       Specific tables to repair
  --check-only                   Check only, don't fix
  --fix-corruption              Fix database corruption
  --rebuild-indexes            Rebuild fragmented indexes
  --update-stats               Update statistics
  --check-integrity            Check database integrity
  --repair-system              Repair system tables
  --fix-orphaned               Fix orphaned records
  --fix-relations             Fix broken relationships
  --fix-duplicates            Fix duplicate records
  --fix-null                  Fix NULL constraint violations
  --fix-defaults              Fix default values
  --backup                    Create backup before repair
  --force                     Skip confirmation
  --verbose                   Show detailed output

Examples:
  npm run db:repair check --database NOVA_DB
  npm run db:repair quick --rebuild-indexes --update-stats
  npm run db:repair full --backup
  npm run db:repair repair --fix-orphaned --fix-duplicates --tables Customer,SalesHeader
                `);
        }

    } catch (error) {
        console.error(chalk.red(`\n❌ Repair failed: ${error.message}`));
        process.exit(1);
    } finally {
        await repair.close();
    }
}

if (require.main === module) {
    main().catch(console.error);
}

export default DatabaseRepair;