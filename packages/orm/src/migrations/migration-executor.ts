import { SQLServerConnection } from '@nova/core/database/sqlserver-connection';
import { Migration } from './migration-generator';

export class MigrationExecutor {
    private connection: SQLServerConnection;
    private migrationsTable = '__Migrations';

    constructor(connection: SQLServerConnection) {
        this.connection = connection;
    }

    async initialize(): Promise<void> {
        await this.ensureMigrationsTable();
    }

    private async ensureMigrationsTable(): Promise<void> {
        const query = `
            IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[${this.migrationsTable}]') AND type in (N'U'))
            BEGIN
                CREATE TABLE [${this.migrationsTable}] (
                    [Id] INT IDENTITY(1,1) NOT NULL,
                    [MigrationId] NVARCHAR(255) NOT NULL,
                    [Name] NVARCHAR(255) NOT NULL,
                    [Version] NVARCHAR(50) NOT NULL,
                    [AppliedAt] DATETIME2 NOT NULL CONSTRAINT [DF_Migrations_AppliedAt] DEFAULT GETUTCDATE(),
                    [Duration] INT NOT NULL,
                    [Checksum] NVARCHAR(64) NOT NULL,
                    [UpScript] NVARCHAR(MAX) NULL,
                    [DownScript] NVARCHAR(MAX) NULL,
                    [AppliedBy] NVARCHAR(100) NULL,
                    [Status] NVARCHAR(20) NOT NULL CONSTRAINT [DF_Migrations_Status] DEFAULT 'Success',
                    [Error] NVARCHAR(MAX) NULL,
                    CONSTRAINT [PK_Migrations] PRIMARY KEY CLUSTERED ([Id])
                );

                CREATE UNIQUE INDEX [UX_Migrations_MigrationId] ON [${this.migrationsTable}] ([MigrationId]);
                
                PRINT '✅ Created migrations tracking table';
            END
        `;

        await this.connection.query(query);
    }

    async getAppliedMigrations(): Promise<AppliedMigration[]> {
        const query = `
            SELECT [MigrationId], [Name], [Version], [AppliedAt], [Status], [Error]
            FROM [${this.migrationsTable}]
            WHERE [Status] = 'Success'
            ORDER BY [Id] ASC
        `;

        const result = await this.connection.query(query);
        return result.recordset;
    }

    async migrationExists(migrationId: string): Promise<boolean> {
        const query = `
            SELECT 1 FROM [${this.migrationsTable}]
            WHERE [MigrationId] = @MigrationId AND [Status] = 'Success'
        `;

        const result = await this.connection.query(query, [migrationId]);
        return result.recordset.length > 0;
    }

    async executeUp(migration: Migration): Promise<void> {
        const startTime = Date.now();
        const checksum = this.calculateChecksum(migration.up);

        try {
            // Start transaction
            await this.connection.query('BEGIN TRANSACTION');

            // Execute migration
            await this.connection.query(migration.up);

            // Record migration
            await this.recordMigration(migration, startTime, checksum, null);

            // Commit
            await this.connection.query('COMMIT TRANSACTION');

        } catch (error) {
            // Rollback
            await this.connection.query('ROLLBACK TRANSACTION');

            // Record failure
            await this.recordMigration(migration, startTime, checksum, error.message);

            throw new Error(`Migration failed: ${error.message}`);
        }
    }

    async executeDown(migration: Migration): Promise<void> {
        if (!migration.down) {
            throw new Error(`No down migration defined for ${migration.id}`);
        }

        const startTime = Date.now();

        try {
            // Start transaction
            await this.connection.query('BEGIN TRANSACTION');

            // Execute rollback
            await this.connection.query(migration.down);

            // Remove migration record
            await this.removeMigrationRecord(migration.id);

            // Commit
            await this.connection.query('COMMIT TRANSACTION');

        } catch (error) {
            // Rollback
            await this.connection.query('ROLLBACK TRANSACTION');
            throw new Error(`Rollback failed: ${error.message}`);
        }
    }

    async executeBulk(migrations: Migration[], direction: 'up' | 'down' = 'up'): Promise<MigrationResult[]> {
        const results: MigrationResult[] = [];

        for (const migration of migrations) {
            try {
                if (direction === 'up') {
                    await this.executeUp(migration);
                } else {
                    await this.executeDown(migration);
                }

                results.push({
                    migrationId: migration.id,
                    success: true,
                    timestamp: new Date()
                });

            } catch (error) {
                results.push({
                    migrationId: migration.id,
                    success: false,
                    error: error.message,
                    timestamp: new Date()
                });

                // Stop on first error
                break;
            }
        }

        return results;
    }

    private async recordMigration(
        migration: Migration,
        startTime: number,
        checksum: string,
        error: string | null
    ): Promise<void> {
        const duration = Date.now() - startTime;
        const status = error ? 'Failed' : 'Success';

        const query = `
            INSERT INTO [${this.migrationsTable}] (
                [MigrationId], [Name], [Version], [AppliedAt],
                [Duration], [Checksum], [UpScript], [DownScript],
                [AppliedBy], [Status], [Error]
            ) VALUES (
                @MigrationId, @Name, @Version, GETUTCDATE(),
                @Duration, @Checksum, @UpScript, @DownScript,
                @AppliedBy, @Status, @Error
            )
        `;

        await this.connection.query(query, [
            migration.id,
            migration.name,
            migration.version,
            duration,
            checksum,
            migration.up,
            migration.down,
            process.env.USER || 'system',
            status,
            error
        ]);
    }

    private async removeMigrationRecord(migrationId: string): Promise<void> {
        const query = `
            DELETE FROM [${this.migrationsTable}]
            WHERE [MigrationId] = @MigrationId
        `;

        await this.connection.query(query, [migrationId]);
    }

    private calculateChecksum(content: string): string {
        const crypto = require('crypto');
        return crypto.createHash('sha256').update(content).digest('hex');
    }

    async getMigrationHistory(limit: number = 100): Promise<any[]> {
        const query = `
            SELECT TOP ${limit}
                [MigrationId],
                [Name],
                [Version],
                [AppliedAt],
                [Duration],
                [Status],
                [Error]
            FROM [${this.migrationsTable}]
            ORDER BY [Id] DESC
        `;

        const result = await this.connection.query(query);
        return result.recordset;
    }

    async validateMigrations(migrations: Migration[]): Promise<ValidationResult> {
        const applied = await this.getAppliedMigrations();
        const appliedMap = new Map(applied.map(m => [m.MigrationId, m]));

        const errors: string[] = [];

        for (const migration of migrations) {
            const appliedMigration = appliedMap.get(migration.id);

            if (appliedMigration) {
                // Check if already applied
                if (appliedMigration.Status === 'Success') {
                    // Already applied, skip
                } else {
                    errors.push(`Migration ${migration.id} previously failed: ${appliedMigration.Error}`);
                }
            }
        }

        return {
            valid: errors.length === 0,
            errors
        };
    }
}

export interface AppliedMigration {
    MigrationId: string;
    Name: string;
    Version: string;
    AppliedAt: Date;
    Status: string;
    Error?: string;
}

export interface MigrationResult {
    migrationId: string;
    success: boolean;
    error?: string;
    timestamp: Date;
}

export interface ValidationResult {
    valid: boolean;
    errors: string[];
}