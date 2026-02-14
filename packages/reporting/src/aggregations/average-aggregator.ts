export class AverageAggregator {
    aggregate(data: any[], field: string): number {
        if (data.length === 0) return 0;

        const sum = data.reduce((acc, row) => {
            const value = this.getNumericValue(row[field]);
            return acc + value;
        }, 0);

        return sum / data.length;
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

    aggregateMovingAverage(
        data: any[],
        field: string,
        period: number
    ): number[] {
        const movingAverages: number[] = [];

        for (let i = 0; i < data.length; i++) {
            if (i < period - 1) {
                movingAverages.push(NaN);
                continue;
            }

            let sum = 0;
            for (let j = i - period + 1; j <= i; j++) {
                sum += this.getNumericValue(data[j][field]);
            }

            movingAverages.push(sum / period);
        }

        return movingAverages;
    }

    aggregateExponentialMovingAverage(
        data: any[],
        field: string,
        alpha: number
    ): number[] {
        const ema: number[] = [];
        
        if (data.length === 0) return ema;

        // First value is just the first data point
        ema.push(this.getNumericValue(data[0][field]));

        for (let i = 1; i < data.length; i++) {
            const value = this.getNumericValue(data[i][field]);
            const previous = ema[i - 1];
            ema.push(alpha * value + (1 - alpha) * previous);
        }

        return ema;
    }

    aggregateByGroup(
        data: any[],
        field: string,
        groupField: string
    ): Record<string, number> {
        const groups: Record<string, { sum: number; count: number }> = {};

        data.forEach(row => {
            const group = String(row[groupField]);
            const value = this.getNumericValue(row[field]);

            if (!groups[group]) {
                groups[group] = { sum: 0, count: 0 };
            }

            groups[group].sum += value;
            groups[group].count++;
        });

        const result: Record<string, number> = {};
        Object.entries(groups).forEach(([group, { sum, count }]) => {
            result[group] = sum / count;
        });

        return result;
    }

    aggregateMedian(data: any[], field: string): number {
        if (data.length === 0) return 0;

        const values = data
            .map(row => this.getNumericValue(row[field]))
            .filter(v => !isNaN(v))
            .sort((a, b) => a - b);

        const mid = Math.floor(values.length / 2);

        if (values.length % 2 === 0) {
            return (values[mid - 1] + values[mid]) / 2;
        } else {
            return values[mid];
        }
    }

    aggregateMode(data: any[], field: string): number[] {
        const frequencies: Record<string, number> = {};

        data.forEach(row => {
            const value = String(row[field]);
            frequencies[value] = (frequencies[value] || 0) + 1;
        });

        const maxFreq = Math.max(...Object.values(frequencies));
        
        return Object.entries(frequencies)
            .filter(([_, freq]) => freq === maxFreq)
            .map(([value]) => parseFloat(value));
    }

    private getNumericValue(value: any): number {
        if (value === null || value === undefined) return 0;
        if (typeof value === 'number') return value;
        if (typeof value === 'string') {
            const parsed = parseFloat(value);
            return isNaN(parsed) ? 0 : parsed;
        }
        return 0;
    }
}