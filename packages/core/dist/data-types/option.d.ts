export declare class Option {
    private value;
    private options;
    private metadata;
    constructor(metadata: OptionMetadata, value?: number | string);
    setValue(value: number | string): void;
    private setByOrdinal;
    private setByName;
    getValue(): number;
    getName(): string;
    getCaption(language?: string): string;
    private getDefaultValue;
    isValid(value: number | string): boolean;
    getOptions(): OptionValue[];
    toString(): string;
    valueOf(): number;
    toJSON(): object;
    static fromInteger(metadata: OptionMetadata, value: number): Option;
    static fromString(metadata: OptionMetadata, value: string): Option;
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
export declare class ExtensibleOption extends Option {
    private customValues;
    constructor(metadata: OptionMetadata, value?: number | string);
    addValue(name: string, caption?: string): number;
    getCustomValues(): OptionValue[];
}
//# sourceMappingURL=option.d.ts.map