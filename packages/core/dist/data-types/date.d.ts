export declare class Date {
    private value;
    constructor(value?: string | Date);
    private parseDate;
    addDays(days: number): Date;
    addMonths(months: number): Date;
    addYears(years: number): Date;
    daysBetween(other: Date): number;
    monthsBetween(other: Date): number;
    equals(other: Date): boolean;
    greaterThan(other: Date): boolean;
    lessThan(other: Date): boolean;
    toISODate(): string;
    toDate(): Date;
    toString(): string;
    static today(): Date;
    static workDate(): Date;
}
//# sourceMappingURL=date.d.ts.map