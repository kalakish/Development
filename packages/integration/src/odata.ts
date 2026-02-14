import { EventEmitter } from 'events';
import { Request, Response } from 'express';
import { Session } from '../core/session';
import { Record } from '../orm/record';
import { Query } from '../orm/query';

export class ODataService extends EventEmitter {
    private endpoints: Map<string, ODataEndpoint> = new Map();
    private metadata: ODataMetadata;

    constructor() {
        super();
        this.metadata = {
            version: '4.0',
            namespace: 'NOVA',
            entitySets: []
        };
    }

    registerEndpoint(endpoint: ODataEndpoint): void {
        this.endpoints.set(endpoint.name, endpoint);
        
        this.metadata.entitySets.push({
            name: endpoint.name,
            entityType: `${this.metadata.namespace}.${endpoint.entityType}`,
            navigable: endpoint.navigable || true
        });
    }

    async handleRequest(req: Request, session: Session): Promise<ODataResponse> {
        const path = req.path.replace(/^\/odata\//, '');
        const segments = path.split('/');
        
        const endpointName = segments[0];
        const endpoint = this.endpoints.get(endpointName);
        
        if (!endpoint) {
            throw new Error(`OData endpoint not found: ${endpointName}`);
        }

        // Parse OData query options
        const options = this.parseQueryOptions(req.query);

        switch (req.method) {
            case 'GET':
                return this.handleGet(endpoint, segments.slice(1), options, session);
            case 'POST':
                return this.handlePost(endpoint, segments.slice(1), req.body, session);
            case 'PATCH':
            case 'PUT':
                return this.handlePatch(endpoint, segments.slice(1), req.body, session);
            case 'DELETE':
                return this.handleDelete(endpoint, segments.slice(1), session);
            default:
                throw new Error(`Method not supported: ${req.method}`);
        }
    }

    private async handleGet(
        endpoint: ODataEndpoint,
        segments: string[],
        options: ODataQueryOptions,
        session: Session
    ): Promise<ODataResponse> {
        // Handle $metadata request
        if (segments[0] === '$metadata') {
            return this.getMetadata();
        }

        // Handle entity set request
        if (segments.length === 0 || (segments.length === 1 && segments[0] === '')) {
            return this.getEntitySet(endpoint, options, session);
        }

        // Handle single entity request
        const id = segments[0];
        return this.getEntity(endpoint, id, options, session);
    }

    private async handlePost(
        endpoint: ODataEndpoint,
        segments: string[],
        body: any,
        session: Session
    ): Promise<ODataResponse> {
        const record = session.createRecord(endpoint.entitySet);
        
        // Map OData entity to record
        this.mapEntityToRecord(body, record, endpoint);

        await record.insert();

        return {
            statusCode: 201,
            data: this.mapRecordToEntity(record, endpoint)
        };
    }

    private async handlePatch(
        endpoint: ODataEndpoint,
        segments: string[],
        body: any,
        session: Session
    ): Promise<ODataResponse> {
        const id = segments[0];
        const record = session.createRecord(endpoint.entitySet);
        
        await record.find(id);
        
        if (record.isEmpty()) {
            return {
                statusCode: 404,
                error: 'Entity not found'
            };
        }

        this.mapEntityToRecord(body, record, endpoint);
        await record.modify();

        return {
            statusCode: 200,
            data: this.mapRecordToEntity(record, endpoint)
        };
    }

    private async handleDelete(
        endpoint: ODataEndpoint,
        segments: string[],
        session: Session
    ): Promise<ODataResponse> {
        const id = segments[0];
        const record = session.createRecord(endpoint.entitySet);
        
        await record.find(id);
        
        if (record.isEmpty()) {
            return {
                statusCode: 404,
                error: 'Entity not found'
            };
        }

        await record.delete();

        return {
            statusCode: 204,
            data: null
        };
    }

    private async getEntitySet(
        endpoint: ODataEndpoint,
        options: ODataQueryOptions,
        session: Session
    ): Promise<ODataResponse> {
        const record = session.createRecord(endpoint.entitySet);
        
        // Apply filters
        if (options.filter) {
            record.setFilter(this.parseFilter(options.filter));
        }

        // Apply sorting
        if (options.orderby) {
            const orders = options.orderby.split(',');
            orders.forEach(order => {
                const [field, direction] = order.trim().split(' ');
                // Apply order
            });
        }

        // Apply pagination
        let top = options.top || 100;
        let skip = options.skip || 0;

        if (options.inlinecount === 'allpages') {
            const count = await record.findSet().then(rows => rows.length);
            // Get total count
        }

        const records = await record.findSet();
        const entities = records.map(r => this.mapRecordToEntity(r, endpoint));

        return {
            statusCode: 200,
            data: {
                '@odata.context': `$metadata#${endpoint.name}`,
                '@odata.count': entities.length,
                value: entities
            }
        };
    }

    private async getEntity(
        endpoint: ODataEndpoint,
        id: string,
        options: ODataQueryOptions,
        session: Session
    ): Promise<ODataResponse> {
        const record = session.createRecord(endpoint.entitySet);
        await record.find(id);

        if (record.isEmpty()) {
            return {
                statusCode: 404,
                error: 'Entity not found'
            };
        }

        const entity = this.mapRecordToEntity(record, endpoint);

        return {
            statusCode: 200,
            data: {
                '@odata.context': `$metadata#${endpoint.name}/$entity`,
                ...entity
            }
        };
    }

    private parseQueryOptions(query: any): ODataQueryOptions {
        return {
            filter: query.$filter,
            orderby: query.$orderby,
            top: query.$top ? parseInt(query.$top) : undefined,
            skip: query.$skip ? parseInt(query.$skip) : undefined,
            select: query.$select?.split(','),
            expand: query.$expand?.split(','),
            inlinecount: query.$inlinecount,
            format: query.$format
        };
    }

    private parseFilter(filter: string): string {
        // Parse OData filter expression to AL filter
        // Example: "Price gt 100" -> "Price > 100"
        const operators: Record<string, string> = {
            'eq': '=',
            'ne': '<>',
            'gt': '>',
            'ge': '>=',
            'lt': '<',
            'le': '<=',
            'and': 'AND',
            'or': 'OR',
            'not': 'NOT',
            'contains': 'LIKE',
            'startswith': 'LIKE',
            'endswith': 'LIKE'
        };

        let alFilter = filter;
        Object.entries(operators).forEach(([odata, al]) => {
            alFilter = alFilter.replace(
                new RegExp(`\\b${odata}\\b`, 'g'),
                al
            );
        });

        return alFilter;
    }

    private mapRecordToEntity(record: Record<any>, endpoint: ODataEndpoint): any {
        const entity: any = {
            '@odata.id': `${endpoint.name}('${record.getField('SystemId')}')`,
            '@odata.etag': `W/"${record.getField('SystemRowVersion')}"`
        };

        const data = record.getData();
        
        endpoint.fields.forEach(field => {
            let value = data[field.source];
            
            // Format value based on type
            if (value instanceof Date) {
                value = value.toISOString();
            } else if (typeof value === 'object' && value !== null) {
                // Handle complex types
                if (field.type === 'Media') {
                    value = {
                        '@odata.mediaEditLink': `${endpoint.name}('${record.getField('SystemId')}')/${field.name}/$value`,
                        '@odata.mediaContentType': value.mimeType
                    };
                }
            }

            entity[field.name] = value;
        });

        return entity;
    }

    private mapEntityToRecord(entity: any, record: Record<any>, endpoint: ODataEndpoint): void {
        endpoint.fields.forEach(field => {
            if (entity[field.name] !== undefined) {
                let value = entity[field.name];
                
                // Parse value based on type
                if (field.type === 'DateTime' && typeof value === 'string') {
                    value = new Date(value);
                }

                record.setField(field.source, value);
            }
        });
    }

    private getMetadata(): ODataResponse {
        return {
            statusCode: 200,
            data: {
                '@odata.context': '$metadata',
                value: {
                    version: this.metadata.version,
                    namespace: this.metadata.namespace,
                    entitySets: this.metadata.entitySets.map(set => ({
                        name: set.name,
                        entityType: set.entityType,
                        navigable: set.navigable
                    }))
                }
            }
        };
    }

    getServiceDocument(): ODataResponse {
        return {
            statusCode: 200,
            data: {
                '@odata.context': '$metadata',
                value: Array.from(this.endpoints.keys()).map(name => ({
                    name,
                    kind: 'EntitySet',
                    url: name
                }))
            }
        };
    }
}

export interface ODataEndpoint {
    name: string;
    entityType: string;
    entitySet: string;
    fields: ODataField[];
    navigable?: boolean;
    operations?: ODataOperation[];
}

export interface ODataField {
    name: string;
    type: string;
    source: string;
    nullable?: boolean;
    isKey?: boolean;
    maxLength?: number;
    precision?: number;
    scale?: number;
}

export interface ODataOperation {
    name: string;
    type: 'function' | 'action';
    parameters: ODataParameter[];
    returnType?: string;
}

export interface ODataParameter {
    name: string;
    type: string;
    nullable?: boolean;
}

export interface ODataQueryOptions {
    filter?: string;
    orderby?: string;
    top?: number;
    skip?: number;
    select?: string[];
    expand?: string[];
    inlinecount?: string;
    format?: string;
}

export interface ODataResponse {
    statusCode: number;
    data?: any;
    error?: string;
}

export interface ODataMetadata {
    version: string;
    namespace: string;
    entitySets: ODataEntitySet[];
}

export interface ODataEntitySet {
    name: string;
    entityType: string;
    navigable: boolean;
}