export class CountAggregator {
    aggregate(data: any[], field?: string): number {
        if (!field) {
            return data.length;
        }

        return data.filter(row => 
            row[field] !== null && row[field] !== undefined
        ).length;
    }

    aggregateDistinct(data: any[], field: string): number {
        const uniqueValues = new Set();

        data.forEach(row => {
            const value = row[field];
            if (value !== null && value !== undefined) {
                uniqueValues.add(this.normalizeValue(value));
            }
        });

        return uniqueValues.size;
    }

    aggregateDistinctValues(data: any[], field: string): any[] {
        const uniqueValues = new Set();

        data.forEach(row => {
            const value = row[field];
            if (value !== null && value !== undefined) {
                uniqueValues.add(this.normalizeValue(value));
            }
        });

        return Array.from(uniqueValues);
    }

    aggregateMulti(data: any[], fields: string[]): Record<string, number> {
        const result: Record<string, number> = {};

        fields.forEach(field => {
            result[field] = this.aggregate(data, field);
        });

        return result;
    }

    aggregateByGroup(
        data: any[],
        field: string,
        groupField: string
    ): Record<string, number> {
        const groups: Record<string, number> = {};

        data.forEach(row => {
            const group = String(row[groupField]);
            
            if (!groups[group]) {
                groups[group] = 0;
            }

            if (row[field] !== null && row[field] !== undefined) {
                groups[group]++;
            }
        });

        return groups;
    }

    aggregateDistinctByGroup(
        data: any[],
        field: string,
        groupField: string
    ): Record<string, number> {
        const groups: Record<string, Set<any>> = {};

        data.forEach(row => {
            const group = String(row[groupField]);
            const value = row[field];

            if (!groups[group]) {
                groups[group] = new Set();
            }

            if (value !== null && value !== undefined) {
                groups[group].add(this.normalizeValue(value));
            }
        });

        const result: Record<string, number> = {};
        Object.entries(groups).forEach(([group, values]) => {
            result[group] = values.size;
        });

        return result;
    }

    aggregateFrequency(
        data: any[],
        field: string
    ): Record<string, number> {
        const frequencies: Record<string, number> = {};

        data.forEach(row => {
            const value = String(row[field]);
            frequencies[value] = (frequencies[value] || 0) + 1;
        });

        return frequencies;
    }

    aggregateCumulativeCount(data: any[]): number[] {
        const cumulative: number[] = [];
        let count = 0;

        data.forEach((_, index) => {
            count++;
            cumulative.push(count);
        });

        return cumulative;
    }

    aggregateRunningCount(
        data: any[],
        field: string,
        value: any
    ): number[] {
        const runningCounts: number[] = [];
        let count = 0;

        data.forEach(row => {
            if (row[field] === value) {
                count++;
            }
            runningCounts.push(count);
        });

        return runningCounts;
    }

    aggregateNullCount(data: any[], field: string): number {
        return data.filter(row => 
            row[field] === null || row[field] === undefined
        ).length;
    }

    aggregateNonNullCount(data: any[], field: string): number {
        return data.filter(row => 
            row[field] !== null && row[field] !== undefined
        ).length;
    }

    aggregateZeroCount(data: any[], field: string): number {
        return data.filter(row => {
            const value = row[field];
            return value === 0 || value === '0' || value === false;
        }).length;
    }

    aggregatePositiveCount(data: any[], field: string): number {
        return data.filter(row => {
            const value = parseFloat(row[field]);
            return !isNaN(value) && value > 0;
        }).length;
    }

    aggregateNegativeCount(data: any[], field: string): number {
        return data.filter(row => {
            const value = parseFloat(row[field]);
            return !isNaN(value) && value < 0;
        }).length;
    }

    private normalizeValue(value: any): any {
        if (value instanceof Date) {
            return value.toISOString();
        }
        if (typeof value === 'number' && isNaN(value)) {
            return null;
        }
        return value;
    }
}