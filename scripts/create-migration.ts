#!/usr/bin/env node

import * as fs from 'fs-extra';
import * as path from 'path';
import * as readline from 'readline';
import { program } from 'commander';
import chalk from 'chalk';
import { format } from 'date-fns';

interface MigrationTemplate {
    name: string;
    description?: string;
    author?: string;
    type: 'schema' | 'data' | 'function' | 'procedure' | 'view' | 'index';
    table?: string;
}

class CreateMigration {
    private migrationsDir: string;
    private templatesDir: string;

    constructor() {
        this.migrationsDir = path.join(process.cwd(), 'migrations');
        this.templatesDir = path.join(__dirname, '../templates/migrations');
    }

    async initialize(): Promise<void> {
        await fs.ensureDir(this.migrationsDir);
        await fs.ensureDir(this.templatesDir);
        await this.ensureTemplates();
    }

    private async ensureTemplates(): Promise<void> {
        const templates = {
            'schema.sql': `-- ====================================================
-- Migration Template: Schema Change
-- ====================================================

-- UP Migration
-- ====================================================
BEGIN TRANSACTION;
SET XACT_ABORT ON;
SET NOCOUNT ON;

PRINT N'Starting migration...';

-- Add your schema changes here
-- Example:
/*
CREATE TABLE [dbo].[NewTable] (
    [Id] INT IDENTITY(1,1) NOT NULL,
    [Name] NVARCHAR(100) NOT NULL,
    [CreatedAt] DATETIME2 NOT NULL CONSTRAINT [DF_NewTable_CreatedAt] DEFAULT GETUTCDATE(),
    CONSTRAINT [PK_NewTable] PRIMARY KEY CLUSTERED ([Id])
);
*/

PRINT N'Migration completed successfully.';

COMMIT TRANSACTION;
GO

-- ====================================================
-- DOWN Migration (Rollback)
-- ====================================================
/*
BEGIN TRANSACTION;
    -- Add rollback statements here
    -- DROP TABLE [dbo].[NewTable];
COMMIT TRANSACTION;
*/
GO`,

            'data.sql': `-- ====================================================
-- Migration Template: Data Migration
-- ====================================================

-- UP Migration
-- ====================================================
BEGIN TRANSACTION;
SET XACT_ABORT ON;
SET NOCOUNT ON;

PRINT N'Starting data migration...';

-- Add your data changes here
-- Example:
/*
UPDATE [dbo].[Users]
SET [Status] = 'Active'
WHERE [Status] IS NULL;

INSERT INTO [dbo].[Settings] ([Key], [Value], [Type])
VALUES ('Theme', 'Light', 'String');
*/

PRINT N'Data migration completed successfully.';

COMMIT TRANSACTION;
GO

-- ====================================================
-- DOWN Migration (Rollback)
-- ====================================================
/*
BEGIN TRANSACTION;
    -- Add rollback statements here
COMMIT TRANSACTION;
*/
GO`,

            'function.sql': `-- ====================================================
-- Migration Template: Function
-- ====================================================

-- UP Migration
-- ====================================================
BEGIN TRANSACTION;
SET XACT_ABORT ON;
SET NOCOUNT ON;

PRINT N'Creating function...';

-- Add your function here
/*
CREATE OR ALTER FUNCTION [dbo].[FunctionName] (
    @Parameter1 INT,
    @Parameter2 NVARCHAR(100)
)
RETURNS TABLE
AS
RETURN
(
    SELECT *
    FROM [dbo].[TableName]
    WHERE [Column1] = @Parameter1
        AND [Column2] = @Parameter2
);
*/

PRINT N'Function created successfully.';

COMMIT TRANSACTION;
GO

-- ====================================================
-- DOWN Migration (Rollback)
-- ====================================================
/*
BEGIN TRANSACTION;
    DROP FUNCTION IF EXISTS [dbo].[FunctionName];
COMMIT TRANSACTION;
*/
GO`,

            'procedure.sql': `-- ====================================================
-- Migration Template: Stored Procedure
-- ====================================================

-- UP Migration
-- ====================================================
BEGIN TRANSACTION;
SET XACT_ABORT ON;
SET NOCOUNT ON;

PRINT N'Creating stored procedure...';

-- Add your stored procedure here
/*
CREATE OR ALTER PROCEDURE [dbo].[ProcedureName] (
    @Parameter1 INT,
    @Parameter2 NVARCHAR(100) = NULL
)
AS
BEGIN
    SET NOCOUNT ON;
    
    SELECT *
    FROM [dbo].[TableName]
    WHERE [Column1] = @Parameter1
        AND (@Parameter2 IS NULL OR [Column2] = @Parameter2);
END
*/

PRINT N'Stored procedure created successfully.';

COMMIT TRANSACTION;
GO

-- ====================================================
-- DOWN Migration (Rollback)
-- ====================================================
/*
BEGIN TRANSACTION;
    DROP PROCEDURE IF EXISTS [dbo].[ProcedureName];
COMMIT TRANSACTION;
*/
GO`,

            'view.sql': `-- ====================================================
-- Migration Template: View
-- ====================================================

-- UP Migration
-- ====================================================
BEGIN TRANSACTION;
SET XACT_ABORT ON;
SET NOCOUNT ON;

PRINT N'Creating view...';

-- Add your view here
/*
CREATE OR ALTER VIEW [dbo].[ViewName]
AS
SELECT 
    [Column1],
    [Column2],
    [Column3]
FROM [dbo].[TableName]
WHERE [IsActive] = 1;
*/

PRINT N'View created successfully.';

COMMIT TRANSACTION;
GO

-- ====================================================
-- DOWN Migration (Rollback)
-- ====================================================
/*
BEGIN TRANSACTION;
    DROP VIEW IF EXISTS [dbo].[ViewName];
COMMIT TRANSACTION;
*/
GO`,

            'index.sql': `-- ====================================================
-- Migration Template: Index
-- ====================================================

-- UP Migration
-- ====================================================
BEGIN TRANSACTION;
SET XACT_ABORT ON;
SET NOCOUNT ON;

PRINT N'Creating index...';

-- Add your index here
/*
CREATE NONCLUSTERED INDEX [IX_TableName_ColumnName]
ON [dbo].[TableName] ([ColumnName])
INCLUDE ([IncludeColumn1], [IncludeColumn2])
WHERE [IsActive] = 1;
*/

PRINT N'Index created successfully.';

COMMIT TRANSACTION;
GO

-- ====================================================
-- DOWN Migration (Rollback)
-- ====================================================
/*
BEGIN TRANSACTION;
    DROP INDEX IF EXISTS [IX_TableName_ColumnName] ON [dbo].[TableName];
COMMIT TRANSACTION;
*/
GO`
        };

        for (const [name, content] of Object.entries(templates)) {
            const templatePath = path.join(this.templatesDir, name);
            if (!await fs.pathExists(templatePath)) {
                await fs.writeFile(templatePath, content);
                console.log(chalk.green(`✅ Created template: ${name}`));
            }
        }
    }

    async createMigration(template: MigrationTemplate): Promise<string> {
        const timestamp = format(new Date(), 'yyyyMMddHHmmss');
        const migrationName = this.generateMigrationName(template);
        const filename = `${timestamp}_${migrationName}.sql`;
        const filepath = path.join(this.migrationsDir, filename);

        // Get template content
        let templateContent = await this.getTemplateContent(template.type);
        
        // Replace placeholders
        templateContent = this.replacePlaceholders(templateContent, template);

        // Add metadata header
        const header = this.generateHeader(template, timestamp);
        templateContent = header + templateContent;

        // Write migration file
        await fs.writeFile(filepath, templateContent);
        
        console.log(chalk.green(`\n✅ Migration created successfully!`));
        console.log(chalk.blue(`   📄 File: ${filename}`));
        console.log(chalk.blue(`   📁 Path: ${filepath}`));
        console.log(chalk.blue(`   🏷️  Type: ${template.type}`));
        console.log(chalk.blue(`   📊 Name: ${template.name}`));

        // Create empty down migration file if requested
        if (template.type === 'schema' || template.type === 'data') {
            console.log(chalk.yellow(`\n⚠️  Don't forget to implement the DOWN migration for rollback!`));
        }

        return filename;
    }

    async createBatchMigration(templates: MigrationTemplate[]): Promise<string[]> {
        const filenames: string[] = [];
        
        for (const template of templates) {
            const filename = await this.createMigration(template);
            filenames.push(filename);
        }

        // Create a batch manifest
        const timestamp = format(new Date(), 'yyyyMMddHHmmss');
        const manifestFile = path.join(this.migrationsDir, `${timestamp}_batch_manifest.json`);
        
        const manifest = {
            createdAt: new Date().toISOString(),
            migrations: templates.map((t, index) => ({
                ...t,
                filename: filenames[index]
            }))
        };

        await fs.writeJson(manifestFile, manifest, { spaces: 2 });
        console.log(chalk.green(`\n✅ Batch manifest created: ${path.basename(manifestFile)}`));

        return filenames;
    }

    private generateMigrationName(template: MigrationTemplate): string {
        const parts = [];
        
        if (template.type) parts.push(template.type);
        if (template.table) parts.push(template.table);
        
        const cleanName = template.name
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '_')
            .replace(/^_|_$/g, '');
        
        parts.push(cleanName);
        
        return parts.join('_');
    }

    private async getTemplateContent(type: string): Promise<string> {
        const templateFile = path.join(this.templatesDir, `${type}.sql`);
        
        if (await fs.pathExists(templateFile)) {
            return await fs.readFile(templateFile, 'utf8');
        }

        // Fallback to schema template
        const schemaTemplate = path.join(this.templatesDir, 'schema.sql');
        return await fs.readFile(schemaTemplate, 'utf8');
    }

    private replacePlaceholders(content: string, template: MigrationTemplate): string {
        let result = content;
        
        const replacements = {
            'TableName': template.table || 'TableName',
            'ColumnName': 'ColumnName',
            'FunctionName': template.name,
            'ProcedureName': template.name,
            'ViewName': template.name,
            'IndexName': template.table ? `IX_${template.table}_${template.name}` : `IX_${template.name}`
        };

        for (const [key, value] of Object.entries(replacements)) {
            result = result.replace(new RegExp(key, 'g'), value);
        }

        return result;
    }

    private generateHeader(template: MigrationTemplate, timestamp: string): string {
        const header = [];
        
        header.push(`-- ====================================================`);
        header.push(`-- Migration: ${template.name}`);
        header.push(`-- Description: ${template.description || 'No description provided'}`);
        header.push(`-- Type: ${template.type}`);
        header.push(`-- Author: ${template.author || process.env.USER || 'system'}`);
        header.push(`-- Created: ${format(new Date(), 'yyyy-MM-dd HH:mm:ss')}`);
        header.push(`-- Version: ${timestamp}`);
        if (template.table) header.push(`-- Table: ${template.table}`);
        header.push(`-- ====================================================`);
        header.push(``);
        
        return header.join('\n');
    }

    async listTemplates(): Promise<void> {
        const templates = await fs.readdir(this.templatesDir);
        
        console.log(chalk.cyan('\n📋 Available Migration Templates:'));
        console.log(chalk.cyan('================================'));
        
        for (const template of templates) {
            if (template.endsWith('.sql')) {
                const name = template.replace('.sql', '');
                console.log(chalk.white(`   • ${name}`));
            }
        }
        console.log('');
    }

    async interactive(): Promise<void> {
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });

        const question = (query: string): Promise<string> => {
            return new Promise((resolve) => {
                rl.question(chalk.yellow(query), resolve);
            });
        };

        console.log(chalk.cyan('\n🔧 Create Migration - Interactive Mode'));
        console.log(chalk.cyan('========================================\n'));

        const template: MigrationTemplate = {
            name: await question('Migration name: '),
            description: await question('Description (optional): '),
            type: await question('Type [schema/data/function/procedure/view/index]: ') as any,
            table: await question('Table name (optional): '),
            author: await question('Author (optional): ') || process.env.USER || 'system'
        };

        if (!template.type || !['schema', 'data', 'function', 'procedure', 'view', 'index'].includes(template.type)) {
            template.type = 'schema';
        }

        await this.createMigration(template);
        rl.close();
    }
}

// CLI Interface
async function main() {
    program
        .name('create-migration')
        .description('Create database migration files')
        .version('1.0.0');

    program
        .command('create')
        .description('Create a new migration')
        .option('-n, --name <name>', 'Migration name')
        .option('-d, --description <desc>', 'Migration description')
        .option('-t, --type <type>', 'Migration type (schema, data, function, procedure, view, index)')
        .option('--table <table>', 'Table name')
        .option('-a, --author <author>', 'Author name')
        .action(async (options) => {
            const creator = new CreateMigration();
            await creator.initialize();

            if (!options.name) {
                await creator.interactive();
                return;
            }

            await creator.createMigration({
                name: options.name,
                description: options.description,
                type: options.type || 'schema',
                table: options.table,
                author: options.author
            });
        });

    program
        .command('batch')
        .description('Create multiple migrations')
        .requiredOption('-f, --file <path>', 'JSON file with migration definitions')
        .action(async (options) => {
            const creator = new CreateMigration();
            await creator.initialize();

            const filePath = path.resolve(options.file);
            if (!await fs.pathExists(filePath)) {
                console.error(chalk.red(`❌ File not found: ${filePath}`));
                process.exit(1);
            }

            const definitions = await fs.readJson(filePath);
            await creator.createBatchMigration(definitions);
        });

    program
        .command('templates')
        .description('List available templates')
        .action(async () => {
            const creator = new CreateMigration();
            await creator.initialize();
            await creator.listTemplates();
        });

    program
        .command('init')
        .description('Initialize migrations directory')
        .action(async () => {
            const creator = new CreateMigration();
            await creator.initialize();
            console.log(chalk.green('✅ Migrations directory initialized'));
        });

    program.parse(process.argv);
}

if (require.main === module) {
    main().catch(console.error);
}

export default CreateMigration;