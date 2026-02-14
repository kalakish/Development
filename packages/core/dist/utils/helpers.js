"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Helpers = void 0;
const uuid_1 = require("uuid");
class Helpers {
    // ============ ID Generation ============
    static generateId(prefix = '') {
        return prefix ? `${prefix}_${(0, uuid_1.v4)()}` : (0, uuid_1.v4)();
    }
    static generateShortId(length = 8) {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        let result = '';
        for (let i = 0; i < length; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return result;
    }
    static generateNumericId(length = 10) {
        let result = '';
        for (let i = 0; i < length; i++) {
            result += Math.floor(Math.random() * 10).toString();
        }
        return result;
    }
    static generateTimestampId() {
        return `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
    // ============ String Utilities ============
    static truncate(str, length, suffix = '...') {
        if (str.length <= length)
            return str;
        return str.substring(0, length - suffix.length) + suffix;
    }
    static camelCase(str) {
        return str
            .replace(/(?:^\w|[A-Z]|\b\w)/g, (word, index) => index === 0 ? word.toLowerCase() : word.toUpperCase())
            .replace(/\s+/g, '')
            .replace(/[^a-zA-Z0-9]/g, '');
    }
    static pascalCase(str) {
        return str
            .replace(/(?:^\w|[A-Z]|\b\w)/g, (word) => word.toUpperCase())
            .replace(/\s+/g, '')
            .replace(/[^a-zA-Z0-9]/g, '');
    }
    static kebabCase(str) {
        return str
            .replace(/([a-z])([A-Z])/g, '$1-$2')
            .replace(/\s+/g, '-')
            .replace(/_/g, '-')
            .toLowerCase();
    }
    static snakeCase(str) {
        return str
            .replace(/([a-z])([A-Z])/g, '$1_$2')
            .replace(/\s+/g, '_')
            .toLowerCase();
    }
    static pluralize(str) {
        const irregular = {
            'person': 'people',
            'man': 'men',
            'woman': 'women',
            'child': 'children',
            'tooth': 'teeth',
            'foot': 'feet',
            'mouse': 'mice',
            'goose': 'geese'
        };
        if (irregular[str])
            return irregular[str];
        if (str.endsWith('y')) {
            return str.slice(0, -1) + 'ies';
        }
        if (str.endsWith('s') || str.endsWith('sh') || str.endsWith('ch')) {
            return str + 'es';
        }
        return str + 's';
    }
    // ============ Number Utilities ============
    static formatNumber(num, decimals = 0) {
        return num.toFixed(decimals).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    }
    static formatCurrency(num, currency = 'USD') {
        const formatter = new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency
        });
        return formatter.format(num);
    }
    static formatPercent(num, decimals = 2) {
        return `${(num * 100).toFixed(decimals)}%`;
    }
    static randomInt(min, max) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }
    static randomDecimal(min, max, decimals = 2) {
        const value = Math.random() * (max - min) + min;
        return Number(value.toFixed(decimals));
    }
    // ============ Date Utilities ============
    static formatDate(date, format = 'YYYY-MM-DD') {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        const seconds = String(date.getSeconds()).padStart(2, '0');
        return format
            .replace('YYYY', year.toString())
            .replace('MM', month)
            .replace('DD', day)
            .replace('HH', hours)
            .replace('mm', minutes)
            .replace('ss', seconds);
    }
    static daysBetween(date1, date2) {
        const oneDay = 24 * 60 * 60 * 1000;
        return Math.round(Math.abs(date1.getTime() - date2.getTime()) / oneDay);
    }
    static addDays(date, days) {
        const result = new Date(date);
        result.setDate(result.getDate() + days);
        return result;
    }
    static addMonths(date, months) {
        const result = new Date(date);
        result.setMonth(result.getMonth() + months);
        return result;
    }
    static addYears(date, years) {
        const result = new Date(date);
        result.setFullYear(result.getFullYear() + years);
        return result;
    }
    static startOfDay(date) {
        const result = new Date(date);
        result.setHours(0, 0, 0, 0);
        return result;
    }
    static endOfDay(date) {
        const result = new Date(date);
        result.setHours(23, 59, 59, 999);
        return result;
    }
    static startOfMonth(date) {
        const result = new Date(date);
        result.setDate(1);
        result.setHours(0, 0, 0, 0);
        return result;
    }
    static endOfMonth(date) {
        const result = new Date(date);
        result.setMonth(result.getMonth() + 1);
        result.setDate(0);
        result.setHours(23, 59, 59, 999);
        return result;
    }
    // ============ Object Utilities ============
    static deepClone(obj) {
        return JSON.parse(JSON.stringify(obj));
    }
    static deepMerge(target, source) {
        const output = { ...target };
        for (const key of Object.keys(source)) {
            if (source[key] instanceof Object && key in target) {
                output[key] = this.deepMerge(target[key], source[key]);
            }
            else {
                output[key] = source[key];
            }
        }
        return output;
    }
    static omit(obj, keys) {
        const result = { ...obj };
        keys.forEach(key => delete result[key]);
        return result;
    }
    static pick(obj, keys) {
        const result = {};
        keys.forEach(key => {
            if (key in obj) {
                result[key] = obj[key];
            }
        });
        return result;
    }
    static isEmpty(obj) {
        if (obj === null || obj === undefined)
            return true;
        if (typeof obj === 'string')
            return obj.length === 0;
        if (Array.isArray(obj))
            return obj.length === 0;
        if (typeof obj === 'object')
            return Object.keys(obj).length === 0;
        return false;
    }
    // ============ Array Utilities ============
    static chunkArray(array, size) {
        const chunks = [];
        for (let i = 0; i < array.length; i += size) {
            chunks.push(array.slice(i, i + size));
        }
        return chunks;
    }
    static uniqueArray(array) {
        return [...new Set(array)];
    }
    static groupBy(array, key) {
        return array.reduce((result, item) => {
            const groupKey = String(item[key]);
            if (!result[groupKey]) {
                result[groupKey] = [];
            }
            result[groupKey].push(item);
            return result;
        }, {});
    }
    static sortBy(array, key, direction = 'asc') {
        return [...array].sort((a, b) => {
            const aVal = a[key];
            const bVal = b[key];
            if (aVal < bVal)
                return direction === 'asc' ? -1 : 1;
            if (aVal > bVal)
                return direction === 'asc' ? 1 : -1;
            return 0;
        });
    }
    // ============ Validation ============
    static isValidEmail(email) {
        const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return re.test(email);
    }
    static isValidUrl(url) {
        try {
            new URL(url);
            return true;
        }
        catch {
            return false;
        }
    }
    static isValidPhone(phone) {
        const re = /^[\+]?[(]?[0-9]{3}[)]?[-\s\.]?[0-9]{3}[-\s\.]?[0-9]{4,6}$/;
        return re.test(phone);
    }
    // ============ Size Conversion ============
    static formatBytes(bytes, decimals = 2) {
        if (bytes === 0)
            return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(decimals)) + ' ' + sizes[i];
    }
    static formatDuration(ms) {
        const seconds = Math.floor(ms / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);
        if (days > 0)
            return `${days}d ${hours % 24}h`;
        if (hours > 0)
            return `${hours}h ${minutes % 60}m`;
        if (minutes > 0)
            return `${minutes}m ${seconds % 60}s`;
        return `${seconds}s`;
    }
}
exports.Helpers = Helpers;
//# sourceMappingURL=helpers.js.map