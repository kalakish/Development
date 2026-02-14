import sql from 'mssql';
import dotenv from 'dotenv';
import { format } from 'date-fns';
import * as fs from 'fs-extra';
import * as path from 'path';

dotenv.config();

export class DatabaseOptimizer {
    private pool: sql.ConnectionPool;
    private logDir: string;

    constructor() {
        this.pool = new sql.ConnectionPool({
            server: process.env.SQL_SERVER || 'localhost',
            port: parseInt(process.env.SQL_PORT || '1433'),
            database: process.env.SQL_DATABASE || 'NOVA_DB',
            user: process.env.SQL_USER || 'sa',
            password: process.env.SQL_PASSWORD || '',
            options: {
                encrypt: process.env.SQL_ENCRYPT === 'true',
                trustServerCertificate: process.env.SQL_TRUST_SERVER_CERTIFICATE === 'true',
                enableArithAbort: true
            }
        });

        this.logDir = path.join(process.cwd(), 'optimization');
    }

    async initialize(): Promise<void> {
        await this.pool.connect();
        await fs.ensureDir(this.logDir);
        console.log('✅ Connected to SQL Server');
    }

    // ============ Main Optimization ============

    async optimizeAll(options?: OptimizeOptions): Promise<OptimizationReport> {
        console.log('\n🚀 Starting database optimization...');
        
        const report: OptimizationReport = {
            timestamp: new Date(),
            database: this.pool.config.database as string,
            actions: [],
            summary: {
                totalActions: 0,
                successful: 0,
                failed: 0,
                skipped: 0,
                spaceReclaimed: 0,
                duration: 0
            }
        };

        const startTime = Date.now();

        try {
            // Step 1: Update Statistics
            if (options?.updateStatistics !== false) {
                const result = await this.updateStatistics(options);
                report.actions.push(result);
            }

            // Step 2: Rebuild/Reorganize Indexes
            if (options?.indexMaintenance !== false) {
                const result = await this.maintainIndexes(options);
                report.actions.push(result);
            }

            // Step 3: Cleanup Orphaned Records
            if (options?.cleanupOrphans !== false) {
                const result = await this.cleanupOrphanedRecords();
                report.actions.push(result);
            }

            // Step 4: Shrink Database (Optional)
            if (options?.shrinkDatabase) {
                const result = await this.shrinkDatabase(options);
                report.actions.push(result);
            }

            // Step 5: Update Database Settings
            if (options?.optimizeSettings !== false) {
                const result = await this.optimizeSettings();
                report.actions.push(result);
            }

            // Step 6: Cleanup Old Data
            if (options?.cleanupOldData) {
                const result = await this.cleanupOldData(options);
                report.actions.push(result);
            }

            // Step 7: Recompile Stored Procedures
            if (options?.recompileProcs !== false) {
                const result = await this.recompileStoredProcedures();
                report.actions.push(result);
            }

            // Calculate summary
            report.summary = this.calculateSummary(report.actions, startTime);
            
            // Save report
            await this.saveReport(report);

            // Display summary
            this.displaySummary(report);

            return report;

        } catch (error) {
            console.error('❌ Optimization failed:', error.message);
            throw error;
        }
    }

    // ============ Statistics Optimization ============

    private async updateStatistics(options?: OptimizeOptions): Promise<OptimizationAction> {
        console.log('\n📊 Updating statistics...');
        
        const action: OptimizationAction = {
            name: 'Update Statistics',
            status: 'pending',
            startTime: new Date(),
            details: []
        };

        try {
            // Get outdated statistics
            const outdated = await this.pool.request().query(`
                SELECT 
                    OBJECT_NAME(s.object_id) AS TableName,
                    s.name AS StatisticsName,
                    sp.modification_counter,
                    sp.rows
                FROM sys.stats s
                CROSS APPLY sys.dm_db_stats_properties(s.object_id, s.stats_id) sp
                WHERE s.object_id > 255
                    AND sp.modification_counter > ${options?.statisticsThreshold || 1000}
                ORDER BY sp.modification_counter DESC
            `);

            let updated = 0;
            let failed = 0;
            let spaceReclaimed = 0;

            for (const stat of outdated.recordset) {
                try {
                    const detail: ActionDetail = {
                        object: `[${stat.TableName}].[${stat.StatisticsName}]`,
                        action: 'UPDATE STATISTICS',
                        status: 'pending'
                    };

                    await this.pool.request()
                        .input('TableName', sql.NVarChar, stat.TableName)
                        .input('StatisticsName', sql.NVarChar, stat.StatisticsName)
                        .query(`
                            UPDATE STATISTICS [${stat.TableName}] [${stat.StatisticsName}] 
                            WITH FULLSCAN
                        `);

                    detail.status = 'success';
                    updated++;
                    action.details.push(detail);

                } catch (error) {
                    failed++;
                    action.details.push({
                        object: `[${stat.TableName}].[${stat.StatisticsName}]`,
                        action: 'UPDATE STATISTICS',
                        status: 'failed',
                        error: error.message
                    });
                }
            }

            // Also update all statistics with sample rate
            if (options?.updateAllStatistics) {
                await this.pool.request().query(`
                    EXEC sp_updatestats
                `);
                action.details.push({
                    object: 'All Tables',
                    action: 'sp_updatestats',
                    status: 'success'
                });
            }

            action.status = failed === 0 ? 'success' : 'warning';
            action.endTime = new Date();
            action.rowsAffected = updated;
            action.spaceReclaimed = spaceReclaimed;

            console.log(`   ✅ Updated ${updated} statistics, ${failed} failed`);

            return action;

        } catch (error) {
            action.status = 'failed';
            action.endTime = new Date();
            action.error = error.message;
            return action;
        }
    }

    // ============ Index Maintenance ============

    private async maintainIndexes(options?: OptimizeOptions): Promise<OptimizationAction> {
        console.log('\n📇 Maintaining indexes...');
        
        const action: OptimizationAction = {
            name: 'Index Maintenance',
            status: 'pending',
            startTime: new Date(),
            details: []
        };

        try {
            // Get fragmentation stats
            const frag = await this.pool.request().query(`
                SELECT 
                    OBJECT_NAME(ips.object_id) AS TableName,
                    i.name AS IndexName,
                    ips.avg_fragmentation_in_percent,
                    ips.page_count,
                    CASE 
                        WHEN ips.avg_fragmentation_in_percent > 30 THEN 'REBUILD'
                        WHEN ips.avg_fragmentation_in_percent > 5 THEN 'REORGANIZE'
                        ELSE 'IGNORE'
                    END AS Action
                FROM sys.dm_db_index_physical_stats(
                    DB_ID(), NULL, NULL, NULL, 'LIMITED') ips
                INNER JOIN sys.indexes i ON ips.object_id = i.object_id AND ips.index_id = i.index_id
                WHERE ips.avg_fragmentation_in_percent > 5
                    AND ips.page_count > 100
                    AND i.name IS NOT NULL
                ORDER BY ips.avg_fragmentation_in_percent DESC
            `);

            let rebuilt = 0;
            let reorganized = 0;
            let skipped = 0;
            let failed = 0;
            let spaceReclaimed = 0;

            for (const idx of frag.recordset) {
                try {
                    const detail: ActionDetail = {
                        object: `[${idx.TableName}].[${idx.IndexName}]`,
                        action: idx.Action,
                        status: 'pending'
                    };

                    if (idx.Action === 'REBUILD') {
                        const beforeSize = await this.getIndexSize(idx.TableName, idx.IndexName);
                        
                        await this.pool.request()
                            .input('TableName', sql.NVarChar, idx.TableName)
                            .input('IndexName', sql.NVarChar, idx.IndexName)
                            .query(`
                                ALTER INDEX [${idx.IndexName}] ON [${idx.TableName}] REBUILD 
                                WITH (ONLINE = ON, SORT_IN_TEMPDB = ON)
                            `);

                        const afterSize = await this.getIndexSize(idx.TableName, idx.IndexName);
                        spaceReclaimed += Math.max(0, beforeSize - afterSize);
                        rebuilt++;

                    } else if (idx.Action === 'REORGANIZE') {
                        await this.pool.request()
                            .input('TableName', sql.NVarChar, idx.TableName)
                            .input('IndexName', sql.NVarChar, idx.IndexName)
                            .query(`
                                ALTER INDEX [${idx.IndexName}] ON [${idx.TableName}] REORGANIZE
                            `);
                        reorganized++;
                    } else {
                        skipped++;
                    }

                    detail.status = 'success';
                    action.details.push(detail);

                } catch (error) {
                    failed++;
                    action.details.push({
                        object: `[${idx.TableName}].[${idx.IndexName}]`,
                        action: idx.Action,
                        status: 'failed',
                        error: error.message
                    });
                }
            }

            // Check for missing indexes
            if (options?.createMissingIndexes) {
                await this.createMissingIndexes(action);
            }

            // Check for unused indexes
            if (options?.dropUnusedIndexes) {
                await this.dropUnusedIndexes(action);
            }

            action.status = failed === 0 ? 'success' : 'warning';
            action.endTime = new Date();
            action.rowsAffected = rebuilt + reorganized;
            action.spaceReclaimed = spaceReclaimed;

            console.log(`   ✅ Rebuilt: ${rebuilt}, Reorganized: ${reorganized}, Failed: ${failed}`);
            console.log(`   💾 Space reclaimed: ${(spaceReclaimed / 1024 / 1024).toFixed(2)} MB`);

            return action;

        } catch (error) {
            action.status = 'failed';
            action.endTime = new Date();
            action.error = error.message;
            return action;
        }
    }

    private async getIndexSize(tableName: string, indexName: string): Promise<number> {
        const result = await this.pool.request()
            .input('TableName', sql.NVarChar, tableName)
            .input('IndexName', sql.NVarChar, indexName)
            .query(`
                SELECT 
                    SUM(ps.used_page_count) * 8 * 1024 AS SizeBytes
                FROM sys.dm_db_partition_stats ps
                INNER JOIN sys.indexes i ON ps.object_id = i.object_id AND ps.index_id = i.index_id
                WHERE OBJECT_NAME(ps.object_id) = @TableName
                    AND i.name = @IndexName
            `);

        return result.recordset[0]?.SizeBytes || 0;
    }

    private async createMissingIndexes(action: OptimizationAction): Promise<void> {
        const missing = await this.pool.request().query(`
            SELECT TOP 10
                migs.avg_total_user_cost * migs.avg_user_impact * (migs.user_seeks + migs.user_scans) AS Impact,
                mid.statement AS TableName,
                mid.equality_columns,
                mid.inequality_columns,
                mid.included_columns
            FROM sys.dm_db_missing_index_groups mig
            INNER JOIN sys.dm_db_missing_index_group_stats migs ON migs.group_handle = mig.index_group_handle
            INNER JOIN sys.dm_db_missing_index_details mid ON mig.index_handle = mid.index_handle
            WHERE mid.database_id = DB_ID()
            ORDER BY Impact DESC
        `);

        for (const idx of missing.recordset) {
            try {
                const indexName = `IX_${new Date().getTime()}`;
                const columns = [];
                if (idx.equality_columns) columns.push(idx.equality_columns);
                if (idx.inequality_columns) columns.push(idx.inequality_columns);
                
                let sql = `CREATE INDEX [${indexName}] ON ${idx.TableName} (${columns.join(', ')})`;
                if (idx.included_columns) {
                    sql += ` INCLUDE (${idx.included_columns})`;
                }

                await this.pool.request().query(sql);
                
                action.details.push({
                    object: `${idx.TableName} - Impact: ${Math.round(idx.Impact)}`,
                    action: 'CREATE INDEX',
                    status: 'success'
                });

            } catch (error) {
                action.details.push({
                    object: idx.TableName,
                    action: 'CREATE INDEX',
                    status: 'failed',
                    error: error.message
                });
            }
        }
    }

    private async dropUnusedIndexes(action: OptimizationAction): Promise<void> {
        const unused = await this.pool.request().query(`
            SELECT 
                OBJECT_NAME(s.object_id) AS TableName,
                i.name AS IndexName,
                s.user_seeks + s.user_scans + s.user_lookups AS TotalReads,
                s.user_updates AS TotalWrites
            FROM sys.dm_db_index_usage_stats s
            INNER JOIN sys.indexes i ON s.object_id = i.object_id AND s.index_id = i.index_id
            WHERE s.database_id = DB_ID()
                AND i.type_desc != 'CLUSTERED'
                AND i.is_primary_key = 0
                AND i.is_unique_constraint = 0
                AND (s.user_seeks + s.user_scans + s.user_lookups) = 0
                AND s.user_updates > 1000
        `);

        for (const idx of unused.recordset) {
            try {
                await this.pool.request()
                    .input('TableName', sql.NVarChar, idx.TableName)
                    .input('IndexName', sql.NVarChar, idx.IndexName)
                    .query(`
                        DROP INDEX [${idx.IndexName}] ON [${idx.TableName}]
                    `);

                action.details.push({
                    object: `[${idx.TableName}].[${idx.IndexName}]`,
                    action: 'DROP INDEX',
                    status: 'success'
                });

            } catch (error) {
                action.details.push({
                    object: `[${idx.TableName}].[${idx.IndexName}]`,
                    action: 'DROP INDEX',
                    status: 'failed',
                    error: error.message
                });
            }
        }
    }

    // ============ Orphaned Records Cleanup ============

    private async cleanupOrphanedRecords(): Promise<OptimizationAction> {
        console.log('\n🧹 Cleaning up orphaned records...');
        
        const action: OptimizationAction = {
            name: 'Orphaned Records Cleanup',
            status: 'pending',
            startTime: new Date(),
            details: []
        };

        try {
            // Find tables with foreign keys
            const fks = await this.pool.request().query(`
                SELECT 
                    OBJECT_NAME(fk.parent_object_id) AS ChildTable,
                    OBJECT_NAME(fk.referenced_object_id) AS ParentTable,
                    fk.name AS FKName,
                    c.name AS ColumnName
                FROM sys.foreign_keys fk
                INNER JOIN sys.foreign_key_columns fkc ON fk.object_id = fkc.constraint_object_id
                INNER JOIN sys.columns c ON fkc.parent_column_id = c.column_id 
                    AND fkc.parent_object_id = c.object_id
                WHERE fk.delete_referential_action = 0  -- NO ACTION
            `);

            let deleted = 0;

            for (const fk of fks.recordset) {
                try {
                    const result = await this.pool.request()
                        .input('ChildTable', sql.NVarChar, fk.ChildTable)
                        .input('ParentTable', sql.NVarChar, fk.ParentTable)
                        .input('ColumnName', sql.NVarChar, fk.ColumnName)
                        .query(`
                            DELETE FROM [${fk.ChildTable}]
                            WHERE [${fk.ColumnName}] IS NOT NULL
                                AND NOT EXISTS (
                                    SELECT 1 FROM [${fk.ParentTable}] 
                                    WHERE [SystemId] = [${fk.ChildTable}].[${fk.ColumnName}]
                                )
                        `);

                    deleted += result.rowsAffected[0];

                    action.details.push({
                        object: fk.ChildTable,
                        action: 'DELETE ORPHANS',
                        status: 'success',
                        rowsAffected: result.rowsAffected[0]
                    });

                } catch (error) {
                    action.details.push({
                        object: fk.ChildTable,
                        action: 'DELETE ORPHANS',
                        status: 'failed',
                        error: error.message
                    });
                }
            }

            action.status = 'success';
            action.endTime = new Date();
            action.rowsAffected = deleted;

            console.log(`   ✅ Deleted ${deleted} orphaned records`);

            return action;

        } catch (error) {
            action.status = 'failed';
            action.endTime = new Date();
            action.error = error.message;
            return action;
        }
    }

    // ============ Database Shrink ============

    private async shrinkDatabase(options?: OptimizeOptions): Promise<OptimizationAction> {
        console.log('\n📦 Shrinking database...');
        
        const action: OptimizationAction = {
            name: 'Database Shrink',
            status: 'pending',
            startTime: new Date(),
            details: []
        };

        try {
            // Get current size
            const beforeSize = await this.pool.request().query(`
                SELECT 
                    SUM(size * 8.0 / 1024) AS SizeMB
                FROM sys.database_files
            `);

            // Shrink database
            await this.pool.request().query(`
                DBCC SHRINKDATABASE (N'${this.pool.config.database}', ${options?.shrinkTargetPercent || 10})
            `);

            // Get after size
            const afterSize = await this.pool.request().query(`
                SELECT 
                    SUM(size * 8.0 / 1024) AS SizeMB
                FROM sys.database_files
            `);

            const spaceReclaimed = (beforeSize.recordset[0].SizeMB - afterSize.recordset[0].SizeMB) * 1024 * 1024;

            action.status = 'success';
            action.endTime = new Date();
            action.spaceReclaimed = spaceReclaimed;

            action.details.push({
                object: this.pool.config.database,
                action: 'SHRINKDATABASE',
                status: 'success',
                spaceReclaimed: spaceReclaimed
            });

            console.log(`   ✅ Database shrunk: ${afterSize.recordset[0].SizeMB.toFixed(2)} MB (reclaimed ${(spaceReclaimed / 1024 / 1024).toFixed(2)} MB)`);

            return action;

        } catch (error) {
            action.status = 'failed';
            action.endTime = new Date();
            action.error = error.message;
            return action;
        }
    }

    // ============ Database Settings Optimization ============

    private async optimizeSettings(): Promise<OptimizationAction> {
        console.log('\n⚙️ Optimizing database settings...');
        
        const action: OptimizationAction = {
            name: 'Database Settings',
            status: 'pending',
            startTime: new Date(),
            details: []
        };

        try {
            // Enable optimal settings
            await this.pool.request().query(`
                -- Enable auto create statistics
                ALTER DATABASE CURRENT SET AUTO_CREATE_STATISTICS ON;
                
                -- Enable auto update statistics
                ALTER DATABASE CURRENT SET AUTO_UPDATE_STATISTICS ON;
                
                -- Enable auto update statistics async
                ALTER DATABASE CURRENT SET AUTO_UPDATE_STATISTICS_ASYNC ON;
                
                -- Set page verify to CHECKSUM
                ALTER DATABASE CURRENT SET PAGE_VERIFY CHECKSUM;
                
                -- Disable auto shrink
                ALTER DATABASE CURRENT SET AUTO_SHRINK OFF;
                
                -- Enable read committed snapshot
                ALTER DATABASE CURRENT SET READ_COMMITTED_SNAPSHOT ON;
                
                -- Enable snapshot isolation
                ALTER DATABASE CURRENT SET ALLOW_SNAPSHOT_ISOLATION ON;
                
                -- Set recovery model to FULL (for production)
                -- ALTER DATABASE CURRENT SET RECOVERY FULL;
            `);

            action.details.push({
                object: 'Database Settings',
                action: 'OPTIMIZE',
                status: 'success'
            });

            action.status = 'success';
            action.endTime = new Date();

            console.log(`   ✅ Database settings optimized`);

            return action;

        } catch (error) {
            action.status = 'failed';
            action.endTime = new Date();
            action.error = error.message;
            return action;
        }
    }

    // ============ Old Data Cleanup ============

    private async cleanupOldData(options?: OptimizeOptions): Promise<OptimizationAction> {
        console.log('\n🗑️ Cleaning up old data...');
        
        const action: OptimizationAction = {
            name: 'Old Data Cleanup',
            status: 'pending',
            startTime: new Date(),
            details: []
        };

        try {
            const retentionDays = options?.retentionDays || 365;
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

            // Cleanup audit logs
            const auditResult = await this.pool.request()
                .input('CutoffDate', sql.DateTime2, cutoffDate)
                .query(`
                    DELETE FROM [AuditLog]
                    WHERE [ChangedAt] < @CutoffDate
                `);

            if (auditResult.rowsAffected[0] > 0) {
                action.details.push({
                    object: 'AuditLog',
                    action: 'DELETE OLD',
                    status: 'success',
                    rowsAffected: auditResult.rowsAffected[0]
                });
            }

            // Cleanup job queue
            const jobResult = await this.pool.request()
                .input('CutoffDate', sql.DateTime2, cutoffDate)
                .query(`
                    DELETE FROM [JobQueue]
                    WHERE [CompletedAt] < @CutoffDate
                        AND [Status] IN ('completed', 'failed', 'cancelled')
                `);

            if (jobResult.rowsAffected[0] > 0) {
                action.details.push({
                    object: 'JobQueue',
                    action: 'DELETE OLD',
                    status: 'success',
                    rowsAffected: jobResult.rowsAffected[0]
                });
            }

            // Cleanup temp tables
            await this.pool.request().query(`
                IF OBJECT_ID('tempdb..#Temp') IS NOT NULL DROP TABLE #Temp
            `);

            action.status = 'success';
            action.endTime = new Date();
            action.rowsAffected = (auditResult.rowsAffected[0] || 0) + (jobResult.rowsAffected[0] || 0);

            console.log(`   ✅ Deleted ${action.rowsAffected} old records`);

            return action;

        } catch (error) {
            action.status = 'failed';
            action.endTime = new Date();
            action.error = error.message;
            return action;
        }
    }

    // ============ Stored Procedure Recompilation ============

    private async recompileStoredProcedures(): Promise<OptimizationAction> {
        console.log('\n🔄 Recompiling stored procedures...');
        
        const action: OptimizationAction = {
            name: 'Stored Procedure Recompilation',
            status: 'pending',
            startTime: new Date(),
            details: []
        };

        try {
            const result = await this.pool.request().query(`
                SELECT 
                    'EXEC sp_recompile ''' + QUOTENAME(SPECIFIC_SCHEMA) + '.' + QUOTENAME(SPECIFIC_NAME) + '''' AS RecompileCommand
                FROM INFORMATION_SCHEMA.ROUTINES
                WHERE ROUTINE_TYPE = 'PROCEDURE'
                    AND ROUTINE_NAME NOT LIKE 'dt_%'
            `);

            for (const row of result.recordset) {
                try {
                    await this.pool.request().query(row.RecompileCommand);
                    
                    action.details.push({
                        object: row.RecompileCommand.replace('EXEC sp_recompile ', '').replace(/'/g, ''),
                        action: 'RECOMPILE',
                        status: 'success'
                    });

                } catch (error) {
                    action.details.push({
                        object: row.RecompileCommand,
                        action: 'RECOMPILE',
                        status: 'failed',
                        error: error.message
                    });
                }
            }

            action.status = 'success';
            action.endTime = new Date();

            console.log(`   ✅ Recompiled ${action.details.length} stored procedures`);

            return action;

        } catch (error) {
            action.status = 'failed';
            action.endTime = new Date();
            action.error = error.message;
            return action;
        }
    }

    // ============ Helper Methods ============

    private calculateSummary(actions: OptimizationAction[], startTime: number): OptimizationSummary {
        const summary: OptimizationSummary = {
            totalActions: actions.length,
            successful: actions.filter(a => a.status === 'success').length,
            failed: actions.filter(a => a.status === 'failed').length,
            skipped: actions.filter(a => a.status === 'skipped').length,
            warning: actions.filter(a => a.status === 'warning').length,
            spaceReclaimed: actions.reduce((sum, a) => sum + (a.spaceReclaimed || 0), 0),
            duration: Date.now() - startTime
        };

        return summary;
    }

    private async saveReport(report: OptimizationReport): Promise<void> {
        const timestamp = format(report.timestamp, 'yyyyMMdd_HHmmss');
        const filename = `optimization_${report.database}_${timestamp}.json`;
        const filepath = path.join(this.logDir, filename);

        await fs.writeJson(filepath, report, { spaces: 2 });
        console.log(`\n📊 Optimization report saved to: ${filepath}`);

        // Save HTML report
        const htmlFilepath = filepath.replace('.json', '.html');
        await this.saveHtmlReport(report, htmlFilepath);
        console.log(`📊 HTML report saved to: ${htmlFilepath}`);
    }

    private async saveHtmlReport(report: OptimizationReport, filepath: string): Promise<void> {
        const html = this.generateHtmlReport(report);
        await fs.writeFile(filepath, html);
    }

    private generateHtmlReport(report: OptimizationReport): string {
        const spaceReclaimedMB = report.summary.spaceReclaimed / 1024 / 1024;
        
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Database Optimization Report - ${report.database}</title>
    <style>
        body {
            font-family: 'Segoe UI', Arial, sans-serif;
            margin: 30px;
            background-color: #f5f5f5;
        }
        .container {
            max-width: 1200px;
            margin: 0 auto;
            background-color: white;
            padding: 30px;
            border-radius: 8px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        h1, h2, h3 {
            color: #2c3e50;
        }
        .header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 30px;
            padding-bottom: 20px;
            border-bottom: 2px solid #e9ecef;
        }
        .badge {
            display: inline-block;
            padding: 6px 12px;
            border-radius: 4px;
            font-weight: bold;
            color: white;
        }
        .badge.success { background-color: #28a745; }
        .badge.warning { background-color: #ffc107; color: #333; }
        .badge.failed { background-color: #dc3545; }
        
        .summary-cards {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 20px;
            margin-bottom: 30px;
        }
        .card {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 20px;
            border-radius: 8px;
        }
        .card-title {
            font-size: 14px;
            opacity: 0.9;
            margin-bottom: 10px;
        }
        .card-value {
            font-size: 32px;
            font-weight: bold;
        }
        
        .action {
            margin-bottom: 20px;
            border: 1px solid #dee2e6;
            border-radius: 6px;
            overflow: hidden;
        }
        .action-header {
            background-color: #f8f9fa;
            padding: 15px 20px;
            border-bottom: 1px solid #dee2e6;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        .action-details {
            padding: 20px;
        }
        
        table {
            width: 100%;
            border-collapse: collapse;
        }
        th {
            background-color: #e9ecef;
            padding: 10px;
            text-align: left;
        }
        td {
            padding: 10px;
            border-bottom: 1px solid #dee2e6;
        }
        
        .success-row { background-color: #f0fff4; }
        .failed-row { background-color: #fff5f5; }
        .warning-row { background-color: #fff9e6; }
        
        .footer {
            margin-top: 30px;
            padding-top: 20px;
            border-top: 1px solid #dee2e6;
            text-align: center;
            color: #6c757d;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>Database Optimization Report</h1>
            <span class="badge ${report.summary.failed > 0 ? 'failed' : 'success'}">
                ${report.summary.failed > 0 ? 'PARTIAL' : 'SUCCESS'}
            </span>
        </div>
        
        <div class="summary-cards">
            <div class="card">
                <div class="card-title">Database</div>
                <div class="card-value">${report.database}</div>
                <div style="margin-top: 10px; font-size: 14px;">${new Date(report.timestamp).toLocaleString()}</div>
            </div>
            <div class="card" style="background: linear-gradient(135deg, #28a745 0%, #218838 100%);">
                <div class="card-title">Space Reclaimed</div>
                <div class="card-value">${spaceReclaimedMB.toFixed(2)} MB</div>
                <div style="margin-top: 10px; font-size: 14px;">Free space recovered</div>
            </div>
            <div class="card" style="background: linear-gradient(135deg, #007bff 0%, #0056b3 100%);">
                <div class="card-title">Actions</div>
                <div class="card-value">${report.summary.totalActions}</div>
                <div style="margin-top: 10px; font-size: 14px;">
                    ✅ ${report.summary.successful} | ⚠️ ${report.summary.warning} | ❌ ${report.summary.failed}
                </div>
            </div>
            <div class="card" style="background: linear-gradient(135deg, #ffc107 0%, #e0a800 100%); color: #333;">
                <div class="card-title">Duration</div>
                <div class="card-value">${(report.summary.duration / 1000).toFixed(1)}s</div>
                <div style="margin-top: 10px; font-size: 14px;">${(report.summary.duration / 1000 / 60).toFixed(1)} minutes</div>
            </div>
        </div>
        
        <h2>📋 Optimization Actions</h2>
        
        ${report.actions.map(action => `
            <div class="action">
                <div class="action-header">
                    <h3 style="margin: 0;">${action.name}</h3>
                    <span class="badge ${action.status}">${action.status}</span>
                </div>
                <div class="action-details">
                    <p><strong>Started:</strong> ${new Date(action.startTime).toLocaleTimeString()}</p>
                    ${action.endTime ? `<p><strong>Completed:</strong> ${new Date(action.endTime).toLocaleTimeString()}</p>` : ''}
                    ${action.rowsAffected ? `<p><strong>Rows Affected:</strong> ${action.rowsAffected.toLocaleString()}</p>` : ''}
                    ${action.spaceReclaimed ? `<p><strong>Space Reclaimed:</strong> ${(action.spaceReclaimed / 1024 / 1024).toFixed(2)} MB</p>` : ''}
                    ${action.error ? `<p style="color: #dc3545;"><strong>Error:</strong> ${action.error}</p>` : ''}
                    
                    ${action.details.length > 0 ? `
                        <h4>Details</h4>
                        <table>
                            <thead>
                                <tr>
                                    <th>Object</th>
                                    <th>Action</th>
                                    <th>Status</th>
                                    <th>Rows</th>
                                    <th>Space</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${action.details.map(detail => `
                                    <tr class="${detail.status}-row">
                                        <td>${detail.object}</td>
                                        <td>${detail.action}</td>
                                        <td><span class="badge ${detail.status}">${detail.status}</span></td>
                                        <td>${detail.rowsAffected?.toLocaleString() || '-'}</td>
                                        <td>${detail.spaceReclaimed ? (detail.spaceReclaimed / 1024 / 1024).toFixed(2) + ' MB' : '-'}</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    ` : ''}
                </div>
            </div>
        `).join('')}
        
        <div class="footer">
            Generated: ${new Date().toLocaleString()}<br>
            NOVA Framework Database Optimizer
        </div>
    </div>
</body>
</html>`;
    }

    private displaySummary(report: OptimizationReport): void {
        console.log('\n' + '='.repeat(80));
        console.log(`📊 DATABASE OPTIMIZATION REPORT`.padStart(45));
        console.log('='.repeat(80));
        console.log(`Database: ${report.database}`);
        console.log(`Timestamp: ${report.timestamp.toLocaleString()}`);
        console.log(`Duration: ${(report.summary.duration / 1000).toFixed(1)}s`);
        console.log('-'.repeat(80));
        console.log(`Actions: ${report.summary.totalActions} (✅ ${report.summary.successful}, ⚠️ ${report.summary.warning}, ❌ ${report.summary.failed})`);
        console.log(`Space Reclaimed: ${(report.summary.spaceReclaimed / 1024 / 1024).toFixed(2)} MB`);
        console.log('='.repeat(80));
        
        for (const action of report.actions) {
            const statusIcon = action.status === 'success' ? '✅' : action.status === 'warning' ? '⚠️' : '❌';
            console.log(`\n${statusIcon} ${action.name} - ${action.status.toUpperCase()}`);
            
            if (action.rowsAffected) {
                console.log(`   Rows: ${action.rowsAffected.toLocaleString()}`);
            }
            if (action.spaceReclaimed) {
                console.log(`   Space: ${(action.spaceReclaimed / 1024 / 1024).toFixed(2)} MB`);
            }
            if (action.error) {
                console.log(`   Error: ${action.error}`);
            }
        }
    }

    async close(): Promise<void> {
        await this.pool.close();
    }
}

export interface OptimizeOptions {
    updateStatistics?: boolean;
    statisticsThreshold?: number;
    updateAllStatistics?: boolean;
    indexMaintenance?: boolean;
    createMissingIndexes?: boolean;
    dropUnusedIndexes?: boolean;
    cleanupOrphans?: boolean;
    shrinkDatabase?: boolean;
    shrinkTargetPercent?: number;
    optimizeSettings?: boolean;
    cleanupOldData?: boolean;
    retentionDays?: number;
    recompileProcs?: boolean;
}

export interface OptimizationReport {
    timestamp: Date;
    database: string;
    actions: OptimizationAction[];
    summary: OptimizationSummary;
}

export interface OptimizationAction {
    name: string;
    status: 'pending' | 'success' | 'warning' | 'failed' | 'skipped';
    startTime: Date;
    endTime?: Date;
    details: ActionDetail[];
    rowsAffected?: number;
    spaceReclaimed?: number;
    error?: string;
}

export interface ActionDetail {
    object: string;
    action: string;
    status: 'pending' | 'success' | 'warning' | 'failed' | 'skipped';
    rowsAffected?: number;
    spaceReclaimed?: number;
    error?: string;
}

export interface OptimizationSummary {
    totalActions: number;
    successful: number;
    failed: number;
    skipped: number;
    warning: number;
    spaceReclaimed: number;
    duration: number;
}

// CLI Interface
async function main() {
    const command = process.argv[2];
    const optimizer = new DatabaseOptimizer();

    try {
        await optimizer.initialize();

        switch (command) {
            case 'all':
                await optimizer.optimizeAll({
                    updateStatistics: true,
                    indexMaintenance: true,
                    cleanupOrphans: true,
                    optimizeSettings: true,
                    cleanupOldData: true,
                    recompileProcs: true,
                    retentionDays: 365
                });
                break;

            case 'quick':
                await optimizer.optimizeAll({
                    updateStatistics: true,
                    indexMaintenance: true,
                    cleanupOrphans: true,
                    optimizeSettings: true,
                    createMissingIndexes: false,
                    dropUnusedIndexes: false,
                    shrinkDatabase: false,
                    cleanupOldData: false,
                    recompileProcs: false
                });
                break;

            case 'statistics':
                await optimizer.updateStatistics({ updateAllStatistics: true });
                break;

            case 'indexes':
                await optimizer.maintainIndexes({ 
                    createMissingIndexes: true,
                    dropUnusedIndexes: true 
                });
                break;

            case 'cleanup':
                await optimizer.cleanupOldData({ retentionDays: 365 });
                break;

            case 'shrink':
                await optimizer.shrinkDatabase({ shrinkTargetPercent: 10 });
                break;

            case 'settings':
                await optimizer.optimizeSettings();
                break;

            case 'orphans':
                await optimizer.cleanupOrphanedRecords();
                break;

            case 'recompile':
                await optimizer.recompileStoredProcedures();
                break;

            default:
                console.log(`
Database Optimization Tool for SQL Server

Commands:
  all                  Run all optimizations (complete)
  quick                Quick optimization (safe)
  statistics           Update statistics only
  indexes              Maintain indexes only
  cleanup              Cleanup old data only
  shrink               Shrink database (use with caution)
  settings             Optimize database settings
  orphans              Cleanup orphaned records
  recompile            Recompile stored procedures

Options:
  --retention-days     Data retention period (default: 365)
  --shrink-target      Target free space percentage (default: 10)
                `);
        }

    } catch (error) {
        console.error('❌ Optimization failed:', error.message);
        process.exit(1);
    } finally {
        await optimizer.close();
    }
}

if (require.main === module) {
    main().catch(console.error);
}

export default DatabaseOptimizer;