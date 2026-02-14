import express, { Express, Request, Response, NextFunction, Router } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import { createServer } from 'http';
import { Server } from 'socket.io';
import Redis from 'ioredis';

// NOVA Core
import { NovaApplication } from '@nova/core';
import { SQLServerConnection } from '@nova/core/database/sqlserver-connection';

// NOVA Security
import { SecurityManager } from '@nova/security';

// NOVA Metadata
import { MetadataManager } from '@nova/metadata';

// NOVA Integration
import { ODataService, RESTService, WebhookManager } from '@nova/integration';
import { WebSocketServer } from '@nova/integration/websocket';
import { EmailService } from '@nova/integration/email';

// NOVA Reporting
import { ReportEngine, ReportExporter } from '@nova/reporting';

// NOVA ORM
import { EntityManager } from '@nova/orm';

// Runtime Middleware
import { createAuthMiddleware } from './middleware/auth-middleware';
import { createErrorHandler, ValidationError, AuthenticationError, AuthorizationError, NotFoundError, BusinessError } from './middleware/error-handler';
import { createRequestLogger } from './middleware/request-logger';
import { createDefaultLimiter, createAuthLimiter, createAPILimiter, createStrictLimiter } from './middleware/rate-limiter';
import { createDefaultCompression, createSmartCompression } from './middleware/compression';

// Runtime Services
import { HealthService } from './services/health-service';
import { MetricsService } from './services/metrics-service';
import { NotificationService } from './services/notification-service';

// Queue Monitoring
import { createBullBoard } from '@bull-board/api';
import { BullAdapter } from '@bull-board/api/bullAdapter';
import { ExpressAdapter } from '@bull-board/express';

// Load environment variables
dotenv.config();

export class RuntimeServer {
    private app: Express;
    private server: any;
    private io: Server;
    private novaApp: NovaApplication;
    private database: SQLServerConnection;
    private redis: Redis;
    private healthService: HealthService;
    private metricsService: MetricsService;
    private notificationService: NotificationService;
    private websocketServer: WebSocketServer;
    private emailService: EmailService;
    private reportEngine: ReportEngine;
    private entityManager: EntityManager;

    constructor() {
        this.app = express();
        this.server = createServer(this.app);
        this.io = new Server(this.server, {
            cors: {
                origin: process.env.CLIENT_URL || 'http://localhost:3000',
                credentials: true,
                methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS']
            },
            transports: ['websocket', 'polling'],
            pingTimeout: 60000,
            pingInterval: 25000
        });
    }

    async initialize(): Promise<void> {
        console.log('\n🚀 Initializing NOVA Runtime Server...\n');

        // Initialize Redis first (for rate limiting, caching, sessions)
        await this.initializeRedis();

        // Initialize Database Connection
        await this.initializeDatabase();

        // Initialize NOVA Application
        await this.initializeNovaApp();

        // Initialize WebSocket Server
        await this.initializeWebSocket();

        // Initialize Email Service
        await this.initializeEmailService();

        // Initialize Services
        await this.initializeServices();

        // Setup Express Middleware
        this.setupMiddleware();

        // Setup API Routes
        this.setupRoutes();

        // Setup WebSocket Handlers
        this.setupWebSocketHandlers();

        // Setup Error Handling
        this.setupErrorHandling();

        // Setup Graceful Shutdown
        this.setupGracefulShutdown();

        console.log('\n✅ NOVA Runtime Server initialized successfully\n');
    }

    private async initializeRedis(): Promise<void> {
        try {
            this.redis = new Redis({
                host: process.env.REDIS_HOST || 'localhost',
                port: parseInt(process.env.REDIS_PORT || '6379'),
                password: process.env.REDIS_PASSWORD,
                db: parseInt(process.env.REDIS_DB || '0'),
                retryStrategy: (times) => {
                    const delay = Math.min(times * 50, 2000);
                    return delay;
                },
                maxRetriesPerRequest: 3
            });

            this.redis.on('connect', () => {
                console.log('✅ Redis connected');
            });

            this.redis.on('error', (error) => {
                console.error('❌ Redis error:', error.message);
            });

            // Test connection
            await this.redis.ping();
        } catch (error) {
            console.error('❌ Failed to connect to Redis:', error.message);
            throw error;
        }
    }

    private async initializeDatabase(): Promise<void> {
        try {
            this.database = new SQLServerConnection({
                server: process.env.SQL_SERVER || 'localhost',
                port: parseInt(process.env.SQL_PORT || '1433'),
                database: process.env.SQL_DATABASE || 'NOVA_DB',
                user: process.env.SQL_USER || 'sa',
                password: process.env.SQL_PASSWORD || '',
                poolSize: parseInt(process.env.SQL_POOL_SIZE || '20'),
                encrypt: process.env.SQL_ENCRYPT === 'true',
                trustServerCertificate: process.env.SQL_TRUST_SERVER_CERTIFICATE === 'true',
                requestTimeout: parseInt(process.env.SQL_REQUEST_TIMEOUT || '30000'),
                connectionTimeout: parseInt(process.env.SQL_CONNECTION_TIMEOUT || '15000')
            });

            await this.database.connect();
            console.log('✅ SQL Server connected');
        } catch (error) {
            console.error('❌ Failed to connect to SQL Server:', error.message);
            throw error;
        }
    }

    private async initializeNovaApp(): Promise<void> {
        try {
            this.novaApp = await NovaApplication.initialize({
                name: 'NOVA Runtime',
                version: process.env.npm_package_version || '2.0.0',
                environment: (process.env.NODE_ENV as any) || 'development',
                
                metadata: {
                    connection: {
                        server: process.env.SQL_SERVER!,
                        database: process.env.METADATA_DATABASE || 'NOVA_Metadata',
                        user: process.env.SQL_USER!,
                        password: process.env.SQL_PASSWORD!
                    },
                    cacheTTL: 3600
                },
                
                database: {
                    server: process.env.SQL_SERVER!,
                    port: parseInt(process.env.SQL_PORT!),
                    database: process.env.SQL_DATABASE!,
                    user: process.env.SQL_USER!,
                    password: process.env.SQL_PASSWORD!,
                    poolSize: parseInt(process.env.SQL_POOL_SIZE || '20')
                },
                
                security: {
                    jwtSecret: process.env.JWT_SECRET!,
                    tokenExpiry: process.env.TOKEN_EXPIRY || '24h',
                    bcryptRounds: 10,
                    sessionTimeout: parseInt(process.env.SESSION_TIMEOUT || '3600000'),
                    maxLoginAttempts: parseInt(process.env.MAX_LOGIN_ATTEMPTS || '5'),
                    lockoutDuration: parseInt(process.env.LOCKOUT_DURATION || '900000')
                },
                
                extensions: {
                    paths: ['./extensions'],
                    autoLoad: true
                },
                
                audit: {
                    enabled: true,
                    retentionDays: parseInt(process.env.AUDIT_RETENTION_DAYS || '90')
                },
                
                healthCheck: true,
                debug: process.env.NODE_ENV === 'development'
            });

            console.log('✅ NOVA Application initialized');
        } catch (error) {
            console.error('❌ Failed to initialize NOVA Application:', error.message);
            throw error;
        }
    }

    private async initializeWebSocket(): Promise<void> {
        try {
            this.websocketServer = new WebSocketServer(this.io, {
                authentication: true,
                heartbeat: true,
                heartbeatInterval: 30000,
                maxConnections: 10000
            });

            console.log('✅ WebSocket Server initialized');
        } catch (error) {
            console.error('❌ Failed to initialize WebSocket Server:', error.message);
            throw error;
        }
    }

    private async initializeEmailService(): Promise<void> {
        try {
            this.emailService = new EmailService({
                host: process.env.SMTP_HOST || 'smtp.gmail.com',
                port: parseInt(process.env.SMTP_PORT || '587'),
                secure: process.env.SMTP_SECURE === 'true',
                auth: {
                    user: process.env.SMTP_USER!,
                    pass: process.env.SMTP_PASSWORD!
                },
                from: process.env.SMTP_FROM || 'noreply@nova.local'
            });

            console.log('✅ Email Service initialized');
        } catch (error) {
            console.warn('⚠️ Email Service not configured:', error.message);
        }
    }

    private async initializeServices(): Promise<void> {
        try {
            // Health Service
            this.healthService = new HealthService(this.novaApp, this.database, this.redis);
            
            // Metrics Service
            this.metricsService = new MetricsService(this.novaApp, this.database, this.redis);
            
            // Notification Service
            this.notificationService = new NotificationService(this.websocketServer, this.emailService);
            
            // Report Engine
            this.reportEngine = new ReportEngine(this.novaApp.createSession({
                id: 'system',
                username: 'system',
                displayName: 'System',
                email: 'system@nova.local',
                roles: ['super'],
                isSuperAdmin: true
            }));
            
            // Entity Manager
            const session = await this.novaApp.createSession({
                id: 'system',
                username: 'system',
                displayName: 'System',
                email: 'system@nova.local',
                roles: ['super'],
                isSuperAdmin: true
            });
            this.entityManager = new EntityManager(session);

            console.log('✅ All services initialized');
        } catch (error) {
            console.error('❌ Failed to initialize services:', error.message);
            throw error;
        }
    }

    private setupMiddleware(): void {
        // ============ Security Middleware ============
        this.app.use(helmet({
            contentSecurityPolicy: process.env.NODE_ENV === 'production',
            crossOriginEmbedderPolicy: process.env.NODE_ENV === 'production',
            crossOriginOpenerPolicy: { policy: 'same-origin' },
            crossOriginResourcePolicy: { policy: 'same-origin' },
            dnsPrefetchControl: { allow: false },
            frameguard: { action: 'deny' },
            hidePoweredBy: true,
            hsts: process.env.NODE_ENV === 'production' ? {
                maxAge: 31536000,
                includeSubDomains: true,
                preload: true
            } : false,
            ieNoOpen: true,
            noSniff: true,
            referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
            xssFilter: true
        }));

        // CORS
        this.app.use(cors({
            origin: (origin, callback) => {
                const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:3000').split(',');
                
                if (!origin || allowedOrigins.includes(origin) || process.env.NODE_ENV === 'development') {
                    callback(null, true);
                } else {
                    callback(new Error('Not allowed by CORS'));
                }
            },
            credentials: true,
            methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
            allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-Company-ID', 'X-Tenant-ID', 'X-Correlation-ID'],
            exposedHeaders: ['X-RateLimit-Limit', 'X-RateLimit-Remaining', 'X-RateLimit-Reset']
        }));

        // ============ Performance Middleware ============
        this.app.use(createSmartCompression());
        
        // Body parsing
        this.app.use(express.json({ 
            limit: process.env.MAX_REQUEST_SIZE || '10mb',
            verify: (req: any, res, buf) => {
                req.rawBody = buf.toString();
            }
        }));
        this.app.use(express.urlencoded({ 
            extended: true, 
            limit: process.env.MAX_REQUEST_SIZE || '10mb' 
        }));

        // ============ Request Logging ============
        this.app.use(createRequestLogger());

        // ============ Rate Limiting ============
        const defaultLimiter = createDefaultLimiter(this.redis);
        const authLimiter = createAuthLimiter(this.redis);
        const apiLimiter = createAPILimiter(this.redis);
        const strictLimiter = createStrictLimiter(this.redis);

        // Apply rate limits to specific routes
        this.app.use('/api/auth', authLimiter);
        this.app.use('/api', apiLimiter);
        this.app.use('/api/admin', strictLimiter);
        
        // ============ Authentication ============
        const auth = createAuthMiddleware(this.novaApp);
        
        // Public routes - no authentication
        this.app.use('/health', auth.optional);
        this.app.use('/metrics', auth.optional);
        this.app.use('/api/auth/login', auth.optional);
        this.app.use('/api/auth/register', auth.optional);
        this.app.use('/api/auth/forgot-password', auth.optional);
        this.app.use('/api/auth/reset-password', auth.optional);
        
        // Protected routes - require authentication
        this.app.use('/api', auth.authenticate);
        this.app.use('/odata', auth.authenticate);
        this.app.use('/metadata', auth.authenticate);
        this.app.use('/reports', auth.authenticate);
        
        // Company & Tenant context
        this.app.use('/api', auth.requireCompany);
        this.app.use('/odata', auth.requireCompany);
        this.app.use('/reports', auth.requireCompany);
        
        if (process.env.MULTI_TENANT === 'true') {
            this.app.use('/api', auth.requireTenant);
            this.app.use('/odata', auth.requireTenant);
            this.app.use('/reports', auth.requireTenant);
        }

        // ============ Request ID & Correlation ============
        this.app.use((req: Request, res: Response, next: NextFunction) => {
            req.id = req.headers['x-request-id'] as string || 
                    `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
            res.setHeader('x-request-id', req.id);
            next();
        });

        // ============ Response Time Header ============
        this.app.use((req: Request, res: Response, next: NextFunction) => {
            const start = Date.now();
            res.on('finish', () => {
                const duration = Date.now() - start;
                res.setHeader('x-response-time', `${duration}ms`);
            });
            next();
        });

        console.log('✅ Middleware setup complete');
    }

    private setupRoutes(): void {
        // ============ Health & Metrics ============
        this.app.get('/health', async (req: Request, res: Response) => {
            const health = await this.healthService.getHealth(req.query.deep === 'true');
            res.json(health);
        });

        this.app.get('/health/live', async (req: Request, res: Response) => {
            const liveness = await this.healthService.getLiveness();
            res.json(liveness);
        });

        this.app.get('/health/ready', async (req: Request, res: Response) => {
            const readiness = await this.healthService.getReadiness();
            res.json(readiness);
        });

        this.app.get('/metrics', async (req: Request, res: Response) => {
            await this.metricsService.collect();
            
            if (req.query.format === 'prometheus') {
                const metrics = await this.metricsService.getPrometheusMetrics();
                res.setHeader('Content-Type', 'text/plain');
                res.send(metrics);
            } else {
                const metrics = await this.metricsService.getJSONMetrics();
                res.json(metrics);
            }
        });

        this.app.get('/metrics/:name', async (req: Request, res: Response) => {
            const metric = this.metricsService.getMetric(req.params.name);
            if (!metric) {
                throw new NotFoundError(`Metric ${req.params.name} not found`);
            }
            res.json(metric);
        });

        // ============ API Routes ============
        this.app.use('/api', this.createAPIRoutes());
        this.app.use('/odata', this.createODataRoutes());
        this.app.use('/metadata', this.createMetadataRoutes());
        this.app.use('/reports', this.createReportRoutes());

        // ============ Webhook Routes ============
        this.app.use('/webhooks', this.createWebhookRoutes());

        // ============ Static Files ============
        this.app.use('/static', express.static('public', {
            maxAge: '1d',
            etag: true,
            lastModified: true,
            setHeaders: (res, path) => {
                if (path.endsWith('.html')) {
                    res.setHeader('Cache-Control', 'public, max-age=0');
                }
            }
        }));

        // ============ Admin Routes ============
        if (process.env.NODE_ENV === 'development' || process.env.ENABLE_ADMIN === 'true') {
            this.app.use('/admin', this.createAdminRoutes());
        }

        // ============ API Documentation ============
        if (process.env.NODE_ENV === 'development') {
            this.app.get('/docs', (req: Request, res: Response) => {
                res.redirect('/swagger');
            });
        }

        console.log('✅ Routes setup complete');
    }

    private createAPIRoutes(): Router {
        const router = express.Router();
        const restService = new RESTService();
        const auth = createAuthMiddleware(this.novaApp);

        // ============ Auth Routes ============
        router.post('/auth/login', async (req: Request, res: Response, next: NextFunction) => {
            try {
                const { username, password } = req.body;
                const securityManager = SecurityManager.getInstance();
                const user = await securityManager.authenticate({ username, password });
                const token = securityManager.generateToken(user);
                
                // Create session
                const session = await this.novaApp.createSession(user);
                
                res.json({
                    success: true,
                    data: {
                        token,
                        user: {
                            id: user.id,
                            username: user.username,
                            displayName: user.displayName,
                            email: user.email,
                            roles: user.roles,
                            isSuperAdmin: user.isSuperAdmin
                        },
                        session: {
                            id: session.id,
                            company: session.company?.toJSON(),
                            tenant: session.tenant?.toJSON()
                        }
                    }
                });
            } catch (error) {
                next(new AuthenticationError(error.message));
            }
        });

        router.post('/auth/logout', auth.authenticate, async (req: Request, res: Response) => {
            await this.novaApp.endSession(req['session'].id);
            res.json({ success: true, message: 'Logged out successfully' });
        });

        router.get('/auth/me', auth.authenticate, (req: Request, res: Response) => {
            res.json({
                success: true,
                data: {
                    user: req['user'],
                    session: req['session'].toJSON()
                }
            });
        });

        // ============ Company Routes ============
        router.get('/companies', auth.authorize('read:company'), async (req: Request, res: Response) => {
            const companies = this.novaApp.getCompanies();
            res.json({ success: true, data: companies });
        });

        router.get('/companies/:id', auth.authorize('read:company'), async (req: Request, res: Response) => {
            const company = this.novaApp.getCompany(req.params.id);
            if (!company) {
                throw new NotFoundError(`Company ${req.params.id} not found`);
            }
            res.json({ success: true, data: company.toJSON() });
        });

        // ============ Tenant Routes ============
        if (process.env.MULTI_TENANT === 'true') {
            router.get('/tenants', auth.authorize('read:tenant'), async (req: Request, res: Response) => {
                const tenants = this.novaApp.getTenants();
                res.json({ success: true, data: tenants });
            });

            router.get('/tenants/:id', auth.authorize('read:tenant'), async (req: Request, res: Response) => {
                const tenant = this.novaApp.getTenant(req.params.id);
                if (!tenant) {
                    throw new NotFoundError(`Tenant ${req.params.id} not found`);
                }
                res.json({ success: true, data: tenant.toJSON() });
            });
        }

        // ============ User Routes ============
        router.get('/users/me/sessions', auth.authenticate, async (req: Request, res: Response) => {
            const sessions = this.novaApp.getSessions().filter(s => s.user.id === req['user'].id);
            res.json({ success: true, data: sessions.map(s => s.toJSON()) });
        });

        router.delete('/users/me/sessions/:id', auth.authenticate, async (req: Request, res: Response) => {
            await this.novaApp.endSession(req.params.id);
            res.json({ success: true, message: 'Session ended' });
        });

        // ============ Notification Routes ============
        router.get('/notifications', auth.authenticate, async (req: Request, res: Response) => {
            const notifications = await this.notificationService.getNotifications(
                req['user'].id,
                {
                    read: req.query.read === 'true' ? true : 
                          req.query.read === 'false' ? false : undefined,
                    limit: req.query.limit ? parseInt(req.query.limit as string) : 50,
                    offset: req.query.offset ? parseInt(req.query.offset as string) : 0
                }
            );
            const unreadCount = await this.notificationService.getUnreadCount(req['user'].id);
            
            res.json({
                success: true,
                data: {
                    notifications,
                    unreadCount,
                    total: notifications.length
                }
            });
        });

        router.patch('/notifications/:id/read', auth.authenticate, async (req: Request, res: Response) => {
            await this.notificationService.markAsRead(req.params.id, req['user'].id);
            res.json({ success: true, message: 'Notification marked as read' });
        });

        router.patch('/notifications/read-all', auth.authenticate, async (req: Request, res: Response) => {
            const count = await this.notificationService.markAllAsRead(req['user'].id);
            res.json({ success: true, message: `${count} notifications marked as read` });
        });

        // Register REST resources
        this.registerRESTResources(restService);
        
        return restService.getRouter();
    }

    private createODataRoutes(): Router {
        const router = express.Router();
        const odataService = new ODataService();

        // Register OData endpoints
        this.registerODataEndpoints(odataService);

        router.get('/$metadata', (req: Request, res: Response) => {
            res.json(odataService.getServiceDocument());
        });

        router.all('/*', async (req: Request, res: Response, next: NextFunction) => {
            try {
                const response = await odataService.handleRequest(req, req['session']);
                res.status(response.statusCode).json(response.data);
            } catch (error) {
                next(error);
            }
        });

        return router;
    }

    private createMetadataRoutes(): Router {
        const router = express.Router();
        const metadataManager = MetadataManager.getInstance();

        router.get('/objects', async (req: Request, res: Response, next: NextFunction) => {
            try {
                const type = req.query.type as any;
                const objects = await metadataManager.getAllObjects(type);
                res.json({ success: true, data: objects });
            } catch (error) {
                next(error);
            }
        });

        router.get('/objects/:type/:id', async (req: Request, res: Response, next: NextFunction) => {
            try {
                const object = await metadataManager.getObject(
                    req.params.type as any,
                    parseInt(req.params.id)
                );
                
                if (!object) {
                    throw new NotFoundError(`Object ${req.params.type}:${req.params.id} not found`);
                }
                
                res.json({ success: true, data: object });
            } catch (error) {
                next(error);
            }
        });

        router.get('/objects/:type/:id/versions', async (req: Request, res: Response, next: NextFunction) => {
            try {
                const versions = await metadataManager.getObjectVersions(
                    req.params.type as any,
                    parseInt(req.params.id)
                );
                res.json({ success: true, data: versions });
            } catch (error) {
                next(error);
            }
        });

        router.post('/search', async (req: Request, res: Response, next: NextFunction) => {
            try {
                const { query, type } = req.body;
                const results = await metadataManager.searchObjects(query, type);
                res.json({ success: true, data: results });
            } catch (error) {
                next(error);
            }
        });

        return router;
    }

    private createReportRoutes(): Router {
        const router = express.Router();
        const auth = createAuthMiddleware(this.novaApp);

        router.post('/:reportId/execute', auth.authorize('execute:report'), async (req: Request, res: Response, next: NextFunction) => {
            try {
                const result = await this.reportEngine.generateReport(
                    req.params.reportId,
                    req.body,
                    { useCache: req.query.cache !== 'false' }
                );
                res.json({ success: true, data: result });
            } catch (error) {
                next(error);
            }
        });

        router.post('/:reportId/export/:format', auth.authorize('export:report'), async (req: Request, res: Response, next: NextFunction) => {
            try {
                const result = await this.reportEngine.generateReport(
                    req.params.reportId,
                    req.body.parameters
                );
                
                const data = await this.reportEngine.exportReport(
                    result,
                    req.params.format as any,
                    {
                        title: req.body.options?.title || result.reportName,
                        author: req['user']?.displayName || 'NOVA Report',
                        orientation: req.body.options?.orientation,
                        pageSize: req.body.options?.pageSize,
                        watermark: req.body.options?.watermark
                    }
                );

                const exporter = new ReportExporter();
                res.setHeader('Content-Type', exporter.getContentType(req.params.format as any));
                res.setHeader('Content-Disposition', `attachment; filename="${result.reportName}_${Date.now()}.${exporter.getFileExtension(req.params.format as any)}"`);
                res.send(data);
            } catch (error) {
                next(error);
            }
        });

        router.get('/:reportId/status/:executionId', auth.authenticate, async (req: Request, res: Response) => {
            const execution = this.reportEngine.getExecution(req.params.executionId);
            if (!execution) {
                throw new NotFoundError(`Execution ${req.params.executionId} not found`);
            }
            res.json({ success: true, data: execution });
        });

        router.delete('/:executionId/cancel', auth.authenticate, async (req: Request, res: Response) => {
            await this.reportEngine.cancelExecution(req.params.executionId);
            res.json({ success: true, message: 'Execution cancelled' });
        });

        return router;
    }

    private createWebhookRoutes(): Router {
        const router = express.Router();
        const webhookManager = new WebhookManager();

        router.post('/:webhookId', async (req: Request, res: Response, next: NextFunction) => {
            try {
                const result = await webhookManager.trigger(
                    req.params.webhookId,
                    req.body,
                    req['session']
                );
                res.json({ success: true, data: result });
            } catch (error) {
                next(error);
            }
        });

        router.get('/:webhookId/history', async (req: Request, res: Response, next: NextFunction) => {
            try {
                const history = await webhookManager.getHistory(
                    req.params.webhookId,
                    req.query.limit ? parseInt(req.query.limit as string) : 100
                );
                res.json({ success: true, data: history });
            } catch (error) {
                next(error);
            }
        });

        return router;
    }

    private createAdminRoutes(): Router {
        const router = express.Router();
        const auth = createAuthMiddleware(this.novaApp);
        
        // Require super admin for admin routes
        router.use(auth.authorize('admin:access'));

        // ============ Bull Board ============
        const serverAdapter = new ExpressAdapter();
        serverAdapter.setBasePath('/admin/queues');
        
        createBullBoard({
            queues: [
                new BullAdapter(this.novaApp.getEventDispatcher()['queue'])
            ],
            serverAdapter
        });

        router.use('/queues', serverAdapter.getRouter());

        // ============ Database Management ============
        router.get('/database/stats', async (req: Request, res: Response) => {
            const metrics = this.database.getMetrics();
            const health = await this.healthService.getHealth(false);
            
            res.json({
                success: true,
                data: {
                    metrics,
                    health: health.services.database,
                    connections: this.database['pool']?.totalCount || 0,
                    idleConnections: this.database['pool']?.idleCount || 0
                }
            });
        });

        // ============ Cache Management ============
        router.delete('/cache', async (req: Request, res: Response) => {
            await this.redis.flushdb();
            res.json({ success: true, message: 'Cache cleared' });
        });

        router.get('/cache/stats', async (req: Request, res: Response) => {
            const info = await this.redis.info();
            const stats = {
                hitRate: await this.redis.get('cache:hit:rate') || 0,
                memory: info.match(/used_memory_human:(\S+)/)?.[1],
                keys: await this.redis.dbsize()
            };
            res.json({ success: true, data: stats });
        });

        // ============ System Info ============
        router.get('/system', async (req: Request, res: Response) => {
            const health = await this.healthService.getHealth(true);
            const metrics = await this.metricsService.getJSONMetrics();
            
            res.json({
                success: true,
                data: {
                    application: {
                        name: this.novaApp.getConfig().name,
                        version: this.novaApp.getConfig().version,
                        environment: this.novaApp.getConfig().environment,
                        instanceId: this.novaApp.getInstanceId(),
                        uptime: this.novaApp.getUptime(),
                        status: this.novaApp.getStatus()
                    },
                    health,
                    metrics,
                    sessions: this.novaApp.getSessions().length,
                    companies: this.novaApp.getCompanies().length,
                    tenants: this.novaApp.getTenants().length
                }
            });
        });

        return router;
    }

    private setupWebSocketHandlers(): void {
        this.io.on('connection', (socket) => {
            console.log(`🔌 Client connected: ${socket.id}`);

            // Handle authentication
            socket.on('authenticate', async (token: string) => {
                try {
                    const user = await SecurityManager.getInstance().validateToken(token);
                    if (user) {
                        socket.data.user = user;
                        socket.data.authenticated = true;
                        
                        // Join user-specific room
                        socket.join(`user:${user.id}`);
                        
                        // Join company room
                        if (socket.data.session?.company) {
                            socket.join(`company:${socket.data.session.company.id}`);
                        }
                        
                        // Join tenant room
                        if (socket.data.session?.tenant) {
                            socket.join(`tenant:${socket.data.session.tenant.id}`);
                        }

                        socket.emit('authenticated', { 
                            success: true,
                            user: {
                                id: user.id,
                                username: user.username,
                                displayName: user.displayName
                            }
                        });

                        // Send unread notification count
                        const unreadCount = await this.notificationService.getUnreadCount(user.id);
                        socket.emit('unread_count', unreadCount);
                    }
                } catch (error) {
                    socket.emit('authenticated', { 
                        success: false, 
                        error: error.message 
                    });
                }
            });

            // Handle subscriptions
            socket.on('subscribe', (event: string) => {
                socket.join(event);
                console.log(`📡 Client ${socket.id} subscribed to ${event}`);
            });

            socket.on('unsubscribe', (event: string) => {
                socket.leave(event);
                console.log(`📡 Client ${socket.id} unsubscribed from ${event}`);
            });

            // Handle disconnection
            socket.on('disconnect', () => {
                console.log(`🔌 Client disconnected: ${socket.id}`);
            });

            // Handle errors
            socket.on('error', (error) => {
                console.error(`❌ WebSocket error for ${socket.id}:`, error);
            });
        });

        console.log('✅ WebSocket handlers setup complete');
    }

    private setupErrorHandling(): void {
        const errorHandler = createErrorHandler();

        // 404 handler
        this.app.use(errorHandler.notFound);

        // Global error handler
        this.app.use(errorHandler.handle);

        // Uncaught exceptions
        process.on('uncaughtException', (error) => {
            console.error('❌ Uncaught Exception:', error);
            this.metricsService.increment('uncaught_exceptions_total', 1, {
                type: error.name
            });
        });

        // Unhandled rejections
        process.on('unhandledRejection', (reason) => {
            console.error('❌ Unhandled Rejection:', reason);
            this.metricsService.increment('unhandled_rejections_total', 1, {
                type: reason?.constructor?.name || 'Unknown'
            });
        });

        console.log('✅ Error handling setup complete');
    }

    private setupGracefulShutdown(): void {
        const shutdown = async (signal: string) => {
            console.log(`\n📡 ${signal} received, starting graceful shutdown...`);

            // Stop accepting new connections
            this.server.close(async () => {
                console.log('📡 HTTP server closed');

                // Close WebSocket connections
                await this.websocketServer?.close();
                console.log('📡 WebSocket server closed');

                // Shutdown NOVA Application
                await this.novaApp.shutdown();
                console.log('✅ NOVA Application shutdown');

                // Close database connection
                await this.database.disconnect();
                console.log('✅ Database disconnected');

                // Close Redis connection
                await this.redis.quit();
                console.log('✅ Redis disconnected');

                // Stop metrics collection
                this.metricsService.stop();
                console.log('✅ Metrics service stopped');

                console.log('✅ Graceful shutdown complete');
                process.exit(0);
            });

            // Force shutdown after timeout
            setTimeout(() => {
                console.error('❌ Force shutdown due to timeout');
                process.exit(1);
            }, 30000);
        };

        process.on('SIGTERM', () => shutdown('SIGTERM'));
        process.on('SIGINT', () => shutdown('SIGINT'));
    }

    private registerRESTResources(restService: RESTService): void {
        // This would load from metadata
        // Example:
        // restService.registerResource({
        //     path: 'customers',
        //     entityType: 'Customer',
        //     entitySet: 'Customer',
        //     fields: [...]
        // });
    }

    private registerODataEndpoints(odataService: ODataService): void {
        // This would load from metadata
        // Example:
        // odataService.registerEndpoint({
        //     name: 'Customers',
        //     entityType: 'Customer',
        //     entitySet: 'Customer',
        //     fields: [...]
        // });
    }

    async start(): Promise<void> {
        await this.initialize();

        const port = process.env.PORT || 3000;
        this.server.listen(port, () => {
            console.log('\n' + '='.repeat(60));
            console.log(`   🚀 NOVA Runtime Server v${process.env.npm_package_version || '2.0.0'}`);
            console.log('='.repeat(60));
            console.log(`   📡 Server:      http://localhost:${port}`);
            console.log(`   📊 Environment: ${process.env.NODE_ENV || 'development'}`);
            console.log(`   🔗 API:         http://localhost:${port}/api`);
            console.log(`   📄 OData:       http://localhost:${port}/odata`);
            console.log(`   📈 Health:      http://localhost:${port}/health`);
            console.log(`   📉 Metrics:     http://localhost:${port}/metrics`);
            console.log(`   🔌 WebSocket:   ws://localhost:${port}`);
            console.log('='.repeat(60));
            console.log(`   ⏰ Started at:  ${new Date().toISOString()}`);
            console.log('='.repeat(60) + '\n');
        });

        // Start metrics collection
        setInterval(async () => {
            await this.metricsService.collect();
        }, 15000);
    }
}

// Export for testing
export { RuntimeServer };

// Start server if running directly
if (require.main === module) {
    const server = new RuntimeServer();
    server.start().catch(error => {
        console.error('❌ Failed to start server:', error);
        process.exit(1);
    });
}

export default RuntimeServer;