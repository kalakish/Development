export declare enum ObjectType {
    Table = "Table",
    Page = "Page",
    Codeunit = "Codeunit",
    Report = "Report",
    XMLPort = "XMLPort",
    Query = "Query",
    Enum = "Enum"
}
export interface INovaObject {
    id: number;
    name: string;
    objectType: ObjectType;
    metadata: Record<string, any>;
    triggers?: Record<string, TriggerDefinition>;
}
export interface FieldDefinition {
    id: number;
    name: string;
    dataType: DataType;
    length?: number;
    precision?: number;
    isPrimaryKey?: boolean;
    isNullable?: boolean;
    defaultValue?: any;
    validate?: ValidationRule[];
    triggers?: Record<string, TriggerHandler>;
}
export interface TriggerDefinition {
    name: string;
    eventType: EventType;
    handler: Function;
    priority?: number;
}
export declare enum EventType {
    OnInsert = "OnInsert",
    OnModify = "OnModify",
    OnDelete = "OnDelete",
    OnRename = "OnRename",
    OnValidate = "OnValidate",
    OnOpenPage = "OnOpenPage",
    OnClosePage = "OnClosePage",
    OnAfterGetRecord = "OnAfterGetRecord",
    OnNewRecord = "OnNewRecord",
    OnAction = "OnAction",
    OnBeforePost = "OnBeforePost",
    OnAfterPost = "OnAfterPost"
}
export declare enum DataType {
    Integer = "Integer",
    BigInteger = "BigInteger",
    Decimal = "Decimal",
    Boolean = "Boolean",
    Text = "Text",
    Code = "Code",
    Date = "Date",
    DateTime = "DateTime",
    Time = "Time",
    Guid = "Guid",
    Duration = "Duration",
    Blob = "Blob",
    Media = "Media",
    MediaSet = "MediaSet"
}
//# sourceMappingURL=object-types.d.ts.map