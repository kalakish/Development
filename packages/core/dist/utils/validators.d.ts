import { DateTime } from '../../data-types/datetime';
import { Decimal } from '../../data-types/decimal';
import { Code } from '../../data-types/code';
export declare class Validators {
    static required(value: any): boolean;
    static requiredIf(condition: boolean): (value: any) => boolean;
    static requiredUnless(condition: boolean): (value: any) => boolean;
    static minLength(length: number): (value: string) => boolean;
    static maxLength(length: number): (value: string) => boolean;
    static pattern(regex: RegExp): (value: string) => boolean;
    static email: (value: string) => boolean;
    static url: (value: string) => boolean;
    static phone: (value: string) => boolean;
    static uuid: (value: string) => boolean;
    static alphanumeric: (value: string) => boolean;
    static numeric: (value: string) => boolean;
    static min(minValue: number): (value: number) => boolean;
    static max(maxValue: number): (value: number) => boolean;
    static between(minValue: number, maxValue: number): (value: number) => boolean;
    static integer(value: number): boolean;
    static positive(value: number): boolean;
    static negative(value: number): boolean;
    static decimal(scale: number): (value: number | Decimal) => boolean;
    static minDate(minDate: Date | DateTime): (value: Date | DateTime) => boolean;
    static maxDate(maxDate: Date | DateTime): (value: Date | DateTime) => boolean;
    static dateBetween(minDate: Date | DateTime, maxDate: Date | DateTime): (value: Date | DateTime) => boolean;
    static future(value: Date | DateTime): boolean;
    static past(value: Date | DateTime): boolean;
    static isTrue(value: boolean): boolean;
    static isFalse(value: boolean): boolean;
    static arrayMinLength(length: number): (value: any[]) => boolean;
    static arrayMaxLength(length: number): (value: any[]) => boolean;
    static arrayUnique(value: any[]): boolean;
    static codeMaxLength(length: number): (value: Code) => boolean;
    static codePattern(regex: RegExp): (value: Code) => boolean;
    static createValidator<T>(fn: (value: T) => boolean, message: string): (value: T) => {
        valid: boolean;
        message: string;
    };
    static compose<T>(...validators: Array<(value: T) => boolean>): (value: T) => boolean;
    static validate(value: any, rules: ValidationRule[]): ValidationResult;
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
//# sourceMappingURL=validators.d.ts.map