import { Record } from '../record';

export interface RelationOptions {
    name: string;
    type: RelationType;
    sourceTable: string;
    targetTable: string;
    sourceField: string;
    targetField: string;
    cascade?: CascadeOptions;
    lazy?: boolean;
}

export interface CascadeOptions {
    insert?: boolean;
    update?: boolean;
    delete?: boolean;
}

export enum RelationType {
    OneToOne = 'one-to-one',
    OneToMany = 'one-to-many',
    ManyToOne = 'many-to-one',
    ManyToMany = 'many-to-many'
}

export abstract class Relation {
    protected options: RelationOptions;

    constructor(options: RelationOptions) {
        this.options = options;
    }

    abstract load(source: Record<any>): Promise<any>;
    abstract save(source: Record<any>, target: any): Promise<void>;

    getName(): string {
        return this.options.name;
    }

    getType(): RelationType {
        return this.options.type;
    }

    getOptions(): RelationOptions {
        return { ...this.options };
    }
}