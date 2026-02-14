import { Record } from '../record';
import { DateTime } from '@nova/core/data-types/datetime';
import { Decimal } from '@nova/core/data-types/decimal';
import { Code } from '@nova/core/data-types/code';
import { Option } from '@nova/core/data-types/option';

export class JSONSerializer {
    serialize(record: Record<any>): string {
        const data = record.getData();
        const serialized = this.serializeValue(data);
        return JSON.stringify(serialized, null, 2);
    }

    serializeValue(value: any): any {
        if (value === null || value === undefined) {
            return null;
        }

        if (value instanceof DateTime) {
            return {
                __type: 'DateTime',
                value: value.toISOString()
            };
        }

        if (value instanceof Decimal) {
            return {
                __type: 'Decimal',
                value: value.toString(),
                precision: 18,
                scale: 2
            };
        }

        if (value instanceof Code) {
            return {
                __type: 'Code',
                value: value.toString(),
                maxLength: value['maxLength']
            };
        }

        if (value instanceof Option) {
            return {
                __type: 'Option',
                value: value.getValue(),
                name: value.getName()
            };
        }

        if (value instanceof Date) {
            return {
                __type: 'Date',
                value: value.toISOString()
            };
        }

        if (Buffer.isBuffer(value)) {
            return {
                __type: 'Blob',
                value: value.toString('base64'),
                size: value.length
            };
        }

        if (Array.isArray(value)) {
            return value.map(v => this.serializeValue(v));
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

    deserialize<T = any>(json: string): T {
        const data = JSON.parse(json);
        return this.deserializeValue(data);
    }

    deserializeValue(value: any): any {
        if (value === null || value === undefined) {
            return null;
        }

        if (typeof value === 'object' && value.__type) {
            switch (value.__type) {
                case 'DateTime':
                    return new DateTime(value.value);
                case 'Decimal':
                    return new Decimal(value.value, value.precision, value.scale);
                case 'Code':
                    return new Code(value.value, value.maxLength);
                case 'Option':
                    // Option needs metadata to deserialize properly
                    return value.value;
                case 'Date':
                    return new Date(value.value);
                case 'Blob':
                    return Buffer.from(value.value, 'base64');
                default:
                    return value;
            }
        }

        if (Array.isArray(value)) {
            return value.map(v => this.deserializeValue(v));
        }

        if (typeof value === 'object') {
            const obj: any = {};
            for (const [key, val] of Object.entries(value)) {
                obj[key] = this.deserializeValue(val);
            }
            return obj;
        }

        return value;
    }

    serializeCollection(records: Record<any>[]): string {
        const data = records.map(r => this.serializeValue(r.getData()));
        return JSON.stringify(data, null, 2);
    }

    deserializeCollection<T = any>(json: string): T[] {
        const data = JSON.parse(json);
        return Array.isArray(data) ? data.map(d => this.deserializeValue(d)) : [];
    }
}