import { EventEmitter } from 'events';
import { CSVPort, CSVPortOptions } from './csv-port';
import { Session } from '@nova/core/session';
import { Record } from '@nova/orm/record';
import { Logger } from '@nova/core/utils/logger';

export interface CSVExportOptions extends CSVPortOptions {
    tableName: string;
    filter?: string;
    fields?: string[];
    batchSize?: number;
    filename?: string;
    onBeforeRow?: (row: any) => Promise<any>;
}

export interface CSVExportResult {
    success: boolean;
    total: number;
    exported: number;
    filename?: string;
    data?: string;
    duration: number;
}

export class CSVExporter extends EventEmitter {
    private csvPort: CSVPort;
    private logger: Logger;

    constructor() {
        super();
        this.csvPort = new CSVPort();
        this.logger = new Logger('CSVExporter');
    }

    async export(
        session: Session,
        options: CSVExportOptions
    ): Promise<CSVExportResult> {
        const startTime = Date.now();
        const result: CSVExportResult = {
            success: true,
            total: 0,
            exported: 0,
            duration: 0
        };

        try {
            // Get total count
            const countRecord = session.createRecord(options.tableName);
            if (options.filter) {
                countRecord.setFilter(options.filter);
            }
            await countRecord.findSet();
            result.total = countRecord.getRecordCount();

            this.emit('start', { total: result.total });

            // Fetch records
            const record = session.createRecord(options.tableName);
            if (options.filter) {
                record.setFilter(options.filter);
            }

            const records = await record.findSet();
            let exportedData: any[] = [];

            // Process in batches
            const batchSize = options.batchSize || 1000;
            
            for (let i = 0; i < records.length; i += batchSize) {
                const batch = records.slice(i, i + batchSize);
                const rows = await this.processBatch(batch, options);
                exportedData = exportedData.concat(rows);

                this.emit('progress', {
                    processed: Math.min(i + batchSize, records.length),
                    total: records.length
                });
            }

            // Filter fields if specified
            if (options.fields && options.fields.length > 0) {
                exportedData = exportedData.map(row => {
                    const filtered: any = {};
                    options.fields!.forEach(field => {
                        filtered[field] = row[field];
                    });
                    return filtered;
                });
            }

            // Generate CSV
            const csv = await this.csvPort.stringifyData(exportedData);
            
            result.exported = exportedData.length;
            result.data = csv;
            result.filename = options.filename || `${options.tableName}_${Date.now()}.csv`;
            result.duration = Date.now() - startTime;

            this.emit('complete', result);
            return result;

        } catch (error) {
            this.logger.error(`CSV export failed: ${error.message}`);
            result.success = false;
            result.duration = Date.now() - startTime;
            return result;
        }
    }

    private async processBatch(
        batch: any[],
        options: CSVExportOptions
    ): Promise<any[]> {
        const rows: any[] = [];

        for (const record of batch) {
            let row = { ...record };

            // Apply transformation
            if (options.onBeforeRow) {
                row = await options.onBeforeRow(row);
            }

            rows.push(row);
        }

        return rows;
    }

    async exportToFile(
        session: Session,
        filepath: string,
        options: CSVExportOptions
    ): Promise<CSVExportResult> {
        const result = await this.export(session, {
            ...options,
            filename: filepath
        });

        if (result.data) {
            const fs = await import('fs-extra');
            await fs.writeFile(filepath, result.data);
        }

        return result;
    }
}