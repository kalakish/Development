import { EventEmitter } from 'events';
import { parse } from 'csv-parse';
import { stringify } from 'csv-stringify';
import { Readable, Writable } from 'stream';
import { Logger } from '@nova/core/utils/logger';

export interface CSVPortOptions {
    delimiter?: string;
    quote?: string;
    escape?: string;
    encoding?: string;
    bom?: boolean;
    columns?: string[] | boolean;
    header?: boolean;
    skipEmptyLines?: boolean;
    skipRows?: number;
}

export class CSVPort extends EventEmitter {
    private options: CSVPortOptions;
    private logger: Logger;

    constructor(options: CSVPortOptions = {}) {
        super();
        this.options = {
            delimiter: ',',
            quote: '"',
            escape: '"',
            encoding: 'utf8',
            bom: false,
            header: true,
            skipEmptyLines: true,
            ...options
        };
        this.logger = new Logger('CSVPort');
    }

    createParser(): any {
        return parse({
            delimiter: this.options.delimiter,
            quote: this.options.quote,
            escape: this.options.escape,
            columns: this.options.columns || this.options.header,
            skip_empty_lines: this.options.skipEmptyLines,
            skip_records_with_empty_values: this.options.skipEmptyLines,
            encoding: this.options.encoding
        });
    }

    createStringifier(): any {
        return stringify({
            delimiter: this.options.delimiter,
            quote: this.options.quote,
            escape: this.options.escape,
            header: this.options.header,
            encoding: this.options.encoding,
            bom: this.options.bom
        });
    }

    async parseString(csv: string): Promise<any[]> {
        return new Promise((resolve, reject) => {
            parse(csv, this.options, (err, records) => {
                if (err) reject(err);
                else resolve(records);
            });
        });
    }

    async stringifyData(data: any[]): Promise<string> {
        return new Promise((resolve, reject) => {
            stringify(data, this.options, (err, output) => {
                if (err) reject(err);
                else resolve(output);
            });
        });
    }

    createReadStream(readable: Readable): Readable {
        const parser = this.createParser();
        return readable.pipe(parser);
    }

    createWriteStream(writable: Writable): Writable {
        const stringifier = this.createStringifier();
        return stringifier.pipe(writable);
    }

    async transform<T = any>(data: T[]): Promise<string> {
        return this.stringifyData(data);
    }

    async parse<T = any>(csv: string): Promise<T[]> {
        return this.parseString(csv);
    }
}