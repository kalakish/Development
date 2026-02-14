import { DateTime } from '../../data-types/datetime';
import { Decimal } from '../../data-types/decimal';
import { Code } from '../../data-types/code';

export class Validators {
    // ============ Required Validators ============

    static required(value: any): boolean {
        if (value === null || value === undefined) return false;
        if (typeof value === 'string') return value.trim().length > 0;
        if (Array.isArray(value)) return value.length > 0;
        if (typeof value === 'object') return Object.keys(value).length > 0;
        return true;
    }

    static requiredIf(condition: boolean): (value: any) => boolean {
        return (value: any) => {
            if (!condition) return true;
            return Validators.required(value);
        };
    }

    static requiredUnless(condition: boolean): (value: any) => boolean {
        return (value: any) => {
            if (condition) return true;
            return Validators.required(value);
        };
    }

    // ============ String Validators ============

    static minLength(length: number): (value: string) => boolean {
        return (value: string) => {
            if (!value) return true;
            return value.length >= length;
        };
    }

    static maxLength(length: number): (value: string) => boolean {
        return (value: string) => {
            if (!value) return true;
            return value.length <= length;
        };
    }

    static pattern(regex: RegExp): (value: string) => boolean {
        return (value: string) => {
            if (!value) return true;
            return regex.test(value);
        };
    }

    static email: (value: string) => boolean = Validators.pattern(
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    );

    static url: (value: string) => boolean = (value: string) => {
        if (!value) return true;
        try {
            new URL(value);
            return true;
        } catch {
            return false;
        }
    };

    static phone: (value: string) => boolean = Validators.pattern(
        /^[\+]?[(]?[0-9]{3}[)]?[-\s\.]?[0-9]{3}[-\s\.]?[0-9]{4,6}$/
    );

    static uuid: (value: string) => boolean = Validators.pattern(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    );

    static alphanumeric: (value: string) => boolean = Validators.pattern(
        /^[a-zA-Z0-9]*$/
    );

    static numeric: (value: string) => boolean = Validators.pattern(
        /^[0-9]*$/
    );

    // ============ Number Validators ============

    static min(minValue: number): (value: number) => boolean {
        return (value: number) => {
            if (value === null || value === undefined) return true;
            return value >= minValue;
        };
    }

    static max(maxValue: number): (value: number) => boolean {
        return (value: number) => {
            if (value === null || value === undefined) return true;
            return value <= maxValue;
        };
    }

    static between(minValue: number, maxValue: number): (value: number) => boolean {
        return (value: number) => {
            if (value === null || value === undefined) return true;
            return value >= minValue && value <= maxValue;
        };
    }

    static integer(value: number): boolean {
        if (value === null || value === undefined) return true;
        return Number.isInteger(value);
    }

    static positive(value: number): boolean {
        if (value === null || value === undefined) return true;
        return value > 0;
    }

    static negative(value: number): boolean {
        if (value === null || value === undefined) return true;
        return value < 0;
    }

    static decimal(scale: number): (value: number | Decimal) => boolean {
        return (value: number | Decimal) => {
            if (value === null || value === undefined) return true;
            
            let num: number;
            if (value instanceof Decimal) {
                num = value.toNumber();
            } else {
                num = value;
            }

            const decimalPlaces = (num.toString().split('.')[1] || '').length;
            return decimalPlaces <= scale;
        };
    }

    // ============ Date Validators ============

    static minDate(minDate: Date | DateTime): (value: Date | DateTime) => boolean {
        return (value: Date | DateTime) => {
            if (!value) return true;
            
            const val = value instanceof DateTime ? value.toDate() : value;
            const min = minDate instanceof DateTime ? minDate.toDate() : minDate;
            
            return val >= min;
        };
    }

    static maxDate(maxDate: Date | DateTime): (value: Date | DateTime) => boolean {
        return (value: Date | DateTime) => {
            if (!value) return true;
            
            const val = value instanceof DateTime ? value.toDate() : value;
            const max = maxDate instanceof DateTime ? maxDate.toDate() : maxDate;
            
            return val <= max;
        };
    }

    static dateBetween(
        minDate: Date | DateTime,
        maxDate: Date | DateTime
    ): (value: Date | DateTime) => boolean {
        return (value: Date | DateTime) => {
            if (!value) return true;
            
            const val = value instanceof DateTime ? value.toDate() : value;
            const min = minDate instanceof DateTime ? minDate.toDate() : minDate;
            const max = maxDate instanceof DateTime ? maxDate.toDate() : maxDate;
            
            return val >= min && val <= max;
        };
    }

    static future(value: Date | DateTime): boolean {
        if (!value) return true;
        
        const val = value instanceof DateTime ? value.toDate() : value;
        const now = new Date();
        
        return val > now;
    }

    static past(value: Date | DateTime): boolean {
        if (!value) return true;
        
        const val = value instanceof DateTime ? value.toDate() : value;
        const now = new Date();
        
        return val < now;
    }

    // ============ Boolean Validators ============

    static isTrue(value: boolean): boolean {
        return value === true;
    }

    static isFalse(value: boolean): boolean {
        return value === false;
    }

    // ============ Array Validators ============

    static arrayMinLength(length: number): (value: any[]) => boolean {
        return (value: any[]) => {
            if (!value) return true;
            return value.length >= length;
        };
    }

    static arrayMaxLength(length: number): (value: any[]) => boolean {
        return (value: any[]) => {
            if (!value) return true;
            return value.length <= length;
        };
    }

    static arrayUnique(value: any[]): boolean {
        if (!value) return true;
        return value.length === new Set(value).size;
    }

    // ============ Code Validators ============

    static codeMaxLength(length: number): (value: Code) => boolean {
        return (value: Code) => {
            if (!value) return true;
            return value.length() <= length;
        };
    }

    static codePattern(regex: RegExp): (value: Code) => boolean {
        return (value: Code) => {
            if (!value) return true;
            return regex.test(value.toString());
        };
    }

    // ============ Custom Validators ============

    static createValidator<T>(
        fn: (value: T) => boolean,
        message: string
    ): (value: T) => { valid: boolean; message: string } {
        return (value: T) => {
            const valid = fn(value);
            return { valid, message };
        };
    }

    static compose<T>(...validators: Array<(value: T) => boolean>): (value: T) => boolean {
        return (value: T) => {
            for (const validator of validators) {
                if (!validator(value)) return false;
            }
            return true;
        };
    }

    // ============ Validation Result ============

    static validate(value: any, rules: ValidationRule[]): ValidationResult {
        const errors: string[] = [];

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

export interface ValidationRule {
    validator: (value: any) => boolean;
    message: string;
    stopOnFailure?: boolean;
}

export interface ValidationResult {
    valid: boolean;
    errors: string[];
}