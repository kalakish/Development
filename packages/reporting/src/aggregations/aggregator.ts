import { SumAggregator } from './sum-aggregator';
import { AverageAggregator } from './average-aggregator';
import { CountAggregator } from './count-aggregator';
import { MinAggregator } from './min-aggregator';
import { MaxAggregator } from './max-aggregator';

export type AggregateType = 'sum' | 'avg' | 'count' | 'min' | 'max';

export interface AggregationDefinition {
    field: string;
    type: AggregateType;
    alias?: string;
    filter?: (row: any) => boolean;
}

export interface AggregationResult {
    [key: string]: any;
}

export class Aggregator {
    private sumAggregator: SumAggregator;
    private avgAggregator: AverageAggregator;
    private countAggregator: CountAggregator;
    private minAggregator: MinAggregator;
    private maxAggregator: MaxAggregator;

    constructor() {
        this.sumAggregator = new SumAggregator();
        this.avgAggregator = new AverageAggregator();
        this.countAggregator = new CountAggregator();
        this.minAggregator = new MinAggregator();
        this.maxAggregator = new MaxAggregator();
    }

    aggregate(data: any[], definitions: AggregationDefinition[]): AggregationResult[] {
        if (data.length === 0) return [];

        const result: AggregationResult = {};

        definitions.forEach(def => {
            const key = def.alias || `${def.type}_${def.field}`;
            const filteredData = def.filter ? data.filter(def.filter) : data;

            switch (def.type) {
                case 'sum':
                    result[key] = this.sumAggregator.aggregate(filteredData, def.field);
                    break;
                case 'avg':
                    result[key] = this.avgAggregator.aggregate(filteredData, def.field);
                    break;
                case 'count':
                    result[key] = this.countAggregator.aggregate(filteredData, def.field);
                    break;
                case 'min':
                    result[key] = this.minAggregator.aggregate(filteredData, def.field);
                    break;
                case 'max':
                    result[key] = this.maxAggregator.aggregate(filteredData, def.field);
                    break;
            }
        });

        return [result];
    }

    aggregateGrouped(
        data: any[],
        groupBy: string[],
        aggregations: AggregationDefinition[]
    ): AggregationResult[] {
        const groups = this.groupData(data, groupBy);
        const results: AggregationResult[] = [];

        groups.forEach((groupData, groupKey) => {
            const result: AggregationResult = {};
            
            // Add group key values
            const keyValues = groupKey.split('|');
            groupBy.forEach((field, index) => {
                result[field] = keyValues[index];
            });

            // Apply aggregations
            aggregations.forEach(def => {
                const key = def.alias || `${def.type}_${def.field}`;
                
                switch (def.type) {
                    case 'sum':
                        result[key] = this.sumAggregator.aggregate(groupData, def.field);
                        break;
                    case 'avg':
                        result[key] = this.avgAggregator.aggregate(groupData, def.field);
                        break;
                    case 'count':
                        result[key] = this.countAggregator.aggregate(groupData, def.field);
                        break;
                    case 'min':
                        result[key] = this.minAggregator.aggregate(groupData, def.field);
                        break;
                    case 'max':
                        result[key] = this.maxAggregator.aggregate(groupData, def.field);
                        break;
                }
            });

            results.push(result);
        });

        return results;
    }

    private groupData(data: any[], fields: string[]): Map<string, any[]> {
        const groups = new Map<string, any[]>();

        data.forEach(row => {
            const key = fields.map(f => row[f]).join('|');
            
            if (!groups.has(key)) {
                groups.set(key, []);
            }
            
            groups.get(key)!.push(row);
        });

        return groups;
    }

    multiAggregate(data: any[], definitions: AggregationDefinition[]): Record<string, number[]> {
        const results: Record<string, number[]> = {};

        definitions.forEach(def => {
            const key = def.alias || `${def.type}_${def.field}`;
            const filteredData = def.filter ? data.filter(def.filter) : data;

            switch (def.type) {
                case 'sum':
                    results[key] = this.sumAggregator.multiAggregate(filteredData, def.field);
                    break;
                case 'avg':
                    results[key] = this.avgAggregator.multiAggregate(filteredData, def.field);
                    break;
                case 'count':
                    results[key] = this.countAggregator.multiAggregate(filteredData, def.field);
                    break;
                case 'min':
                    results[key] = this.minAggregator.multiAggregate(filteredData, def.field);
                    break;
                case 'max':
                    results[key] = this.maxAggregator.multiAggregate(filteredData, def.field);
                    break;
            }
        });

        return results;
    }

    aggregateWithSummary(
        data: any[],
        definitions: AggregationDefinition[],
        summaryFields?: string[]
    ): { details: AggregationResult[]; summary: AggregationResult } {
        const details = this.aggregateGrouped(data, summaryFields || [], definitions);
        const summary = this.aggregate(data, definitions)[0];

        return { details, summary };
    }

    getAggregator(type: AggregateType): any {
        switch (type) {
            case 'sum':
                return this.sumAggregator;
            case 'avg':
                return this.avgAggregator;
            case 'count':
                return this.countAggregator;
            case 'min':
                return this.minAggregator;
            case 'max':
                return this.maxAggregator;
        }
    }
}