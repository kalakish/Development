export class Date {
    private value: Date;

    constructor(value?: string | Date) {
        if (!value) {
            this.value = new Date();
        } else if (typeof value === 'string') {
            this.value = this.parseDate(value);
        } else {
            this.value = value;
        }
        
        // Normalize to start of day
        this.value.setHours(0, 0, 0, 0);
    }

    private parseDate(value: string): Date {
        const parsed = new Date(value);
        
        if (isNaN(parsed.getTime())) {
            throw new Error(`Invalid date format: ${value}`);
        }
        
        return parsed;
    }

    addDays(days: number): Date {
        const newDate = new Date(this.value);
        newDate.setDate(newDate.getDate() + days);
        return new Date(newDate);
    }

    addMonths(months: number): Date {
        const newDate = new Date(this.value);
        newDate.setMonth(newDate.getMonth() + months);
        return new Date(newDate);
    }

    addYears(years: number): Date {
        const newDate = new Date(this.value);
        newDate.setFullYear(newDate.getFullYear() + years);
        return new Date(newDate);
    }

    daysBetween(other: Date): number {
        const diffTime = Math.abs(this.value.getTime() - other.value.getTime());
        return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    }

    monthsBetween(other: Date): number {
        return (other.value.getFullYear() - this.value.getFullYear()) * 12 +
               (other.value.getMonth() - this.value.getMonth());
    }

    equals(other: Date): boolean {
        return this.value.getTime() === other.value.getTime();
    }

    greaterThan(other: Date): boolean {
        return this.value > other.value;
    }

    lessThan(other: Date): boolean {
        return this.value < other.value;
    }

    toISODate(): string {
        return this.value.toISOString().split('T')[0];
    }

    toDate(): Date {
        return this.value;
    }

    toString(): string {
        return this.toISODate();
    }

    static today(): Date {
        return new Date();
    }

    static workDate(): Date {
        const today = new Date();
        let date = new Date(today);
        
        // Adjust to next Monday if weekend
        const day = date.value.getDay();
        if (day === 0) { // Sunday
            date = date.addDays(1);
        } else if (day === 6) { // Saturday
            date = date.addDays(2);
        }
        
        return date;
    }
}