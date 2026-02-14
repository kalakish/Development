export class MaxAggregator {
    aggregate(data: any[], field: string): number | null {
        if (data.length === 0) return null;

        let max: number | null = null;

        data.forEach(row => {
            const value = this.getNumericValue(row[field]);
            if (value !== null) {
                if (max === null || value > max) {
                    max = value;
                }
            }
        });

        return max;
    }

    aggregateMulti(data: any[], fields: string[]): Record<string, number | null> {
        const result: Record<string, number | null> = {};

        fields.forEach(field => {
            result[field] = this.aggregate(data, field);
        });

        return result;
    }

    aggregateByGroup(
        data: any[],
        field: string,
        groupField: string
    ): Record<string, number | null> {
        const groups: Record<string, number | null> = {};

        data.forEach(row => {
            const group = String(row[groupField]);
            const value = this.getNumericValue(row[field]);

            if (value !== null) {
                if (groups[group] === undefined || value > groups[group]!) {
                    groups[group] = value;
                }
            }
        });

        return groups;
    }

    aggregateWindow(
        data: any[],
        field: string,
        windowSize: number
    ): (number | null)[] {
        const windowMaxs: (number | null)[] = [];

        for (let i = 0; i < data.length; i++) {
            let windowMax: number | null = null;
            const start = Math.max(0, i - windowSize + 1);

            for (let j = start; j <= i; j++) {
                const value = this.getNumericValue(data[j][field]);
                if (value !== null) {
                    if (windowMax === null || value > windowMax) {
                        windowMax = value;
                    }
                }
            }

            windowMaxs.push(windowMax);
        }

        return windowMaxs;
    }

    aggregateRunningMax(data: any[], field: string): (number | null)[] {
        const runningMaxs: (number | null)[] = [];
        let currentMax: number | null = null;

        data.forEach(row => {
            const value = this.getNumericValue(row[field]);
            
            if (value !== null) {
                if (currentMax === null || value > currentMax) {
                    currentMax = value;
                }
            }

            runningMaxs.push(currentMax);
        });

        return runningMaxs;
    }

    aggregateDateMax(data: any[], field: string): Date | null {
        if (data.length === 0) return null;

        let maxDate: Date | null = null;

        data.forEach(row => {
            const value = row[field];
            if (value instanceof Date) {
                if (maxDate === null || value > maxDate) {
                    maxDate = value;
                }
            } else if (typeof value === 'string' || typeof value === 'number') {
                const date = new Date(value);
                if (!isNaN(date.getTime())) {
                    if (maxDate === null || date > maxDate) {
                        maxDate = date;
                    }
                }
            }
        });

        return maxDate;
    }

    aggregateStringMax(data: any[], field: string): string | null {
        if (data.length === 0) return null;

        let maxString: string | null = null;

        data.forEach(row => {
            const value = row[field];
            if (value !== null && value !== undefined) {
                const str = String(value);
                if (maxString === null || str.localeCompare(maxString) > 0) {
                    maxString = str;
                }
            }
        });

        return maxString;
    }

    private getNumericValue(value: any): number | null {
        if (value === null || value === undefined) return null;
        if (typeof value === 'number') return isNaN(value) ? null : value;
        if (typeof value === 'string') {
            const parsed = parseFloat(value);
            return isNaN(parsed) ? null : parsed;
        }
        if (typeof value === 'boolean') return value ? 1 : 0;
        return null;
    }
}