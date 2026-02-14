"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RecordFactory = void 0;
class RecordFactory {
    session;
    constructor(session) {
        this.session = session;
    }
    createRecord(tableName) {
        return this.session.createRecord(tableName);
    }
    async createRecordWithData(tableName, data) {
        const record = this.createRecord(tableName);
        Object.assign(record.getData(), data);
        await record.insert();
        return record;
    }
    async getRecord(tableName, id) {
        const record = this.createRecord(tableName);
        const found = await record.find(id);
        return found ? record : null;
    }
    async findRecords(tableName, filter) {
        const record = this.createRecord(tableName);
        if (filter) {
            record.setFilter(filter);
        }
        await record.findSet();
        return [record]; // This needs to be fixed to return all records
    }
    async deleteRecord(tableName, id) {
        const record = this.createRecord(tableName);
        await record.find(id);
        if (!record.isEmpty()) {
            return record.delete();
        }
        return false;
    }
    async copyRecord(tableName, sourceId, modifications) {
        const source = await this.getRecord(tableName, sourceId);
        if (!source) {
            throw new Error(`Source record not found: ${sourceId}`);
        }
        const target = this.createRecord(tableName);
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
exports.RecordFactory = RecordFactory;
//# sourceMappingURL=record-factory.js.map