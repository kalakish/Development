"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Decimal = void 0;
class Decimal {
    value;
    precision;
    scale;
    constructor(value, precision = 18, scale = 2) {
        this.precision = precision;
        this.scale = scale;
        this.value = this.validateAndFormat(value);
    }
    validateAndFormat(value) {
        let num;
        if (typeof value === 'string') {
            num = parseFloat(value);
        }
        else {
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
    getDecimalPlaces(num) {
        const match = (String(num).split('.')[1] || '').length;
        return match;
    }
    round(num, decimals) {
        const factor = Math.pow(10, decimals);
        return Math.round(num * factor) / factor;
    }
    add(other) {
        return new Decimal(this.value + other.value, this.precision, this.scale);
    }
    subtract(other) {
        return new Decimal(this.value - other.value, this.precision, this.scale);
    }
    multiply(other) {
        return new Decimal(this.value * other.value, this.precision, this.scale);
    }
    divide(other) {
        if (other.value === 0) {
            throw new Error('Division by zero');
        }
        return new Decimal(this.value / other.value, this.precision, this.scale);
    }
    equals(other) {
        return this.value === other.value;
    }
    greaterThan(other) {
        return this.value > other.value;
    }
    lessThan(other) {
        return this.value < other.value;
    }
    toNumber() {
        return this.value;
    }
    toString() {
        return this.value.toFixed(this.scale);
    }
    static zero() {
        return new Decimal(0);
    }
    static max() {
        return new Decimal(999999999999999.99);
    }
}
exports.Decimal = Decimal;
//# sourceMappingURL=decimal.js.map