import * as AST from '../parser/ast';
import { ObjectMetadata, ObjectType, FieldMetadata, TriggerMetadata } from '@nova/metadata';
import { TokenType } from '../parser/lexer';

export class MetadataGenerator {
    generate(ast: AST.Program): ObjectMetadata[] {
        const metadata: ObjectMetadata[] = [];

        for (const obj of ast.objects) {
            switch (obj.objectType) {
                case TokenType.TABLE:
                    metadata.push(this.generateTableMetadata(obj as AST.TableDefinition));
                    break;
                case TokenType.PAGE:
                    metadata.push(this.generatePageMetadata(obj as AST.PageDefinition));
                    break;
                case TokenType.CODEUNIT:
                    metadata.push(this.generateCodeunitMetadata(obj as AST.CodeunitDefinition));
                    break;
                case TokenType.REPORT:
                    metadata.push(this.generateReportMetadata(obj as AST.ReportDefinition));
                    break;
                case TokenType.XMLPORT:
                    metadata.push(this.generateXMLPortMetadata(obj as AST.XMLPortDefinition));
                    break;
            }
        }

        return metadata;
    }

    private generateTableMetadata(table: AST.TableDefinition): ObjectMetadata {
        const metadata: ObjectMetadata = {
            id: table.id,
            name: table.name,
            objectType: ObjectType.Table,
            version: 1,
            createdAt: new Date(),
            modifiedAt: new Date(),
            properties: {},
            fields: [],
            triggers: []
        };

        // Generate fields
        metadata.fields = table.fields.map(field => this.generateFieldMetadata(field));

        // Generate triggers
        metadata.triggers = table.triggers.map(trigger => this.generateTriggerMetadata(trigger));

        // Generate keys
        metadata.properties.keys = table.keys.map(key => ({
            fields: key.fields,
            clustered: key.clustered,
            unique: key.unique
        }));

        return metadata;
    }

    private generateFieldMetadata(field: AST.FieldDefinition): FieldMetadata {
        return {
            id: field.id,
            name: field.name,
            dataType: this.mapDataType(field.dataType),
            length: field.length,
            precision: field.precision,
            isPrimaryKey: field.properties.some(p => p.name === 'PrimaryKey' && p.value === true),
            isNullable: !field.properties.some(p => p.name === 'NotBlank'),
            defaultValue: field.properties.find(p => p.name === 'DefaultValue')?.value,
            editable: field.properties.find(p => p.name === 'Editable')?.value !== false,
            triggers: field.triggers.map(t => ({
                event: 'OnValidate',
                field: t.fieldName,
                body: this.generateTriggerBody(t.body)
            }))
        };
    }

    private generateTriggerMetadata(trigger: AST.TriggerDefinition): TriggerMetadata {
        return {
            name: trigger.name,
            event: this.mapTriggerEvent(trigger.name),
            objectType: ObjectType.Table,
            body: this.generateTriggerBody(trigger.body),
            parameters: trigger.parameters.map(p => p.name)
        };
    }

    private generatePageMetadata(page: AST.PageDefinition): ObjectMetadata {
        const metadata: ObjectMetadata = {
            id: page.id,
            name: page.name,
            objectType: ObjectType.Page,
            version: 1,
            createdAt: new Date(),
            modifiedAt: new Date(),
            properties: {
                pageType: page.pageType,
                sourceTable: page.sourceTable
            },
            triggers: []
        };

        // Generate layout
        metadata.properties.layout = this.generateLayoutDefinition(page.layout);

        // Generate actions
        metadata.properties.actions = page.actions.map(action => ({
            name: action.name,
            trigger: this.generateTriggerMetadata(action.trigger)
        }));

        // Generate page triggers
        metadata.triggers = page.triggers.map(trigger => 
            this.generateTriggerMetadata(trigger)
        );

        return metadata;
    }

    private generateCodeunitMetadata(codeunit: AST.CodeunitDefinition): ObjectMetadata {
        const metadata: ObjectMetadata = {
            id: codeunit.id,
            name: codeunit.name,
            objectType: ObjectType.Codeunit,
            version: 1,
            createdAt: new Date(),
            modifiedAt: new Date(),
            properties: {},
            triggers: []
        };

        // Generate procedures
        metadata.properties.procedures = codeunit.procedures.map(proc => ({
            name: proc.name,
            parameters: proc.parameters.map(p => ({
                name: p.name,
                type: this.mapDataType(p.type),
                isVar: p.isVar
            })),
            returnType: proc.returnType ? this.mapDataType(proc.returnType) : undefined,
            isEvent: proc.isEvent,
            isIntegration: proc.isIntegration,
            body: this.generateProcedureBody(proc.body)
        }));

        // Generate event subscribers
        metadata.properties.eventSubscribers = codeunit.eventSubscribers.map(sub => ({
            eventName: sub.eventName,
            procedureName: sub.procedureName,
            priority: sub.priority || 0
        }));

        return metadata;
    }

    private generateReportMetadata(report: AST.ReportDefinition): ObjectMetadata {
        const metadata: ObjectMetadata = {
            id: report.id,
            name: report.name,
            objectType: ObjectType.Report,
            version: 1,
            createdAt: new Date(),
            modifiedAt: new Date(),
            properties: {
                dataset: this.generateDatasetDefinition(report.dataset)
            },
            triggers: report.triggers.map(trigger => 
                this.generateTriggerMetadata(trigger)
            )
        };

        return metadata;
    }

    private generateXMLPortMetadata(xmlport: AST.XMLPortDefinition): ObjectMetadata {
        const metadata: ObjectMetadata = {
            id: xmlport.id,
            name: xmlport.name,
            objectType: ObjectType.XMLPort,
            version: 1,
            createdAt: new Date(),
            modifiedAt: new Date(),
            properties: {
                schema: this.generateSchemaDefinition(xmlport.schema),
                tableMappings: xmlport.tableMapping.map(map => ({
                    table: map.source,
                    xmlPath: map.name
                }))
            },
            triggers: []
        };

        return metadata;
    }

    private generateLayoutDefinition(layout: AST.PageLayout): any {
        const areas: any[] = [];

        for (const area of layout.areas) {
            const groups: any[] = [];

            for (const group of area.groups) {
                const fields: any[] = group.fields.map(field => ({
                    name: field.name,
                    source: field.source,
                    properties: this.extractProperties(field.properties)
                }));

                groups.push({
                    name: group.name,
                    fields
                });
            }

            areas.push({
                type: area.type,
                groups
            });
        }

        return { areas };
    }

    private generateDatasetDefinition(dataItems: AST.DataItemDefinition[]): any[] {
        return dataItems.map(item => ({
            name: item.name,
            tableName: item.tableName,
            columns: item.columns.map(col => ({
                name: col.name,
                source: col.source
            })),
            childItems: item.childItems ? 
                this.generateDatasetDefinition(item.childItems) : []
        }));
    }

    private generateSchemaDefinition(schema: AST.SchemaDefinition): any {
        return {
            root: this.generateSchemaElement(schema.root)
        };
    }

    private generateSchemaElement(element: AST.SchemaElement): any {
        const result: any = {
            type: element.type,
            name: element.name
        };

        if (element.source) {
            result.source = element.source;
        }

        if (element.children.length > 0) {
            result.children = element.children.map(child => 
                this.generateSchemaElement(child)
            );
        }

        return result;
    }

    private generateTriggerBody(body: AST.Statement[]): string {
        // Generate executable code from AST
        // This would be converted to JavaScript/TypeScript
        return JSON.stringify(body);
    }

    private generateProcedureBody(body: AST.Statement[]): string {
        // Generate executable code from AST
        return JSON.stringify(body);
    }

    private extractProperties(properties: AST.Property[]): Record<string, any> {
        const result: Record<string, any> = {};
        
        for (const prop of properties) {
            result[prop.name] = prop.value;
        }
        
        return result;
    }

    private mapDataType(tokenType: TokenType): string {
        const map: Record<TokenType, string> = {
            [TokenType.INTEGER]: 'Integer',
            [TokenType.BIGINTEGER]: 'BigInteger',
            [TokenType.DECIMAL]: 'Decimal',
            [TokenType.BOOLEAN]: 'Boolean',
            [TokenType.TEXT]: 'Text',
            [TokenType.CODE]: 'Code',
            [TokenType.DATE]: 'Date',
            [TokenType.DATETIME]: 'DateTime',
            [TokenType.TIME]: 'Time',
            [TokenType.GUID]: 'Guid',
            [TokenType.BLOB]: 'Blob',
            [TokenType.MEDIA]: 'Media',
            [TokenType.RECORD]: 'Record',
            [TokenType.RECORDREF]: 'RecordRef',
            [TokenType.JSONOBJECT]: 'JsonObject',
            [TokenType.JSONARRAY]: 'JsonArray',
            [TokenType.XMLDOCUMENT]: 'XmlDocument',
            [TokenType.HTTPCLIENT]: 'HttpClient',
            [TokenType.LIST]: 'List',
            [TokenType.DICTIONARY]: 'Dictionary',
            [TokenType.VARIANT]: 'Variant'
        };

        return map[tokenType] || 'Variant';
    }

    private mapTriggerEvent(triggerName: string): string {
        const map: Record<string, string> = {
            'OnInsert': 'BeforeInsert',
            'OnModify': 'BeforeModify',
            'OnDelete': 'BeforeDelete',
            'OnRename': 'BeforeRename',
            'OnValidate': 'OnValidate',
            'OnOpenPage': 'OpenPage',
            'OnClosePage': 'ClosePage',
            'OnAfterGetRecord': 'AfterGetRecord',
            'OnNewRecord': 'NewRecord',
            'OnAction': 'Action'
        };

        return map[triggerName] || triggerName;
    }
}