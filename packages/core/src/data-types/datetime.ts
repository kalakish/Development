export class DateTime {
    private value: Date;

    constructor(value?: string | Date | number) {
        if (!value) {
            this.value = new Date();
        } else if (typeof value === 'string') {
            this.value = new Date(value);
            if (isNaN(this.value.getTime())) {
                throw new Error(`Invalid datetime format: ${value}`);
            }
        } else if (typeof value === 'number') {
            this.value = new Date(value);
        } else {
            this.value = value;
        }
    }

    // Static factory methods
    static now(): DateTime {
        return new DateTime();
    }

    static utcNow(): DateTime {
        const now = new Date();
        return new DateTime(Date.UTC(
            now.getUTCFullYear(),
            now.getUTCMonth(),
            now.getUTCDate(),
            now.getUTCHours(),
            now.getUTCMinutes(),
            now.getUTCSeconds(),
            now.getUTCMilliseconds()
        ));
    }

    static fromISOString(value: string): DateTime {
        return new DateTime(value);
    }

    static fromDate(date: Date): DateTime {
        return new DateTime(date);
    }

    // Date components
    getFullYear(): number {
        return this.value.getFullYear();
    }

    getMonth(): number {
        return this.value.getMonth() + 1;
    }

    getDate(): number {
        return this.value.getDate();
    }

    getDay(): number {
        return this.value.getDay();
    }

    getHours(): number {
        return this.value.getHours();
    }

    getMinutes(): number {
        return this.value.getMinutes();
    }

    getSeconds(): number {
        return this.value.getSeconds();
    }

    getMilliseconds(): number {
        return this.value.getMilliseconds();
    }

    // UTC components
    getUTCFullYear(): number {
        return this.value.getUTCFullYear();
    }

    getUTCMonth(): number {
        return this.value.getUTCMonth() + 1;
    }

    getUTCDate(): number {
        return this.value.getUTCDate();
    }

    getUTCDay(): number {
        return this.value.getUTCDay();
    }

    getUTCHours(): number {
        return this.value.getUTCHours();
    }

    getUTCMinutes(): number {
        return this.value.getUTCMinutes();
    }

    getUTCSeconds(): number {
        return this.value.getUTCSeconds();
    }

    getUTCMilliseconds(): number {
        return this.value.getUTCMilliseconds();
    }

    // Manipulation
    addMilliseconds(ms: number): DateTime {
        return new DateTime(this.value.getTime() + ms);
    }

    addSeconds(seconds: number): DateTime {
        return this.addMilliseconds(seconds * 1000);
    }

    addMinutes(minutes: number): DateTime {
        return this.addMilliseconds(minutes * 60 * 1000);
    }

    addHours(hours: number): DateTime {
        return this.addMilliseconds(hours * 60 * 60 * 1000);
    }

    addDays(days: number): DateTime {
        return this.addMilliseconds(days * 24 * 60 * 60 * 1000);
    }

    addMonths(months: number): DateTime {
        const newDate = new Date(this.value);
        newDate.setMonth(newDate.getMonth() + months);
        return new DateTime(newDate);
    }

    addYears(years: number): DateTime {
        const newDate = new Date(this.value);
        newDate.setFullYear(newDate.getFullYear() + years);
        return new DateTime(newDate);
    }

    // Comparison
    equals(other: DateTime): boolean {
        return this.value.getTime() === other.value.getTime();
    }

    greaterThan(other: DateTime): boolean {
        return this.value.getTime() > other.value.getTime();
    }

    greaterThanOrEqual(other: DateTime): boolean {
        return this.value.getTime() >= other.value.getTime();
    }

    lessThan(other: DateTime): boolean {
        return this.value.getTime() < other.value.getTime();
    }

    lessThanOrEqual(other: DateTime): boolean {
        return this.value.getTime() <= other.value.getTime();
    }

    // Difference
    diffMilliseconds(other: DateTime): number {
        return this.value.getTime() - other.value.getTime();
    }

    diffSeconds(other: DateTime): number {
        return Math.floor(this.diffMilliseconds(other) / 1000);
    }

    diffMinutes(other: DateTime): number {
        return Math.floor(this.diffSeconds(other) / 60);
    }

    diffHours(other: DateTime): number {
        return Math.floor(this.diffMinutes(other) / 60);
    }

    diffDays(other: DateTime): number {
        return Math.floor(this.diffHours(other) / 24);
    }

    // Formatting
    toISOString(): string {
        return this.value.toISOString();
    }

    toUTCString(): string {
        return this.value.toUTCString();
    }

    toLocaleString(locale?: string, options?: Intl.DateTimeFormatOptions): string {
        return this.value.toLocaleString(locale, options);
    }

    toLocaleDateString(locale?: string, options?: Intl.DateTimeFormatOptions): string {
        return this.value.toLocaleDateString(locale, options);
    }

    toLocaleTimeString(locale?: string, options?: Intl.DateTimeFormatOptions): string {
        return this.value.toLocaleTimeString(locale, options);
    }

    toString(): string {
        return this.toISOString();
    }

    // Conversion
    toDate(): Date {
        return new Date(this.value);
    }

    toUnixTime(): number {
        return Math.floor(this.value.getTime() / 1000);
    }

    // Validation
    isValid(): boolean {
        return !isNaN(this.value.getTime());
    }

    // Static utilities
    static min(...dates: DateTime[]): DateTime {
        if (dates.length === 0) throw new Error('At least one date required');
        return dates.reduce((min, curr) => curr.lessThan(min) ? curr : min);
    }

    static max(...dates: DateTime[]): DateTime {
        if (dates.length === 0) throw new Error('At least one date required');
        return dates.reduce((max, curr) => curr.greaterThan(max) ? curr : max);
    }

    static parse(value: string, format?: string): DateTime {
        // Simple ISO parsing, could be extended for custom formats
        return new DateTime(value);
    }
}