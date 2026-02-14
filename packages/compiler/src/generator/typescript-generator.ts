import { ObjectMetadata } from '@nova/metadata';
import { TokenType } from '../parser/lexer';
import * as AST from '../parser/ast';

export class TypescriptGenerator {
    private imports: Set<string>;
    private decorators: Set<string>;

    constructor() {
        this.imports = new Set();
        this.decorators = new Set();
    }

    generate(metadata: ObjectMetadata): string {
        this.imports.clear();
        this.decorators.clear();

        switch (metadata.objectType) {
            case 'Table':
                return this.generateTable(metadata);
            case 'Page':
                return this.generatePage(metadata);
            case 'Codeunit':
                return this.generateCodeunit(metadata);
            case 'Report':
                return this.generateReport(metadata);
            case 'XMLPort':
                return this.generateXMLPort(metadata);
            case 'Query':
                return this.generateQuery(metadata);
            case 'Enum':
                return this.generateEnum(metadata);
            default:
                return '';
        }
    }

    private generateTable(metadata: ObjectMetadata): string {
        this.imports.add('import { NovaTable, Field, OnInsert, OnModify, OnDelete, OnValidate } from "@nova/orm";');
        
        let code = this.generateImports();
        
        code += `\n@Table(${metadata.id}, '${metadata.name}')\n`;
        code += `export class ${metadata.name} extends NovaTable {\n`;
        
        // Generate fields
        for (const field of metadata.fields || []) {
            code += this.generateTableField(field);
        }
        
        // Generate triggers
        for (const trigger of metadata.triggers || []) {
            code += this.generateTableTrigger(trigger);
        }
        
        code += '}\n';
        
        return code;
    }

    private generateTableField(field: any): string {
        let code = `\n    @Field(${field.id}, '${field.name}', DataType.${field.dataType}`;
        
        if (field.length) {
            code += `, ${field.length}`;
        }
        
        if (field.precision) {
            code += `, { precision: ${field.precision} }`;
        }
        
        code += ')\n';
        
        const isOptional = field.isNullable ? '?' : '';
        const tsType = this.mapToTypeScriptType(field.dataType);
        
        code += `    ${field.name}${isOptional}: ${tsType};\n`;
        
        return code;
    }

    private generateTableTrigger(trigger: any): string {
        let code = `\n    @${trigger.name}()\n`;
        code += `    async ${trigger.name.toLowerCase()}(rec: Record<${this.getTableName(trigger)}>) {\n`;
        
        // Generate trigger body
        if (trigger.body) {
            code += this.generateStatements(JSON.parse(trigger.body));
        }
        
        code += '    }\n';
        
        return code;
    }

    private generatePage(metadata: ObjectMetadata): string {
        this.imports.add('import { NovaPage, Page, SourceTable, Layout, Actions } from "@nova/ui";');
        this.imports.add('import { Box, Card, Grid, TextField, Button } from "@mui/material";');
        
        let code = this.generateImports();
        
        code += `\n@Page(${metadata.id}, '${metadata.name}', PageType.${metadata.properties.pageType})\n`;
        
        if (metadata.properties.sourceTable) {
            code += `@SourceTable(${metadata.properties.sourceTable})\n`;
        }
        
        code += `export class ${metadata.name} extends NovaPage {\n`;
        
        // Generate layout
        if (metadata.properties.layout) {
            code += this.generateLayout(metadata.properties.layout);
        }
        
        // Generate actions
        if (metadata.properties.actions) {
            code += this.generateActions(metadata.properties.actions);
        }
        
        // Generate triggers
        for (const trigger of metadata.triggers || []) {
            code += this.generatePageTrigger(trigger);
        }
        
        code += '}\n';
        
        return code;
    }

    private generateLayout(layout: any): string {
        let code = '\n    @Layout()\n';
        code += '    layout = {\n';
        code += '        areas: [\n';
        
        for (const area of layout.areas) {
            code += `            {\n`;
            code += `                type: '${area.type}',\n`;
            code += `                groups: [\n`;
            
            for (const group of area.groups) {
                code += `                    {\n`;
                code += `                        name: '${group.name}',\n`;
                code += `                        fields: [\n`;
                
                for (const field of group.fields) {
                    code += `                            { name: '${field.name}', source: '${field.source}' },\n`;
                }
                
                code += `                        ]\n`;
                code += `                    },\n`;
            }
            
            code += `                ]\n`;
            code += `            },\n`;
        }
        
        code += '        ]\n';
        code += '    };\n';
        
        return code;
    }

    private generateActions(actions: any[]): string {
        let code = '\n    @Actions()\n';
        code += '    actions = [\n';
        
        for (const action of actions) {
            code += `        {\n`;
            code += `            name: '${action.name}',\n`;
            code += `            trigger: async (rec: any) => {\n`;
            
            if (action.trigger && action.trigger.body) {
                code += this.generateStatements(JSON.parse(action.trigger.body));
            }
            
            code += `            }\n`;
            code += `        },\n`;
        }
        
        code += '    ];\n';
        
        return code;
    }

    private generatePageTrigger(trigger: any): string {
        let code = `\n    @${trigger.name}()\n`;
        code += `    async ${trigger.name.toLowerCase()}() {\n`;
        
        if (trigger.body) {
            code += this.generateStatements(JSON.parse(trigger.body));
        }
        
        code += '    }\n';
        
        return code;
    }

    private generateCodeunit(metadata: ObjectMetadata): string {
        this.imports.add('import { NovaCodeunit, Codeunit, Procedure, IntegrationEvent, EventSubscriber } from "@nova/core";');
        
        let code = this.generateImports();
        
        code += `\n@Codeunit(${metadata.id}, '${metadata.name}')\n`;
        code += `export class ${metadata.name} extends NovaCodeunit {\n`;
        
        // Generate procedures
        for (const proc of metadata.properties.procedures || []) {
            code += this.generateProcedure(proc);
        }
        
        code += '}\n';
        
        return code;
    }

    private generateProcedure(proc: any): string {
        let code = '\n';
        
        if (proc.isIntegration) {
            code += '    @IntegrationEvent()\n';
        } else if (proc.isEvent) {
            code += '    @BusinessEvent()\n';
        }
        
        code += `    @Procedure\n`;
        
        // Generate parameters
        const params = proc.parameters.map(p => 
            `${p.isVar ? 'var ' : ''}${p.name}: ${this.mapToTypeScriptType(p.type)}`
        ).join(', ');
        
        const returnType = proc.returnType ? 
            `: Promise<${this.mapToTypeScriptType(proc.returnType)}>` : 
            ': Promise<void>';
        
        code += `    async ${proc.name}(${params})${returnType} {\n`;
        
        if (proc.body) {
            code += this.generateStatements(JSON.parse(proc.body));
        }
        
        code += '    }\n';
        
        return code;
    }

    private generateReport(metadata: ObjectMetadata): string {
        this.imports.add('import { NovaReport, Report, DataItem, OnPreReport, OnPostReport } from "@nova/reporting";');
        
        let code = this.generateImports();
        
        code += `\n@Report(${metadata.id}, '${metadata.name}')\n`;
        code += `export class ${metadata.name} extends NovaReport {\n`;
        
        // Generate dataset
        if (metadata.properties.dataset) {
            code += this.generateDataset(metadata.properties.dataset);
        }
        
        // Generate triggers
        for (const trigger of metadata.triggers || []) {
            code += this.generateReportTrigger(trigger);
        }
        
        code += '}\n';
        
        return code;
    }

    private generateDataset(dataset: any[]): string {
        let code = '';
        
        for (const dataItem of dataset) {
            code += `\n    @DataItem(${dataItem.tableName})\n`;
            code += `    async ${dataItem.name}(item: Record<${dataItem.tableName}>) {\n`;
            code += '        return {\n';
            
            for (const column of dataItem.columns) {
                code += `            ${column.name}: item.${column.source},\n`;
            }
            
            code += '        };\n';
            code += '    }\n';
            
            if (dataItem.childItems) {
                code += this.generateDataset(dataItem.childItems);
            }
        }
        
        return code;
    }

    private generateReportTrigger(trigger: any): string {
        let code = `\n    @${trigger.name}()\n`;
        code += `    async ${trigger.name.toLowerCase()}(parameters: ReportParameters) {\n`;
        
        if (trigger.body) {
            code += this.generateStatements(JSON.parse(trigger.body));
        }
        
        code += '    }\n';
        
        return code;
    }

    private generateXMLPort(metadata: ObjectMetadata): string {
        this.imports.add('import { NovaXMLPort, XMLPort, Schema, TableMapping } from "@nova/integration";');
        
        let code = this.generateImports();
        
        code += `\n@XMLPort(${metadata.id}, '${metadata.name}')\n`;
        code += `export class ${metadata.name} extends NovaXMLPort {\n`;
        
        // Generate schema
        if (metadata.properties.schema) {
            code += this.generateXMLSchema(metadata.properties.schema);
        }
        
        // Generate table mappings
        if (metadata.properties.tableMappings) {
            for (const mapping of metadata.properties.tableMappings) {
                code += `\n    @TableMapping('${mapping.table}', '${mapping.xmlPath}')\n`;
                code += `    async map${mapping.table}() {}\n`;
            }
        }
        
        code += '}\n';
        
        return code;
    }

    private generateXMLSchema(schema: any): string {
        let code = '\n    @Schema()\n';
        code += '    schema = {\n';
        code += this.generateSchemaElement(schema.root, '        ');
        code += '    };\n';
        
        return code;
    }

    private generateSchemaElement(element: any, indent: string): string {
        let code = `${indent}type: '${element.type}',\n`;
        code += `${indent}name: '${element.name}',\n`;
        
        if (element.source) {
            code += `${indent}source: '${element.source}',\n`;
        }
        
        if (element.children && element.children.length > 0) {
            code += `${indent}children: [\n`;
            
            for (const child of element.children) {
                code += `${indent}    {\n`;
                code += this.generateSchemaElement(child, `${indent}        `);
                code += `${indent}    },\n`;
            }
            
            code += `${indent}],\n`;
        }
        
        return code;
    }

    private generateQuery(metadata: ObjectMetadata): string {
        this.imports.add('import { NovaQuery, Query, DataItem, Column, Filter, OrderBy } from "@nova/orm";');
        
        let code = this.generateImports();
        
        code += `\n@Query(${metadata.id}, '${metadata.name}', QueryType.${metadata.properties.dataType})\n`;
        code += `export class ${metadata.name} extends NovaQuery {\n`;
        
        // Generate query elements
        for (const element of metadata.properties.elements || []) {
            if (element.type === 'QueryDataItem') {
                code += `\n    @DataItem('${element.tableName}')\n`;
                
                if (element.link) {
                    code += `    @Link('${element.link.from}', '${element.link.to}')\n`;
                }
                
                code += `    ${element.name}: any;\n`;
            } else if (element.type === 'QueryColumn') {
                code += `\n    @Column('${element.source}')\n`;
                code += `    ${element.name}: any;\n`;
            }
        }
        
        // Generate filters
        for (const filter of metadata.properties.filters || []) {
            code += `\n    @Filter('${filter.field}', '${filter.value}')\n`;
            code += `    ${filter.name || 'filter'}: any;\n`;
        }
        
        // Generate order by
        for (const order of metadata.properties.orderBy || []) {
            code += `\n    @OrderBy('${order.field}', '${order.direction}')\n`;
            code += `    order: any;\n`;
        }
        
        code += '}\n';
        
        return code;
    }

    private generateEnum(metadata: ObjectMetadata): string {
        let code = `export enum ${metadata.name} {\n`;
        
        for (const value of metadata.properties.values || []) {
            code += `    ${value.name} = ${value.id},\n`;
        }
        
        code += '}\n';
        
        return code;
    }

    private generateStatements(statements: any[]): string {
        let code = '';
        
        for (const stmt of statements) {
            code += this.generateStatement(stmt);
        }
        
        return code;
    }

    private generateStatement(stmt: any): string {
        switch (stmt.type) {
            case 'VariableDeclaration':
                return this.generateVariableDeclaration(stmt);
            case 'Assignment':
                return this.generateAssignment(stmt);
            case 'IfStatement':
                return this.generateIfStatement(stmt);
            case 'WhileStatement':
                return this.generateWhileStatement(stmt);
            case 'ForStatement':
                return this.generateForStatement(stmt);
            case 'ReturnStatement':
                return this.generateReturnStatement(stmt);
            case 'Call':
                return this.generateCallStatement(stmt);
            case 'ExpressionStatement':
                return this.generateExpressionStatement(stmt);
            default:
                return '';
        }
    }

    private generateVariableDeclaration(stmt: any): string {
        const initializer = stmt.initializer ? 
            ` = ${this.generateExpression(stmt.initializer)}` : '';
        return `        const ${stmt.name}${initializer};\n`;
    }

    private generateAssignment(stmt: any): string {
        const left = this.generateExpression(stmt.left);
        const right = this.generateExpression(stmt.right);
        return `        ${left} = ${right};\n`;
    }

    private generateIfStatement(stmt: any): string {
        let code = `        if (${this.generateExpression(stmt.condition)}) {\n`;
        
        for (const s of stmt.thenBranch) {
            code += this.generateStatement(s);
        }
        
        if (stmt.elseBranch && stmt.elseBranch.length > 0) {
            code += '        } else {\n';
            
            for (const s of stmt.elseBranch) {
                code += this.generateStatement(s);
            }
        }
        
        code += '        }\n';
        
        return code;
    }

    private generateWhileStatement(stmt: any): string {
        let code = `        while (${this.generateExpression(stmt.condition)}) {\n`;
        
        for (const s of stmt.body) {
            code += this.generateStatement(s);
        }
        
        code += '        }\n';
        
        return code;
    }

    private generateForStatement(stmt: any): string {
        let code = `        for (let ${stmt.variable} = ${this.generateExpression(stmt.start)}; `;
        code += `${stmt.variable} <= ${this.generateExpression(stmt.end)}; `;
        code += `${stmt.variable}++) {\n`;
        
        for (const s of stmt.body) {
            code += this.generateStatement(s);
        }
        
        code += '        }\n';
        
        return code;
    }

    private generateReturnStatement(stmt: any): string {
        if (stmt.expression) {
            return `        return ${this.generateExpression(stmt.expression)};\n`;
        }
        return '        return;\n';
    }

    private generateCallStatement(stmt: any): string {
        return `        await ${this.generateExpression(stmt)};\n`;
    }

    private generateExpressionStatement(stmt: any): string {
        return `        ${this.generateExpression(stmt.expression)};\n`;
    }

    private generateExpression(expr: any): string {
        if (!expr) return 'null';
        
        switch (expr.type) {
            case 'Literal':
                return JSON.stringify(expr.value);
                
            case 'Identifier':
                return expr.name;
                
            case 'Binary':
                return `${this.generateExpression(expr.left)} ${expr.operator} ${this.generateExpression(expr.right)}`;
                
            case 'Unary':
                return `${expr.operator} ${this.generateExpression(expr.operand)}`;
                
            case 'Member':
                return `${this.generateExpression(expr.object)}.${this.generateExpression(expr.property)}`;
                
            case 'Call':
                const args = expr.arguments.map((a: any) => this.generateExpression(a)).join(', ');
                return `${this.generateExpression(expr.callee)}(${args})`;
                
            case 'Record':
                const fields = Object.entries(expr.fields)
                    .map(([key, value]) => `${key}: ${this.generateExpression(value)}`)
                    .join(', ');
                return `{ ${fields} }`;
                
            case 'Filter':
                return `{ field: '${expr.field}', operator: '${expr.operator}', value: ${this.generateExpression(expr.value)} }`;
                
            default:
                return '';
        }
    }

    private generateImports(): string {
        let code = '';
        
        for (const imp of this.imports) {
            code += imp + '\n';
        }
        
        if (this.imports.size > 0) {
            code += '\n';
        }
        
        return code;
    }

    private mapToTypeScriptType(dataType: string): string {
        const map: Record<string, string> = {
            'Integer': 'number',
            'BigInteger': 'number',
            'Decimal': 'number',
            'Boolean': 'boolean',
            'Text': 'string',
            'Code': 'string',
            'Date': 'Date',
            'DateTime': 'Date',
            'Time': 'string',
            'Guid': 'string',
            'Blob': 'Buffer',
            'Media': 'Buffer',
            'MediaSet': 'Buffer[]',
            'Record': 'any',
            'RecordRef': 'any',
            'JsonObject': 'object',
            'JsonArray': 'any[]',
            'HttpClient': 'any',
            'XmlDocument': 'any',
            'InStream': 'any',
            'OutStream': 'any',
            'Variant': 'any'
        };
        
        // Handle generic types
        if (dataType.startsWith('List<')) {
            const innerType = dataType.substring(5, dataType.length - 1);
            return `${this.mapToTypeScriptType(innerType)}[]`;
        } else if (dataType.startsWith('Dictionary<')) {
            const types = dataType.substring(11, dataType.length - 1).split(',');
            const keyType = this.mapToTypeScriptType(types[0].trim());
            const valueType = this.mapToTypeScriptType(types[1].trim());
            return `Map<${keyType}, ${valueType}>`;
        }
        
        return map[dataType] || 'any';
    }

    private getTableName(trigger: any): string {
        // Extract table name from context
        return 'any';
    }
}