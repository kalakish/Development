import { EventEmitter } from 'events';
import { NovaPage } from './page';

export abstract class PageControl extends EventEmitter {
    public readonly id: string;
    public readonly type: ControlType;
    public readonly name: string;
    public readonly sourceField?: string;
    
    protected page: NovaPage;
    protected value: any;
    protected originalValue: any;
    protected enabled: boolean = true;
    protected visible: boolean = true;
    protected required: boolean = false;
    protected readOnly: boolean = false;
    protected validationErrors: string[] = [];
    protected properties: Map<string, any> = new Map();

    constructor(options: ControlOptions) {
        super();
        this.id = options.id;
        this.type = options.type;
        this.name = options.name;
        this.sourceField = options.sourceField;
        this.page = options.page;
        
        this.value = options.defaultValue;
        this.originalValue = options.defaultValue;
        this.required = options.required || false;
        this.readOnly = options.readOnly || false;
        this.enabled = options.enabled !== false;
        this.visible = options.visible !== false;
    }

    setPage(page: NovaPage): void {
        this.page = page;
    }

    // Value management
    getValue(): any {
        return this.value;
    }

    setValue(value: any, triggerEvent: boolean = true): void {
        const oldValue = this.value;
        this.value = value;
        
        if (triggerEvent && oldValue !== value) {
            this.emit('valueChanged', value, oldValue);
        }
    }

    reset(): void {
        this.setValue(this.originalValue);
        this.validationErrors = [];
    }

    isDirty(): boolean {
        return this.value !== this.originalValue;
    }

    // Validation
    async validate(): Promise<boolean> {
        this.validationErrors = [];
        
        // Required validation
        if (this.required && (this.value === undefined || this.value === null || this.value === '')) {
            this.validationErrors.push(`${this.name} is required`);
        }
        
        // Custom validation
        await this.performValidation();
        
        const isValid = this.validationErrors.length === 0;
        
        this.emit('validated', isValid, this.validationErrors);
        
        return isValid;
    }

    protected abstract performValidation(): Promise<void>;

    getValidationErrors(): string[] {
        return [...this.validationErrors];
    }

    // State management
    enable(): void {
        this.enabled = true;
        this.emit('enabled');
    }

    disable(): void {
        this.enabled = false;
        this.emit('disabled');
    }

    show(): void {
        this.visible = true;
        this.emit('shown');
    }

    hide(): void {
        this.visible = false;
        this.emit('hidden');
    }

    // Properties
    setProperty(name: string, value: any): void {
        this.properties.set(name, value);
        this.emit('propertyChanged', name, value);
    }

    getProperty(name: string): any {
        return this.properties.get(name);
    }

    // Getters
    isEnabled(): boolean {
        return this.enabled && !this.readOnly;
    }

    isVisible(): boolean {
        return this.visible;
    }

    isRequired(): boolean {
        return this.required;
    }

    isReadOnly(): boolean {
        return this.readOnly;
    }

    // Render
    abstract render(): any;
}

export enum ControlType {
    TextBox = 'TextBox',
    NumberBox = 'NumberBox',
    DatePicker = 'DatePicker',
    CheckBox = 'CheckBox',
    ComboBox = 'ComboBox',
    ListBox = 'ListBox',
    RadioGroup = 'RadioGroup',
    Button = 'Button',
    Label = 'Label',
    Image = 'Image',
    Grid = 'Grid',
    TabControl = 'TabControl',
    GroupBox = 'GroupBox'
}

export interface ControlOptions {
    id: string;
    type: ControlType;
    name: string;
    page: NovaPage;
    sourceField?: string;
    defaultValue?: any;
    required?: boolean;
    readOnly?: boolean;
    enabled?: boolean;
    visible?: boolean;
}

// Text Box Control
export class TextBoxControl extends PageControl {
    private maxLength?: number;
    private multiline: boolean = false;
    private placeholder?: string;

    constructor(options: TextBoxOptions) {
        super(options);
        this.maxLength = options.maxLength;
        this.multiline = options.multiline || false;
        this.placeholder = options.placeholder;
    }

    protected async performValidation(): Promise<void> {
        // Max length validation
        if (this.maxLength && this.value?.length > this.maxLength) {
            this.validationErrors.push(
                `${this.name} cannot exceed ${this.maxLength} characters`
            );
        }
    }

    render() {
        return {
            type: 'textbox',
            id: this.id,
            name: this.name,
            value: this.value,
            multiline: this.multiline,
            maxLength: this.maxLength,
            placeholder: this.placeholder,
            enabled: this.isEnabled(),
            visible: this.isVisible(),
            required: this.isRequired(),
            readOnly: this.isReadOnly(),
            errors: this.validationErrors
        };
    }
}

export interface TextBoxOptions extends ControlOptions {
    maxLength?: number;
    multiline?: boolean;
    placeholder?: string;
}

// Number Box Control
export class NumberBoxControl extends PageControl {
    private min?: number;
    private max?: number;
    private decimals: number = 0;

    constructor(options: NumberBoxOptions) {
        super(options);
        this.min = options.min;
        this.max = options.max;
        this.decimals = options.decimals || 0;
    }

    setValue(value: any, triggerEvent: boolean = true): void {
        // Format number
        if (value !== undefined && value !== null) {
            value = Number(value);
            if (isNaN(value)) {
                value = null;
            }
        }
        super.setValue(value, triggerEvent);
    }

    protected async performValidation(): Promise<void> {
        if (this.value === null || this.value === undefined) return;
        
        // Min validation
        if (this.min !== undefined && this.value < this.min) {
            this.validationErrors.push(
                `${this.name} must be at least ${this.min}`
            );
        }
        
        // Max validation
        if (this.max !== undefined && this.value > this.max) {
            this.validationErrors.push(
                `${this.name} must be at most ${this.max}`
            );
        }
    }

    render() {
        return {
            type: 'numberbox',
            id: this.id,
            name: this.name,
            value: this.value,
            min: this.min,
            max: this.max,
            decimals: this.decimals,
            enabled: this.isEnabled(),
            visible: this.isVisible(),
            required: this.isRequired(),
            errors: this.validationErrors
        };
    }
}

export interface NumberBoxOptions extends ControlOptions {
    min?: number;
    max?: number;
    decimals?: number;
}

// Date Picker Control
export class DatePickerControl extends PageControl {
    private minDate?: Date;
    private maxDate?: Date;
    private format: string = 'MM/DD/YYYY';

    constructor(options: DatePickerOptions) {
        super(options);
        this.minDate = options.minDate;
        this.maxDate = options.maxDate;
        this.format = options.format || 'MM/DD/YYYY';
    }

    setValue(value: any, triggerEvent: boolean = true): void {
        // Parse date
        if (typeof value === 'string') {
            value = new Date(value);
        }
        super.setValue(value, triggerEvent);
    }

    protected async performValidation(): Promise<void> {
        if (!this.value) return;
        
        const date = new Date(this.value);
        
        // Min date validation
        if (this.minDate && date < this.minDate) {
            this.validationErrors.push(
                `${this.name} cannot be before ${this.minDate.toLocaleDateString()}`
            );
        }
        
        // Max date validation
        if (this.maxDate && date > this.maxDate) {
            this.validationErrors.push(
                `${this.name} cannot be after ${this.maxDate.toLocaleDateString()}`
            );
        }
    }

    render() {
        return {
            type: 'datepicker',
            id: this.id,
            name: this.name,
            value: this.value,
            minDate: this.minDate,
            maxDate: this.maxDate,
            format: this.format,
            enabled: this.isEnabled(),
            visible: this.isVisible(),
            required: this.isRequired(),
            errors: this.validationErrors
        };
    }
}

export interface DatePickerOptions extends ControlOptions {
    minDate?: Date;
    maxDate?: Date;
    format?: string;
}

// Check Box Control
export class CheckBoxControl extends PageControl {
    constructor(options: ControlOptions) {
        super(options);
    }

    setValue(value: any, triggerEvent: boolean = true): void {
        super.setValue(Boolean(value), triggerEvent);
    }

    protected async performValidation(): Promise<void> {
        // No additional validation for checkboxes
    }

    render() {
        return {
            type: 'checkbox',
            id: this.id,
            name: this.name,
            value: this.value,
            checked: this.value === true,
            enabled: this.isEnabled(),
            visible: this.isVisible(),
            required: this.isRequired()
        };
    }
}

// Combo Box Control
export class ComboBoxControl extends PageControl {
    private options: ComboBoxOption[];
    private allowCustom: boolean = false;

    constructor(options: ComboBoxOptions) {
        super(options);
        this.options = options.options || [];
        this.allowCustom = options.allowCustom || false;
    }

    setOptions(options: ComboBoxOption[]): void {
        this.options = options;
        this.emit('optionsChanged', options);
    }

    protected async performValidation(): Promise<void> {
        if (this.value && !this.allowCustom) {
            const validOption = this.options.some(opt => opt.value === this.value);
            if (!validOption) {
                this.validationErrors.push(
                    `${this.name} has an invalid selection`
                );
            }
        }
    }

    render() {
        return {
            type: 'combobox',
            id: this.id,
            name: this.name,
            value: this.value,
            options: this.options,
            allowCustom: this.allowCustom,
            enabled: this.isEnabled(),
            visible: this.isVisible(),
            required: this.isRequired(),
            errors: this.validationErrors
        };
    }
}

export interface ComboBoxOption {
    value: any;
    label: string;
    disabled?: boolean;
}

export interface ComboBoxOptions extends ControlOptions {
    options?: ComboBoxOption[];
    allowCustom?: boolean;
}