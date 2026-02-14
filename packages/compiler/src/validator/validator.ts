import * as AST from '../parser/ast';
import { SymbolTable, SymbolType, ScopeType } from './symbol-table';
import { TypeChecker } from './type-checker';
import { Diagnostic } from '../compiler';

export class SemanticValidator {
    private symbolTable: SymbolTable;
    private typeChecker: TypeChecker;
    private diagnostics: Diagnostic[];
    private currentObject: any;

    constructor() {
        this.symbolTable = new SymbolTable();
        this.typeChecker = new TypeChecker();
        this.diagnostics = [];
    }

    validate(ast: AST.Program): Diagnostic[] {
        this.diagnostics = [];
        
        // Phase 1: Build symbol table
        this.buildSymbolTable(ast);
        
        // Phase 2: Validate object definitions
        for (const obj of ast.objects) {
            this.currentObject = obj;
            
            switch (obj.objectType) {
                case 'TABLE':
                    this.validateTable(obj);
                    break;
                case 'PAGE':
                    this.validatePage(obj);
                    break;
                case 'CODEUNIT':
                    this.validateCodeunit(obj);
                    break;
                case 'REPORT':
                    this.validateReport(obj);
                    break;
                case 'XMLPORT':
                    this.validateXMLPort(obj);
                    break;
                case 'QUERY':
                    this.validateQuery(obj);
                    break;
                case 'ENUM':
                    this.validateEnum(obj);
                    break;
            }
        }
        
        // Phase 3: Cross-object validation
        this.validateCrossReferences(ast);
        
        return this.diagnostics;
    }

    private buildSymbolTable(ast: AST.Program): void {
        // First pass: register all objects
        for (const obj of ast.objects) {
            this.symbolTable.define({
                name: obj.name,
                type: SymbolType[obj.objectType],
                metadata: obj,
                position: obj.position
            });
        }

        // Second pass: register object members
        for (const obj of ast.objects) {
            this.symbolTable.enterScope(ScopeType.Object, obj.name);
            
            if (obj.objectType === 'TABLE') {
                this.registerTableMembers(obj);
            } else if (obj.objectType === 'CODEUNIT') {
                this.registerCodeunitMembers(obj);
            } else if (obj.objectType === 'PAGE') {
                this.registerPageMembers(obj);
            }
            
            this.symbolTable.exitScope();
        }
    }

    private registerTableMembers(table: AST.TableDefinition): void {
        // Register fields
        for (const field of table.fields) {
            this.symbolTable.define({
                name: field.name,
                type: SymbolType.Field,
                dataType: field.dataType,
                metadata: field,
                position: field.position
            });
        }

        // Register triggers
        for (const trigger of table.triggers) {
            this.symbolTable.define({
                name: trigger.name,
                type: SymbolType.Trigger,
                metadata: trigger,
                position: trigger.position
            });
        }
    }

    private registerCodeunitMembers(codeunit: AST.CodeunitDefinition): void {
        // Register procedures
        for (const proc of codeunit.procedures) {
            this.symbolTable.define({
                name: proc.name,
                type: SymbolType.Procedure,
                metadata: proc,
                position: proc.position
            });
        }
    }

    private registerPageMembers(page: AST.PageDefinition): void {
        // Register layout fields
        this.registerLayoutFields(page.layout);
        
        // Register actions
        for (const action of page.actions) {
            this.symbolTable.define({
                name: action.name,
                type: SymbolType.Action,
                metadata: action,
                position: action.position
            });
        }
    }

    private registerLayoutFields(layout: AST.PageLayout): void {
        for (const area of layout.areas) {
            for (const group of area.groups) {
                for (const field of group.fields) {
                    this.symbolTable.define({
                        name: field.name,
                        type: SymbolType.Field,
                        metadata: field,
                        position: field.position
                    });
                }
            }
        }
    }

    private validateTable(table: AST.TableDefinition): void {
        // Validate table ID
        this.validateObjectId(table.id, 'Table');
        
        // Validate field IDs are unique and sequential
        this.validateFieldIds(table.fields);
        
        // Validate field names are unique
        this.validateUniqueFieldNames(table.fields);
        
        // Validate primary key
        this.validatePrimaryKey(table);
        
        // Validate field data types
        for (const field of table.fields) {
            this.validateFieldDataType(field);
        }
        
        // Validate triggers
        for (const trigger of table.triggers) {
            this.validateTrigger(trigger);
        }
        
        // Validate field triggers
        for (const field of table.fields) {
            for (const trigger of field.triggers) {
                this.validateFieldTrigger(trigger, field);
            }
        }
    }

    private validateFieldIds(fields: AST.FieldDefinition[]): void {
        const ids = new Set<number>();
        
        for (const field of fields) {
            if (ids.has(field.id)) {
                this.addError(
                    `Duplicate field ID: ${field.id}`,
                    field.position
                );
            }
            ids.add(field.id);
        }
        
        // Check sequential ordering
        const sortedIds = Array.from(ids).sort((a, b) => a - b);
        for (let i = 0; i < sortedIds.length; i++) {
            if (sortedIds[i] !== i + 1) {
                this.addWarning(
                    `Field IDs should be sequential. Expected ${i + 1}, got ${sortedIds[i]}`,
                    fields[i].position
                );
            }
        }
    }

    private validateUniqueFieldNames(fields: AST.FieldDefinition[]): void {
        const names = new Set<string>();
        
        for (const field of fields) {
            if (names.has(field.name)) {
                this.addError(
                    `Duplicate field name: ${field.name}`,
                    field.position
                );
            }
            names.add(field.name);
        }
    }

    private validatePrimaryKey(table: AST.TableDefinition): void {
        const primaryKeys = table.keys.filter(k => k.clustered);
        
        if (primaryKeys.length === 0) {
            this.addWarning(
                'Table has no primary key. Consider adding a clustered key.',
                table.position
            );
        } else if (primaryKeys.length > 1) {
            this.addError(
                'Table cannot have multiple clustered keys',
                primaryKeys[1].position
            );
        } else {
            // Validate primary key fields exist
            const key = primaryKeys[0];
            const fieldNames = new Set(table.fields.map(f => f.name));
            
            for (const fieldName of key.fields) {
                if (!fieldNames.has(fieldName)) {
                    this.addError(
                        `Primary key field '${fieldName}' does not exist`,
                        key.position
                    );
                }
            }
        }
    }

    private validateFieldDataType(field: AST.FieldDefinition): void {
        // Check length for Text/Code fields
        if ((field.dataType === 'Text' || field.dataType === 'Code') && !field.length) {
            this.addWarning(
                `Field '${field.name}' should specify a length`,
                field.position
            );
        }
        
        // Check precision for Decimal fields
        if (field.dataType === 'Decimal' && !field.precision) {
            this.addWarning(
                `Field '${field.name}' should specify precision`,
                field.position
            );
        }
    }

    private validateTrigger(trigger: AST.TriggerDefinition): void {
        // Validate trigger body
        if (trigger.body.length === 0) {
            this.addWarning(
                `Trigger '${trigger.name}' has empty body`,
                trigger.position
            );
        }
        
        // Validate trigger parameters
        for (const param of trigger.parameters) {
            this.validateParameter(param);
        }
    }

    private validateFieldTrigger(trigger: AST.FieldTriggerDefinition, field: AST.FieldDefinition): void {
        // Set field name reference
        trigger.fieldName = field.name;
        
        // Validate trigger body
        if (trigger.body.length === 0) {
            this.addWarning(
                `Field validation trigger for '${field.name}' has empty body`,
                trigger.position
            );
        }
    }

    private validatePage(page: AST.PageDefinition): void {
        // Validate page type
        const validPageTypes = ['Card', 'List', 'Document', 'RoleCenter', 'ListPlus', 
                               'Worksheet', 'StandardDialog', 'ConfirmationDialog', 
                               'NavigatePage', 'CardPart', 'ListPart', 'HeadlinePart',
                               'PromptDialog', 'UserControlHost', 'ConfigurationDialog'];
        
        if (!validPageTypes.includes(page.pageType)) {
            this.addError(
                `Invalid page type: ${page.pageType}`,
                page.position
            );
        }
        
        // Validate source table exists
        if (page.sourceTable) {
            const tableSymbol = this.symbolTable.resolve(page.sourceTable);
            if (!tableSymbol || tableSymbol.type !== SymbolType.Table) {
                this.addError(
                    `Source table '${page.sourceTable}' does not exist`,
                    page.position
                );
            }
        }
        
        // Validate layout
        this.validatePageLayout(page.layout);
        
        // Validate actions
        for (const action of page.actions) {
            this.validateAction(action);
        }
        
        // Validate page triggers
        for (const trigger of page.triggers) {
            this.validateTrigger(trigger);
        }
    }

    private validatePageLayout(layout: AST.PageLayout): void {
        const validAreaTypes = ['Content', 'FactBoxes', 'RoleCenter'];
        
        for (const area of layout.areas) {
            if (!validAreaTypes.includes(area.type)) {
                this.addError(
                    `Invalid area type: ${area.type}`,
                    area.position
                );
            }
            
            for (const group of area.groups) {
                for (const field of group.fields) {
                    // Validate field source exists in source table
                    this.validateFieldReference(field.source);
                }
            }
        }
    }

    private validateAction(action: AST.ActionDefinition): void {
        if (!action.trigger || action.trigger.body.length === 0) {
            this.addWarning(
                `Action '${action.name}' has no implementation`,
                action.position
            );
        }
    }

    private validateCodeunit(codeunit: AST.CodeunitDefinition): void {
        // Validate procedure names are unique
        const procNames = new Set<string>();
        
        for (const proc of codeunit.procedures) {
            if (procNames.has(proc.name)) {
                this.addError(
                    `Duplicate procedure name: ${proc.name}`,
                    proc.position
                );
            }
            procNames.add(proc.name);
            
            this.validateProcedure(proc);
        }
        
        // Validate event subscribers
        for (const subscriber of codeunit.eventSubscribers) {
            this.validateEventSubscriber(subscriber, codeunit);
        }
    }

    private validateProcedure(proc: AST.ProcedureDefinition): void {
        // Validate parameters
        const paramNames = new Set<string>();
        
        for (const param of proc.parameters) {
            if (paramNames.has(param.name)) {
                this.addError(
                    `Duplicate parameter name: ${param.name}`,
                    param.position
                );
            }
            paramNames.add(param.name);
            
            this.validateParameter(param);
        }
        
        // Validate return type
        if (proc.returnType) {
            this.validateDataType(proc.returnType);
        }
        
        // Validate procedure body
        if (proc.body.length === 0 && !proc.isEvent) {
            this.addWarning(
                `Procedure '${proc.name}' has empty body`,
                proc.position
            );
        }
        
        // Validate event attributes
        if (proc.isEvent && proc.returnType) {
            this.addError(
                'Event procedures cannot have return types',
                proc.position
            );
        }
    }

    private validateParameter(param: AST.ParameterDefinition): void {
        this.validateDataType(param.type);
        
        // Record parameters cannot be passed by value
        if (param.type === 'Record' && !param.isVar) {
            this.addWarning(
                `Record parameter '${param.name}' should be passed by reference using VAR`,
                param.position
            );
        }
    }

    private validateEventSubscriber(subscriber: AST.EventSubscriberDefinition, codeunit: AST.CodeunitDefinition): void {
        // Validate procedure exists
        const proc = codeunit.procedures.find(p => p.name === subscriber.procedureName);
        
        if (!proc) {
            this.addError(
                `Event subscriber procedure '${subscriber.procedureName}' does not exist`,
                subscriber.position
            );
        } else {
            // Validate procedure signature
            if (proc.parameters.length === 0) {
                this.addError(
                    'Event subscriber must have at least one parameter (the sender)',
                    proc.position
                );
            }
        }
        
        // Validate priority range
        if (subscriber.priority < 0 || subscriber.priority > 100) {
            this.addWarning(
                'Event subscriber priority should be between 0 and 100',
                subscriber.position
            );
        }
    }

    private validateReport(report: AST.ReportDefinition): void {
        // Validate dataset
        for (const dataItem of report.dataset) {
            this.validateDataItem(dataItem);
        }
        
        // Validate triggers
        for (const trigger of report.triggers) {
            this.validateTrigger(trigger);
        }
    }

    private validateDataItem(dataItem: AST.DataItemDefinition): void {
        // Validate table exists
        const tableSymbol = this.symbolTable.resolve(dataItem.tableName);
        if (!tableSymbol || tableSymbol.type !== SymbolType.Table) {
            this.addError(
                `Data item table '${dataItem.tableName}' does not exist`,
                dataItem.position
            );
        }
        
        // Validate columns
        for (const column of dataItem.columns) {
            this.validateFieldReference(column.source);
        }
        
        // Validate child items
        for (const child of dataItem.childItems) {
            this.validateDataItem(child);
        }
    }

    private validateXMLPort(xmlport: AST.XMLPortDefinition): void {
        if (xmlport.schema) {
            this.validateSchemaElement(xmlport.schema.root);
        }
        
        // Validate table mappings
        for (const mapping of xmlport.tableMapping) {
            const tableSymbol = this.symbolTable.resolve(mapping.source);
            if (!tableSymbol || tableSymbol.type !== SymbolType.Table) {
                this.addError(
                    `Mapped table '${mapping.source}' does not exist`,
                    mapping.position
                );
            }
        }
    }

    private validateSchemaElement(element: AST.SchemaElement): void {
        if (element.type === 'table') {
            const tableSymbol = this.symbolTable.resolve(element.source);
            if (!tableSymbol || tableSymbol.type !== SymbolType.Table) {
                this.addError(
                    `Schema table '${element.source}' does not exist`,
                    element.position
                );
            }
        }
        
        for (const child of element.children) {
            this.validateSchemaElement(child);
        }
    }

    private validateQuery(query: AST.QueryDefinition): void {
        // Validate query type
        const validQueryTypes = ['Normal', 'Static', 'API'];
        if (!validQueryTypes.includes(query.dataType)) {
            this.addWarning(
                `Invalid query type: ${query.dataType}. Using 'Normal'`,
                query.position
            );
        }
        
        // Validate data items
        for (const element of query.elements) {
            if (element.type === 'QueryDataItem') {
                const tableSymbol = this.symbolTable.resolve(element.tableName);
                if (!tableSymbol || tableSymbol.type !== SymbolType.Table) {
                    this.addError(
                        `Query data item table '${element.tableName}' does not exist`,
                        element.position
                    );
                }
                
                // Validate link
                if (element.link) {
                    this.validateFieldReference(element.link.from);
                    this.validateFieldReference(element.link.to);
                }
            } else if (element.type === 'QueryColumn') {
                this.validateFieldReference(element.source);
            }
        }
        
        // Validate filters
        for (const filter of query.filters) {
            this.validateFieldReference(filter.field);
        }
        
        // Validate order by
        for (const order of query.orderBy) {
            this.validateFieldReference(order.field);
        }
    }

    private validateEnum(enumDef: AST.EnumDefinition): void {
        // Validate enum values are unique
        const ids = new Set<number>();
        const names = new Set<string>();
        
        for (const value of enumDef.values) {
            if (ids.has(value.id)) {
                this.addError(
                    `Duplicate enum value ID: ${value.id}`,
                    value.position
                );
            }
            ids.add(value.id);
            
            if (names.has(value.name)) {
                this.addError(
                    `Duplicate enum value name: ${value.name}`,
                    value.position
                );
            }
            names.add(value.name);
        }
        
        // Validate sequential IDs
        const sortedIds = Array.from(ids).sort((a, b) => a - b);
        for (let i = 0; i < sortedIds.length; i++) {
            if (sortedIds[i] !== i) {
                this.addWarning(
                    `Enum value IDs should be sequential starting from 0`,
                    enumDef.values[i].position
                );
                break;
            }
        }
    }

    private validateFieldReference(expression: any): void {
        if (!expression) return;
        
        if (expression.type === 'Identifier') {
            // Check if field exists in current table context
            const symbol = this.symbolTable.resolve(expression.name);
            if (!symbol) {
                this.addWarning(
                    `Field '${expression.name}' may not exist`,
                    expression.position
                );
            }
        } else if (expression.type === 'Member') {
            this.validateFieldReference(expression.object);
            this.validateFieldReference(expression.property);
        }
    }

    private validateDataType(dataType: string): void {
        const validTypes = [
            'Integer', 'BigInteger', 'Decimal', 'Boolean', 'Text', 'Code',
            'Date', 'DateTime', 'Time', 'Guid', 'Blob', 'Media', 'MediaSet',
            'Record', 'RecordRef', 'FieldRef', 'JsonObject', 'JsonArray',
            'HttpClient', 'XmlDocument', 'InStream', 'OutStream', 'Variant'
        ];
        
        // Check for generic types
        if (dataType.startsWith('List<')) {
            const innerType = dataType.substring(5, dataType.length - 1);
            this.validateDataType(innerType);
        } else if (dataType.startsWith('Dictionary<')) {
            const types = dataType.substring(11, dataType.length - 1).split(',');
            this.validateDataType(types[0].trim());
            this.validateDataType(types[1].trim());
        } else if (!validTypes.includes(dataType)) {
            this.addError(`Invalid data type: ${dataType}`);
        }
    }

    private validateObjectId(id: number, objectType: string): void {
        // Business Central AL range conventions
        if (id >= 50000 && id <= 99999) {
            // Custom objects - valid range
        } else if (id >= 1 && id <= 49999) {
            this.addWarning(
                `${objectType} ID ${id} is in the Microsoft reserved range (1-49999)`,
                this.currentObject?.position
            );
        } else if (id > 99999) {
            this.addWarning(
                `${objectType} ID ${id} exceeds recommended maximum (99999)`,
                this.currentObject?.position
            );
        }
    }

    private validateCrossReferences(ast: AST.Program): void {
        // Validate all object references
        // This would traverse the AST and check that all referenced objects exist
    }

    private addError(message: string, position?: any): void {
        this.diagnostics.push({
            severity: 'error',
            message,
            position,
            code: 'NOVA0001'
        });
    }

    private addWarning(message: string, position?: any): void {
        this.diagnostics.push({
            severity: 'warning',
            message,
            position,
            code: 'NOVA1001'
        });
    }

    private addInfo(message: string, position?: any): void {
        this.diagnostics.push({
            severity: 'info',
            message,
            position,
            code: 'NOVA2001'
        });
    }
}