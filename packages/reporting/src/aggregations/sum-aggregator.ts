export class SumAggregator {
    aggregate(data: any[], field: string): number {
        if (data.length === 0) return 0;

        return data.reduce((sum, row) => {
            const value = this.getNumericValue(row[field]);
            return sum + value;
        }, 0);
    }

    aggregateMulti(data: any[], fields: string[]): Record<string, number> {
        const result: Record<string, number> = {};

        fields.forEach(field => {
            result[field] = this.aggregate(data, field);
        });

        return result;
    }

    aggregateWeighted(
        data: any[],
        valueField: string,
        weightField: string
    ): number {
        if (data.length === 0) return 0;

        let sum = 0;
        let weightSum = 0;

        data.forEach(row => {
            const value = this.getNumericValue(row[valueField]);
            const weight = this.getNumericValue(row[weightField]);
            
            sum += value * weight;
            weightSum += weight;
        });

        return weightSum === 0 ? 0 : sum / weightSum;
    }

    aggregateRunning(data: any[], field: string): number[] {
        const runningTotals: number[] = [];
        let total = 0;

        data.forEach(row => {
            total += this.getNumericValue(row[field]);
            runningTotals.push(total);
        });

        return runningTotals;
    }

    aggregateByGroup(
        data: any[],
        field: string,
        groupField: string
    ): Record<string, number> {
        const groups: Record<string, number> = {};

        data.forEach(row => {
            const group = String(row[groupField]);
            const value = this.getNumericValue(row[field]);

            if (!groups[group]) {
                groups[group] = 0;
            }

            groups[group] += value;
        });

        return groups;
    }

    aggregateWindow(
        data: any[],
        field: string,
        windowSize: number
    ): number[] {
        const rollingSums: number[] = [];

        for (let i = 0; i < data.length; i++) {
            let sum = 0;
            const start = Math.max(0, i - windowSize + 1);

            for (let j = start; j <= i; j++) {
                sum += this.getNumericValue(data[j][field]);
            }

            rollingSums.push(sum);
        }

        return rollingSums;
    }

    private getNumericValue(value: any): number {
        if (value === null || value === undefined) return 0;
        if (typeof value === 'number') return value;
        if (typeof value === 'string') {
            const parsed = parseFloat(value);
            return isNaN(parsed) ? 0 : parsed;
        }
        if (typeof value === 'boolean') return value ? 1 : 0;
        return 0;
    }
}