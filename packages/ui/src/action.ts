import { NovaPage } from './page';
import { EventEmitter } from 'events';

export class PageAction extends EventEmitter {
    public readonly id: string;
    public readonly name: string;
    public readonly type: ActionType;
    
    protected page: NovaPage;
    protected enabled: boolean = true;
    protected visible: boolean = true;
    protected busy: boolean = false;
    protected shortcut?: string;
    protected image?: string;
    protected properties: Map<string, any> = new Map();

    constructor(options: ActionOptions) {
        super();
        this.id = options.id;
        this.name = options.name;
        this.type = options.type || ActionType.Action;
        this.page = options.page;
        this.shortcut = options.shortcut;
        this.image = options.image;
        this.enabled = options.enabled !== false;
        this.visible = options.visible !== false;
    }

    setPage(page: NovaPage): void {
        this.page = page;
    }

    async execute(): Promise<void> {
        if (!this.enabled || this.busy) return;
        
        this.busy = true;
        this.emit('executing');
        
        try {
            await this.onExecute();
            this.emit('executed');
        } catch (error) {
            this.emit('error', error);
            throw error;
        } finally {
            this.busy = false;
        }
    }

    protected async onExecute(): Promise<void> {
        // Override in derived classes
    }

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

    setProperty(name: string, value: any): void {
        this.properties.set(name, value);
        this.emit('propertyChanged', name, value);
    }

    getProperty(name: string): any {
        return this.properties.get(name);
    }

    isEnabled(): boolean {
        return this.enabled && !this.busy;
    }

    isVisible(): boolean {
        return this.visible;
    }

    isBusy(): boolean {
        return this.busy;
    }

    render(): any {
        return {
            id: this.id,
            name: this.name,
            type: this.type,
            enabled: this.isEnabled(),
            visible: this.isVisible(),
            busy: this.busy,
            shortcut: this.shortcut,
            image: this.image,
            properties: Object.fromEntries(this.properties)
        };
    }
}

export enum ActionType {
    Action = 'Action',
    Navigate = 'Navigate',
    Create = 'Create',
    Edit = 'Edit',
    Delete = 'Delete',
    Save = 'Save',
    Cancel = 'Cancel',
    Refresh = 'Refresh',
    Export = 'Export',
    Import = 'Import',
    Print = 'Print'
}

export interface ActionOptions {
    id: string;
    name: string;
    type?: ActionType;
    page: NovaPage;
    shortcut?: string;
    image?: string;
    enabled?: boolean;
    visible?: boolean;
}

// Standard Save Action
export class SaveAction extends PageAction {
    constructor(options: ActionOptions) {
        super({
            ...options,
            type: ActionType.Save,
            name: options.name || 'Save',
            image: options.image || 'save'
        });
    }

    protected async onExecute(): Promise<void> {
        await this.page.save();
    }
}

// Standard Cancel Action
export class CancelAction extends PageAction {
    constructor(options: ActionOptions) {
        super({
            ...options,
            type: ActionType.Cancel,
            name: options.name || 'Cancel',
            image: options.image || 'cancel'
        });
    }

    protected async onExecute(): Promise<void> {
        await this.page.cancel();
    }
}

// Standard Delete Action
export class DeleteAction extends PageAction {
    constructor(options: ActionOptions) {
        super({
            ...options,
            type: ActionType.Delete,
            name: options.name || 'Delete',
            image: options.image || 'delete'
        });
    }

    protected async onExecute(): Promise<void> {
        await this.page.delete();
    }
}

// Standard Refresh Action
export class RefreshAction extends PageAction {
    constructor(options: ActionOptions) {
        super({
            ...options,
            type: ActionType.Refresh,
            name: options.name || 'Refresh',
            image: options.image || 'refresh'
        });
    }

    protected async onExecute(): Promise<void> {
        await this.page.refresh();
    }
}