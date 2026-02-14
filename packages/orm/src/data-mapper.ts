import { Record } from './record';
import { Session } from '@nova/core/session';
import { TableMetadata } from '@nova/metadata';

export class DataMapper {
    private session: Session;
    private mappings: Map<string, EntityMapping> = new Map();

    constructor(session: Session) {
        this.session = session;
    }

    registerMapping<TEntity>(mapping: EntityMapping<TEntity>): void {
        this.mappings.set(mapping.entityName, mapping);
    }

    async mapToEntity<TEntity>(record: Record<any>): Promise<TEntity> {
        const metadata = record.getMetadata();
        const mapping = this.mappings.get(metadata.name);

        if (!mapping) {
            throw new Error(`No mapping found for entity: ${metadata.name}`);
        }

        const data = record.getData();
        const entity = new mapping.entityType() as TEntity;

        // Map fields
        for (const [property, fieldName] of Object.entries(mapping.fieldMap)) {
            (entity as any)[property] = data[fieldName];
        }

        // Map relations
        if (mapping.relations) {
            for (const relation of mapping.relations) {
                const relatedData = await this.loadRelation(record, relation);
                (entity as any)[relation.property] = relatedData;
            }
        }

        return entity;
    }

    async mapToRecord<TEntity>(entity: TEntity, tableName: string): Promise<Record<any>> {
        const mapping = this.mappings.get(tableName);

        if (!mapping) {
            throw new Error(`No mapping found for table: ${tableName}`);
        }

        const record = this.session.createRecord(tableName);

        // Map fields
        for (const [property, fieldName] of Object.entries(mapping.fieldMap)) {
            const value = (entity as any)[property];
            if (value !== undefined) {
                record.setField(fieldName, value);
            }
        }

        return record;
    }

    async mapCollectionToEntities<TEntity>(records: Record<any>[]): Promise<TEntity[]> {
        if (records.length === 0) return [];

        const metadata = records[0].getMetadata();
        const mapping = this.mappings.get(metadata.name);

        if (!mapping) {
            throw new Error(`No mapping found for entity: ${metadata.name}`);
        }

        const entities: TEntity[] = [];

        for (const record of records) {
            const entity = await this.mapToEntity<TEntity>(record);
            entities.push(entity);
        }

        return entities;
    }

    private async loadRelation(record: Record<any>, relation: EntityRelation): Promise<any> {
        const metadata = record.getMetadata();
        const fieldValue = record.getField(relation.foreignKey);

        if (!fieldValue) {
            return relation.isCollection ? [] : null;
        }

        const relatedRecord = this.session.createRecord(relation.targetTable);
        await relatedRecord.find(fieldValue);

        if (relatedRecord.isEmpty()) {
            return relation.isCollection ? [] : null;
        }

        const relatedMapping = this.mappings.get(relation.targetTable);
        
        if (!relatedMapping) {
            throw new Error(`No mapping found for related table: ${relation.targetTable}`);
        }

        if (relation.isCollection) {
            // Load all related records
            const records = await relatedRecord.findSet(
                `[${relation.targetField}] = '${fieldValue}'`
            );
            return this.mapCollectionToEntities(records);
        } else {
            // Load single related record
            return this.mapToEntity(relatedRecord);
        }
    }

    async saveEntity<TEntity>(entity: TEntity, tableName: string): Promise<void> {
        const record = await this.mapToRecord(entity, tableName);
        
        const id = (entity as any).id || (entity as any).SystemId;
        
        if (id) {
            await record.find(id);
            if (!record.isEmpty()) {
                await record.modify();
                return;
            }
        }

        await record.insert();
        (entity as any).SystemId = record.getField('SystemId');
    }

    async saveCollection<TEntity>(entities: TEntity[], tableName: string): Promise<void> {
        for (const entity of entities) {
            await this.saveEntity(entity, tableName);
        }
    }

    async deleteEntity<TEntity>(entity: TEntity, tableName: string): Promise<void> {
        const record = await this.mapToRecord(entity, tableName);
        const id = (entity as any).id || (entity as any).SystemId;

        if (id) {
            await record.find(id);
            if (!record.isEmpty()) {
                await record.delete();
            }
        }
    }
}

export interface EntityMapping<TEntity = any> {
    entityName: string;
    tableName: string;
    entityType: new () => TEntity;
    fieldMap: Record<keyof TEntity, string>;
    relations?: EntityRelation[];
}

export interface EntityRelation {
    property: string;
    targetTable: string;
    foreignKey: string;
    targetField: string;
    isCollection?: boolean;
}