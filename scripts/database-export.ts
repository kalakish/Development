#!/usr/bin/env node

import sql from 'mssql';
import * as fs from 'fs-extra';
import * as path from 'path';
import chalk from 'chalk';
import { program } from 'commander';
import dotenv from 'dotenv';
import { format } from 'date-fns';
import archiver from 'archiver';
import { createObjectCsvWriter } from 'csv-writer';

dotenv.config();

class DatabaseExport {
    private pool: sql.ConnectionPool;

    async initialize(): Promise<void> {
        const config: sql.config = {
            server: process.env.SQL_SERVER || 'localhost',
            port: parseInt(process.env.SQL_PORT || '1433'),
            database: process.env.SQL_DATABASE || 'NOVA_DB',
            user: process.env.SQL_USER || 'sa',
            password: process.env.SQL_PASSWORD || '',
            options: {
                encrypt: process.env.SQL_ENCRYPT === 'true',
                trustServerCertificate: process.env.SQL_TRUST_SERVER_CERTIFICATE === 'true'
            }
        };

        try {
            this.pool = await sql.connect(config);
            console.log(chalk.green('✅ Connected to SQL Server'));
        } catch (error) {
            console.error(chalk.red('❌ Failed to connect to SQL Server:'), error.message);
            process.exit(1);
        }
    }

    async exportSchema(options: ExportOptions): Promise<string> {
        console.log(chalk.blue('\n📊 Exporting database schema...'));

        const timestamp = format(new Date(), 'yyyyMMdd_HHmmss');
        const filename = `schema_${timestamp}.sql`;
        const filepath = path.join(options.output || process.cwd(), filename);

        await fs.ensureDir(path.dirname(filepath));

        let output = `-- ====================================================\n`;
        output += `-- Database Schema Export\n`;
        output += `-- Server: ${process.env.SQL_SERVER}\n`;
        output += `-- Database: ${process.env.SQL_DATABASE}\n`;
        output += `-- Exported: ${format(new Date(), 'yyyy-MM-dd HH:mm:ss')}\n`;
        output += `-- ====================================================\n\n`;

        // Get all tables
        const tables = await this.getTables(options.tables);
        
        for (const table of tables) {
            output += await this.exportTableSchema(table);
            output += '\n';
        }

        // Get all views
        if (options.includeViews) {
            const views = await this.getViews();
            for (const view of views) {
                output += await this.exportViewSchema(view);
                output += '\n';
            }
        }

        // Get all stored procedures
        if (options.includeProcedures) {
            const procedures = await this.getProcedures();
            for (const proc of procedures) {
                output += await this.exportProcedureSchema(proc);
                output += '\n';
            }
        }

        // Get all functions
        if (options.includeFunctions) {
            const functions = await this.getFunctions();
            for (const func of functions) {
                output += await this.exportFunctionSchema(func);
                output += '\n';
            }
        }

        // Get all indexes
        if (options.includeIndexes) {
            for (const table of tables) {
                output += await this.exportIndexes(table);
                output += '\n';
            }
        }

        // Get all constraints
        if (options.includeConstraints) {
            for (const table of tables) {
                output += await this.exportConstraints(table);
                output += '\n';
            }
        }

        await fs.writeFile(filepath, output);
        console.log(chalk.green(`   ✅ Schema exported to: ${filepath}`));

        return filepath;
    }

    async exportData(options: ExportOptions): Promise<string[]> {
        console.log(chalk.blue('\n📦 Exporting data...'));

        const timestamp = format(new Date(), 'yyyyMMdd_HHmmss');
        const exportDir = path.join(options.output || process.cwd(), `data_${timestamp}`);
        const files: string[] = [];

        await fs.ensureDir(exportDir);

        const tables = await this.getTables(options.tables);

        for (const table of tables) {
            const filepath = await this.exportTableData(table, exportDir, options);
            files.push(filepath);
        }

        // Create archive if requested
        if (options.compress) {
            const archivePath = await this.createArchive(exportDir, timestamp);
            files.push(archivePath);
        }

        console.log(chalk.green(`   ✅ Data exported to: ${exportDir}`));
        
        return files;
    }

    private async exportTableSchema(table: string): Promise<string> {
        const result = await this.pool.request()
            .input('TableName', sql.NVarChar, table)
            .query(`
                SELECT 
                    c.name AS ColumnName,
                    t.name AS DataType,
                    c.max_length AS MaxLength,
                    c.precision AS Precision,
                    c.scale AS Scale,
                    c.is_nullable AS IsNullable,
                    c.is_identity AS IsIdentity,
                    dc.definition AS DefaultValue,
                    cc.definition AS ComputedDefinition
                FROM sys.columns c
                INNER JOIN sys.types t ON c.user_type_id = t.user_type_id
                LEFT JOIN sys.default_constraints dc 
                    ON c.default_object_id = dc.object_id
                LEFT JOIN sys.computed_columns cc 
                    ON c.object_id = cc.object_id AND c.column_id = cc.column_id
                WHERE c.object_id = OBJECT_ID(@TableName)
                ORDER BY c.column_id
            `);

        const columns = result.recordset;

        let output = `-- Table: ${table}\n`;
        output += `CREATE TABLE [dbo].[${table}] (\n`;

        const columnDefs = columns.map(col => {
            let def = `    [${col.ColumnName}] `;
            
            if (col.ComputedDefinition) {
                def += `AS ${col.ComputedDefinition}`;
            } else {
                def += `[${col.DataType}]`;
                
                if (col.DataType in ['varchar', 'nvarchar', 'char', 'nchar', 'varbinary']) {
                    def += col.MaxLength === -1 ? '(MAX)' : `(${col.MaxLength})`;
                } else if (col.DataType in ['decimal', 'numeric']) {
                    def += `(${col.Precision}, ${col.Scale})`;
                }
                
                if (col.IsIdentity === 1) {
                    def += ` IDENTITY(1,1)`;
                }
                
                if (col.IsNullable === 0) {
                    def += ` NOT NULL`;
                } else {
                    def += ` NULL`;
                }
                
                if (col.DefaultValue) {
                    def += ` CONSTRAINT [DF_${table}_${col.ColumnName}] DEFAULT ${col.DefaultValue}`;
                }
            }
            
            return def;
        });

        output += columnDefs.join(',\n');
        output += `\n);\n\n`;

        return output;
    }

    private async exportTableData(table: string, exportDir: string, options: ExportOptions): Promise<string> {
        console.log(chalk.white(`   Exporting table: ${table}`));

        const result = await this.pool.request()
            .input('TableName', sql.NVarChar, table)
            .query(`SELECT * FROM [dbo].[${table}]`);

        const rows = result.recordset;

        if (rows.length === 0) {
            console.log(chalk.yellow(`      ⚠️  No data in table ${table}`));
            return '';
        }

        let filepath: string;

        switch (options.format) {
            case 'csv':
                filepath = await this.exportToCSV(table, rows, exportDir);
                break;
            case 'json':
                filepath = await this.exportToJSON(table, rows, exportDir);
                break;
            case 'sql':
                filepath = await this.exportToSQL(table, rows, exportDir);
                break;
            default:
                filepath = await this.exportToJSON(table, rows, exportDir);
        }

        console.log(chalk.green(`      ✅ Exported ${rows.length} rows to ${path.basename(filepath)}`));
        
        return filepath;
    }

    private async exportToCSV(table: string, rows: any[], exportDir: string): Promise<string> {
        const filepath = path.join(exportDir, `${table}.csv`);
        
        if (rows.length === 0) return filepath;

        const columns = Object.keys(rows[0]);
        
        const csvWriter = createObjectCsvWriter({
            path: filepath,
            header: columns.map(col => ({ id: col, title: col }))
        });

        await csvWriter.writeRecords(rows);
        
        return filepath;
    }

    private async exportToJSON(table: string, rows: any[], exportDir: string): Promise<string> {
        const filepath = path.join(exportDir, `${table}.json`);
        
        const output = {
            table,
            exportedAt: new Date().toISOString(),
            rowCount: rows.length,
            data: rows
        };

        await fs.writeJson(filepath, output, { spaces: 2 });
        
        return filepath;
    }

    private async exportToSQL(table: string, rows: any[], exportDir: string): Promise<string> {
        const filepath = path.join(exportDir, `${table}.sql`);
        
        if (rows.length === 0) return filepath;

        const columns = Object.keys(rows[0]);
        let output = `-- Data for table: ${table}\n`;
        output += `-- Exported: ${format(new Date(), 'yyyy-MM-dd HH:mm:ss')}\n`;
        output += `-- Rows: ${rows.length}\n\n`;

        output += `SET IDENTITY_INSERT [dbo].[${table}] ON;\n\n`;

        for (const row of rows) {
            const values = columns.map(col => {
                const val = row[col];
                if (val === null || val === undefined) return 'NULL';
                if (typeof val === 'string') return `N'${val.replace(/'/g, "''")}'`;
                if (val instanceof Date) return `'${val.toISOString()}'`;
                if (typeof val === 'object') return `N'${JSON.stringify(val).replace(/'/g, "''")}'`;
                return val;
            });

            output += `INSERT INTO [dbo].[${table}] ([${columns.join('], [')}])\n`;
            output += `VALUES (${values.join(', ')});\n`;
        }

        output += `\nSET IDENTITY_INSERT [dbo].[${table}] OFF;\n\n`;

        await fs.writeFile(filepath, output);
        
        return filepath;
    }

    private async exportViewSchema(view: string): Promise<string> {
        const result = await this.pool.request()
            .input('ViewName', sql.NVarChar, view)
            .query(`
                SELECT OBJECT_DEFINITION(OBJECT_ID(@ViewName)) AS Definition
            `);

        const definition = result.recordset[0]?.Definition || '';

        return `-- View: ${view}\n${definition}\nGO\n\n`;
    }

    private async exportProcedureSchema(procedure: string): Promise<string> {
        const result = await this.pool.request()
            .input('ProcedureName', sql.NVarChar, procedure)
            .query(`
                SELECT OBJECT_DEFINITION(OBJECT_ID(@ProcedureName)) AS Definition
            `);

        const definition = result.recordset[0]?.Definition || '';

        return `-- Stored Procedure: ${procedure}\n${definition}\nGO\n\n`;
    }

    private async exportFunctionSchema(func: string): Promise<string> {
        const result = await this.pool.request()
            .input('FunctionName', sql.NVarChar, func)
            .query(`
                SELECT OBJECT_DEFINITION(OBJECT_ID(@FunctionName)) AS Definition
            `);

        const definition = result.recordset[0]?.Definition || '';

        return `-- Function: ${func}\n${definition}\nGO\n\n`;
    }

    private async exportIndexes(table: string): Promise<string> {
        const result = await this.pool.request()
            .input('TableName', sql.NVarChar, table)
            .query(`
                SELECT 
                    i.name AS IndexName,
                    i.is_unique AS IsUnique,
                    i.is_primary_key AS IsPrimaryKey,
                    i.type_desc AS IndexType,
                    STUFF((
                        SELECT ', ' + c.name + CASE WHEN ic.is_descending_key = 1 THEN ' DESC' ELSE '' END
                        FROM sys.index_columns ic
                        INNER JOIN sys.columns c ON ic.object_id = c.object_id AND ic.column_id = c.column_id
                        WHERE ic.object_id = i.object_id AND ic.index_id = i.index_id
                        AND ic.key_ordinal > 0
                        ORDER BY ic.key_ordinal
                        FOR XML PATH('')
                    ), 1, 2, '') AS KeyColumns,
                    i.filter_definition AS Filter
                FROM sys.indexes i
                WHERE i.object_id = OBJECT_ID(@TableName)
                    AND i.name IS NOT NULL
                    AND i.is_primary_key = 0
            `);

        const indexes = result.recordset;

        if (indexes.length === 0) return '';

        let output = `-- Indexes for table: ${table}\n`;

        for (const idx of indexes) {
            const unique = idx.IsUnique ? 'UNIQUE ' : '';
            const type = idx.IndexType === 'CLUSTERED' ? 'CLUSTERED' : 'NONCLUSTERED';
            const filter = idx.Filter ? ` WHERE ${idx.Filter}` : '';

            output += `CREATE ${unique}${type} INDEX [${idx.IndexName}]\n`;
            output += `ON [dbo].[${table}] (${idx.KeyColumns})${filter};\n`;
        }

        output += '\n';

        return output;
    }

    private async exportConstraints(table: string): Promise<string> {
        const result = await this.pool.request()
            .input('TableName', sql.NVarChar, table)
            .query(`
                SELECT 
                    c.name AS ConstraintName,
                    c.type_desc AS ConstraintType,
                    OBJECT_NAME(c.parent_object_id) AS TableName,
                    OBJECT_NAME(c.referenced_object_id) AS ReferencedTable,
                    STUFF((
                        SELECT ', ' + COL_NAME(fkc.parent_object_id, fkc.parent_column_id)
                        FROM sys.foreign_key_columns fkc
                        WHERE fkc.constraint_object_id = c.object_id
                        ORDER BY fkc.constraint_column_id
                        FOR XML PATH('')
                    ), 1, 2, '') AS Columns,
                    STUFF((
                        SELECT ', ' + COL_NAME(fkc.referenced_object_id, fkc.referenced_column_id)
                        FROM sys.foreign_key_columns fkc
                        WHERE fkc.constraint_object_id = c.object_id
                        ORDER BY fkc.constraint_column_id
                        FOR XML PATH('')
                    ), 1, 2, '') AS ReferencedColumns,
                    c.delete_referential_action_desc AS DeleteAction,
                    c.update_referential_action_desc AS UpdateAction
                FROM sys.foreign_keys c
                WHERE c.parent_object_id = OBJECT_ID(@TableName)
                UNION ALL
                SELECT 
                    c.name,
                    c.type_desc,
                    OBJECT_NAME(c.parent_object_id),
                    NULL,
                    COL_NAME(c.parent_object_id, c.unique_index_id),
                    NULL,
                    NULL,
                    NULL
                FROM sys.key_constraints c
                WHERE c.parent_object_id = OBJECT_ID(@TableName)
            `);

        const constraints = result.recordset;

        if (constraints.length === 0) return '';

        let output = `-- Constraints for table: ${table}\n`;

        for (const con of constraints) {
            if (con.ConstraintType === 'PRIMARY_KEY_CONSTRAINT') {
                output += `ALTER TABLE [dbo].[${table}] ADD CONSTRAINT [${con.ConstraintName}] PRIMARY KEY (${con.Columns});\n`;
            } else if (con.ConstraintType === 'FOREIGN_KEY_CONSTRAINT') {
                output += `ALTER TABLE [dbo].[${table}] ADD CONSTRAINT [${con.ConstraintName}] FOREIGN KEY (${con.Columns})\n`;
                output += `    REFERENCES [dbo].[${con.ReferencedTable}] (${con.ReferencedColumns})\n`;
                output += `    ON DELETE ${con.DeleteAction.replace('_', ' ')} ON UPDATE ${con.UpdateAction.replace('_', ' ')};\n`;
            } else if (con.ConstraintType === 'UNIQUE_CONSTRAINT') {
                output += `ALTER TABLE [dbo].[${table}] ADD CONSTRAINT [${con.ConstraintName}] UNIQUE (${con.Columns});\n`;
            }
        }

        output += '\n';

        return output;
    }

    private async getTables(filter?: string[]): Promise<string[]> {
        let query = `
            SELECT [name] 
            FROM sys.tables 
            WHERE [is_ms_shipped] = 0
        `;

        if (filter && filter.length > 0) {
            const tableList = filter.map(t => `'${t}'`).join(',');
            query += ` AND [name] IN (${tableList})`;
        }

        query += ` ORDER BY [name]`;

        const result = await this.pool.request().query(query);
        return result.recordset.map(r => r.name);
    }

    private async getViews(): Promise<string[]> {
        const result = await this.pool.request().query(`
            SELECT [name] 
            FROM sys.views 
            WHERE [is_ms_shipped] = 0
            ORDER BY [name]
        `);
        return result.recordset.map(r => r.name);
    }

    private async getProcedures(): Promise<string[]> {
        const result = await this.pool.request().query(`
            SELECT [name] 
            FROM sys.procedures 
            WHERE [is_ms_shipped] = 0
            ORDER BY [name]
        `);
        return result.recordset.map(r => r.name);
    }

    private async getFunctions(): Promise<string[]> {
        const result = await this.pool.request().query(`
            SELECT [name] 
            FROM sys.objects 
            WHERE [type] IN ('FN', 'IF', 'TF')
                AND [is_ms_shipped] = 0
            ORDER BY [name]
        `);
        return result.recordset.map(r => r.name);
    }

    private async createArchive(exportDir: string, timestamp: string): Promise<string> {
        const archivePath = path.join(path.dirname(exportDir), `data_${timestamp}.zip`);
        
        const output = fs.createWriteStream(archivePath);
        const archive = archiver('zip', { zlib: { level: 9 } });

        return new Promise((resolve, reject) => {
            output.on('close', () => {
                fs.removeSync(exportDir);
                console.log(chalk.green(`   ✅ Archive created: ${path.basename(archivePath)} (${archive.pointer()} bytes)`));
                resolve(archivePath);
            });

            archive.on('error', reject);

            archive.pipe(output);
            archive.directory(exportDir, false);
            archive.finalize();
        });
    }

    async close(): Promise<void> {
        await this.pool.close();
    }
}

interface ExportOptions {
    output?: string;
    format: 'json' | 'csv' | 'sql';
    tables?: string[];
    includeSchema: boolean;
    includeData: boolean;
    includeViews: boolean;
    includeProcedures: boolean;
    includeFunctions: boolean;
    includeIndexes: boolean;
    includeConstraints: boolean;
    compress: boolean;
}

// CLI Interface
async function main() {
    program
        .name('database-export')
        .description('Export database schema and data')
        .version('1.0.0');

    program
        .command('schema')
        .description('Export database schema')
        .option('-o, --output <path>', 'Output directory')
        .option('-t, --tables <tables>', 'Comma-separated list of tables')
        .option('--views', 'Include views', true)
        .option('--procedures', 'Include stored procedures', true)
        .option('--functions', 'Include functions', true)
        .option('--indexes', 'Include indexes', true)
        .option('--constraints', 'Include constraints', true)
        .action(async (options) => {
            const exporter = new DatabaseExport();
            try {
                await exporter.initialize();
                await exporter.exportSchema({
                    output: options.output,
                    format: 'sql',
                    includeSchema: true,
                    includeData: false,
                    includeViews: options.views,
                    includeProcedures: options.procedures,
                    includeFunctions: options.functions,
                    includeIndexes: options.indexes,
                    includeConstraints: options.constraints,
                    tables: options.tables ? options.tables.split(',') : undefined,
                    compress: false
                });
            } finally {
                await exporter.close();
            }
        });

    program
        .command('data')
        .description('Export database data')
        .option('-o, --output <path>', 'Output directory')
        .option('-f, --format <format>', 'Export format (json, csv, sql)', 'json')
        .option('-t, --tables <tables>', 'Comma-separated list of tables')
        .option('-z, --compress', 'Compress output into ZIP archive')
        .action(async (options) => {
            const exporter = new DatabaseExport();
            try {
                await exporter.initialize();
                await exporter.exportData({
                    output: options.output,
                    format: options.format,
                    includeSchema: false,
                    includeData: true,
                    includeViews: false,
                    includeProcedures: false,
                    includeFunctions: false,
                    includeIndexes: false,
                    includeConstraints: false,
                    tables: options.tables ? options.tables.split(',') : undefined,
                    compress: options.compress
                });
            } finally {
                await exporter.close();
            }
        });

    program
        .command('full')
        .description('Export full database (schema + data)')
        .option('-o, --output <path>', 'Output directory')
        .option('-f, --format <format>', 'Export format for data (json, csv, sql)', 'json')
        .option('-z, --compress', 'Compress output into ZIP archive')
        .action(async (options) => {
            const exporter = new DatabaseExport();
            try {
                await exporter.initialize();
                
                // Export schema
                await exporter.exportSchema({
                    output: options.output,
                    format: 'sql',
                    includeSchema: true,
                    includeData: false,
                    includeViews: true,
                    includeProcedures: true,
                    includeFunctions: true,
                    includeIndexes: true,
                    includeConstraints: true,
                    compress: false
                });

                // Export data
                await exporter.exportData({
                    output: options.output,
                    format: options.format,
                    includeSchema: false,
                    includeData: true,
                    includeViews: false,
                    includeProcedures: false,
                    includeFunctions: false,
                    includeIndexes: false,
                    includeConstraints: false,
                    compress: options.compress
                });

                console.log(chalk.green('\n✅ Full database export completed!'));
                
            } finally {
                await exporter.close();
            }
        });

    program.parse(process.argv);
}

if (require.main === module) {
    main().catch(console.error);
}

export default DatabaseExport;