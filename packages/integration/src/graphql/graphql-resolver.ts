import { Logger } from '@nova/core/utils/logger';
import { Session } from '@nova/core/session';
import { Record } from '@nova/orm/record';

export interface ResolverContext {
    session: Session;
    [key: string]: any;
}

export interface ResolverResult<T = any> {
    data?: T;
    errors?: ResolverError[];
    extensions?: Record<string, any>;
}

export interface ResolverError {
    message: string;
    code?: string;
    path?: string[];
    locations?: Array<{ line: number; column: number }>;
}

export class GraphQLResolver {
    private logger: Logger;
    private resolvers: Map<string, Function> = new Map();

    constructor() {
        this.logger = new Logger('GraphQLResolver');
    }

    // ============ Query Resolvers ============

    createQueryResolver<T = any>(
        type: string,
        resolver: (parent: any, args: any, context: ResolverContext) => Promise<T>
    ): void {
        const key = `Query.${type}`;
        this.resolvers.set(key, resolver);
        this.logger.debug(`Registered query resolver: ${type}`);
    }

    createQueriesResolver(
        resolvers: Record<string, (parent: any, args: any, context: ResolverContext) => Promise<any>>
    ): void {
        Object.entries(resolvers).forEach(([key, resolver]) => {
            this.createQueryResolver(key, resolver);
        });
    }

    // ============ Mutation Resolvers ============

    createMutationResolver<T = any>(
        type: string,
        resolver: (parent: any, args: any, context: ResolverContext) => Promise<T>
    ): void {
        const key = `Mutation.${type}`;
        this.resolvers.set(key, resolver);
        this.logger.debug(`Registered mutation resolver: ${type}`);
    }

    createMutationsResolver(
        resolvers: Record<string, (parent: any, args: any, context: ResolverContext) => Promise<any>>
    ): void {
        Object.entries(resolvers).forEach(([key, resolver]) => {
            this.createMutationResolver(key, resolver);
        });
    }

    // ============ Field Resolvers ============

    createFieldResolver<T = any>(
        type: string,
        field: string,
        resolver: (parent: any, args: any, context: ResolverContext) => Promise<T>
    ): void {
        const key = `${type}.${field}`;
        this.resolvers.set(key, resolver);
        this.logger.debug(`Registered field resolver: ${type}.${field}`);
    }

    // ============ Built-in Resolvers ============

    createRecordResolver(tableName: string) {
        return async (parent: any, args: any, context: ResolverContext) => {
            try {
                const record = context.session.createRecord(tableName);
                await record.find(args.id);
                
                if (record.isEmpty()) {
                    throw new Error(`Record not found: ${args.id}`);
                }

                return record.getData();
            } catch (error) {
                this.logger.error(`Record resolver failed: ${error.message}`);
                throw error;
            }
        };
    }

    createRecordsResolver(tableName: string) {
        return async (parent: any, args: any, context: ResolverContext) => {
            try {
                const record = context.session.createRecord(tableName);
                
                if (args.filter) {
                    record.setFilter(args.filter);
                }

                const records = await record.findSet();
                return records;
            } catch (error) {
                this.logger.error(`Records resolver failed: ${error.message}`);
                throw error;
            }
        };
    }

    createCreateRecordResolver(tableName: string) {
        return async (parent: any, args: any, context: ResolverContext) => {
            try {
                const record = context.session.createRecord(tableName);
                
                Object.assign(record.getData(), args.input);
                await record.insert();

                return record.getData();
            } catch (error) {
                this.logger.error(`Create record resolver failed: ${error.message}`);
                throw error;
            }
        };
    }

    createUpdateRecordResolver(tableName: string) {
        return async (parent: any, args: any, context: ResolverContext) => {
            try {
                const record = context.session.createRecord(tableName);
                await record.find(args.id);

                if (record.isEmpty()) {
                    throw new Error(`Record not found: ${args.id}`);
                }

                Object.assign(record.getData(), args.input);
                await record.modify();

                return record.getData();
            } catch (error) {
                this.logger.error(`Update record resolver failed: ${error.message}`);
                throw error;
            }
        };
    }

    createDeleteRecordResolver(tableName: string) {
        return async (parent: any, args: any, context: ResolverContext) => {
            try {
                const record = context.session.createRecord(tableName);
                await record.find(args.id);

                if (record.isEmpty()) {
                    throw new Error(`Record not found: ${args.id}`);
                }

                await record.delete();
                return { success: true, id: args.id };
            } catch (error) {
                this.logger.error(`Delete record resolver failed: ${error.message}`);
                throw error;
            }
        };
    }

    // ============ Resolver Execution ============

    getResolver(type: string, field?: string): Function | undefined {
        const key = field ? `${type}.${field}` : type;
        return this.resolvers.get(key);
    }

    async execute(
        type: string,
        field: string,
        parent: any,
        args: any,
        context: ResolverContext
    ): Promise<any> {
        const resolver = this.getResolver(type, field);
        
        if (!resolver) {
            throw new Error(`No resolver found for ${type}.${field}`);
        }

        try {
            return await resolver(parent, args, context);
        } catch (error) {
            this.logger.error(`Resolver execution failed: ${error.message}`);
            throw error;
        }
    }

    // ============ Utility ============

    wrapResolver<T = any>(
        resolver: (parent: any, args: any, context: ResolverContext) => Promise<T>
    ): (parent: any, args: any, context: ResolverContext) => Promise<ResolverResult<T>> {
        return async (parent, args, context) => {
            try {
                const data = await resolver(parent, args, context);
                return { data };
            } catch (error) {
                return {
                    errors: [{
                        message: error.message,
                        code: error.code || 'INTERNAL_ERROR'
                    }]
                };
            }
        };
    }

    getAllResolvers(): Record<string, Function> {
        return Object.fromEntries(this.resolvers);
    }

    clearResolvers(): void {
        this.resolvers.clear();
        this.logger.info('All resolvers cleared');
    }
}