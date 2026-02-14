"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Validators = void 0;
const datetime_1 = require("../../data-types/datetime");
const decimal_1 = require("../../data-types/decimal");
class Validators {
    // ============ Required Validators ============
    static required(value) {
        if (value === null || value === undefined)
            return false;
        if (typeof value === 'string')
            return value.trim().length > 0;
        if (Array.isArray(value))
            return value.length > 0;
        if (typeof value === 'object')
            return Object.keys(value).length > 0;
        return true;
    }
    static requiredIf(condition) {
        return (value) => {
            if (!condition)
                return true;
            return Validators.required(value);
        };
    }
    static requiredUnless(condition) {
        return (value) => {
            if (condition)
                return true;
            return Validators.required(value);
        };
    }
    // ============ String Validators ============
    static minLength(length) {
        return (value) => {
            if (!value)
                return true;
            return value.length >= length;
        };
    }
    static maxLength(length) {
        return (value) => {
            if (!value)
                return true;
            return value.length <= length;
        };
    }
    static pattern(regex) {
        return (value) => {
            if (!value)
                return true;
            return regex.test(value);
        };
    }
    static email = Validators.pattern(/^[^\s@]+@[^\s@]+\.[^\s@]+$/);
    static url = (value) => {
        if (!value)
            return true;
        try {
            new URL(value);
            return true;
        }
        catch {
            return false;
        }
    };
    static phone = Validators.pattern(/^[\+]?[(]?[0-9]{3}[)]?[-\s\.]?[0-9]{3}[-\s\.]?[0-9]{4,6}$/);
    static uuid = Validators.pattern(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    static alphanumeric = Validators.pattern(/^[a-zA-Z0-9]*$/);
    static numeric = Validators.pattern(/^[0-9]*$/);
    // ============ Number Validators ============
    static min(minValue) {
        return (value) => {
            if (value === null || value === undefined)
                return true;
            return value >= minValue;
        };
    }
    static max(maxValue) {
        return (value) => {
            if (value === null || value === undefined)
                return true;
            return value <= maxValue;
        };
    }
    static between(minValue, maxValue) {
        return (value) => {
            if (value === null || value === undefined)
                return true;
            return value >= minValue && value <= maxValue;
        };
    }
    static integer(value) {
        if (value === null || value === undefined)
            return true;
        return Number.isInteger(value);
    }
    static positive(value) {
        if (value === null || value === undefined)
            return true;
        return value > 0;
    }
    static negative(value) {
        if (value === null || value === undefined)
            return true;
        return value < 0;
    }
    static decimal(scale) {
        return (value) => {
            if (value === null || value === undefined)
                return true;
            let num;
            if (value instanceof decimal_1.Decimal) {
                num = value.toNumber();
            }
            else {
                num = value;
            }
            const decimalPlaces = (num.toString().split('.')[1] || '').length;
            return decimalPlaces <= scale;
        };
    }
    // ============ Date Validators ============
    static minDate(minDate) {
        return (value) => {
            if (!value)
                return true;
            const val = value instanceof datetime_1.DateTime ? value.toDate() : value;
            const min = minDate instanceof datetime_1.DateTime ? minDate.toDate() : minDate;
            return val >= min;
        };
    }
    static maxDate(maxDate) {
        return (value) => {
            if (!value)
                return true;
            const val = value instanceof datetime_1.DateTime ? value.toDate() : value;
            const max = maxDate instanceof datetime_1.DateTime ? maxDate.toDate() : maxDate;
            return val <= max;
        };
    }
    static dateBetween(minDate, maxDate) {
        return (value) => {
            if (!value)
                return true;
            const val = value instanceof datetime_1.DateTime ? value.toDate() : value;
            const min = minDate instanceof datetime_1.DateTime ? minDate.toDate() : minDate;
            const max = maxDate instanceof datetime_1.DateTime ? maxDate.toDate() : maxDate;
            return val >= min && val <= max;
        };
    }
    static future(value) {
        if (!value)
            return true;
        const val = value instanceof datetime_1.DateTime ? value.toDate() : value;
        const now = new Date();
        return val > now;
    }
    static past(value) {
        if (!value)
            return true;
        const val = value instanceof datetime_1.DateTime ? value.toDate() : value;
        const now = new Date();
        return val < now;
    }
    // ============ Boolean Validators ============
    static isTrue(value) {
        return value === true;
    }
    static isFalse(value) {
        return value === false;
    }
    // ============ Array Validators ============
    static arrayMinLength(length) {
        return (value) => {
            if (!value)
                return true;
            return value.length >= length;
        };
    }
    static arrayMaxLength(length) {
        return (value) => {
            if (!value)
                return true;
            return value.length <= length;
        };
    }
    static arrayUnique(value) {
        if (!value)
            return true;
        return value.length === new Set(value).size;
    }
    // ============ Code Validators ============
    static codeMaxLength(length) {
        return (value) => {
            if (!value)
                return true;
            return value.length() <= length;
        };
    }
    static codePattern(regex) {
        return (value) => {
            if (!value)
                return true;
            return regex.test(value.toString());
        };
    }
    // ============ Custom Validators ============
    static createValidator(fn, message) {
        return (value) => {
            const valid = fn(value);
            return { valid, message };
        };
    }
    static compose(...validators) {
        return (value) => {
            for (const validator of validators) {
                if (!validator(value))
                    return false;
            }
            return true;
        };
    }
    // ============ Validation Result ============
    static validate(value, rules) {
        const errors = [];
        for (const rule of rules) {
            const isValid = rule.validator(value);
            if (!isValid) {
                errors.push(rule.message);
                if (rule.stopOnFailure) {
                    break;
                }
            }
        }
        return {
            valid: errors.length === 0,
            errors
        };
    }
}
exports.Validators = Validators;
//# sourceMappingURL=validators.js.map