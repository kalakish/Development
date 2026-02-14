"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Date = void 0;
class Date {
    value;
    constructor(value) {
        if (!value) {
            this.value = new Date();
        }
        else if (typeof value === 'string') {
            this.value = this.parseDate(value);
        }
        else {
            this.value = value;
        }
        // Normalize to start of day
        this.value.setHours(0, 0, 0, 0);
    }
    parseDate(value) {
        const parsed = new Date(value);
        if (isNaN(parsed.getTime())) {
            throw new Error(`Invalid date format: ${value}`);
        }
        return parsed;
    }
    addDays(days) {
        const newDate = new Date(this.value);
        newDate.setDate(newDate.getDate() + days);
        return new Date(newDate);
    }
    addMonths(months) {
        const newDate = new Date(this.value);
        newDate.setMonth(newDate.getMonth() + months);
        return new Date(newDate);
    }
    addYears(years) {
        const newDate = new Date(this.value);
        newDate.setFullYear(newDate.getFullYear() + years);
        return new Date(newDate);
    }
    daysBetween(other) {
        const diffTime = Math.abs(this.value.getTime() - other.value.getTime());
        return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    }
    monthsBetween(other) {
        return (other.value.getFullYear() - this.value.getFullYear()) * 12 +
            (other.value.getMonth() - this.value.getMonth());
    }
    equals(other) {
        return this.value.getTime() === other.value.getTime();
    }
    greaterThan(other) {
        return this.value > other.value;
    }
    lessThan(other) {
        return this.value < other.value;
    }
    toISODate() {
        return this.value.toISOString().split('T')[0];
    }
    toDate() {
        return this.value;
    }
    toString() {
        return this.toISODate();
    }
    static today() {
        return new Date();
    }
    static workDate() {
        const today = new Date();
        let date = new Date(today);
        // Adjust to next Monday if weekend
        const day = date.value.getDay();
        if (day === 0) { // Sunday
            date = date.addDays(1);
        }
        else if (day === 6) { // Saturday
            date = date.addDays(2);
        }
        return date;
    }
}
exports.Date = Date;
//# sourceMappingURL=date.js.map