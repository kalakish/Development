import { Relation, RelationOptions, RelationType } from './relation';
import { Record } from '../record';
import { Session } from '@nova/core/session';

export class OneToManyRelation extends Relation {
    constructor(options: RelationOptions) {
        super({
            ...options,
            type: RelationType.OneToMany
        });
    }

    async load(source: Record<any>): Promise<any[]> {
        const session = source.getSession();
        const targetValue = source.getField(this.options.sourceField);

        if (!targetValue) return [];

        const targetRecord = session.createRecord(this.options.targetTable);
        
        await targetRecord.findSet(
            `[${this.options.targetField}] = '${targetValue}'`
        );

        return targetRecord.getData() as any[];
    }

    async save(source: Record<any>, targets: any[]): Promise<void> {
        const session = source.getSession();
        const sourceValue = source.getField(this.options.sourceField);

        for (const targetData of targets) {
            const targetRecord = session.createRecord(this.options.targetTable);
            
            if (targetData.SystemId) {
                await targetRecord.find(targetData.SystemId);
            }

            targetRecord.setField(this.options.targetField, sourceValue);
            
            Object.assign(targetRecord.getData(), targetData);
            
            if (targetRecord.isNewRecord()) {
                await targetRecord.insert();
            } else {
                await targetRecord.modify();
            }
        }
    }
}