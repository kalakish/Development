import sql from 'mssql';
import dotenv from 'dotenv';
import { format } from 'date-fns';
import * as fs from 'fs-extra';
import * as path from 'path';

dotenv.config();

export class DatabaseAnalyzer {
    private pool: sql.ConnectionPool;
    private outputDir: string;

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

        this.outputDir = path.join(process.cwd(), 'analysis');
    }

    async initialize(): Promise<void> {
        await this.pool.connect();
        await fs.ensureDir(this.outputDir);
        console.log('✅ Connected to SQL Server');
    }

    // ============ Main Analysis ============

    async analyzeAll(options?: AnalyzeOptions): Promise<AnalysisReport> {
        console.log('\n🔍 Starting comprehensive database analysis...');
        
        const report: AnalysisReport = {
            timestamp: new Date(),
            database: this.pool.config.database as string,
            server: this.pool.config.server as string,
            summary: {
                status: 'healthy',
                issues: 0,
                recommendations: 0
            },
            sections: {}
        };

        try {
            // Run all analyses
            report.sections.databaseInfo = await this.analyzeDatabaseInfo();
            report.sections.performance = await this.analyzePerformance();
            report.sections.storage = await this.analyzeStorage();
            report.sections.indexes = await this.analyzeIndexes();
            report.sections.tables = await this.analyzeTables();
            report.sections.queries = await this.analyzeQueries();
            report.sections.fragmentation = await this.analyzeFragmentation();
            report.sections.statistics = await this.analyzeStatistics();
            report.sections.blocking = await this.analyzeBlocking();
            report.sections.waitStats = await this.analyzeWaitStats();
            report.sections.health = await this.analyzeHealth();
            report.sections.security = await this.analyzeSecurity();
            report.sections.backup = await this.analyzeBackupStatus();

            // Calculate summary
            report.summary = this.calculateSummary(report);
            
            // Generate recommendations
            report.recommendations = this.generateRecommendations(report);
            
            // Save report
            if (options?.saveReport) {
                await this.saveReport(report);
            }

            // Display summary
            this.displaySummary(report);

            return report;

        } catch (error) {
            console.error('❌ Analysis failed:', error.message);
            throw error;
        }
    }

    // ============ Database Information ============

    private async analyzeDatabaseInfo(): Promise<AnalysisSection> {
        const section: AnalysisSection = {
            title: 'Database Information',
            status: 'healthy',
            metrics: [],
            issues: []
        };

        // Get database properties
        const dbInfo = await this.pool.request().query(`
            SELECT 
                DB_NAME() AS DatabaseName,
                DATABASEPROPERTYEX(DB_NAME(), 'Version') AS Version,
                DATABASEPROPERTYEX(DB_NAME(), 'Collation') AS Collation,
                DATABASEPROPERTYEX(DB_NAME(), 'IsAutoClose') AS AutoClose,
                DATABASEPROPERTYEX(DB_NAME(), 'IsAutoShrink') AS AutoShrink,
                DATABASEPROPERTYEX(DB_NAME(), 'IsAutoCreateStatistics') AS AutoCreateStats,
                DATABASEPROPERTYEX(DB_NAME(), 'IsAutoUpdateStatistics') AS AutoUpdateStats,
                DATABASEPROPERTYEX(DB_NAME(), 'IsFulltextEnabled') AS FullTextEnabled,
                DATABASEPROPERTYEX(DB_NAME(), 'IsTrustworthyOn') AS Trustworthy,
                DATABASEPROPERTYEX(DB_NAME(), 'Recovery') AS RecoveryModel,
                DATABASEPROPERTYEX(DB_NAME(), 'Status') AS Status,
                DATABASEPROPERTYEX(DB_NAME(), 'Updateability') AS Updateability,
                DATABASEPROPERTYEX(DB_NAME(), 'UserAccess') AS UserAccess
        `);

        const info = dbInfo.recordset[0];
        
        section.metrics.push(
            { name: 'Database Name', value: info.DatabaseName, threshold: 'N/A', status: 'healthy' },
            { name: 'Version', value: info.Version, threshold: 'N/A', status: 'healthy' },
            { name: 'Collation', value: info.Collation, threshold: 'N/A', status: 'healthy' },
            { name: 'Recovery Model', value: info.RecoveryModel, threshold: 'FULL', status: info.RecoveryModel === 'FULL' ? 'healthy' : 'warning' },
            { name: 'Status', value: info.Status, threshold: 'ONLINE', status: info.Status === 'ONLINE' ? 'healthy' : 'critical' }
        );

        // Check for issues
        if (info.AutoClose === 1) {
            section.issues.push({
                severity: 'warning',
                message: 'Auto Close is enabled - can cause performance issues',
                recommendation: 'Disable Auto Close for better performance'
            });
        }

        if (info.AutoShrink === 1) {
            section.issues.push({
                severity: 'warning',
                message: 'Auto Shrink is enabled - can cause fragmentation',
                recommendation: 'Disable Auto Shrink and manually manage file sizes'
            });
        }

        if (info.AutoCreateStats === 0) {
            section.issues.push({
                severity: 'warning',
                message: 'Auto Create Statistics is disabled',
                recommendation: 'Enable Auto Create Statistics for better query performance'
            });
        }

        if (info.AutoUpdateStats === 0) {
            section.issues.push({
                severity: 'warning',
                message: 'Auto Update Statistics is disabled',
                recommendation: 'Enable Auto Update Statistics for optimal query plans'
            });
        }

        section.status = section.issues.length === 0 ? 'healthy' : 'warning';
        
        return section;
    }

    // ============ Performance Analysis ============

    private async analyzePerformance(): Promise<AnalysisSection> {
        const section: AnalysisSection = {
            title: 'Performance Metrics',
            status: 'healthy',
            metrics: [],
            issues: []
        };

        // Get performance counters
        const perf = await this.pool.request().query(`
            SELECT 
                (SELECT cntr_value FROM sys.dm_os_performance_counters 
                 WHERE counter_name = 'Batch Requests/sec' 
                 AND object_name LIKE '%:SQL Statistics%') AS BatchRequests,
                
                (SELECT cntr_value FROM sys.dm_os_performance_counters 
                 WHERE counter_name = 'SQL Compilations/sec' 
                 AND object_name LIKE '%:SQL Statistics%') AS Compilations,
                
                (SELECT cntr_value FROM sys.dm_os_performance_counters 
                 WHERE counter_name = 'SQL Re-Compilations/sec' 
                 AND object_name LIKE '%:SQL Statistics%') AS ReCompilations,
                
                (SELECT cntr_value FROM sys.dm_os_performance_counters 
                 WHERE counter_name = 'Page Splits/sec' 
                 AND object_name LIKE '%:Access Methods%') AS PageSplits,
                
                (SELECT cntr_value FROM sys.dm_os_performance_counters 
                 WHERE counter_name = 'Page life expectancy' 
                 AND object_name LIKE '%:Buffer Manager%') AS PageLifeExpectancy,
                
                (SELECT cntr_value FROM sys.dm_os_performance_counters 
                 WHERE counter_name = 'Lazy Writes/sec' 
                 AND object_name LIKE '%:Buffer Manager%') AS LazyWrites,
                
                (SELECT cntr_value FROM sys.dm_os_performance_counters 
                 WHERE counter_name = 'Free pages' 
                 AND object_name LIKE '%:Buffer Manager%') AS FreePages
        `);

        const stats = perf.recordset[0];

        // Calculate metrics
        const compileRatio = stats.Compilations / nullif(stats.BatchRequests, 0) * 100;
        const recompileRatio = stats.ReCompilations / nullif(stats.BatchRequests, 0) * 100;

        section.metrics.push(
            { name: 'Batch Requests/sec', value: stats.BatchRequests, threshold: '>1000', status: stats.BatchRequests > 1000 ? 'healthy' : 'warning' },
            { name: 'Compile Ratio', value: `${compileRatio.toFixed(2)}%`, threshold: '<10%', status: compileRatio < 10 ? 'healthy' : 'warning' },
            { name: 'Recompile Ratio', value: `${recompileRatio.toFixed(2)}%`, threshold: '<5%', status: recompileRatio < 5 ? 'healthy' : 'warning' },
            { name: 'Page Life Expectancy', value: stats.PageLifeExpectancy, threshold: '>300', status: stats.PageLifeExpectancy > 300 ? 'healthy' : 'warning' },
            { name: 'Page Splits/sec', value: stats.PageSplits, threshold: '<50', status: stats.PageSplits < 50 ? 'healthy' : 'warning' }
        );

        // Check for issues
        if (stats.PageLifeExpectancy < 300) {
            section.issues.push({
                severity: 'critical',
                message: `Low Page Life Expectancy: ${stats.PageLifeExpectancy}`,
                recommendation: 'Increase server memory or reduce memory pressure'
            });
        }

        if (compileRatio > 10) {
            section.issues.push({
                severity: 'warning',
                message: `High compilation ratio: ${compileRatio.toFixed(2)}%`,
                recommendation: 'Review and optimize query patterns, use parameterized queries'
            });
        }

        if (stats.PageSplits > 50) {
            section.issues.push({
                severity: 'warning',
                message: `High page splits: ${stats.PageSplits}/sec`,
                recommendation: 'Review index fill factor and update statistics'
            });
        }

        section.status = section.issues.some(i => i.severity === 'critical') ? 'critical' : 
                        section.issues.length > 0 ? 'warning' : 'healthy';

        return section;
    }

    // ============ Storage Analysis ============

    private async analyzeStorage(): Promise<AnalysisSection> {
        const section: AnalysisSection = {
            title: 'Storage Analysis',
            status: 'healthy',
            metrics: [],
            issues: []
        };

        // Get file sizes
        const files = await this.pool.request().query(`
            SELECT 
                name,
                type_desc AS FileType,
                size * 8.0 / 1024 AS SizeMB,
                FILEPROPERTY(name, 'SpaceUsed') * 8.0 / 1024 AS UsedMB,
                (size - FILEPROPERTY(name, 'SpaceUsed')) * 8.0 / 1024 AS FreeMB,
                growth * 8.0 / 1024 AS GrowthMB,
                is_percent_growth,
                physical_name
            FROM sys.database_files
        `);

        let totalSize = 0;
        let totalUsed = 0;
        let totalFree = 0;

        for (const file of files.recordset) {
            const usedPercent = (file.UsedMB / file.SizeMB) * 100;
            const freePercent = 100 - usedPercent;

            section.metrics.push({
                name: `${file.name} (${file.FileType})`,
                value: `${file.SizeMB.toFixed(2)} MB`,
                threshold: 'N/A',
                status: freePercent > 20 ? 'healthy' : 'warning'
            });

            totalSize += file.SizeMB;
            totalUsed += file.UsedMB;
            totalFree += file.FreeMB;

            // Check for auto-growth issues
            if (file.is_percent_growth && file.GrowthMB > 1024) {
                section.issues.push({
                    severity: 'warning',
                    message: `${file.name} uses percentage auto-growth with large value`,
                    recommendation: 'Switch to fixed MB growth (recommended: 256-512 MB)'
                });
            }
        }

        const freePercent = (totalFree / totalSize) * 100;

        section.metrics.push({
            name: 'Total Database Size',
            value: `${totalSize.toFixed(2)} MB`,
            threshold: 'N/A',
            status: 'healthy'
        });

        section.metrics.push({
            name: 'Free Space',
            value: `${totalFree.toFixed(2)} MB (${freePercent.toFixed(1)}%)',
            threshold: '>20%',
            status: freePercent > 20 ? 'healthy' : 'critical'
        });

        if (freePercent < 10) {
            section.issues.push({
                severity: 'critical',
                message: `Critically low free space: ${freePercent.toFixed(1)}%`,
                recommendation: 'Extend database files immediately or free up space'
            });
        } else if (freePercent < 20) {
            section.issues.push({
                severity: 'warning',
                message: `Low free space: ${freePercent.toFixed(1)}%`,
                recommendation: 'Plan to extend database files soon'
            });
        }

        return section;
    }

    // ============ Index Analysis ============

    private async analyzeIndexes(): Promise<AnalysisSection> {
        const section: AnalysisSection = {
            title: 'Index Analysis',
            status: 'healthy',
            metrics: [],
            issues: []
        };

        // Get index usage statistics
        const indexes = await this.pool.request().query(`
            SELECT 
                OBJECT_NAME(s.object_id) AS TableName,
                i.name AS IndexName,
                i.type_desc AS IndexType,
                s.user_seeks,
                s.user_scans,
                s.user_lookups,
                s.user_updates,
                s.last_user_seek,
                s.last_user_scan,
                s.last_user_lookup,
                s.last_user_update,
                CASE 
                    WHEN s.user_seeks + s.user_scans + s.user_lookups = 0 THEN 0
                    ELSE (s.user_updates * 1.0) / (s.user_seeks + s.user_scans + s.user_lookups)
                END AS UpdateRatio
            FROM sys.dm_db_index_usage_stats s
            INNER JOIN sys.indexes i ON s.object_id = i.object_id AND s.index_id = i.index_id
            WHERE s.database_id = DB_ID()
                AND OBJECTPROPERTY(s.object_id, 'IsUserTable') = 1
            ORDER BY (s.user_seeks + s.user_scans + s.user_lookups) ASC
        `);

        // Find unused indexes
        const unusedIndexes = indexes.recordset.filter(i => 
            (i.user_seeks + i.user_scans + i.user_lookups) === 0 && 
            i.user_updates > 0
        );

        // Find high maintenance indexes
        const highMaintenance = indexes.recordset.filter(i => 
            i.UpdateRatio > 10 && 
            (i.user_seeks + i.user_scans + i.user_lookups) < 100
        );

        // Get missing indexes
        const missingIndexes = await this.pool.request().query(`
            SELECT 
                migs.avg_total_user_cost * migs.avg_user_impact * (migs.user_seeks + migs.user_scans) AS Impact,
                migs.avg_total_user_cost,
                migs.avg_user_impact,
                migs.user_seeks,
                migs.user_scans,
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

        section.metrics.push(
            { name: 'Total Indexes', value: indexes.recordset.length, threshold: 'N/A', status: 'healthy' },
            { name: 'Unused Indexes', value: unusedIndexes.length, threshold: '0', status: unusedIndexes.length === 0 ? 'healthy' : 'warning' },
            { name: 'Missing Indexes', value: missingIndexes.recordset.length, threshold: '<5', status: missingIndexes.recordset.length < 5 ? 'healthy' : 'warning' },
            { name: 'High Maintenance Indexes', value: highMaintenance.length, threshold: '<3', status: highMaintenance.length < 3 ? 'healthy' : 'warning' }
        );

        // Report unused indexes
        for (const idx of unusedIndexes.slice(0, 10)) {
            section.issues.push({
                severity: 'warning',
                message: `Unused index: [${idx.TableName}].[${idx.IndexName}] (${idx.user_updates} updates, 0 reads)`,
                recommendation: `Consider dropping this index if not needed`
            });
        }

        // Report missing indexes
        for (const idx of missingIndexes.recordset.slice(0, 10)) {
            const columns = [];
            if (idx.equality_columns) columns.push(`Equality: ${idx.equality_columns}`);
            if (idx.inequality_columns) columns.push(`Inequality: ${idx.inequality_columns}`);
            if (idx.included_columns) columns.push(`Include: ${idx.included_columns}`);

            section.issues.push({
                severity: 'info',
                message: `Missing index on ${idx.TableName} with impact ${Math.round(idx.Impact)}`,
                recommendation: `Create index: ${columns.join(', ')}`
            });
        }

        section.status = unusedIndexes.length > 10 || missingIndexes.recordset.length > 10 ? 'warning' : 'healthy';

        return section;
    }

    // ============ Table Analysis ============

    private async analyzeTables(): Promise<AnalysisSection> {
        const section: AnalysisSection = {
            title: 'Table Analysis',
            status: 'healthy',
            metrics: [],
            issues: []
        };

        // Get table sizes and row counts
        const tables = await this.pool.request().query(`
            SELECT 
                t.NAME AS TableName,
                p.rows AS RowCounts,
                SUM(a.total_pages) * 8 AS TotalSpaceKB,
                SUM(a.used_pages) * 8 AS UsedSpaceKB,
                (SUM(a.total_pages) - SUM(a.used_pages)) * 8 AS UnusedSpaceKB
            FROM sys.tables t
            INNER JOIN sys.indexes i ON t.object_id = i.object_id
            INNER JOIN sys.partitions p ON i.object_id = p.object_id AND i.index_id = p.index_id
            INNER JOIN sys.allocation_units a ON p.partition_id = a.container_id
            WHERE t.is_ms_shipped = 0 AND i.object_id > 255
            GROUP BY t.NAME, p.rows
            ORDER BY SUM(a.total_pages) DESC
        `);

        let totalRows = 0;
        let totalSizeMB = 0;

        for (const table of tables.recordset) {
            const sizeMB = table.TotalSpaceKB / 1024;
            totalRows += table.RowCounts;
            totalSizeMB += sizeMB;

            // Check for oversized tables
            if (sizeMB > 10240) { // > 10 GB
                section.issues.push({
                    severity: 'warning',
                    message: `Large table: ${table.TableName} (${sizeMB.toFixed(2)} MB, ${table.RowCounts.toLocaleString()} rows)`,
                    recommendation: 'Consider partitioning or archiving old data'
                });
            }

            // Check for table without clustered index
            // This would require additional query
        }

        section.metrics.push(
            { name: 'Total Tables', value: tables.recordset.length, threshold: 'N/A', status: 'healthy' },
            { name: 'Total Rows', value: totalRows.toLocaleString(), threshold: 'N/A', status: 'healthy' },
            { name: 'Total Data Size', value: `${totalSizeMB.toFixed(2)} MB`, threshold: 'N/A', status: 'healthy' },
            { name: 'Average Table Size', value: `${(totalSizeMB / tables.recordset.length).toFixed(2)} MB`, threshold: '<1000', status: 'healthy' }
        );

        return section;
    }

    // ============ Fragmentation Analysis ============

    private async analyzeFragmentation(): Promise<AnalysisSection> {
        const section: AnalysisSection = {
            title: 'Fragmentation Analysis',
            status: 'healthy',
            metrics: [],
            issues: []
        };

        // Get fragmentation stats
        const frag = await this.pool.request().query(`
            SELECT 
                OBJECT_NAME(ips.object_id) AS TableName,
                i.name AS IndexName,
                ips.index_type_desc,
                ips.avg_fragmentation_in_percent,
                ips.fragment_count,
                ips.avg_fragment_size_in_pages,
                ips.page_count
            FROM sys.dm_db_index_physical_stats(
                DB_ID(), NULL, NULL, NULL, 'LIMITED') ips
            INNER JOIN sys.indexes i ON ips.object_id = i.object_id AND ips.index_id = i.index_id
            WHERE ips.avg_fragmentation_in_percent > 5
                AND ips.page_count > 1000
            ORDER BY ips.avg_fragmentation_in_percent DESC
        `);

        const highFragmentation = frag.recordset.filter(f => f.avg_fragmentation_in_percent > 30);
        const moderateFragmentation = frag.recordset.filter(f => 
            f.avg_fragmentation_in_percent > 5 && f.avg_fragmentation_in_percent <= 30
        );

        section.metrics.push(
            { name: 'Fragmented Indexes (>30%)', value: highFragmentation.length, threshold: '0', status: highFragmentation.length === 0 ? 'healthy' : 'critical' },
            { name: 'Fragmented Indexes (5-30%)', value: moderateFragmentation.length, threshold: '<10', status: moderateFragmentation.length < 10 ? 'healthy' : 'warning' },
            { name: 'Average Fragmentation', value: `${(frag.recordset.reduce((sum, f) => sum + f.avg_fragmentation_in_percent, 0) / nullif(frag.recordset.length, 0)).toFixed(2)}%`, threshold: '<5%', status: 'info' }
        );

        // Report high fragmentation
        for (const f of highFragmentation.slice(0, 10)) {
            section.issues.push({
                severity: 'critical',
                message: `High fragmentation: [${f.TableName}].[${f.IndexName}] - ${f.avg_fragmentation_in_percent.toFixed(2)}% (${f.page_count} pages)`,
                recommendation: f.avg_fragmentation_in_percent > 30 ? 'Rebuild index' : 'Reorganize index'
            });
        }

        section.status = highFragmentation.length > 0 ? 'critical' : 
                        moderateFragmentation.length > 10 ? 'warning' : 'healthy';

        return section;
    }

    // ============ Statistics Analysis ============

    private async analyzeStatistics(): Promise<AnalysisSection> {
        const section: AnalysisSection = {
            title: 'Statistics Analysis',
            status: 'healthy',
            metrics: [],
            issues: []
        };

        // Get outdated statistics
        const stats = await this.pool.request().query(`
            SELECT 
                OBJECT_NAME(s.object_id) AS TableName,
                s.name AS StatisticsName,
                sp.last_updated,
                sp.rows,
                sp.rows_sampled,
                sp.modification_counter,
                CASE 
                    WHEN sp.modification_counter > 1000 THEN 'Critical'
                    WHEN sp.modification_counter > 500 THEN 'Warning'
                    ELSE 'OK'
                END AS Status
            FROM sys.stats s
            CROSS APPLY sys.dm_db_stats_properties(s.object_id, s.stats_id) sp
            WHERE s.object_id > 255
                AND sp.modification_counter > 500
            ORDER BY sp.modification_counter DESC
        `);

        const outdatedStats = stats.recordset.filter(s => s.modification_counter > 1000);
        const agingStats = stats.recordset.filter(s => s.modification_counter > 500 && s.modification_counter <= 1000);

        section.metrics.push(
            { name: 'Outdated Statistics (>1000 mods)', value: outdatedStats.length, threshold: '0', status: outdatedStats.length === 0 ? 'healthy' : 'critical' },
            { name: 'Aging Statistics (500-1000 mods)', value: agingStats.length, threshold: '<10', status: agingStats.length < 10 ? 'healthy' : 'warning' }
        );

        for (const stat of outdatedStats.slice(0, 10)) {
            section.issues.push({
                severity: 'critical',
                message: `Outdated statistics: [${stat.TableName}].[${stat.StatisticsName}] - ${stat.modification_counter} modifications since last update`,
                recommendation: 'Update statistics immediately'
            });
        }

        return section;
    }

    // ============ Blocking Analysis ============

    private async analyzeBlocking(): Promise<AnalysisSection> {
        const section: AnalysisSection = {
            title: 'Blocking Analysis',
            status: 'healthy',
            metrics: [],
            issues: []
        };

        // Get blocking chains
        const blocking = await this.pool.request().query(`
            SELECT 
                blocking.session_id AS BlockingSessionId,
                blocking.login_name AS BlockingLogin,
                blocked.session_id AS BlockedSessionId,
                blocked.login_name AS BlockedLogin,
                blocking_text.text AS BlockingQuery,
                blocked_text.text AS BlockedQuery,
                blocking.wait_time / 1000 AS WaitTimeSeconds,
                blocking.wait_type,
                blocking.last_wait_type
            FROM sys.dm_exec_requests blocking
            INNER JOIN sys.dm_exec_requests blocked 
                ON blocking.session_id = blocked.blocking_session_id
            CROSS APPLY sys.dm_exec_sql_text(blocking.sql_handle) blocking_text
            CROSS APPLY sys.dm_exec_sql_text(blocked.sql_handle) blocked_text
            WHERE blocking.blocking_session_id IS NULL
        `);

        section.metrics.push({
            name: 'Active Blocking Chains',
            value: blocking.recordset.length,
            threshold: '0',
            status: blocking.recordset.length === 0 ? 'healthy' : 'critical'
        });

        for (const block of blocking.recordset) {
            section.issues.push({
                severity: 'critical',
                message: `Blocking chain: Session ${block.BlockingSessionId} (${block.BlockingLogin}) blocking session ${block.BlockedSessionId} for ${block.WaitTimeSeconds} seconds`,
                recommendation: 'Kill blocking session or optimize query'
            });
        }

        return section;
    }

    // ============ Wait Statistics Analysis ============

    private async analyzeWaitStats(): Promise<AnalysisSection> {
        const section: AnalysisSection = {
            title: 'Wait Statistics',
            status: 'healthy',
            metrics: [],
            issues: []
        };

        // Get top wait types
        const waits = await this.pool.request().query(`
            SELECT TOP 10
                wait_type,
                wait_time_ms / 1000 AS wait_time_seconds,
                waiting_tasks_count,
                wait_time_ms / NULLIF(waiting_tasks_count, 0) AS avg_wait_ms,
                max_wait_time_ms / 1000 AS max_wait_seconds,
                signal_wait_time_ms / 1000 AS signal_wait_seconds
            FROM sys.dm_os_wait_stats
            WHERE wait_type NOT LIKE '%SLEEP%'
                AND wait_type NOT LIKE '%IDLE%'
                AND waiting_tasks_count > 0
            ORDER BY wait_time_ms DESC
        `);

        const criticalWaits = ['PAGEIOLATCH_', 'WRITELOG', 'ASYNC_IO_COMPLETION', 'LCK_M_'];

        for (const wait of waits.recordset) {
            section.metrics.push({
                name: wait.wait_type,
                value: `${wait.wait_time_seconds.toFixed(2)}s`,
                threshold: '<300s',
                status: criticalWaits.some(cw => wait.wait_type.startsWith(cw)) && wait.wait_time_seconds > 300 ? 'critical' : 'info'
            });

            if (criticalWaits.some(cw => wait.wait_type.startsWith(cw)) && wait.wait_time_seconds > 300) {
                section.issues.push({
                    severity: 'critical',
                    message: `High ${wait.wait_type} wait time: ${wait.wait_time_seconds.toFixed(2)}s`,
                    recommendation: this.getWaitRecommendation(wait.wait_type)
                });
            }
        }

        return section;
    }

    // ============ Health Analysis ============

    private async analyzeHealth(): Promise<AnalysisSection> {
        const section: AnalysisSection = {
            title: 'Database Health',
            status: 'healthy',
            metrics: [],
            issues: []
        };

        // Check database state
        const state = await this.pool.request().query(`
            SELECT 
                state_desc,
                user_access_desc,
                recovery_model_desc,
                page_verify_option_desc,
                is_auto_close_on,
                is_auto_shrink_on,
                is_auto_create_stats_on,
                is_auto_update_stats_on,
                is_read_only
            FROM sys.databases
            WHERE name = DB_NAME()
        `);

        const dbState = state.recordset[0];

        section.metrics.push(
            { name: 'Database State', value: dbState.state_desc, threshold: 'ONLINE', status: dbState.state_desc === 'ONLINE' ? 'healthy' : 'critical' },
            { name: 'User Access', value: dbState.user_access_desc, threshold: 'MULTI_USER', status: dbState.user_access_desc === 'MULTI_USER' ? 'healthy' : 'warning' },
            { name: 'Page Verify', value: dbState.page_verify_option_desc, threshold: 'CHECKSUM', status: dbState.page_verify_option_desc === 'CHECKSUM' ? 'healthy' : 'warning' },
            { name: 'Auto Create Stats', value: dbState.is_auto_create_stats_on ? 'ON' : 'OFF', threshold: 'ON', status: dbState.is_auto_create_stats_on ? 'healthy' : 'warning' },
            { name: 'Auto Update Stats', value: dbState.is_auto_update_stats_on ? 'ON' : 'OFF', threshold: 'ON', status: dbState.is_auto_update_stats_on ? 'healthy' : 'warning' }
        );

        if (dbState.state_desc !== 'ONLINE') {
            section.issues.push({
                severity: 'critical',
                message: `Database is ${dbState.state_desc}`,
                recommendation: 'Bring database online immediately'
            });
        }

        if (dbState.page_verify_option_desc !== 'CHECKSUM') {
            section.issues.push({
                severity: 'warning',
                message: `Page verify option is ${dbState.page_verify_option_desc}`,
                recommendation: 'Set page verify to CHECKSUM for data integrity'
            });
        }

        return section;
    }

    // ============ Security Analysis ============

    private async analyzeSecurity(): Promise<AnalysisSection> {
        const section: AnalysisSection = {
            title: 'Security Analysis',
            status: 'healthy',
            metrics: [],
            issues: []
        };

        // Check for security issues
        const security = await this.pool.request().query(`
            -- Find users with excessive permissions
            SELECT 
                princ.name AS UserName,
                princ.type_desc AS UserType,
                perm.permission_name,
                perm.state_desc,
                perm.class_desc,
                OBJECT_NAME(perm.major_id) AS ObjectName
            FROM sys.database_principals princ
            INNER JOIN sys.database_permissions perm 
                ON princ.principal_id = perm.grantee_principal_id
            WHERE princ.name NOT IN ('dbo', 'sys', 'INFORMATION_SCHEMA')
                AND perm.permission_name IN ('CONTROL', 'ALTER', 'IMPERSONATE', 'SELECT', 'INSERT', 'UPDATE', 'DELETE')
                AND perm.state_desc = 'GRANT_WITH_GRANT'
        `);

        const orphanedUsers = await this.pool.request().query(`
            SELECT dp.name AS OrphanedUser
            FROM sys.database_principals dp
            LEFT JOIN sys.server_principals sp ON dp.sid = sp.sid
            WHERE dp.type IN ('S', 'U')
                AND dp.principal_id > 4
                AND sp.sid IS NULL
        `);

        section.metrics.push(
            { name: 'Users with Admin Rights', value: security.recordset.length, threshold: '<3', status: security.recordset.length < 3 ? 'healthy' : 'warning' },
            { name: 'Orphaned Users', value: orphanedUsers.recordset.length, threshold: '0', status: orphanedUsers.recordset.length === 0 ? 'healthy' : 'critical' }
        );

        for (const user of security.recordset) {
            section.issues.push({
                severity: 'warning',
                message: `User '${user.UserName}' has ${user.permission_name} WITH GRANT option on ${user.class_desc} ${user.ObjectName || ''}`,
                recommendation: 'Review and restrict excessive permissions'
            });
        }

        for (const user of orphanedUsers.recordset) {
            section.issues.push({
                severity: 'critical',
                message: `Orphaned user: ${user.OrphanedUser}`,
                recommendation: 'Drop orphaned user or remap to valid login'
            });
        }

        return section;
    }

    // ============ Backup Status Analysis ============

    private async analyzeBackupStatus(): Promise<AnalysisSection> {
        const section: AnalysisSection = {
            title: 'Backup Status',
            status: 'healthy',
            metrics: [],
            issues: []
        };

        // Get latest backup info
        const backups = await this.pool.request().query(`
            SELECT 
                database_name,
                MAX(CASE WHEN type = 'D' THEN backup_start_date END) AS LastFullBackup,
                MAX(CASE WHEN type = 'I' THEN backup_start_date END) AS LastDifferentialBackup,
                MAX(CASE WHEN type = 'L' THEN backup_start_date END) AS LastLogBackup,
                COUNT(CASE WHEN type = 'D' THEN 1 END) AS FullBackupCount,
                COUNT(CASE WHEN type = 'I' THEN 1 END) AS DiffBackupCount,
                COUNT(CASE WHEN type = 'L' THEN 1 END) AS LogBackupCount
            FROM msdb.dbo.backupset
            WHERE database_name = DB_NAME()
            GROUP BY database_name
        `);

        if (backups.recordset.length === 0) {
            section.issues.push({
                severity: 'critical',
                message: 'No backups found for this database',
                recommendation: 'Configure immediate backup strategy'
            });
        } else {
            const backup = backups.recordset[0];
            const now = new Date();
            const lastFull = backup.LastFullBackup ? new Date(backup.LastFullBackup) : null;
            const lastLog = backup.LastLogBackup ? new Date(backup.LastLogBackup) : null;
            
            const daysSinceFull = lastFull ? (now.getTime() - lastFull.getTime()) / (1000 * 60 * 60 * 24) : 999;
            const hoursSinceLog = lastLog ? (now.getTime() - lastLog.getTime()) / (1000 * 60 * 60) : 999;

            section.metrics.push(
                { name: 'Last Full Backup', value: lastFull?.toLocaleString() || 'Never', threshold: '<7 days', status: daysSinceFull < 7 ? 'healthy' : 'critical' },
                { name: 'Last Log Backup', value: lastLog?.toLocaleString() || 'Never', threshold: '<24 hours', status: hoursSinceLog < 24 ? 'healthy' : 'critical' },
                { name: 'Full Backups', value: backup.FullBackupCount, threshold: '>0', status: 'info' },
                { name: 'Log Backups', value: backup.LogBackupCount, threshold: '>0', status: 'info' }
            );

            if (daysSinceFull >= 7) {
                section.issues.push({
                    severity: 'critical',
                    message: `No full backup in ${Math.round(daysSinceFull)} days`,
                    recommendation: 'Perform full backup immediately'
                });
            }

            if (hoursSinceLog >= 24) {
                section.issues.push({
                    severity: 'warning',
                    message: `No log backup in ${Math.round(hoursSinceLog)} hours`,
                    recommendation: 'Schedule more frequent log backups'
                });
            }
        }

        return section;
    }

    // ============ Helper Methods ============

    private calculateSummary(report: AnalysisReport): AnalysisSummary {
        let totalIssues = 0;
        let criticalIssues = 0;
        let warningIssues = 0;
        let infoIssues = 0;
        let totalRecommendations = 0;

        for (const section of Object.values(report.sections)) {
            for (const issue of section.issues || []) {
                totalIssues++;
                switch (issue.severity) {
                    case 'critical': criticalIssues++; break;
                    case 'warning': warningIssues++; break;
                    case 'info': infoIssues++; break;
                }
            }
            totalRecommendations += section.issues?.filter(i => i.recommendation).length || 0;
        }

        const overallStatus = criticalIssues > 0 ? 'critical' :
                             warningIssues > 5 ? 'warning' :
                             'healthy';

        return {
            status: overallStatus,
            issues: totalIssues,
            criticalIssues,
            warningIssues,
            infoIssues,
            recommendations: totalRecommendations,
            score: this.calculateHealthScore(report)
        };
    }

    private calculateHealthScore(report: AnalysisReport): number {
        let score = 100;
        
        // Deduct points for issues
        for (const section of Object.values(report.sections)) {
            for (const issue of section.issues || []) {
                switch (issue.severity) {
                    case 'critical': score -= 10; break;
                    case 'warning': score -= 5; break;
                    case 'info': score -= 1; break;
                }
            }
        }

        return Math.max(0, score);
    }

    private generateRecommendations(report: AnalysisReport): Recommendation[] {
        const recommendations: Recommendation[] = [];

        for (const section of Object.values(report.sections)) {
            for (const issue of section.issues || []) {
                if (issue.recommendation) {
                    recommendations.push({
                        section: section.title,
                        issue: issue.message,
                        recommendation: issue.recommendation,
                        severity: issue.severity,
                        estimatedEffort: this.estimateEffort(issue.severity)
                    });
                }
            }
        }

        // Sort by severity
        return recommendations.sort((a, b) => {
            const severityOrder = { critical: 0, warning: 1, info: 2 };
            return severityOrder[a.severity] - severityOrder[b.severity];
        });
    }

    private estimateEffort(severity: string): 'Low' | 'Medium' | 'High' {
        switch (severity) {
            case 'critical': return 'High';
            case 'warning': return 'Medium';
            default: return 'Low';
        }
    }

    private getWaitRecommendation(waitType: string): string {
        if (waitType.startsWith('PAGEIOLATCH_')) {
            return 'Consider adding memory, improving indexes, or moving to faster storage';
        }
        if (waitType === 'WRITELOG') {
            return 'Move transaction log to faster storage, reduce log activity, or batch transactions';
        }
        if (waitType.startsWith('LCK_M_')) {
            return 'Review blocking queries, optimize transactions, and consider snapshot isolation';
        }
        return 'Investigate and optimize the specific wait type';
    }

    private async saveReport(report: AnalysisReport): Promise<void> {
        const timestamp = format(report.timestamp, 'yyyyMMdd_HHmmss');
        const filename = `analysis_${report.database}_${timestamp}.json`;
        const filepath = path.join(this.outputDir, filename);

        await fs.writeJson(filepath, report, { spaces: 2 });
        console.log(`\n📊 Report saved to: ${filepath}`);

        // Also save as HTML
        const htmlFilepath = filepath.replace('.json', '.html');
        await this.saveHtmlReport(report, htmlFilepath);
        console.log(`📊 HTML report saved to: ${htmlFilepath}`);
    }

    private async saveHtmlReport(report: AnalysisReport, filepath: string): Promise<void> {
        const html = this.generateHtmlReport(report);
        await fs.writeFile(filepath, html);
    }

    private generateHtmlReport(report: AnalysisReport): string {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Database Analysis Report - ${report.database}</title>
    <style>
        body {
            font-family: 'Segoe UI', Arial, sans-serif;
            margin: 30px;
            background-color: #f5f5f5;
            color: #333;
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
        .badge.healthy { background-color: #28a745; }
        .badge.warning { background-color: #ffc107; color: #333; }
        .badge.critical { background-color: #dc3545; }
        
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
            box-shadow: 0 4px 6px rgba(0,0,0,0.1);
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
        
        .section {
            margin-bottom: 30px;
            border: 1px solid #dee2e6;
            border-radius: 6px;
            overflow: hidden;
        }
        .section-header {
            background-color: #f8f9fa;
            padding: 15px 20px;
            border-bottom: 1px solid #dee2e6;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        .section-content {
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
        
        .issue-critical { border-left: 4px solid #dc3545; background-color: #fff5f5; }
        .issue-warning { border-left: 4px solid #ffc107; background-color: #fff9e6; }
        .issue-info { border-left: 4px solid #17a2b8; background-color: #e3f2fd; }
        
        .recommendation {
            background-color: #d1ecf1;
            border-left: 4px solid #17a2b8;
            padding: 10px;
            margin-top: 10px;
        }
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
            <h1>Database Analysis Report</h1>
            <span class="badge ${report.summary.status}">
                ${report.summary.status.toUpperCase()}
            </span>
        </div>
        
        <div class="summary-cards">
            <div class="card">
                <div class="card-title">Database</div>
                <div class="card-value">${report.database}</div>
                <div style="margin-top: 10px; font-size: 14px;">${report.server}</div>
            </div>
            <div class="card" style="background: linear-gradient(135deg, #6b8cce 0%, #4a69bd 100%);">
                <div class="card-title">Health Score</div>
                <div class="card-value">${report.summary.score}%</div>
                <div style="margin-top: 10px; font-size: 14px;">${report.summary.status}</div>
            </div>
            <div class="card" style="background: linear-gradient(135deg, #e74c3c 0%, #c0392b 100%);">
                <div class="card-title">Issues</div>
                <div class="card-value">${report.summary.issues}</div>
                <div style="margin-top: 10px; font-size: 14px;">
                    Critical: ${report.summary.criticalIssues} | Warning: ${report.summary.warningIssues}
                </div>
            </div>
            <div class="card" style="background: linear-gradient(135deg, #f39c12 0%, #e67e22 100%);">
                <div class="card-title">Recommendations</div>
                <div class="card-value">${report.summary.recommendations}</div>
                <div style="margin-top: 10px; font-size: 14px;">Action required</div>
            </div>
        </div>
        
        <div class="recommendations">
            <h2>⚠️ Recommendations</h2>
            ${report.recommendations.map(rec => `
                <div class="recommendation">
                    <strong>[${rec.severity.toUpperCase()}] ${rec.section}</strong><br>
                    ${rec.issue}<br>
                    <span style="color: #0066cc;">→ ${rec.recommendation}</span><br>
                    <small>Estimated effort: ${rec.estimatedEffort}</small>
                </div>
            `).join('')}
        </div>
        
        ${Object.entries(report.sections).map(([key, section]) => `
            <div class="section">
                <div class="section-header">
                    <h3>${section.title}</h3>
                    <span class="badge ${section.status}">${section.status}</span>
                </div>
                <div class="section-content">
                    ${section.metrics.length > 0 ? `
                        <table>
                            <thead>
                                <tr>
                                    <th>Metric</th>
                                    <th>Value</th>
                                    <th>Threshold</th>
                                    <th>Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${section.metrics.map(metric => `
                                    <tr>
                                        <td>${metric.name}</td>
                                        <td>${metric.value}</td>
                                        <td>${metric.threshold}</td>
                                        <td><span class="badge ${metric.status}">${metric.status}</span></td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    ` : ''}
                    
                    ${section.issues.length > 0 ? `
                        <h4>Issues Found</h4>
                        ${section.issues.map(issue => `
                            <div class="issue-${issue.severity}" style="padding: 10px; margin-bottom: 10px;">
                                <strong>${issue.severity.toUpperCase()}</strong>: ${issue.message}<br>
                                ${issue.recommendation ? `<span style="color: #0066cc;">→ ${issue.recommendation}</span>` : ''}
                            </div>
                        `).join('')}
                    ` : ''}
                </div>
            </div>
        `).join('')}
        
        <div class="footer">
            Generated: ${report.timestamp.toLocaleString()}<br>
            NOVA Framework Database Analyzer
        </div>
    </div>
</body>
</html>`;
    }

    private displaySummary(report: AnalysisReport): void {
        console.log('\n' + '='.repeat(80));
        console.log(`📊 DATABASE ANALYSIS REPORT`.padStart(45));
        console.log('='.repeat(80));
        console.log(`Database: ${report.database}@${report.server}`);
        console.log(`Timestamp: ${report.timestamp.toLocaleString()}`);
        console.log(`Health Score: ${report.summary.score}% - ${report.summary.status.toUpperCase()}`);
        console.log('-'.repeat(80));
        console.log(`Issues: ${report.summary.issues} (Critical: ${report.summary.criticalIssues}, Warning: ${report.summary.warningIssues}, Info: ${report.summary.infoIssues})`);
        console.log(`Recommendations: ${report.summary.recommendations}`);
        console.log('='.repeat(80));
        
        if (report.summary.criticalIssues > 0) {
            console.log('\n🔴 CRITICAL ISSUES:');
            for (const rec of report.recommendations) {
                if (rec.severity === 'critical') {
                    console.log(`   • [${rec.section}] ${rec.issue}`);
                    console.log(`     → ${rec.recommendation}`);
                }
            }
        }
        
        if (report.summary.warningIssues > 0) {
            console.log('\n🟡 WARNING ISSUES:');
            for (const rec of report.recommendations) {
                if (rec.severity === 'warning') {
                    console.log(`   • [${rec.section}] ${rec.issue}`);
                }
            }
        }
    }

    async close(): Promise<void> {
        await this.pool.close();
    }
}

export interface AnalyzeOptions {
    saveReport?: boolean;
    sections?: string[];
    outputFormat?: 'json' | 'html' | 'both';
}

export interface AnalysisReport {
    timestamp: Date;
    database: string;
    server: string;
    summary: AnalysisSummary;
    sections: Record<string, AnalysisSection>;
    recommendations?: Recommendation[];
}

export interface AnalysisSummary {
    status: 'healthy' | 'warning' | 'critical';
    issues: number;
    criticalIssues: number;
    warningIssues: number;
    infoIssues: number;
    recommendations: number;
    score: number;
}

export interface AnalysisSection {
    title: string;
    status: 'healthy' | 'warning' | 'critical' | 'info';
    metrics: Metric[];
    issues: Issue[];
}

export interface Metric {
    name: string;
    value: string | number;
    threshold: string;
    status: 'healthy' | 'warning' | 'critical' | 'info';
}

export interface Issue {
    severity: 'critical' | 'warning' | 'info';
    message: string;
    recommendation?: string;
}

export interface Recommendation {
    section: string;
    issue: string;
    recommendation: string;
    severity: string;
    estimatedEffort: 'Low' | 'Medium' | 'High';
}

// Helper function to handle division by zero
function nullif(value: number, compare: number): number {
    return value === compare ? 1 : value;
}

// CLI Interface
async function main() {
    const command = process.argv[2];
    const analyzer = new DatabaseAnalyzer();

    try {
        await analyzer.initialize();

        switch (command) {
            case 'analyze':
                await analyzer.analyzeAll({ saveReport: true });
                break;

            case 'quick':
                // Quick analysis - only critical sections
                const report = await analyzer.analyzeAll({ saveReport: true });
                console.log('\n✅ Quick analysis completed');
                break;

            case 'health':
                const health = await analyzer.analyzeHealth();
                console.log('\n🏥 Database Health Status:', health.status);
                health.issues.forEach(i => console.log(`   ${i.severity}: ${i.message}`));
                break;

            case 'performance':
                const perf = await analyzer.analyzePerformance();
                console.log('\n⚡ Performance Analysis:', perf.status);
                perf.metrics.forEach(m => console.log(`   ${m.name}: ${m.value} [${m.status}]`));
                break;

            case 'indexes':
                const idx = await analyzer.analyzeIndexes();
                console.log('\n📇 Index Analysis:', idx.status);
                idx.issues.slice(0, 10).forEach(i => console.log(`   ${i.severity}: ${i.message}`));
                break;

            default:
                console.log(`
Database Analysis Tool for SQL Server

Commands:
  analyze              Run full database analysis
  quick                Quick health check
  health               Check database health only
  performance          Analyze performance metrics
  indexes              Analyze index usage
  fragmentation        Analyze index fragmentation
  storage              Analyze storage usage
  security             Analyze security settings
  backup               Analyze backup status
                `);
        }

    } catch (error) {
        console.error('❌ Analysis failed:', error.message);
        process.exit(1);
    } finally {
        await analyzer.close();
    }
}

if (require.main === module) {
    main().catch(console.error);
}

export default DatabaseAnalyzer;