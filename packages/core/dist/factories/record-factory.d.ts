import { Session } from '../session';
import { Record } from '@nova/orm/record';
export declare class RecordFactory {
    private session;
    constructor(session: Session);
    createRecord<T = any>(tableName: string): Record<T>;
    createRecordWithData<T = any>(tableName: string, data: Partial<T>): Promise<Record<T>>;
    getRecord<T = any>(tableName: string, id: string): Promise<Record<T> | null>;
    findRecords<T = any>(tableName: string, filter?: string): Promise<Record<T>[]>;
    deleteRecord(tableName: string, id: string): Promise<boolean>;
    copyRecord<T = any>(tableName: string, sourceId: string, modifications?: Partial<T>): Promise<Record<T>>;
}
//# sourceMappingURL=record-factory.d.ts.map