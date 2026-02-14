export declare class Decimal {
    private value;
    private readonly precision;
    private readonly scale;
    constructor(value: number | string, precision?: number, scale?: number);
    private validateAndFormat;
    private getDecimalPlaces;
    private round;
    add(other: Decimal): Decimal;
    subtract(other: Decimal): Decimal;
    multiply(other: Decimal): Decimal;
    divide(other: Decimal): Decimal;
    equals(other: Decimal): boolean;
    greaterThan(other: Decimal): boolean;
    lessThan(other: Decimal): boolean;
    toNumber(): number;
    toString(): string;
    static zero(): Decimal;
    static max(): Decimal;
}
//# sourceMappingURL=decimal.d.ts.map