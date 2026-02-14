import { ObjectMetadata, ObjectType } from './object-metadata';

export interface ReportMetadata extends ObjectMetadata {
    objectType: ObjectType.Report;
    datasets: ReportDataset[];
    parameters?: ReportParameter[];
    triggers?: ReportTrigger[];
    layout?: ReportLayout;
    properties?: Record<string, any>;
}

export interface ReportDataset {
    name: string;
    tableName: string;
    columns: ReportColumn[];
    relations?: ReportRelation[];
    filters?: ReportFilter[];
    properties?: Record<string, any>;
}

export interface ReportColumn {
    name: string;
    source: string;
    dataType: string;
    caption?: string;
    format?: string;
    width?: number;
    visible?: boolean;
    isAggregate?: boolean;
    aggregateType?: 'Sum' | 'Avg' | 'Count' | 'Min' | 'Max';
    properties?: Record<string, any>;
}

export interface ReportRelation {
    type: 'inner' | 'left' | 'right' | 'full';
    table: string;
    condition: string;
    properties?: Record<string, any>;
}

export interface ReportParameter {
    name: string;
    type: 'Integer' | 'Decimal' | 'String' | 'Boolean' | 'Date' | 'DateTime' | 'Option';
    required: boolean;
    defaultValue?: any;
    validValues?: any[];
    caption?: string;
    properties?: Record<string, any>;
}

export interface ReportTrigger {
    name: 'OnPreReport' | 'OnPostReport' | 'OnPreDataItem' | 'OnPostDataItem';
    enabled: boolean;
    body?: string;
    properties?: Record<string, any>;
}

export interface ReportLayout {
    type: 'rdlc' | 'rdl' | 'word' | 'excel';
    source?: string;
    properties?: Record<string, any>;
}