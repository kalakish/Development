import { Router, Express } from 'express';
import { EventEmitter } from 'events';
import { Logger } from '@nova/core/utils/logger';
import { SecurityManager } from '@nova/security/security-manager';
import { APIController } from './api-controller';
import { APIRoute } from './api-route';

export interface APIGatewayOptions {
    prefix?: string;
    version?: string;
    enableCors?: boolean;
    enableCompression?: boolean;
    enableRateLimiting?: boolean;
    enableLogging?: boolean;
}

export class APIGateway extends EventEmitter {
    private router: Router;
    private logger: Logger;
    private controllers: Map<string, APIController> = new Map();
    private routes: APIRoute[] = [];
    private options: APIGatewayOptions;
    private securityManager: SecurityManager;

    constructor(options: APIGatewayOptions = {}) {
        super();
        this.router = Router();
        this.logger = new Logger('APIGateway');
        this.options = {
            prefix: '/api',
            version: 'v1',
            enableCors: true,
            enableCompression: true,
            enableRateLimiting: true,
            enableLogging: true,
            ...options
        };

        this.securityManager = SecurityManager.getInstance();
        this.setupMiddleware();
    }

    private setupMiddleware(): void {
        // JSON parsing
        this.router.use(express.json({ limit: '50mb' }));
        this.router.use(express.urlencoded({ extended: true, limit: '50mb' }));

        // Logging
        if (this.options.enableLogging) {
            this.router.use(this.requestLogger.bind(this));
        }

        // CORS
        if (this.options.enableCors) {
            this.router.use(cors({
                origin: '*',
                credentials: true
            }));
        }

        // Compression
        if (this.options.enableCompression) {
            this.router.use(compression());
        }

        // Rate limiting
        if (this.options.enableRateLimiting) {
            this.router.use(this.rateLimiter.bind(this));
        }
    }

    // ============ Controller Management ============

    registerController(controller: APIController): void {
        const basePath = this.buildPath(controller.getBasePath());
        
        // Register controller routes
        controller.getRoutes().forEach(route => {
            this.registerRoute(basePath, route);
        });

        this.controllers.set(controller.constructor.name, controller);
        this.logger.info(`Registered controller: ${controller.constructor.name} at ${basePath}`);
    }

    unregisterController(controllerName: string): void {
        this.controllers.delete(controllerName);
        
        // Remove routes
        this.routes = this.routes.filter(r => r.controller !== controllerName);
        
        // Rebuild router
        this.rebuildRouter();

        this.logger.info(`Unregistered controller: ${controllerName}`);
    }

    // ============ Route Management ============

    private registerRoute(basePath: string, route: APIRoute): void {
        const fullPath = `${basePath}${route.path}`;
        
        route.controller = route.controller || 'unknown';
        this.routes.push(route);

        switch (route.method.toLowerCase()) {
            case 'get':
                this.router.get(fullPath, ...route.middleware, route.handler.bind(route.controllerInstance));
                break;
            case 'post':
                this.router.post(fullPath, ...route.middleware, route.handler.bind(route.controllerInstance));
                break;
            case 'put':
                this.router.put(fullPath, ...route.middleware, route.handler.bind(route.controllerInstance));
                break;
            case 'patch':
                this.router.patch(fullPath, ...route.middleware, route.handler.bind(route.controllerInstance));
                break;
            case 'delete':
                this.router.delete(fullPath, ...route.middleware, route.handler.bind(route.controllerInstance));
                break;
        }

        this.logger.debug(`Registered route: ${route.method} ${fullPath}`);
    }

    private rebuildRouter(): void {
        this.router = Router();
        this.setupMiddleware();

        this.controllers.forEach(controller => {
            const basePath = this.buildPath(controller.getBasePath());
            controller.getRoutes().forEach(route => {
                if (this.routes.some(r => r.id === route.id)) {
                    this.registerRoute(basePath, route);
                }
            });
        });
    }

    // ============ Route Discovery ============

    getRoutes(): APIRoute[] {
        return [...this.routes];
    }

    getRoute(path: string, method: string): APIRoute | undefined {
        return this.routes.find(r => r.path === path && r.method === method);
    }

    getControllers(): APIController[] {
        return Array.from(this.controllers.values());
    }

    // ============ Middleware ============

    private async requestLogger(req: any, res: any, next: any): Promise<void> {
        const start = Date.now();

        res.on('finish', () => {
            const duration = Date.now() - start;
            this.logger.info(`${req.method} ${req.originalUrl} ${res.statusCode} - ${duration}ms`);
        });

        next();
    }

    private async rateLimiter(req: any, res: any, next: any): Promise<void> {
        // Implement rate limiting logic
        next();
    }

    // ============ Utility ============

    private buildPath(path: string): string {
        let fullPath = this.options.prefix || '/api';
        
        if (this.options.version) {
            fullPath += `/${this.options.version}`;
        }

        if (path) {
            fullPath += path.startsWith('/') ? path : `/${path}`;
        }

        return fullPath;
    }

    // ============ Express Integration ============

    applyTo(app: Express): void {
        app.use(this.router);
        this.logger.success(`API Gateway mounted at ${this.options.prefix}/${this.options.version}`);
    }

    getRouter(): Router {
        return this.router;
    }

    // ============ Documentation ============

    generateOpenAPI(): any {
        const openAPI: any = {
            openapi: '3.0.0',
            info: {
                title: 'NOVA API Gateway',
                version: this.options.version,
                description: 'NOVA Framework REST API'
            },
            paths: {},
            components: {
                schemas: {},
                securitySchemes: {
                    bearerAuth: {
                        type: 'http',
                        scheme: 'bearer',
                        bearerFormat: 'JWT'
                    }
                }
            }
        };

        this.routes.forEach(route => {
            const path = route.path;
            const method = route.method.toLowerCase();

            if (!openAPI.paths[path]) {
                openAPI.paths[path] = {};
            }

            openAPI.paths[path][method] = {
                summary: route.summary || `${route.method} ${route.path}`,
                description: route.description,
                tags: route.tags || ['default'],
                security: route.isPublic ? [] : [{ bearerAuth: [] }],
                responses: route.responses || {
                    '200': { description: 'Success' },
                    '400': { description: 'Bad Request' },
                    '401': { description: 'Unauthorized' },
                    '500': { description: 'Internal Server Error' }
                }
            };

            if (route.parameters) {
                openAPI.paths[path][method].parameters = route.parameters;
            }

            if (route.requestBody) {
                openAPI.paths[path][method].requestBody = route.requestBody;
            }
        });

        return openAPI;
    }
}

// Express dependencies
import express from 'express';
import cors from 'cors';
import compression from 'compression';