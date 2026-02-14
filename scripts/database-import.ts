#!/usr/bin/env node

import sql from 'mssql';
import * as fs from 'fs-extra';
import * as path from 'path';
import chalk from 'chalk';
import { program } from 'commander';
import dotenv from 'dotenv';
import unzipper from 'unzipper';
import csv from 'csv-parser';

dotenv.config();

class DatabaseImport {
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

    async importSchema(filepath: string, options: ImportOptions = {}): Promise<void> {
        console.log(chalk.blue('\n📥 Importing database schema...'));

        if (!await fs.pathExists(filepath)) {
            console.error(chalk.red(`❌ Schema file not found: ${filepath}`));
            return;
        }

        const content = await fs.readFile(filepath, 'utf8');
        
        // Split into individual statements
        const statements = content.split('GO\n').filter(s => s.trim());

        console.log(chalk.white(`   Found ${statements.length} statements to execute`));

        let successCount = 0;
        let failCount = 0;

        for (let i = 0; i < statements.length; i++) {
            const statement = statements[i].trim();
            if (!statement) continue;

            try {
                if (options.dryRun) {
                    console.log(chalk.white(`   [DRY RUN] Would execute: ${statement.substring(0, 100)}...`));
                    successCount++;
                } else {
                    await this.pool.request().query(statement);
                    successCount++;
                    
                    if (options.verbose) {
                        console.log(chalk.green(`   ✅ Executed (${i + 1}/${statements.length})`));
                    }
                }
            } catch (error) {
                failCount++;
                console.error(chalk.red(`   ❌ Failed: ${error.message}`));
                
                if (options.stopOnError) {
                    throw error;
                }
            }
        }

        console.log(chalk.green(`\n✅ Schema import completed: ${successCount} succeeded, ${failCount} failed`));
    }

    async importData(filepath: string, options: ImportOptions = {}): Promise<void> {
        console.log(chalk.blue('\n📥 Importing data...'));

        const stats = await fs.stat(filepath);

        if (stats.isDirectory()) {
            await this.importDirectory(filepath, options);
        } else if (filepath.endsWith('.zip')) {
            await this.importZipArchive(filepath, options);
        } else if (filepath.endsWith('.json')) {
            await this.importJSONFile(filepath, options);
        } else if (filepath.endsWith('.csv')) {
            await this.importCSVFile(filepath, options);
        } else if (filepath.endsWith('.sql')) {
            await this.importSQLDataFile(filepath, options);
        } else {
            console.error(chalk.red(`❌ Unsupported file format: ${filepath}`));
        }
    }

    private async importDirectory(dirpath: string, options: ImportOptions): Promise<void> {
        const files = await fs.readdir(dirpath);
        
        // Import JSON files first (preserve order)
        const jsonFiles = files.filter(f => f.endsWith('.json')).sort();
        for (const file of jsonFiles) {
            await this.importJSONFile(path.join(dirpath, file), options);
        }

        // Import CSV files
        const csvFiles = files.filter(f => f.endsWith('.csv')).sort();
        for (const file of csvFiles) {
            await this.importCSVFile(path.join(dirpath, file), options);
        }

        // Import SQL files
        const sqlFiles = files.filter(f => f.endsWith('.sql')).sort();
        for (const file of sqlFiles) {
            await this.importSQLDataFile(path.join(dirpath, file), options);
        }
    }

    private async importZipArchive(zipPath: string, options: ImportOptions): Promise<void> {
        console.log(chalk.white(`   Extracting archive: ${path.basename(zipPath)}`));

        const extractPath = path.join(process.cwd(), 'temp_import_' + Date.now());
        
        await fs.ensureDir(extractPath);
        
        await fs.createReadStream(zipPath)
            .pipe(unzipper.Extract({ path: extractPath }))
            .promise();

        try {
            await this.importDirectory(extractPath, options);
        } finally {
            await fs.remove(extractPath);
        }
    }

    private async importJSONFile(filepath: string, options: ImportOptions): Promise<void> {
        const filename = path.basename(filepath);
        console.log(chalk.white(`   Importing JSON: ${filename}`));

        const content = await fs.readJson(filepath);
        
        if (!content.table || !content.data) {
            console.error(chalk.red(`      ❌ Invalid JSON format: missing table or data property`));
            return;
        }

        const table = content.table;
        const rows = content.data;

        console.log(chalk.white(`      Table: ${table}, Rows: ${rows.length}`));

        if (rows.length === 0) return;

        if (options.dryRun) {
            console.log(chalk.white(`      [DRY RUN] Would insert ${rows.length} rows into ${table}`));
            return;
        }

        await this.importTableData(table, rows, options);
    }

    private async importCSVFile(filepath: string, options: ImportOptions): Promise<void> {
        const filename = path.basename(filepath);
        const table = filename.replace('.csv', '');
        
        console.log(chalk.white(`   Importing CSV: ${filename} -> Table: ${table}`));

        const rows: any[] = [];

        await new Promise((resolve, reject) => {
            fs.createReadStream(filepath)
                .pipe(csv())
                .on('data', (data) => rows.push(data))
                .on('end', resolve)
                .on('error', reject);
        });

        console.log(chalk.white(`      Found ${rows.length} rows`));

        if (rows.length === 0) return;

        if (options.dryRun) {
            console.log(chalk.white(`      [DRY RUN] Would insert ${rows.length} rows into ${table}`));
            return;
        }

        await this.importTableData(table, rows, options);
    }

    private async importSQLDataFile(filepath: string, options: ImportOptions): Promise<void> {
        const filename = path.basename(filepath);
        console.log(chalk.white(`   Importing SQL data: ${filename}`));

        const content = await fs.readFile(filepath, 'utf8');
        const statements = content.split(';\n').filter(s => s.trim());

        let successCount = 0;
        let failCount = 0;

        for (const statement of statements) {
            if (!statement.trim() || statement.startsWith('--')) continue;

            try {
                if (options.dryRun) {
                    console.log(chalk.white(`      [DRY RUN] Would execute: ${statement.substring(0, 100)}...`));
                    successCount++;
                } else {
                    await this.pool.request().query(statement);
                    successCount++;
                }
            } catch (error) {
                failCount++;
                console.error(chalk.red(`      ❌ Failed: ${error.message}`));
                
                if (options.stopOnError) {
                    throw error;
                }
            }
        }

        console.log(chalk.green(`      ✅ Imported: ${successCount} succeeded, ${failCount} failed`));
    }

    private async importTableData(table: string, rows: any[], options: ImportOptions): Promise<void> {
        if (rows.length === 0) return;

        // Disable triggers and constraints
        await this.pool.request()
            .input('TableName', sql.NVarChar, table)
            .query(`ALTER TABLE [dbo].[${table}] NOCHECK CONSTRAINT ALL`);
        
        await this.pool.request()
            .input('TableName', sql.NVarChar, table)
            .query(`DISABLE TRIGGER ALL ON [dbo].[${table}]`);

        try {
            // Get table columns
            const columnsResult = await this.pool.request()
                .input('TableName', sql.NVarChar, table)
                .query(`
                    SELECT [name] 
                    FROM sys.columns 
                    WHERE [object_id] = OBJECT_ID(@TableName)
                    ORDER BY [column_id]
                `);

            const tableColumns = columnsResult.recordset.map(c => c.name);
            
            // Filter rows to only include valid columns
            const validRows = rows.map(row => {
                const validRow: any = {};
                for (const col of tableColumns) {
                    if (row[col] !== undefined) {
                        validRow[col] = row[col];
                    }
                }
                return validRow;
            });

            // Insert in batches
            const batchSize = options.batchSize || 1000;
            
            for (let i = 0; i < validRows.length; i += batchSize) {
                const batch = validRows.slice(i, i + batchSize);
                await this.insertBatch(table, batch);
                console.log(chalk.white(`      Progress: ${Math.min(i + batchSize, validRows.length)}/${validRows.length} rows`));
            }

            console.log(chalk.green(`      ✅ Imported ${validRows.length} rows into ${table}`));

        } finally {
            // Re-enable triggers and constraints
            await this.pool.request()
                .input('TableName', sql.NVarChar, table)
                .query(`ALTER TABLE [dbo].[${table}] WITH CHECK CHECK CONSTRAINT ALL`);
            
            await this.pool.request()
                .input('TableName', sql.NVarChar, table)
                .query(`ENABLE TRIGGER ALL ON [dbo].[${table}]`);
        }
    }

    private async insertBatch(table: string, rows: any[]): Promise<void> {
        if (rows.length === 0) return;

        const columns = Object.keys(rows[0]);
        
        const tableValued = new sql.Table(table);
        
        // Add columns
        for (const col of columns) {
            tableValued.columns.add(col, sql.NVarChar, { nullable: true });
        }

        // Add rows
        for (const row of rows) {
            tableValued.rows.add(...columns.map(col => row[col] ?? null));
        }

        const request = this.pool.request();
        request.input('data', tableValued);

        await request.query(`
            INSERT INTO [dbo].[${table}] (${columns.map(c => `[${c}]`).join(', ')})
            SELECT ${columns.map(c => `[${c}]`).join(', ')} FROM @data
        `);
    }

    async close(): Promise<void> {
        await this.pool.close();
    }
}

interface ImportOptions {
    dryRun?: boolean;
    verbose?: boolean;
    stopOnError?: boolean;
    batchSize?: number;
}

// CLI Interface
async function main() {
    program
        .name('database-import')
        .description('Import database schema and data')
        .version('1.0.0');

    program
        .command('schema <file>')
        .description('Import database schema from SQL file')
        .option('--dry-run', 'Show what would be imported without executing')
        .option('--stop-on-error', 'Stop execution on first error')
        .option('-v, --verbose', 'Show verbose output')
        .action(async (file, options) => {
            const importer = new DatabaseImport();
            try {
                await importer.initialize();
                await importer.importSchema(file, {
                    dryRun: options.dryRun,
                    verbose: options.verbose,
                    stopOnError: options.stopOnError
                });
            } finally {
                await importer.close();
            }
        });

    program
        .command('data <path>')
        .description('Import data from JSON, CSV, SQL, or directory')
        .option('--dry-run', 'Show what would be imported without executing')
        .option('--stop-on-error', 'Stop execution on first error')
        .option('-b, --batch-size <number>', 'Batch size for inserts', '1000')
        .action(async (path, options) => {
            const importer = new DatabaseImport();
            try {
                await importer.initialize();
                await importer.importData(path, {
                    dryRun: options.dryRun,
                    stopOnError: options.stopOnError,
                    batchSize: parseInt(options.batchSize)
                });
            } finally {
                await importer.close();
            }
        });

    program.parse(process.argv);
}

if (require.main === module) {
    main().catch(console.error);
}

export default DatabaseImport;