export class MinAggregator {
    aggregate(data: any[], field: string): number | null {
        if (data.length === 0) return null;

        let min: number | null = null;

        data.forEach(row => {
            const value = this.getNumericValue(row[field]);
            if (value !== null) {
                if (min === null || value < min) {
                    min = value;
                }
            }
        });

        return min;
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
                if (groups[group] === undefined || value < groups[group]!) {
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
        const windowMins: (number | null)[] = [];

        for (let i = 0; i < data.length; i++) {
            let windowMin: number | null = null;
            const start = Math.max(0, i - windowSize + 1);

            for (let j = start; j <= i; j++) {
                const value = this.getNumericValue(data[j][field]);
                if (value !== null) {
                    if (windowMin === null || value < windowMin) {
                        windowMin = value;
                    }
                }
            }

            windowMins.push(windowMin);
        }

        return windowMins;
    }

    aggregateRunningMin(data: any[], field: string): (number | null)[] {
        const runningMins: (number | null)[] = [];
        let currentMin: number | null = null;

        data.forEach(row => {
            const value = this.getNumericValue(row[field]);
            
            if (value !== null) {
                if (currentMin === null || value < currentMin) {
                    currentMin = value;
                }
            }

            runningMins.push(currentMin);
        });

        return runningMins;
    }

    aggregateDateMin(data: any[], field: string): Date | null {
        if (data.length === 0) return null;

        let minDate: Date | null = null;

        data.forEach(row => {
            const value = row[field];
            if (value instanceof Date) {
                if (minDate === null || value < minDate) {
                    minDate = value;
                }
            } else if (typeof value === 'string' || typeof value === 'number') {
                const date = new Date(value);
                if (!isNaN(date.getTime())) {
                    if (minDate === null || date < minDate) {
                        minDate = date;
                    }
                }
            }
        });

        return minDate;
    }

    aggregateStringMin(data: any[], field: string): string | null {
        if (data.length === 0) return null;

        let minString: string | null = null;

        data.forEach(row => {
            const value = row[field];
            if (value !== null && value !== undefined) {
                const str = String(value);
                if (minString === null || str.localeCompare(minString) < 0) {
                    minString = str;
                }
            }
        });

        return minString;
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