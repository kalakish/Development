import { TableMetadata } from '@nova/metadata';
import { SQLServerSchemaGenerator } from '@nova/compiler/generator/sqlserver-schema-generator';
import fs from 'fs-extra';
import path from 'path';

export class MigrationGenerator {
    private schemaGenerator: SQLServerSchemaGenerator;

    constructor() {
        this.schemaGenerator = new SQLServerSchemaGenerator();
    }

    async generateCreateTableMigration(
        table: TableMetadata,
        outputPath?: string
    ): Promise<Migration> {
        const timestamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '');
        const migrationId = `${timestamp}_Create_${table.name}`;
        
        const statements = this.schemaGenerator.generateCreateTable(table);
        
        const migration: Migration = {
            id: migrationId,
            name: `Create_${table.name}`,
            timestamp,
            version: timestamp.substring(0, 14),
            up: statements.join('\n\n'),
            down: this.generateDownMigration(table)
        };

        if (outputPath) {
            await this.saveMigration(migration, outputPath);
        }

        return migration;
    }

    async generateAlterTableMigration(
        tableName: string,
        oldSchema: any,
        newSchema: any,
        outputPath?: string
    ): Promise<Migration> {
        const timestamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '');
        const migrationId = `${timestamp}_Alter_${tableName}`;
        
        const statements = this.schemaGenerator.generateAlterTable(oldSchema, newSchema);
        
        const migration: Migration = {
            id: migrationId,
            name: `Alter_${tableName}`,
            timestamp,
            version: timestamp.substring(0, 14),
            up: statements.join('\n\n'),
            down: this.generateDownAlterMigration(tableName, oldSchema)
        };

        if (outputPath) {
            await this.saveMigration(migration, outputPath);
        }

        return migration;
    }

    async generateAddColumnMigration(
        tableName: string,
        column: any,
        outputPath?: string
    ): Promise<Migration> {
        const timestamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '');
        const migrationId = `${timestamp}_Add_${column.name}_To_${tableName}`;
        
        const up = `
-- Add column ${column.name} to ${tableName}
ALTER TABLE [${tableName}] 
ADD ${this.schemaGenerator['generateFieldDefinition'](column)};
        `;

        const down = `
-- Remove column ${column.name} from ${tableName}
ALTER TABLE [${tableName}] 
DROP COLUMN [${column.name}];
        `;

        const migration: Migration = {
            id: migrationId,
            name: `Add_${column.name}_To_${tableName}`,
            timestamp,
            version: timestamp.substring(0, 14),
            up,
            down
        };

        if (outputPath) {
            await this.saveMigration(migration, outputPath);
        }

        return migration;
    }

    async generateSeedDataMigration(
        tableName: string,
        records: any[],
        outputPath?: string
    ): Promise<Migration> {
        const timestamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '');
        const migrationId = `${timestamp}_Seed_${tableName}`;
        
        const up = this.schemaGenerator.generateSeedData(tableName, records);
        
        const migration: Migration = {
            id: migrationId,
            name: `Seed_${tableName}`,
            timestamp,
            version: timestamp.substring(0, 14),
            up,
            down: this.generateDownSeedMigration(tableName, records)
        };

        if (outputPath) {
            await this.saveMigration(migration, outputPath);
        }

        return migration;
    }

    async generateInitialSchemaMigration(
        tables: TableMetadata[],
        outputPath?: string
    ): Promise<Migration> {
        const timestamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '');
        const migrationId = `${timestamp}_Initial_Schema`;
        
        let up = '';
        let down = '';

        for (const table of tables) {
            const statements = this.schemaGenerator.generateCreateTable(table);
            up += statements.join('\n\n') + '\n\n';
            down += `DROP TABLE IF EXISTS [${table.name}];\n`;
        }

        // Add system tables
        const systemSetup = this.schemaGenerator.generateDatabaseSetup();
        up += systemSetup.join('\n\n') + '\n\n';
        down += `DROP TABLE IF EXISTS [AuditLog];\n`;
        down += `DROP TABLE IF EXISTS [JobQueue];\n`;

        const migration: Migration = {
            id: migrationId,
            name: 'Initial_Schema',
            timestamp,
            version: '1.0.0',
            up,
            down
        };

        if (outputPath) {
            await this.saveMigration(migration, outputPath);
        }

        return migration;
    }

    private generateDownMigration(table: TableMetadata): string {
        return `DROP TABLE IF EXISTS [${table.name}];`;
    }

    private generateDownAlterMigration(tableName: string, oldSchema: any): string {
        // Generate rollback SQL
        return `-- Rollback for ${tableName} alteration`;
    }

    private generateDownSeedMigration(tableName: string, records: any[]): string {
        if (records.length === 0) return '';

        const ids = records
            .map(r => r.SystemId || r.Id)
            .filter(id => id)
            .map(id => `'${id}'`)
            .join(',');

        return ids ? `DELETE FROM [${tableName}] WHERE [SystemId] IN (${ids});` : '';
    }

    private async saveMigration(migration: Migration, outputPath: string): Promise<void> {
        const filename = `${migration.id}.sql`;
        const filepath = path.join(outputPath, filename);

        const content = `-- Migration: ${migration.name}
-- Version: ${migration.version}
-- Generated: ${new Date().toISOString()}

-- ==========================================================
-- UP
-- ==========================================================
${migration.up}

-- ==========================================================
-- DOWN
-- ==========================================================
${migration.down}
`;

        await fs.ensureDir(outputPath);
        await fs.writeFile(filepath, content);
    }

    generateMigrationReport(migrations: Migration[]): string {
        let report = '# Migration Generation Report\n\n';
        report += `Generated: ${new Date().toISOString()}\n\n`;
        report += `Total Migrations: ${migrations.length}\n\n`;
        
        report += '## Migrations\n\n';
        migrations.forEach((m, i) => {
            report += `${i + 1}. **${m.id}**\n`;
            report += `   - Name: ${m.name}\n`;
            report += `   - Version: ${m.version}\n`;
            report += `   - Up Size: ${m.up.length} bytes\n`;
            report += `   - Down Size: ${m.down.length} bytes\n\n`;
        });

        return report;
    }
}

export interface Migration {
    id: string;
    name: string;
    timestamp: string;
    version: string;
    up: string;
    down: string;
}