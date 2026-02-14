import { Relation, RelationOptions, RelationType } from './relation';
import { Record } from '../record';
import { Session } from '@nova/core/session';

export interface ManyToManyOptions extends RelationOptions {
    junctionTable: string;
    sourceJunctionField: string;
    targetJunctionField: string;
}

export class ManyToManyRelation extends Relation {
    private junctionTable: string;
    private sourceJunctionField: string;
    private targetJunctionField: string;

    constructor(options: ManyToManyOptions) {
        super({
            ...options,
            type: RelationType.ManyToMany
        });
        
        this.junctionTable = options.junctionTable;
        this.sourceJunctionField = options.sourceJunctionField;
        this.targetJunctionField = options.targetJunctionField;
    }

    async load(source: Record<any>): Promise<any[]> {
        const session = source.getSession();
        const sourceId = source.getField('SystemId');

        // Get junction records
        const junctionRecord = session.createRecord(this.junctionTable);
        const junctions = await junctionRecord.findSet(
            `[${this.sourceJunctionField}] = '${sourceId}'`
        );

        if (junctions.length === 0) return [];

        // Get target records
        const targetIds = junctions.map(j => j[this.targetJunctionField]);
        const targetRecord = session.createRecord(this.options.targetTable);
        
        const targets = await targetRecord.findSet(
            `[SystemId] IN (${targetIds.map(id => `'${id}'`).join(',')})`
        );

        return targets;
    }

    async save(source: Record<any>, targets: any[]): Promise<void> {
        const session = source.getSession();
        const sourceId = source.getField('SystemId');

        // Clear existing relationships
        await this.clearRelationships(session, sourceId);

        // Create new relationships
        for (const target of targets) {
            let targetId: string;

            if (typeof target === 'string') {
                targetId = target;
            } else {
                // Save or find target record
                const targetRecord = session.createRecord(this.options.targetTable);
                
                if (target.SystemId) {
                    await targetRecord.find(target.SystemId);
                    targetId = target.SystemId;
                } else {
                    Object.assign(targetRecord.getData(), target);
                    await targetRecord.insert();
                    targetId = targetRecord.getField('SystemId');
                }
            }

            // Create junction record
            const junctionRecord = session.createRecord(this.junctionTable);
            junctionRecord.setField(this.sourceJunctionField, sourceId);
            junctionRecord.setField(this.targetJunctionField, targetId);
            await junctionRecord.insert();
        }
    }

    private async clearRelationships(session: Session, sourceId: string): Promise<void> {
        const junctionRecord = session.createRecord(this.junctionTable);
        const existing = await junctionRecord.findSet(
            `[${this.sourceJunctionField}] = '${sourceId}'`
        );

        for (const junction of existing) {
            const record = session.createRecord(this.junctionTable);
            await record.find(junction.SystemId);
            await record.delete();
        }
    }
}