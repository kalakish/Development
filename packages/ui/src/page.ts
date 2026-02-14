import { EventEmitter } from 'events';
import { Session } from '../core/session';
import { Record } from '../orm/record';

export abstract class NovaPage extends EventEmitter {
    protected session: Session;
    protected metadata: PageMetadata;
    protected record?: Record<any>;
    protected records: any[] = [];
    protected state: PageState;
    protected controls: Map<string, PageControl> = new Map();
    protected actions: Map<string, PageAction> = new Map();

    constructor(metadata: PageMetadata, session: Session) {
        super();
        this.metadata = metadata;
        this.session = session;
        this.state = {
            mode: PageMode.View,
            dirty: false,
            validating: false,
            loading: false,
            selectedRecords: [],
            currentRecord: null
        };
    }

    async initialize(): Promise<void> {
        await this.loadMetadata();
        await this.createControls();
        await this.registerActions();
        await this.executeTrigger('OnOpenPage');
    }

    async open(recordId?: string): Promise<void> {
        this.state.loading = true;
        
        try {
            if (recordId) {
                await this.loadRecord(recordId);
            } else {
                await this.createNewRecord();
            }
            
            await this.executeTrigger('OnAfterGetRecord');
            
        } finally {
            this.state.loading = false;
        }
    }

    async close(): Promise<void> {
        await this.executeTrigger('OnClosePage');
        this.emit('closed');
    }

    private async loadRecord(recordId: string): Promise<void> {
        const record = this.session.createRecord(this.metadata.sourceTable);
        const data = await record.find(recordId);
        
        if (data) {
            this.record = record;
            this.state.currentRecord = data;
            this.state.mode = PageMode.View;
            
            // Update controls with data
            this.updateControlsFromRecord();
        }
    }

    private async createNewRecord(): Promise<void> {
        const record = this.session.createRecord(this.metadata.sourceTable);
        this.record = record;
        this.state.currentRecord = record.getData();
        this.state.mode = PageMode.Edit;
        
        await this.executeTrigger('OnNewRecord');
        
        // Reset controls
        this.resetControls();
    }

    async save(): Promise<boolean> {
        if (!this.record) return false;
        
        this.state.validating = true;
        
        try {
            // Validate all controls
            const isValid = await this.validate();
            
            if (!isValid) {
                return false;
            }
            
            // Update record from controls
            this.updateRecordFromControls();
            
            // Save record
            let success: boolean;
            
            if (this.record.isNewRecord()) {
                success = await this.record.insert();
            } else {
                success = await this.record.modify();
            }
            
            if (success) {
                this.state.dirty = false;
                this.state.mode = PageMode.View;
                this.emit('saved', this.record.getData());
            }
            
            return success;
            
        } finally {
            this.state.validating = false;
        }
    }

    async delete(): Promise<boolean> {
        if (!this.record || this.record.isNewRecord()) {
            return false;
        }
        
        if (await this.confirmDelete()) {
            const success = await this.record.delete();
            
            if (success) {
                this.emit('deleted', this.record.getData());
                await this.close();
            }
            
            return success;
        }
        
        return false;
    }

    async edit(): Promise<void> {
        this.state.mode = PageMode.Edit;
        this.emit('modeChanged', PageMode.Edit);
    }

    async cancel(): Promise<void> {
        if (this.record) {
            this.record.reset();
            this.updateControlsFromRecord();
        }
        
        this.state.mode = PageMode.View;
        this.state.dirty = false;
        
        this.emit('cancelled');
    }

    async refresh(): Promise<void> {
        if (this.record && !this.record.isNewRecord()) {
            await this.record.find(this.record.getData()['SystemId']);
            this.updateControlsFromRecord();
            this.emit('refreshed');
        }
    }

    // Control management
    addControl(control: PageControl): void {
        this.controls.set(control.id, control);
        control.setPage(this);
        
        control.on('valueChanged', (value) => {
            this.state.dirty = true;
            this.emit('fieldChanged', {
                control: control.id,
                value
            });
        });
        
        control.on('validated', (isValid) => {
            this.emit('controlValidated', {
                control: control.id,
                isValid
            });
        });
    }

    getControl(id: string): PageControl | undefined {
        return this.controls.get(id);
    }

    // Action management
    registerAction(action: PageAction): void {
        this.actions.set(action.id, action);
        action.setPage(this);
    }

    async executeAction(actionId: string): Promise<void> {
        const action = this.actions.get(actionId);
        
        if (action) {
            await action.execute();
        }
    }

    // Validation
    async validate(): Promise<boolean> {
        let isValid = true;
        
        for (const control of this.controls.values()) {
            if (!await control.validate()) {
                isValid = false;
            }
        }
        
        return isValid;
    }

    // Data binding
    private updateControlsFromRecord(): void {
        if (!this.record) return;
        
        for (const control of this.controls.values()) {
            if (control.sourceField) {
                const value = this.record.getField(control.sourceField);
                control.setValue(value);
            }
        }
    }

    private updateRecordFromControls(): void {
        if (!this.record) return;
        
        for (const control of this.controls.values()) {
            if (control.sourceField && control.isDirty()) {
                this.record.setField(control.sourceField, control.getValue());
            }
        }
    }

    private resetControls(): void {
        for (const control of this.controls.values()) {
            control.reset();
        }
    }

    // Triggers
    protected async executeTrigger(triggerName: string): Promise<void> {
        const trigger = this.metadata.triggers?.find(t => t.name === triggerName);
        
        if (trigger && trigger.handler) {
            await trigger.handler(this);
        }
    }

    // Abstract methods
    protected abstract createControls(): Promise<void>;
    protected abstract loadMetadata(): Promise<void>;

    // Helper methods
    private async confirmDelete(): Promise<boolean> {
        // Show confirmation dialog
        return true;
    }

    // Getters
    getSession(): Session {
        return this.session;
    }

    getMetadata(): PageMetadata {
        return this.metadata;
    }

    getRecord(): Record<any> | undefined {
        return this.record;
    }

    getState(): PageState {
        return { ...this.state };
    }

    isEditable(): boolean {
        return this.state.mode === PageMode.Edit && 
               this.metadata.editable !== false;
    }

    isDirty(): boolean {
        return this.state.dirty;
    }

    isLoading(): boolean {
        return this.state.loading;
    }
}

export interface PageMetadata {
    id: number;
    name: string;
    pageType: PageType;
    sourceTable: string;
    layout: PageLayout;
    actions: PageActionMetadata[];
    triggers: PageTriggerMetadata[];
    editable?: boolean;
    insertAllowed?: boolean;
    modifyAllowed?: boolean;
    deleteAllowed?: boolean;
}

export enum PageType {
    Card = 'Card',
    List = 'List',
    Document = 'Document',
    RoleCenter = 'RoleCenter',
    ListPlus = 'ListPlus',
    Worksheet = 'Worksheet',
    StandardDialog = 'StandardDialog',
    ConfirmationDialog = 'ConfirmationDialog',
    NavigatePage = 'NavigatePage',
    CardPart = 'CardPart',
    ListPart = 'ListPart',
    HeadlinePart = 'HeadlinePart',
    PromptDialog = 'PromptDialog',
    UserControlHost = 'UserControlHost',
    ConfigurationDialog = 'ConfigurationDialog'
}

export enum PageMode {
    View = 'view',
    Edit = 'edit',
    Create = 'create',
    Delete = 'delete'
}

export interface PageState {
    mode: PageMode;
    dirty: boolean;
    validating: boolean;
    loading: boolean;
    selectedRecords: any[];
    currentRecord: any | null;
}

export interface PageLayout {
    areas: LayoutArea[];
}

export interface LayoutArea {
    type: string;
    groups: LayoutGroup[];
}

export interface LayoutGroup {
    name: string;
    fields: LayoutField[];
}

export interface LayoutField {
    name: string;
    source: string;
    properties: Record<string, any>;
}

export interface PageActionMetadata {
    id: string;
    name: string;
    trigger: {
        body: string;
    };
}

export interface PageTriggerMetadata {
    name: string;
    handler: Function;
}