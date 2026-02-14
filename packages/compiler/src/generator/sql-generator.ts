import { FieldMetadata } from '@nova/metadata';
import { ObjectMetadata } from '@nova/metadata';

export class SQLGenerator {
    generateCreateTable(metadata: ObjectMetadata): string {
        const fields = metadata.fields || [];
        const keys = metadata.properties.keys || [];
        
        const fieldDefinitions = fields.map(field => 
            this.generateFieldDefinition(field)
        ).join(',\n  ');

        const primaryKey = keys.find(k => k.clustered);
        const primaryKeyDef = primaryKey ? 
            `,\n  PRIMARY KEY (${primaryKey.fields.join(', ')})` : '';

        const indexes = keys.filter(k => !k.clustered).map(key => 
            this.generateIndexDefinition(metadata.name, key)
        ).join('\n');

        return `
-- Table: ${metadata.name}
CREATE TABLE IF NOT EXISTS "${metadata.name}" (
  ${fieldDefinitions}${primaryKeyDef}
);

${indexes}
        `;
    }

    private generateFieldDefinition(field: FieldMetadata): string {
        const sqlType = this.mapToSQLType(field);
        const nullable = field.isNullable ? '' : ' NOT NULL';
        const defaultValue = field.defaultValue ? 
            ` DEFAULT ${this.formatDefaultValue(field.defaultValue)}` : '';
        
        return `"${field.name}" ${sqlType}${nullable}${defaultValue}`;
    }

    private generateIndexDefinition(tableName: string, key: any): string {
        const indexName = `IDX_${tableName}_${key.fields.join('_')}`;
        const unique = key.unique ? 'UNIQUE ' : '';
        
        return `CREATE ${unique}INDEX IF NOT EXISTS "${indexName}" ON "${tableName}" (${key.fields.join(', ')});`;
    }

    private mapToSQLType(field: FieldMetadata): string {
        switch (field.dataType) {
            case 'Integer':
                return 'INTEGER';
            case 'BigInteger':
                return 'BIGINT';
            case 'Decimal':
                return field.precision ? 
                    `DECIMAL(${field.precision}, 2)` : 
                    'DECIMAL(18, 2)';
            case 'Boolean':
                return 'BOOLEAN';
            case 'Text':
            case 'Code':
                return field.length ? 
                    `VARCHAR(${field.length})` : 
                    'TEXT';
            case 'Date':
                return 'DATE';
            case 'DateTime':
                return 'TIMESTAMP';
            case 'Time':
                return 'TIME';
            case 'Guid':
                return 'UUID';
            case 'Blob':
            case 'Media':
                return 'BYTEA';
            default:
                return 'TEXT';
        }
    }

    private formatDefaultValue(value: any): string {
        if (typeof value === 'string') {
            return `'${value}'`;
        }
        if (value instanceof Date) {
            return `'${value.toISOString()}'`;
        }
        return String(value);
    }
}