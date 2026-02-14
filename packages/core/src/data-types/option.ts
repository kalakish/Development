export class Option {
    private value: number;
    private options: OptionValue[];
    private metadata: OptionMetadata;

    constructor(metadata: OptionMetadata, value?: number | string) {
        this.metadata = metadata;
        this.options = metadata.values || [];
        
        if (value !== undefined) {
            this.setValue(value);
        } else {
            this.value = this.getDefaultValue();
        }
    }

    setValue(value: number | string): void {
        if (typeof value === 'number') {
            this.setByOrdinal(value);
        } else {
            this.setByName(value);
        }
    }

    private setByOrdinal(ordinal: number): void {
        const option = this.options.find(o => o.ordinal === ordinal);
        if (!option) {
            throw new Error(`Invalid option ordinal: ${ordinal}`);
        }
        this.value = ordinal;
    }

    private setByName(name: string): void {
        const option = this.options.find(o => 
            o.name.toLowerCase() === name.toLowerCase()
        );
        if (!option) {
            throw new Error(`Invalid option name: ${name}`);
        }
        this.value = option.ordinal;
    }

    getValue(): number {
        return this.value;
    }

    getName(): string {
        const option = this.options.find(o => o.ordinal === this.value);
        return option?.name || '';
    }

    getCaption(language?: string): string {
        const option = this.options.find(o => o.ordinal === this.value);
        if (option?.captions) {
            return option.captions[language || 'en-US'] || option.name;
        }
        return option?.name || '';
    }

    private getDefaultValue(): number {
        const defaultOption = this.options.find(o => o.isDefault);
        return defaultOption?.ordinal || 0;
    }

    isValid(value: number | string): boolean {
        try {
            if (typeof value === 'number') {
                return this.options.some(o => o.ordinal === value);
            } else {
                return this.options.some(o => 
                    o.name.toLowerCase() === value.toLowerCase()
                );
            }
        } catch {
            return false;
        }
    }

    getOptions(): OptionValue[] {
        return [...this.options];
    }

    toString(): string {
        return this.getName();
    }

    valueOf(): number {
        return this.value;
    }

    toJSON(): object {
        return {
            value: this.value,
            name: this.getName(),
            caption: this.getCaption()
        };
    }

    // Static helpers
    static fromInteger(metadata: OptionMetadata, value: number): Option {
        return new Option(metadata, value);
    }

    static fromString(metadata: OptionMetadata, value: string): Option {
        return new Option(metadata, value);
    }
}

export interface OptionMetadata {
    id: number;
    name: string;
    values: OptionValue[];
    extensible?: boolean;
}

export interface OptionValue {
    ordinal: number;
    name: string;
    caption?: string;
    captions?: Record<string, string>;
    color?: string;
    isDefault?: boolean;
    isSystem?: boolean;
}

// Extensible Option (supports adding values)
export class ExtensibleOption extends Option {
    private customValues: Map<number, OptionValue> = new Map();

    constructor(metadata: OptionMetadata, value?: number | string) {
        super(metadata, value);
    }

    addValue(name: string, caption?: string): number {
        if (!this.metadata.extensible) {
            throw new Error('Option is not extensible');
        }

        const values = [...this.options, ...Array.from(this.customValues.values())];
        const maxOrdinal = Math.max(...values.map(v => v.ordinal), -1);
        const newOrdinal = maxOrdinal + 1;

        const newValue: OptionValue = {
            ordinal: newOrdinal,
            name,
            caption: caption || name,
            isSystem: false
        };

        this.customValues.set(newOrdinal, newValue);
        return newOrdinal;
    }

    getCustomValues(): OptionValue[] {
        return Array.from(this.customValues.values());
    }
}