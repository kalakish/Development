import { ObjectMetadata, ObjectType } from './object-metadata';

export interface PageMetadata extends ObjectMetadata {
    objectType: ObjectType.Page;
    pageType: PageType;
    sourceTable?: string;
    layout: PageLayout;
    actions: PageAction[];
    triggers: PageTrigger[];
    editable?: boolean;
    insertAllowed?: boolean;
    modifyAllowed?: boolean;
    deleteAllowed?: boolean;
    caption?: string;
    instructionalText?: string;
    properties?: Record<string, any>;
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

export interface PageLayout {
    areas: LayoutArea[];
    properties?: Record<string, any>;
}

export interface LayoutArea {
    type: 'Content' | 'FactBoxes' | 'RoleCenter';
    groups: LayoutGroup[];
}

export interface LayoutGroup {
    name: string;
    caption?: string;
    fields: LayoutField[];
    visible?: boolean;
    expanded?: boolean;
    properties?: Record<string, any>;
}

export interface LayoutField {
    name: string;
    source: string;
    caption?: string;
    editable?: boolean;
    visible?: boolean;
    tooltip?: string;
    properties?: Record<string, any>;
}

export interface PageAction {
    id: string;
    name: string;
    caption?: string;
    tooltip?: string;
    image?: string;
    shortcut?: string;
    visible?: boolean;
    enabled?: boolean;
    trigger?: string;
    properties?: Record<string, any>;
}

export interface PageTrigger {
    name: 'OnOpenPage' | 'OnClosePage' | 'OnAfterGetRecord' | 'OnNewRecord' | 'OnInsertRecord' | 'OnModifyRecord' | 'OnDeleteRecord';
    enabled: boolean;
    body?: string;
    properties?: Record<string, any>;
}