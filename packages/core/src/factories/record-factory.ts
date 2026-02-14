import { Session } from '../session';
import { Record } from '@nova/orm/record';

export class RecordFactory {
    private session: Session;

    constructor(session: Session) {
        this.session = session;
    }

    createRecord<T = any>(tableName: string): Record<T> {
        return this.session.createRecord<T>(tableName);
    }

    async createRecordWithData<T = any>(tableName: string, data: Partial<T>): Promise<Record<T>> {
        const record = this.createRecord<T>(tableName);
        Object.assign(record.getData(), data);
        await record.insert();
        return record;
    }

    async getRecord<T = any>(tableName: string, id: string): Promise<Record<T> | null> {
        const record = this.createRecord<T>(tableName);
        const found = await record.find(id);
        return found ? record : null;
    }

    async findRecords<T = any>(
        tableName: string,
        filter?: string
    ): Promise<Record<T>[]> {
        const record = this.createRecord<T>(tableName);
        
        if (filter) {
            record.setFilter(filter);
        }

        await record.findSet();
        return [record]; // This needs to be fixed to return all records
    }

    async deleteRecord(tableName: string, id: string): Promise<boolean> {
        const record = this.createRecord(tableName);
        await record.find(id);
        
        if (!record.isEmpty()) {
            return record.delete();
        }
        
        return false;
    }

    async copyRecord<T = any>(
        tableName: string,
        sourceId: string,
        modifications?: Partial<T>
    ): Promise<Record<T>> {
        const source = await this.getRecord<T>(tableName, sourceId);
        
        if (!source) {
            throw new Error(`Source record not found: ${sourceId}`);
        }

        const target = this.createRecord<T>(tableName);
        
        // Copy all fields
        const sourceData = source.getData();
        Object.assign(target.getData(), sourceData);
        
        // Clear system fields
        target.setField('SystemId', undefined);
        target.setField('SystemCreatedAt', undefined);
        target.setField('SystemCreatedBy', undefined);
        target.setField('SystemRowVersion', undefined);
        
        // Apply modifications
        if (modifications) {
            Object.assign(target.getData(), modifications);
        }

        await target.insert();
        
        return target;
    }
}