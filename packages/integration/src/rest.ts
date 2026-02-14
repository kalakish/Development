import { EventEmitter } from 'events';
import { Router, Request, Response, NextFunction } from 'express';
import { Session } from '../core/session';
import { Record } from '../orm/record';

export class RESTService extends EventEmitter {
    private router: Router;
    private resources: Map<string, RESTResource> = new Map();
    private middleware: RESTMiddleware[] = [];

    constructor() {
        super();
        this.router = Router();
    }

    registerResource(resource: RESTResource): void {
        this.resources.set(resource.path, resource);
        this.buildRoutes(resource);
    }

    registerMiddleware(middleware: RESTMiddleware): void {
        this.middleware.push(middleware);
    }

    private buildRoutes(resource: RESTResource): void {
        const basePath = `/api/${resource.path}`;

        // GET /resource
        this.router.get(basePath, this.applyMiddleware(async (req, res) => {
            const session = req['session'];
            const result = await this.handleGetCollection(resource, req.query, session);
            res.status(result.statusCode).json(result.data);
        }));

        // GET /resource/:id
        this.router.get(`${basePath}/:id`, this.applyMiddleware(async (req, res) => {
            const session = req['session'];
            const result = await this.handleGetResource(resource, req.params.id, req.query, session);
            res.status(result.statusCode).json(result.data);
        }));

        // POST /resource
        this.router.post(basePath, this.applyMiddleware(async (req, res) => {
            const session = req['session'];
            const result = await this.handleCreateResource(resource, req.body, session);
            res.status(result.statusCode).json(result.data);
        }));

        // PUT /resource/:id
        this.router.put(`${basePath}/:id`, this.applyMiddleware(async (req, res) => {
            const session = req['session'];
            const result = await this.handleUpdateResource(resource, req.params.id, req.body, session);
            res.status(result.statusCode).json(result.data);
        }));

        // PATCH /resource/:id
        this.router.patch(`${basePath}/:id`, this.applyMiddleware(async (req, res) => {
            const session = req['session'];
            const result = await this.handlePatchResource(resource, req.params.id, req.body, session);
            res.status(result.statusCode).json(result.data);
        }));

        // DELETE /resource/:id
        this.router.delete(`${basePath}/:id`, this.applyMiddleware(async (req, res) => {
            const session = req['session'];
            const result = await this.handleDeleteResource(resource, req.params.id, session);
            res.status(result.statusCode).json(result.data);
        }));

        // Custom actions
        if (resource.actions) {
            resource.actions.forEach(action => {
                this.router[action.method](`${basePath}${action.path}`, this.applyMiddleware(async (req, res) => {
                    const session = req['session'];
                    const result = await action.handler(req, res, session);
                    res.status(result.statusCode).json(result.data);
                }));
            });
        }
    }

    private async handleGetCollection(
        resource: RESTResource,
        query: any,
        session: Session
    ): Promise<RESTResponse> {
        const record = session.createRecord(resource.entitySet);
        
        // Apply filters
        if (query.filter) {
            record.setFilter(query.filter);
        }

        // Apply sorting
        if (query.sort) {
            const sorts = query.sort.split(',');
            sorts.forEach(sort => {
                const [field, direction] = sort.split(':');
                // Apply sort
            });
        }

        // Apply pagination
        const page = parseInt(query.page) || 1;
        const pageSize = parseInt(query.pageSize) || 50;
        const offset = (page - 1) * pageSize;

        if (pageSize > 0) {
            // Apply limit/offset
        }

        const records = await record.findSet();
        const items = records.map(r => this.mapRecordToResource(r, resource));

        return {
            statusCode: 200,
            data: {
                items,
                page,
                pageSize,
                total: items.length,
                totalPages: Math.ceil(items.length / pageSize)
            }
        };
    }

    private async handleGetResource(
        resource: RESTResource,
        id: string,
        query: any,
        session: Session
    ): Promise<RESTResponse> {
        const record = session.createRecord(resource.entitySet);
        await record.find(id);

        if (record.isEmpty()) {
            return {
                statusCode: 404,
                data: { error: 'Resource not found' }
            };
        }

        const data = this.mapRecordToResource(record, resource);

        return {
            statusCode: 200,
            data
        };
    }

    private async handleCreateResource(
        resource: RESTResource,
        body: any,
        session: Session
    ): Promise<RESTResponse> {
        const record = session.createRecord(resource.entitySet);
        
        this.mapRequestToRecord(body, record, resource);
        
        await record.insert();

        const data = this.mapRecordToResource(record, resource);

        return {
            statusCode: 201,
            data
        };
    }

    private async handleUpdateResource(
        resource: RESTResource,
        id: string,
        body: any,
        session: Session
    ): Promise<RESTResponse> {
        const record = session.createRecord(resource.entitySet);
        await record.find(id);

        if (record.isEmpty()) {
            return {
                statusCode: 404,
                data: { error: 'Resource not found' }
            };
        }

        this.mapRequestToRecord(body, record, resource);
        await record.modify();

        const data = this.mapRecordToResource(record, resource);

        return {
            statusCode: 200,
            data
        };
    }

    private async handlePatchResource(
        resource: RESTResource,
        id: string,
        body: any,
        session: Session
    ): Promise<RESTResponse> {
        const record = session.createRecord(resource.entitySet);
        await record.find(id);

        if (record.isEmpty()) {
            return {
                statusCode: 404,
                data: { error: 'Resource not found' }
            };
        }

        // Only update provided fields
        Object.keys(body).forEach(fieldName => {
            const field = resource.fields.find(f => f.name === fieldName);
            if (field) {
                record.setField(field.source, body[fieldName]);
            }
        });

        await record.modify();

        const data = this.mapRecordToResource(record, resource);

        return {
            statusCode: 200,
            data
        };
    }

    private async handleDeleteResource(
        resource: RESTResource,
        id: string,
        session: Session
    ): Promise<RESTResponse> {
        const record = session.createRecord(resource.entitySet);
        await record.find(id);

        if (record.isEmpty()) {
            return {
                statusCode: 404,
                data: { error: 'Resource not found' }
            };
        }

        await record.delete();

        return {
            statusCode: 204,
            data: null
        };
    }

    private mapRecordToResource(record: Record<any>, resource: RESTResource): any {
        const data: any = {
            id: record.getField('SystemId')
        };

        const recordData = record.getData();
        
        resource.fields.forEach(field => {
            let value = recordData[field.source];
            
            // Format value
            if (value instanceof Date) {
                value = value.toISOString();
            }

            data[field.name] = value;
        });

        // Add links
        data._links = {
            self: { href: `/api/${resource.path}/${data.id}` },
            collection: { href: `/api/${resource.path}` }
        };

        return data;
    }

    private mapRequestToRecord(body: any, record: Record<any>, resource: RESTResource): void {
        resource.fields.forEach(field => {
            if (body[field.name] !== undefined) {
                let value = body[field.name];
                
                if (field.type === 'DateTime' && typeof value === 'string') {
                    value = new Date(value);
                }

                record.setField(field.source, value);
            }
        });
    }

    private applyMiddleware(handler: RESTHandler): RESTHandler {
        return async (req: Request, res: Response, next: NextFunction) => {
            try {
                // Apply registered middleware
                for (const middleware of this.middleware) {
                    const result = await middleware(req, res);
                    if (result === false) {
                        return;
                    }
                }

                await handler(req, res, next);
            } catch (error) {
                next(error);
            }
        };
    }

    getRouter(): Router {
        return this.router;
    }

    // Documentation
    generateOpenAPI(): any {
        const openAPI: any = {
            openapi: '3.0.0',
            info: {
                title: 'NOVA REST API',
                version: '1.0.0'
            },
            paths: {},
            components: {
                schemas: {}
            }
        };

        this.resources.forEach(resource => {
            const basePath = `/api/${resource.path}`;
            
            openAPI.paths[basePath] = {
                get: {
                    summary: `Get ${resource.path} collection`,
                    responses: {
                        '200': {
                            description: 'Successful response'
                        }
                    }
                },
                post: {
                    summary: `Create ${resource.path}`,
                    responses: {
                        '201': {
                            description: 'Resource created'
                        }
                    }
                }
            };

            openAPI.paths[`${basePath}/{id}`] = {
                get: {
                    summary: `Get ${resource.path} by ID`,
                    parameters: [
                        {
                            name: 'id',
                            in: 'path',
                            required: true,
                            schema: { type: 'string' }
                        }
                    ],
                    responses: {
                        '200': {
                            description: 'Successful response'
                        },
                        '404': {
                            description: 'Resource not found'
                        }
                    }
                },
                put: {
                    summary: `Update ${resource.path}`,
                    parameters: [
                        {
                            name: 'id',
                            in: 'path',
                            required: true,
                            schema: { type: 'string' }
                        }
                    ],
                    responses: {
                        '200': {
                            description: 'Resource updated'
                        }
                    }
                },
                delete: {
                    summary: `Delete ${resource.path}`,
                    parameters: [
                        {
                            name: 'id',
                            in: 'path',
                            required: true,
                            schema: { type: 'string' }
                        }
                    ],
                    responses: {
                        '204': {
                            description: 'Resource deleted'
                        }
                    }
                }
            };

            // Add schema
            openAPI.components.schemas[resource.entityType] = {
                type: 'object',
                properties: resource.fields.reduce((props, field) => {
                    props[field.name] = {
                        type: this.mapToOpenAPIType(field.type),
                        nullable: field.nullable
                    };
                    return props;
                }, {} as any)
            };
        });

        return openAPI;
    }

    private mapToOpenAPIType(type: string): string {
        const map: Record<string, string> = {
            'Integer': 'integer',
            'BigInteger': 'integer',
            'Decimal': 'number',
            'Boolean': 'boolean',
            'Text': 'string',
            'Code': 'string',
            'Date': 'string',
            'DateTime': 'string',
            'Guid': 'string'
        };
        return map[type] || 'string';
    }
}

export interface RESTResource {
    path: string;
    entityType: string;
    entitySet: string;
    fields: RESTField[];
    actions?: RESTAction[];
}

export interface RESTField {
    name: string;
    type: string;
    source: string;
    nullable?: boolean;
    isKey?: boolean;
    example?: any;
}

export interface RESTAction {
    method: 'get' | 'post' | 'put' | 'patch' | 'delete';
    path: string;
    handler: RESTHandler;
}

export interface RESTResponse {
    statusCode: number;
    data: any;
}

export type RESTMiddleware = (req: Request, res: Response) => Promise<boolean | void>;
export type RESTHandler = (req: Request, res: Response, next: NextFunction) => Promise<RESTResponse | void>;