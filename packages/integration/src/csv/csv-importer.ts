import { EventEmitter } from 'events';
import { Readable } from 'stream';
import { CSVPort, CSVPortOptions } from './csv-port';
import { Session } from '@nova/core/session';
import { Record } from '@nova/orm/record';
import { Logger } from '@nova/core/utils/logger';

export interface CSVImportOptions extends CSVPortOptions {
    tableName: string;
    batchSize?: number;
    validate?: boolean;
    dryRun?: boolean;
    stopOnError?: boolean;
    fieldMapping?: Record<string, string>;
    onBeforeInsert?: (record: Record<any>, row: any) => Promise<void>;
    onAfterInsert?: (record: Record<any>, row: any) => Promise<void>;
}

export interface CSVImportResult {
    success: boolean;
    total: number;
    imported: number;
    failed: number;
    skipped: number;
    errors: Array<{ row: number; error: string; data?: any }>;
    duration: number;
}

export class CSVImporter extends EventEmitter {
    private csvPort: CSVPort;
    private logger: Logger;

    constructor() {
        super();
        this.csvPort = new CSVPort();
        this.logger = new Logger('CSVImporter');
    }

    async import(
        session: Session,
        csv: string | Buffer | Readable,
        options: CSVImportOptions
    ): Promise<CSVImportResult> {
        const startTime = Date.now();
        const result: CSVImportResult = {
            success: true,
            total: 0,
            imported: 0,
            failed: 0,
            skipped: 0,
            errors: [],
            duration: 0
        };

        try {
            // Parse CSV
            let records: any[];
            
            if (typeof csv === 'string') {
                records = await this.csvPort.parse(csv);
            } else if (Buffer.isBuffer(csv)) {
                records = await this.csvPort.parse(csv.toString());
            } else {
                // Handle stream
                const chunks: Buffer[] = [];
                for await (const chunk of csv) {
                    chunks.push(Buffer.from(chunk));
                }
                const buffer = Buffer.concat(chunks);
                records = await this.csvPort.parse(buffer.toString());
            }

            result.total = records.length;
            this.emit('start', { total: result.total });

            // Apply field mapping
            if (options.fieldMapping) {
                records = records.map(row => this.mapFields(row, options.fieldMapping!));
            }

            // Skip header row if not already handled
            if (!options.header && options.skipRows) {
                records = records.slice(options.skipRows);
            }

            // Process in batches
            const batchSize = options.batchSize || 100;
            
            for (let i = 0; i < records.length; i += batchSize) {
                const batch = records.slice(i, i + batchSize);
                await this.processBatch(session, batch, i, options, result);

                this.emit('progress', {
                    processed: Math.min(i + batchSize, records.length),
                    total: records.length,
                    imported: result.imported,
                    failed: result.failed
                });

                if (result.failed > 0 && options.stopOnError) {
                    break;
                }
            }

            result.duration = Date.now() - startTime;
            result.success = result.failed === 0;

            this.emit('complete', result);
            return result;

        } catch (error) {
            this.logger.error(`CSV import failed: ${error.message}`);
            result.success = false;
            result.errors.push({ row: -1, error: error.message });
            result.duration = Date.now() - startTime;
            return result;
        }
    }

    private async processBatch(
        session: Session,
        batch: any[],
        startIndex: number,
        options: CSVImportOptions,
        result: CSVImportResult
    ): Promise<void> {
        const promises = batch.map(async (row, index) => {
            const rowNumber = startIndex + index + 1;
            
            try {
                // Validate row
                if (options.validate) {
                    const isValid = await this.validateRow(row);
                    if (!isValid) {
                        throw new Error('Row validation failed');
                    }
                }

                // Dry run - skip actual insert
                if (options.dryRun) {
                    result.skipped++;
                    return;
                }

                // Create record
                const record = session.createRecord(options.tableName);

                // Map CSV fields to record fields
                Object.entries(row).forEach(([key, value]) => {
                    if (value !== null && value !== undefined) {
                        record.setField(key, value);
                    }
                });

                // Execute before insert hook
                if (options.onBeforeInsert) {
                    await options.onBeforeInsert(record, row);
                }

                // Insert record
                await record.insert();

                // Execute after insert hook
                if (options.onAfterInsert) {
                    await options.onAfterInsert(record, row);
                }

                result.imported++;

            } catch (error) {
                result.failed++;
                result.errors.push({
                    row: rowNumber,
                    error: error.message,
                    data: row
                });

                this.emit('error', {
                    row: rowNumber,
                    error: error.message,
                    data: row
                });
            }
        });

        await Promise.all(promises);
    }

    private mapFields(row: any, mapping: Record<string, string>): any {
        const mapped: any = {};
        
        Object.entries(row).forEach(([key, value]) => {
            const targetField = mapping[key] || key;
            mapped[targetField] = value;
        });

        return mapped;
    }

    private async validateRow(row: any): Promise<boolean> {
        // Implement row validation logic
        return true;
    }

    async validate(
        csv: string | Buffer,
        options: CSVImportOptions
    ): Promise<CSVImportResult> {
        return this.import(null as any, csv, {
            ...options,
            dryRun: true,
            validate: true
        });
    }
}