"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ExtensibleOption = exports.Option = void 0;
class Option {
    value;
    options;
    metadata;
    constructor(metadata, value) {
        this.metadata = metadata;
        this.options = metadata.values || [];
        if (value !== undefined) {
            this.setValue(value);
        }
        else {
            this.value = this.getDefaultValue();
        }
    }
    setValue(value) {
        if (typeof value === 'number') {
            this.setByOrdinal(value);
        }
        else {
            this.setByName(value);
        }
    }
    setByOrdinal(ordinal) {
        const option = this.options.find(o => o.ordinal === ordinal);
        if (!option) {
            throw new Error(`Invalid option ordinal: ${ordinal}`);
        }
        this.value = ordinal;
    }
    setByName(name) {
        const option = this.options.find(o => o.name.toLowerCase() === name.toLowerCase());
        if (!option) {
            throw new Error(`Invalid option name: ${name}`);
        }
        this.value = option.ordinal;
    }
    getValue() {
        return this.value;
    }
    getName() {
        const option = this.options.find(o => o.ordinal === this.value);
        return option?.name || '';
    }
    getCaption(language) {
        const option = this.options.find(o => o.ordinal === this.value);
        if (option?.captions) {
            return option.captions[language || 'en-US'] || option.name;
        }
        return option?.name || '';
    }
    getDefaultValue() {
        const defaultOption = this.options.find(o => o.isDefault);
        return defaultOption?.ordinal || 0;
    }
    isValid(value) {
        try {
            if (typeof value === 'number') {
                return this.options.some(o => o.ordinal === value);
            }
            else {
                return this.options.some(o => o.name.toLowerCase() === value.toLowerCase());
            }
        }
        catch {
            return false;
        }
    }
    getOptions() {
        return [...this.options];
    }
    toString() {
        return this.getName();
    }
    valueOf() {
        return this.value;
    }
    toJSON() {
        return {
            value: this.value,
            name: this.getName(),
            caption: this.getCaption()
        };
    }
    // Static helpers
    static fromInteger(metadata, value) {
        return new Option(metadata, value);
    }
    static fromString(metadata, value) {
        return new Option(metadata, value);
    }
}
exports.Option = Option;
// Extensible Option (supports adding values)
class ExtensibleOption extends Option {
    customValues = new Map();
    constructor(metadata, value) {
        super(metadata, value);
    }
    addValue(name, caption) {
        if (!this.metadata.extensible) {
            throw new Error('Option is not extensible');
        }
        const values = [...this.options, ...Array.from(this.customValues.values())];
        const maxOrdinal = Math.max(...values.map(v => v.ordinal), -1);
        const newOrdinal = maxOrdinal + 1;
        const newValue = {
            ordinal: newOrdinal,
            name,
            caption: caption || name,
            isSystem: false
        };
        this.customValues.set(newOrdinal, newValue);
        return newOrdinal;
    }
    getCustomValues() {
        return Array.from(this.customValues.values());
    }
}
exports.ExtensibleOption = ExtensibleOption;
//# sourceMappingURL=option.js.map