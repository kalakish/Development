import { buildSchema, GraphQLSchema, GraphQLObjectType, GraphQLString, GraphQLInt, GraphQLFloat, GraphQLBoolean, GraphQLList, GraphQLNonNull, GraphQLInputObjectType, GraphQLEnumType } from 'graphql';
import { Logger } from '@nova/core/utils/logger';

export interface SchemaType {
    name: string;
    fields: SchemaField[];
}

export interface SchemaField {
    name: string;
    type: string;
    required?: boolean;
    list?: boolean;
    args?: SchemaArgument[];
    resolve?: (parent: any, args: any, context: any) => any;
}

export interface SchemaArgument {
    name: string;
    type: string;
    required?: boolean;
    list?: boolean;
}

export class GraphQLSchemaBuilder {
    private logger: Logger;
    private types: Map<string, GraphQLObjectType> = new Map();
    private inputTypes: Map<string, GraphQLInputObjectType> = new Map();
    private enums: Map<string, GraphQLEnumType> = new Map();

    constructor() {
        this.logger = new Logger('GraphQLSchemaBuilder');
    }

    buildSchema(query: GraphQLObjectType, mutation?: GraphQLObjectType): GraphQLSchema {
        const schema: any = {
            query
        };

        if (mutation) {
            schema.mutation = mutation;
        }

        return new GraphQLSchema(schema);
    }

    createObjectType(type: SchemaType): GraphQLObjectType {
        if (this.types.has(type.name)) {
            return this.types.get(type.name)!;
        }

        const fields: any = {};

        type.fields.forEach(field => {
            fields[field.name] = {
                type: this.resolveType(field),
                args: this.resolveArgs(field.args),
                resolve: field.resolve
            };
        });

        const objectType = new GraphQLObjectType({
            name: type.name,
            fields
        });

        this.types.set(type.name, objectType);
        return objectType;
    }

    createInputType(name: string, fields: SchemaField[]): GraphQLInputObjectType {
        if (this.inputTypes.has(name)) {
            return this.inputTypes.get(name)!;
        }

        const inputFields: any = {};

        fields.forEach(field => {
            inputFields[field.name] = {
                type: this.resolveInputType(field)
            };
        });

        const inputType = new GraphQLInputObjectType({
            name,
            fields: inputFields
        });

        this.inputTypes.set(name, inputType);
        return inputType;
    }

    createEnumType(name: string, values: Record<string, { value: any }>): GraphQLEnumType {
        if (this.enums.has(name)) {
            return this.enums.get(name)!;
        }

        const enumType = new GraphQLEnumType({
            name,
            values
        });

        this.enums.set(name, enumType);
        return enumType;
    }

    private resolveType(field: SchemaField): any {
        let type = this.getBaseType(field.type);

        if (field.list) {
            type = new GraphQLList(type);
        }

        if (field.required) {
            type = new GraphQLNonNull(type);
        }

        return type;
    }

    private resolveInputType(field: SchemaField): any {
        let type = this.getBaseInputType(field.type);

        if (field.list) {
            type = new GraphQLList(type);
        }

        if (field.required) {
            type = new GraphQLNonNull(type);
        }

        return type;
    }

    private resolveArgs(args?: SchemaArgument[]): any {
        if (!args) return {};

        const resolvedArgs: any = {};

        args.forEach(arg => {
            let type = this.getBaseType(arg.type);

            if (arg.list) {
                type = new GraphQLList(type);
            }

            if (arg.required) {
                type = new GraphQLNonNull(type);
            }

            resolvedArgs[arg.name] = { type };
        });

        return resolvedArgs;
    }

    private getBaseType(type: string): any {
        switch (type.toLowerCase()) {
            case 'string': return GraphQLString;
            case 'int':
            case 'integer': return GraphQLInt;
            case 'float':
            case 'decimal': return GraphQLFloat;
            case 'boolean':
            case 'bool': return GraphQLBoolean;
            default:
                if (this.types.has(type)) {
                    return this.types.get(type);
                }
                if (this.enums.has(type)) {
                    return this.enums.get(type);
                }
                return GraphQLString;
        }
    }

    private getBaseInputType(type: string): any {
        switch (type.toLowerCase()) {
            case 'string': return GraphQLString;
            case 'int':
            case 'integer': return GraphQLInt;
            case 'float':
            case 'decimal': return GraphQLFloat;
            case 'boolean':
            case 'bool': return GraphQLBoolean;
            default:
                if (this.inputTypes.has(type)) {
                    return this.inputTypes.get(type);
                }
                if (this.enums.has(type)) {
                    return this.enums.get(type);
                }
                return GraphQLString;
        }
    }

    getTypes(): GraphQLObjectType[] {
        return Array.from(this.types.values());
    }

    getInputTypes(): GraphQLInputObjectType[] {
        return Array.from(this.inputTypes.values());
    }

    getEnums(): GraphQLEnumType[] {
        return Array.from(this.enums.values());
    }
}