import { ObjectMetadata } from '@nova/metadata';
import { DatabaseSchema, TableSchema, ColumnSchema, IndexSchema, ForeignKeySchema } from '@nova/orm';

export class SchemaGenerator {
    private schemas: Map<string, TableSchema> = new Map();

    generate(metadata: ObjectMetadata[]): DatabaseSchema {
        const tables: TableSchema[] = [];

        for (const obj of metadata) {
            if (obj.objectType === 'Table') {
                const tableSchema = this.generateTableSchema(obj);
                tables.push(tableSchema);
                this.schemas.set(obj.name, tableSchema);
            }
        }

        // Generate relationships after all tables are processed
        for (const table of tables) {
            table.foreignKeys = this.generateForeignKeys(table);
        }

        return {
            version: '1.0',
            tables,
            createdAt: new Date()
        };
    }

    generateTableSchema(metadata: ObjectMetadata): TableSchema {
        const columns: ColumnSchema[] = [];
        const indexes: IndexSchema[] = [];

        // Generate columns
        for (const field of metadata.fields || []) {
            columns.push(this.generateColumnSchema(field));
        }

        // Generate indexes from keys
        for (const key of metadata.properties.keys || []) {
            indexes.push(this.generateIndexSchema(metadata.name, key));
        }

        // Generate system columns
        columns.push({
            name: 'SystemId',
            dataType: 'Guid',
            isNullable: false,
            isSystemField: true,
            defaultValue: 'gen_random_uuid()'
        });

        columns.push({
            name: 'SystemCreatedAt',
            dataType: 'DateTime',
            isNullable: false,
            isSystemField: true,
            defaultValue: 'CURRENT_TIMESTAMP'
        });

        columns.push({
            name: 'SystemCreatedBy',
            dataType: 'Guid',
            isNullable: true,
            isSystemField: true
        });

        columns.push({
            name: 'SystemModifiedAt',
            dataType: 'DateTime',
            isNullable: true,
            isSystemField: true
        });

        columns.push({
            name: 'SystemModifiedBy',
            dataType: 'Guid',
            isNullable: true,
            isSystemField: true
        });

        columns.push({
            name: 'SystemRowVersion',
            dataType: 'Integer',
            isNullable: false,
            isSystemField: true,
            defaultValue: '1'
        });

        return {
            name: metadata.name,
            id: metadata.id,
            columns,
            indexes,
            foreignKeys: [],
            primaryKey: this.getPrimaryKey(indexes),
            extensions: metadata.extensions || []
        };
    }

    private generateColumnSchema(field: any): ColumnSchema {
        const column: ColumnSchema = {
            name: field.name,
            dataType: this.mapToDatabaseType(field.dataType),
            isNullable: field.isNullable ?? true,
            isPrimaryKey: field.isPrimaryKey || false,
            isSystemField: false
        };

        if (field.length) {
            column.length = field.length;
        }

        if (field.precision) {
            column.precision = field.precision;
            column.scale = 2; // Default scale
        }

        if (field.defaultValue !== undefined) {
            column.defaultValue = this.formatDefaultValue(field.defaultValue);
        }

        if (field.dataType === 'Code' || field.dataType === 'Text') {
            column.collation = 'en_US.UTF-8';
        }

        return column;
    }

    private generateIndexSchema(tableName: string, key: any): IndexSchema {
        const index: IndexSchema = {
            name: key.name || `IDX_${tableName}_${key.fields.join('_')}`,
            fields: key.fields,
            isUnique: key.unique || key.clustered || false,
            isPrimary: key.clustered || false
        };

        if (key.clustered) {
            index.type = 'clustered';
        }

        return index;
    }

    private generateForeignKeys(table: TableSchema): ForeignKeySchema[] {
        const foreignKeys: ForeignKeySchema[] = [];

        // Detect foreign key relationships based on field naming conventions
        for (const column of table.columns) {
            if (column.name.endsWith('Id') || column.name.endsWith('No.')) {
                const referencedTable = column.name.replace(/Id$|No\.$/, '');
                
                if (this.schemas.has(referencedTable)) {
                    foreignKeys.push({
                        name: `FK_${table.name}_${column.name}`,
                        column: column.name,
                        referencedTable,
                        referencedColumn: 'SystemId',
                        onDelete: 'RESTRICT',
                        onUpdate: 'CASCADE'
                    });
                }
            }
        }

        return foreignKeys;
    }

    private getPrimaryKey(indexes: IndexSchema[]): string[] {
        const primaryKey = indexes.find(idx => idx.isPrimary);
        return primaryKey?.fields || ['SystemId'];
    }

    private mapToDatabaseType(dataType: string): string {
        const map: Record<string, string> = {
            'Integer': 'int',
            'BigInteger': 'bigint',
            'Decimal': 'decimal',
            'Boolean': 'boolean',
            'Text': 'varchar',
            'Code': 'varchar',
            'Date': 'date',
            'DateTime': 'timestamp',
            'Time': 'time',
            'Guid': 'uuid',
            'Blob': 'bytea',
            'Media': 'bytea',
            'MediaSet': 'bytea[]'
        };

        return map[dataType] || 'text';
    }

    private formatDefaultValue(value: any): string {
        if (typeof value === 'string') {
            return `'${value}'`;
        }
        if (value instanceof Date) {
            return `'${value.toISOString()}'`;
        }
        if (typeof value === 'boolean') {
            return value ? 'true' : 'false';
        }
        if (value === null) {
            return 'null';
        }
        return String(value);
    }

    generateAlterScript(oldSchema: TableSchema, newSchema: TableSchema): string[] {
        const statements: string[] = [];

        // Add new columns
        for (const newColumn of newSchema.columns) {
            const oldColumn = oldSchema.columns.find(c => c.name === newColumn.name);
            
            if (!oldColumn) {
                statements.push(
                    `ALTER TABLE "${newSchema.name}" ADD COLUMN "${newColumn.name}" ${this.getColumnDefinition(newColumn)};`
                );
            }
        }

        // Drop removed columns
        for (const oldColumn of oldSchema.columns) {
            const newColumn = newSchema.columns.find(c => c.name === oldColumn.name);
            
            if (!newColumn && !oldColumn.isSystemField) {
                statements.push(
                    `ALTER TABLE "${newSchema.name}" DROP COLUMN "${oldColumn.name}";`
                );
            }
        }

        // Modify existing columns
        for (const newColumn of newSchema.columns) {
            const oldColumn = oldSchema.columns.find(c => c.name === newColumn.name);
            
            if (oldColumn && !oldColumn.isSystemField) {
                const changes = this.getColumnChanges(oldColumn, newColumn);
                statements.push(...changes);
            }
        }

        return statements;
    }

    private getColumnDefinition(column: ColumnSchema): string {
        let def = `${this.mapToDatabaseType(column.dataType)}`;
        
        if (column.length) {
            def += `(${column.length})`;
        } else if (column.precision) {
            def += `(${column.precision}, ${column.scale})`;
        }
        
        if (!column.isNullable) {
            def += ' NOT NULL';
        }
        
        if (column.defaultValue) {
            def += ` DEFAULT ${column.defaultValue}`;
        }
        
        return def;
    }

    private getColumnChanges(oldColumn: ColumnSchema, newColumn: ColumnSchema): string[] {
        const changes: string[] = [];

        // Change data type
        if (oldColumn.dataType !== newColumn.dataType) {
            changes.push(
                `ALTER TABLE "${oldColumn.name}" ALTER COLUMN "${newColumn.name}" TYPE ${this.getColumnDefinition(newColumn)};`
            );
        }

        // Change nullability
        if (oldColumn.isNullable !== newColumn.isNullable) {
            if (newColumn.isNullable) {
                changes.push(
                    `ALTER TABLE "${oldColumn.name}" ALTER COLUMN "${newColumn.name}" DROP NOT NULL;`
                );
            } else {
                changes.push(
                    `ALTER TABLE "${oldColumn.name}" ALTER COLUMN "${newColumn.name}" SET NOT NULL;`
                );
            }
        }

        // Change default value
        if (oldColumn.defaultValue !== newColumn.defaultValue) {
            if (newColumn.defaultValue) {
                changes.push(
                    `ALTER TABLE "${oldColumn.name}" ALTER COLUMN "${newColumn.name}" SET DEFAULT ${newColumn.defaultValue};`
                );
            } else {
                changes.push(
                    `ALTER TABLE "${oldColumn.name}" ALTER COLUMN "${newColumn.name}" DROP DEFAULT;`
                );
            }
        }

        return changes;
    }

    generateSeedData(table: TableSchema, records: any[]): string {
        if (records.length === 0) return '';

        const columns = table.columns.map(c => `"${c.name}"`).join(', ');
        const values = records.map(record => {
            const row = table.columns.map(col => {
                const value = record[col.name];
                if (value === undefined || value === null) return 'NULL';
                if (typeof value === 'string') return `'${value.replace(/'/g, "''")}'`;
                if (value instanceof Date) return `'${value.toISOString()}'`;
                return value;
            }).join(', ');
            return `(${row})`;
        }).join(',\n  ');

        return `
-- Seed data for ${table.name}
INSERT INTO "${table.name}" (${columns}) VALUES
  ${values}
ON CONFLICT (${table.primaryKey.join(', ')}) DO UPDATE SET
  ${table.columns.filter(c => !c.isPrimaryKey && !c.isSystemField).map(c => 
    `"${c.name}" = EXCLUDED."${c.name}"`
  ).join(',\n  ')};
`;
    }

    generateMigrationScript(fromVersion: string, toVersion: string, changes: any[]): string {
        return `
-- Migration from v${fromVersion} to v${toVersion}
-- Generated: ${new Date().toISOString()}
-- DO NOT EDIT - Generated by NOVA Schema Generator

BEGIN;

${changes.map(change => change.script).join('\n\n')}

COMMIT;
`;
    }
}

export interface DatabaseSchema {
    version: string;
    tables: TableSchema[];
    createdAt: Date;
}

export interface TableSchema {
    name: string;
    id: number;
    columns: ColumnSchema[];
    indexes: IndexSchema[];
    foreignKeys: ForeignKeySchema[];
    primaryKey: string[];
    extensions: any[];
}

export interface ColumnSchema {
    name: string;
    dataType: string;
    length?: number;
    precision?: number;
    scale?: number;
    isNullable: boolean;
    isPrimaryKey?: boolean;
    isSystemField: boolean;
    defaultValue?: string;
    collation?: string;
}

export interface IndexSchema {
    name: string;
    fields: string[];
    isUnique: boolean;
    isPrimary: boolean;
    type?: 'clustered' | 'nonclustered';
    include?: string[];
    where?: string;
}

export interface ForeignKeySchema {
    name: string;
    column: string;
    referencedTable: string;
    referencedColumn: string;
    onDelete: 'CASCADE' | 'RESTRICT' | 'SET NULL' | 'NO ACTION';
    onUpdate: 'CASCADE' | 'RESTRICT' | 'SET NULL' | 'NO ACTION';
}