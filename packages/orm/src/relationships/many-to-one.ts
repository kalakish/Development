import { Relation, RelationOptions, RelationType } from './relation';
import { Record } from '../record';

export class ManyToOneRelation extends Relation {
    constructor(options: RelationOptions) {
        super({
            ...options,
            type: RelationType.ManyToOne
        });
    }

    async load(source: Record<any>): Promise<any> {
        const session = source.getSession();
        const foreignKey = source.getField(this.options.sourceField);

        if (!foreignKey) return null;

        const targetRecord = session.createRecord(this.options.targetTable);
        await targetRecord.find(foreignKey);

        return targetRecord.getData();
    }

    async save(source: Record<any>, target: any): Promise<void> {
        const session = source.getSession();
        
        if (target) {
            const targetRecord = session.createRecord(this.options.targetTable);
            
            if (target.SystemId) {
                await targetRecord.find(target.SystemId);
            }

            Object.assign(targetRecord.getData(), target);
            
            if (targetRecord.isNewRecord()) {
                await targetRecord.insert();
            } else {
                await targetRecord.modify();
            }

            // Set foreign key
            source.setField(
                this.options.sourceField,
                targetRecord.getField('SystemId')
            );
        } else {
            // Clear foreign key
            source.setField(this.options.sourceField, null);
        }
    }
}