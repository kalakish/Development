export class Code {
    private value: string;
    private readonly maxLength: number;

    constructor(value: string, maxLength: number = 20) {
        this.maxLength = maxLength;
        this.value = this.validateAndFormat(value);
    }

    private validateAndFormat(value: string): string {
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

    toString(): string {
        return this.value;
    }

    valueOf(): string {
        return this.value;
    }

    equals(other: Code): boolean {
        return this.value === other.value;
    }

    isEmpty(): boolean {
        return this.value.length === 0;
    }

    length(): number {
        return this.value.length;
    }
}