export class Decimal {
    private value: number;
    private readonly precision: number;
    private readonly scale: number;

    constructor(value: number | string, precision: number = 18, scale: number = 2) {
        this.precision = precision;
        this.scale = scale;
        this.value = this.validateAndFormat(value);
    }

    private validateAndFormat(value: number | string): number {
        let num: number;
        
        if (typeof value === 'string') {
            num = parseFloat(value);
        } else {
            num = value;
        }
        
        if (isNaN(num)) {
            throw new Error('Invalid decimal value');
        }
        
        // Check precision
        const decimalPlaces = this.getDecimalPlaces(num);
        if (decimalPlaces > this.scale) {
            throw new Error(`Decimal value exceeds maximum scale of ${this.scale}`);
        }
        
        // Round to scale
        num = this.round(num, this.scale);
        
        return num;
    }

    private getDecimalPlaces(num: number): number {
        const match = (String(num).split('.')[1] || '').length;
        return match;
    }

    private round(num: number, decimals: number): number {
        const factor = Math.pow(10, decimals);
        return Math.round(num * factor) / factor;
    }

    add(other: Decimal): Decimal {
        return new Decimal(this.value + other.value, this.precision, this.scale);
    }

    subtract(other: Decimal): Decimal {
        return new Decimal(this.value - other.value, this.precision, this.scale);
    }

    multiply(other: Decimal): Decimal {
        return new Decimal(this.value * other.value, this.precision, this.scale);
    }

    divide(other: Decimal): Decimal {
        if (other.value === 0) {
            throw new Error('Division by zero');
        }
        return new Decimal(this.value / other.value, this.precision, this.scale);
    }

    equals(other: Decimal): boolean {
        return this.value === other.value;
    }

    greaterThan(other: Decimal): boolean {
        return this.value > other.value;
    }

    lessThan(other: Decimal): boolean {
        return this.value < other.value;
    }

    toNumber(): number {
        return this.value;
    }

    toString(): string {
        return this.value.toFixed(this.scale);
    }

    static zero(): Decimal {
        return new Decimal(0);
    }

    static max(): Decimal {
        return new Decimal(999999999999999.99);
    }
}