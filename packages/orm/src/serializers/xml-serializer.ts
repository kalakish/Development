import { Record } from '../record';
import { Parser, Builder } from 'xml2js';
import { DateTime } from '@nova/core/data-types/datetime';
import { Decimal } from '@nova/core/data-types/decimal';

export class XMLSerializer {
    private builder: Builder;
    private parser: Parser;

    constructor() {
        this.builder = new Builder({
            rootName: 'Record',
            xmldec: { version: '1.0', encoding: 'UTF-8' },
            renderOpts: { pretty: true, indent: '  ' }
        });

        this.parser = new Parser({
            explicitArray: false,
            explicitRoot: false,
            mergeAttrs: true
        });
    }

    serialize(record: Record<any>, rootName?: string): string {
        const data = record.getData();
        const xmlObj = this.serializeValue(data, rootName);
        return this.builder.buildObject(xmlObj);
    }

    private serializeValue(value: any, rootName?: string): any {
        if (value === null || value === undefined) {
            return null;
        }

        if (value instanceof DateTime) {
            return value.toISOString();
        }

        if (value instanceof Decimal) {
            return value.toString();
        }

        if (value instanceof Date) {
            return value.toISOString();
        }

        if (Buffer.isBuffer(value)) {
            return value.toString('base64');
        }

        if (Array.isArray(value)) {
            return {
                [rootName || 'Item']: value.map(v => this.serializeValue(v))
            };
        }

        if (typeof value === 'object') {
            const obj: any = {};
            for (const [key, val] of Object.entries(value)) {
                obj[key] = this.serializeValue(val);
            }
            return obj;
        }

        return value;
    }

    async deserialize<T = any>(xml: string): Promise<T> {
        const data = await this.parser.parseStringPromise(xml);
        return this.deserializeValue(data);
    }

    private deserializeValue(value: any): any {
        if (value === null || value === undefined) {
            return null;
        }

        if (typeof value === 'object') {
            if (Array.isArray(value)) {
                return value.map(v => this.deserializeValue(v));
            }

            const obj: any = {};
            for (const [key, val] of Object.entries(value)) {
                obj[key] = this.deserializeValue(val);
            }
            return obj;
        }

        // Try to parse dates
        if (typeof value === 'string') {
            const dateRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;
            if (dateRegex.test(value)) {
                return new Date(value);
            }

            // Try to parse numbers
            if (!isNaN(Number(value)) && value.trim() !== '') {
                return Number(value);
            }
        }

        return value;
    }

    serializeCollection(records: Record<any>[]): string {
        const data = records.map(r => this.serializeValue(r.getData()));
        return this.builder.buildObject({ Records: { Record: data } });
    }

    async deserializeCollection<T = any>(xml: string): Promise<T[]> {
        const data = await this.parser.parseStringPromise(xml);
        if (data.Records && data.Records.Record) {
            const records = Array.isArray(data.Records.Record) 
                ? data.Records.Record 
                : [data.Records.Record];
            return records.map(r => this.deserializeValue(r));
        }
        return [];
    }
}