import { TokenType } from './lexer';

export interface Position {
    line: number;
    column: number;
}

export interface Node {
    type: string;
    position: Position;
}

// Root Program
export interface Program extends Node {
    type: 'Program';
    objects: ObjectDefinition[];
}

// Object Definitions
export interface ObjectDefinition extends Node {
    id: number;
    name: string;
    objectType: TokenType;
    properties: Property[];
    extensions?: ObjectExtension[];
}

export interface TableDefinition extends ObjectDefinition {
    fields: FieldDefinition[];
    keys: KeyDefinition[];
    triggers: TriggerDefinition[];
}

export interface PageDefinition extends ObjectDefinition {
    pageType: string;
    sourceTable: string;
    layout: PageLayout;
    actions: ActionDefinition[];
    triggers: TriggerDefinition[];
}

export interface CodeunitDefinition extends ObjectDefinition {
    procedures: ProcedureDefinition[];
    eventSubscribers: EventSubscriberDefinition[];
}

export interface ReportDefinition extends ObjectDefinition {
    dataset: DataItemDefinition[];
    requestPage: RequestPageDefinition;
    triggers: TriggerDefinition[];
}

export interface XMLPortDefinition extends ObjectDefinition {
    schema: SchemaDefinition;
    tableMapping: TableMappingDefinition[];
}

// Field Definitions
export interface FieldDefinition extends Node {
    id: number;
    name: string;
    dataType: TokenType;
    length?: number;
    precision?: number;
    properties: Property[];
    triggers: FieldTriggerDefinition[];
}

export interface KeyDefinition extends Node {
    fields: string[];
    clustered: boolean;
    unique: boolean;
}

// Trigger Definitions
export interface TriggerDefinition extends Node {
    name: string;
    parameters: ParameterDefinition[];
    body: Statement[];
}

export interface FieldTriggerDefinition extends Node {
    fieldName: string;
    triggerName: string;
    body: Statement[];
}

// Layout Definitions
export interface PageLayout extends Node {
    areas: LayoutArea[];
}

export interface LayoutArea extends Node {
    type: string;
    groups: LayoutGroup[];
}

export interface LayoutGroup extends Node {
    name: string;
    fields: LayoutField[];
}

export interface LayoutField extends Node {
    name: string;
    source: string;
    properties: Property[];
}

// Action Definitions
export interface ActionDefinition extends Node {
    name: string;
    trigger: TriggerDefinition;
}

// Procedure Definitions
export interface ProcedureDefinition extends Node {
    name: string;
    parameters: ParameterDefinition[];
    returnType?: TokenType;
    body: Statement[];
    isEvent?: boolean;
    isIntegration?: boolean;
}

export interface ParameterDefinition extends Node {
    name: string;
    type: TokenType;
    isVar?: boolean;
}

// Event Subscriber
export interface EventSubscriberDefinition extends Node {
    eventName: string;
    procedureName: string;
    priority?: number;
}

// Dataset Definitions
export interface DataItemDefinition extends Node {
    name: string;
    tableName: string;
    columns: ColumnDefinition[];
    childItems: DataItemDefinition[];
}

export interface ColumnDefinition extends Node {
    name: string;
    source: string;
}

// Schema Definitions
export interface SchemaDefinition extends Node {
    root: SchemaElement;
}

export interface SchemaElement extends Node {
    type: 'text' | 'table' | 'field';
    name: string;
    children: SchemaElement[];
    source?: string;
}

// Statements
export type Statement = 
    | VariableDeclarationStatement
    | AssignmentStatement
    | IfStatement
    | WhileStatement
    | ForStatement
    | RepeatStatement
    | CaseStatement
    | ExitStatement
    | BreakStatement
    | ContinueStatement
    | ReturnStatement
    | ExpressionStatement
    | BlockStatement;

export interface VariableDeclarationStatement extends Node {
    type: 'VariableDeclaration';
    name: string;
    dataType: TokenType;
    initializer?: Expression;
}

export interface AssignmentStatement extends Node {
    type: 'Assignment';
    left: Expression;
    right: Expression;
}

export interface IfStatement extends Node {
    type: 'IfStatement';
    condition: Expression;
    thenBranch: Statement[];
    elseBranch: Statement[];
}

export interface WhileStatement extends Node {
    type: 'WhileStatement';
    condition: Expression;
    body: Statement[];
}

export interface ForStatement extends Node {
    type: 'ForStatement';
    variable: string;
    start: Expression;
    end: Expression;
    body: Statement[];
}

export interface RepeatStatement extends Node {
    type: 'RepeatStatement';
    body: Statement[];
    condition: Expression;
}

export interface CaseStatement extends Node {
    type: 'CaseStatement';
    expression: Expression;
    cases: CaseBranch[];
    elseBranch?: Statement[];
}

export interface CaseBranch extends Node {
    values: Expression[];
    body: Statement[];
}

// Expressions
export type Expression =
    | LiteralExpression
    | IdentifierExpression
    | BinaryExpression
    | UnaryExpression
    | CallExpression
    | MemberExpression
    | RecordExpression
    | FilterExpression;

export interface LiteralExpression extends Node {
    type: 'Literal';
    value: any;
    valueType: TokenType;
}

export interface IdentifierExpression extends Node {
    type: 'Identifier';
    name: string;
}

export interface BinaryExpression extends Node {
    type: 'Binary';
    left: Expression;
    operator: string;
    right: Expression;
}

export interface UnaryExpression extends Node {
    type: 'Unary';
    operator: string;
    operand: Expression;
}

export interface CallExpression extends Node {
    type: 'Call';
    callee: Expression;
    arguments: Expression[];
}

export interface MemberExpression extends Node {
    type: 'Member';
    object: Expression;
    property: Expression;
    computed: boolean;
}

export interface RecordExpression extends Node {
    type: 'Record';
    fields: Record<string, Expression>;
}

export interface FilterExpression extends Node {
    type: 'Filter';
    field: string;
    operator: string;
    value: Expression;
}

// Properties
export interface Property extends Node {
    name: string;
    value: any;
}