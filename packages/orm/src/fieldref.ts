import { Record } from './record';
import { DateTime } from '@nova/core/data-types/datetime';
import { Decimal } from '@nova/core/data-types/decimal';
import { Code } from '@nova/core/data-types/code';
import { Option } from '@nova/core/data-types/option';

export class FieldRef {
    private record: Record<any>;
    private fieldName: string;
    private fieldMetadata: any;

    constructor(record: Record<any>, fieldName: string) {
        this.record = record;
        this.fieldName = fieldName;
        this.fieldMetadata = this.getFieldMetadata();
    }

    // ============ Value Operations ============

    value(): any {
        return this.record.getField(this.fieldName);
    }

    setValue(value: any): void {
        this.record.setField(this.fieldName, this.convertValue(value));
    }

    private convertValue(value: any): any {
        if (!value) return value;

        const fieldType = this.fieldMetadata?.dataType;

        switch (fieldType) {
            case 'Integer':
            case 'BigInteger':
                return Number(value);
            case 'Decimal':
                return value instanceof Decimal ? value : new Decimal(value);
            case 'Boolean':
                return Boolean(value);
            case 'Code':
                return value instanceof Code ? value : new Code(value, this.fieldMetadata.length);
            case 'DateTime':
                return value instanceof DateTime ? value : new DateTime(value);
            case 'Date':
                return value instanceof DateTime ? value.toDate() : new Date(value);
            case 'Option':
                return value instanceof Option ? value : new Option(this.fieldMetadata.optionMetadata, value);
            default:
                return value;
        }
    }

    // ============ Validation ============

    validate(): boolean {
        return this.record.validate(this.fieldName);
    }

    testField(errorMessage?: string): void {
        this.record.testField(this.fieldName, errorMessage);
    }

    // ============ Metadata ============

    name(): string {
        return this.fieldName;
    }

    caption(): string {
        return this.fieldMetadata?.caption || this.fieldName;
    }

    type(): string {
        return this.fieldMetadata?.dataType || 'Text';
    }

    length(): number | undefined {
        return this.fieldMetadata?.length;
    }

    precision(): number | undefined {
        return this.fieldMetadata?.precision;
    }

    scale(): number | undefined {
        return this.fieldMetadata?.scale;
    }

    isNullable(): boolean {
        return this.fieldMetadata?.isNullable !== false;
    }

    isPrimaryKey(): boolean {
        return this.fieldMetadata?.isPrimaryKey === true;
    }

    isEditable(): boolean {
        if (this.fieldMetadata?.isPrimaryKey) {
            return false;
        }
        return this.fieldMetadata?.editable !== false;
    }

    // ============ Flow Fields ============

    calcField(): void {
        this.record.calcFields(this.fieldName);
    }

    // ============ Option Fields ============

    optionMembers(): string[] {
        return this.fieldMetadata?.optionMembers || [];
    }

    optionCaption(optionValue: number): string {
        const members = this.fieldMetadata?.optionMembers || [];
        const captions = this.fieldMetadata?.optionCaptions || [];
        return captions[optionValue] || members[optionValue] || '';
    }

    // ============ Blob/Media Fields ============

    async asBlob(): Promise<Buffer> {
        const value = this.value();
        if (Buffer.isBuffer(value)) return value;
        if (typeof value === 'string') return Buffer.from(value, 'base64');
        return Buffer.from(value || '');
    }

    async asBase64(): Promise<string> {
        const buffer = await this.asBlob();
        return buffer.toString('base64');
    }

    // ============ Type Conversion ============

    asInteger(): number {
        const value = this.value();
        if (value instanceof Decimal) return value.toNumber();
        return Number(value) || 0;
    }

    asDecimal(): Decimal {
        const value = this.value();
        if (value instanceof Decimal) return value;
        return new Decimal(value || 0);
    }

    asBoolean(): boolean {
        const value = this.value();
        if (typeof value === 'boolean') return value;
        if (typeof value === 'number') return value !== 0;
        if (typeof value === 'string') return value.toLowerCase() === 'true';
        return Boolean(value);
    }

    asString(): string {
        const value = this.value();
        if (value === null || value === undefined) return '';
        if (value instanceof DateTime) return value.toISOString();
        if (value instanceof Decimal) return value.toString();
        if (value instanceof Code) return value.toString();
        if (value instanceof Option) return value.toString();
        return String(value);
    }

    asDate(): Date | null {
        const value = this.value();
        if (!value) return null;
        if (value instanceof DateTime) return value.toDate();
        if (value instanceof Date) return value;
        return new Date(value);
    }

    asDateTime(): DateTime | null {
        const value = this.value();
        if (!value) return null;
        if (value instanceof DateTime) return value;
        if (value instanceof Date) return new DateTime(value);
        return new DateTime(value);
    }

    asOption(): Option | null {
        const value = this.value();
        if (!value) return null;
        if (value instanceof Option) return value;
        return new Option(this.fieldMetadata?.optionMetadata, value);
    }

    // ============ Comparison ============

    equals(other: any): boolean {
        const thisValue = this.value();
        if (thisValue instanceof Decimal && other instanceof Decimal) {
            return thisValue.equals(other);
        }
        if (thisValue instanceof DateTime && other instanceof DateTime) {
            return thisValue.equals(other);
        }
        return thisValue === other;
    }

    isNull(): boolean {
        const value = this.value();
        return value === null || value === undefined;
    }

    // ============ Events ============

    onValidate(handler: (value: any, oldValue: any) => void): void {
        this.record.on(`fieldChanged:${this.fieldName}`, (data) => {
            if (data.field === this.fieldName) {
                handler(data.newValue, data.oldValue);
            }
        });
    }

    onChange(handler: (value: any, oldValue: any) => void): void {
        this.record.on(`fieldChanged:${this.fieldName}`, (data) => {
            if (data.field === this.fieldName) {
                handler(data.newValue, data.oldValue);
            }
        });
    }

    // ============ Private Helpers ============

    private getFieldMetadata(): any {
        const metadata = this.record.getMetadata();
        return metadata.fields.find(f => f.name === this.fieldName);
    }

    // ============ FlowField Calculation ============

    async calculate(): Promise<any> {
        const field = this.fieldMetadata;
        if (!field?.isFlowField) {
            throw new Error(`Field ${this.fieldName} is not a flow field`);
        }

        const formula = field.calculationFormula;
        if (!formula) {
            throw new Error(`No calculation formula defined for flow field ${this.fieldName}`);
        }

        // Execute calculation based on formula type
        switch (field.calculationType) {
            case 'Sum':
                return this.calculateSum(formula);
            case 'Count':
                return this.calculateCount(formula);
            case 'Average':
                return this.calculateAverage(formula);
            case 'Min':
                return this.calculateMin(formula);
            case 'Max':
                return this.calculateMax(formula);
            case 'Lookup':
                return this.calculateLookup(formula);
            default:
                throw new Error(`Unsupported flow field type: ${field.calculationType}`);
        }
    }

    private async calculateSum(formula: string): Promise<number> {
        // Parse formula and execute SQL SUM
        return 0;
    }

    private async calculateCount(formula: string): Promise<number> {
        // Parse formula and execute SQL COUNT
        return 0;
    }

    private async calculateAverage(formula: string): Promise<number> {
        // Parse formula and execute SQL AVG
        return 0;
    }

    private async calculateMin(formula: string): Promise<number> {
        // Parse formula and execute SQL MIN
        return 0;
    }

    private async calculateMax(formula: string): Promise<number> {
        // Parse formula and execute SQL MAX
        return 0;
    }

    private async calculateLookup(formula: string): Promise<any> {
        // Parse formula and execute field lookup
        return null;
    }
}