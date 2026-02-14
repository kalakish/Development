"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Code = void 0;
class Code {
    value;
    maxLength;
    constructor(value, maxLength = 20) {
        this.maxLength = maxLength;
        this.value = this.validateAndFormat(value);
    }
    validateAndFormat(value) {
        if (value === null || value === undefined) {
            return '';
        }
        const str = String(value).trim();
        if (str.length > this.maxLength) {
            throw new Error(`Code value exceeds maximum length of ${this.maxLength}`);
        }
        // Code fields are typically uppercase
        return str.toUpperCase();
    }
    toString() {
        return this.value;
    }
    valueOf() {
        return this.value;
    }
    equals(other) {
        return this.value === other.value;
    }
    isEmpty() {
        return this.value.length === 0;
    }
    length() {
        return this.value.length;
    }
}
exports.Code = Code;
//# sourceMappingURL=code.js.map