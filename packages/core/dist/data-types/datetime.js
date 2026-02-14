"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DateTime = void 0;
class DateTime {
    value;
    constructor(value) {
        if (!value) {
            this.value = new Date();
        }
        else if (typeof value === 'string') {
            this.value = new Date(value);
            if (isNaN(this.value.getTime())) {
                throw new Error(`Invalid datetime format: ${value}`);
            }
        }
        else if (typeof value === 'number') {
            this.value = new Date(value);
        }
        else {
            this.value = value;
        }
    }
    // Static factory methods
    static now() {
        return new DateTime();
    }
    static utcNow() {
        const now = new Date();
        return new DateTime(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), now.getUTCHours(), now.getUTCMinutes(), now.getUTCSeconds(), now.getUTCMilliseconds()));
    }
    static fromISOString(value) {
        return new DateTime(value);
    }
    static fromDate(date) {
        return new DateTime(date);
    }
    // Date components
    getFullYear() {
        return this.value.getFullYear();
    }
    getMonth() {
        return this.value.getMonth() + 1;
    }
    getDate() {
        return this.value.getDate();
    }
    getDay() {
        return this.value.getDay();
    }
    getHours() {
        return this.value.getHours();
    }
    getMinutes() {
        return this.value.getMinutes();
    }
    getSeconds() {
        return this.value.getSeconds();
    }
    getMilliseconds() {
        return this.value.getMilliseconds();
    }
    // UTC components
    getUTCFullYear() {
        return this.value.getUTCFullYear();
    }
    getUTCMonth() {
        return this.value.getUTCMonth() + 1;
    }
    getUTCDate() {
        return this.value.getUTCDate();
    }
    getUTCDay() {
        return this.value.getUTCDay();
    }
    getUTCHours() {
        return this.value.getUTCHours();
    }
    getUTCMinutes() {
        return this.value.getUTCMinutes();
    }
    getUTCSeconds() {
        return this.value.getUTCSeconds();
    }
    getUTCMilliseconds() {
        return this.value.getUTCMilliseconds();
    }
    // Manipulation
    addMilliseconds(ms) {
        return new DateTime(this.value.getTime() + ms);
    }
    addSeconds(seconds) {
        return this.addMilliseconds(seconds * 1000);
    }
    addMinutes(minutes) {
        return this.addMilliseconds(minutes * 60 * 1000);
    }
    addHours(hours) {
        return this.addMilliseconds(hours * 60 * 60 * 1000);
    }
    addDays(days) {
        return this.addMilliseconds(days * 24 * 60 * 60 * 1000);
    }
    addMonths(months) {
        const newDate = new Date(this.value);
        newDate.setMonth(newDate.getMonth() + months);
        return new DateTime(newDate);
    }
    addYears(years) {
        const newDate = new Date(this.value);
        newDate.setFullYear(newDate.getFullYear() + years);
        return new DateTime(newDate);
    }
    // Comparison
    equals(other) {
        return this.value.getTime() === other.value.getTime();
    }
    greaterThan(other) {
        return this.value.getTime() > other.value.getTime();
    }
    greaterThanOrEqual(other) {
        return this.value.getTime() >= other.value.getTime();
    }
    lessThan(other) {
        return this.value.getTime() < other.value.getTime();
    }
    lessThanOrEqual(other) {
        return this.value.getTime() <= other.value.getTime();
    }
    // Difference
    diffMilliseconds(other) {
        return this.value.getTime() - other.value.getTime();
    }
    diffSeconds(other) {
        return Math.floor(this.diffMilliseconds(other) / 1000);
    }
    diffMinutes(other) {
        return Math.floor(this.diffSeconds(other) / 60);
    }
    diffHours(other) {
        return Math.floor(this.diffMinutes(other) / 60);
    }
    diffDays(other) {
        return Math.floor(this.diffHours(other) / 24);
    }
    // Formatting
    toISOString() {
        return this.value.toISOString();
    }
    toUTCString() {
        return this.value.toUTCString();
    }
    toLocaleString(locale, options) {
        return this.value.toLocaleString(locale, options);
    }
    toLocaleDateString(locale, options) {
        return this.value.toLocaleDateString(locale, options);
    }
    toLocaleTimeString(locale, options) {
        return this.value.toLocaleTimeString(locale, options);
    }
    toString() {
        return this.toISOString();
    }
    // Conversion
    toDate() {
        return new Date(this.value);
    }
    toUnixTime() {
        return Math.floor(this.value.getTime() / 1000);
    }
    // Validation
    isValid() {
        return !isNaN(this.value.getTime());
    }
    // Static utilities
    static min(...dates) {
        if (dates.length === 0)
            throw new Error('At least one date required');
        return dates.reduce((min, curr) => curr.lessThan(min) ? curr : min);
    }
    static max(...dates) {
        if (dates.length === 0)
            throw new Error('At least one date required');
        return dates.reduce((max, curr) => curr.greaterThan(max) ? curr : max);
    }
    static parse(value, format) {
        // Simple ISO parsing, could be extended for custom formats
        return new DateTime(value);
    }
}
exports.DateTime = DateTime;
//# sourceMappingURL=datetime.js.map