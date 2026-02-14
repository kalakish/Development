import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import dotenv from 'dotenv';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { NovaApplication } from '@nova/core';
import { SecurityManager } from '@nova/security';
import { MetadataManager } from '@nova/metadata';
import { ODataService, RESTService, WebhookManager } from '@nova/integration';
import { ReportEngine } from '@nova/reporting';
import { createBullBoard } from '@bull-board/api';
import { BullAdapter } from '@bull-board/api/bullMQAdapter';

// Load environment variables
dotenv.config();

export class RuntimeServer {
    private app: Express;
    private server: any;
    private io: Server;
    private novaApp: NovaApplication;

    constructor() {
        this.app = express();
        this.server = createServer(this.app);
        this.io = new Server(this.server, {
            cors: {
                origin: process.env.CLIENT_URL || 'http://localhost:3000',
                credentials: true
            }
        });
    }

    async initialize(): Promise<void> {
        // Initialize NOVA Application
        this.novaApp = await NovaApplication.initialize({
            name: 'NOVA Runtime',
            version: process.env.npm_package_version || '2.0.0',
            environment: (process.env.NODE_ENV as any) || 'development',
            metadata: {
                connection: process.env.METADATA_DATABASE_URL!,
                cacheTTL: 3600
            },
            database: {
                host: process.env.DB_HOST!,
                port: parseInt(process.env.DB_PORT!),
                database: process.env.DB_NAME!,
                user: process.env.DB_USER!,
                password: process.env.DB_PASSWORD!,
                poolSize: parseInt(process.env.DB_POOL_SIZE || '20')
            },
            security: {
                jwtSecret: process.env.JWT_SECRET!,
                tokenExpiry: process.env.TOKEN_EXPIRY || '24h',
                bcryptRounds: 10,
                sessionTimeout: 3600000
            },
            extensions: {
                paths: ['./extensions'],
                autoLoad: true
            },
            audit: {
                enabled: true,
                retentionDays: 90
            },
            healthCheck: true
        });

        // Setup middleware
        this.setupMiddleware();

        // Setup routes
        this.setupRoutes();

        // Setup WebSocket
        this.setupWebSocket();

        // Setup error handling
        this.setupErrorHandling();

        console.log('✅ NOVA Runtime Server initialized successfully');
    }

    private setupMiddleware(): void {
        // Security
        this.app.use(helmet());
        this.app.use(cors({
            origin: process.env.CLIENT_URL || 'http://localhost:3000',
            credentials: true
        }));

        // Performance
        this.app.use(compression());
        this.app.use(express.json({ limit: '50mb' }));
        this.app.use(express.urlencoded({ extended: true, limit: '50mb' }));

        // Logging
        this.app.use((req: Request, res: Response, next: NextFunction) => {
            console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
            next();
        });

        // Authentication middleware
        this.app.use(async (req: Request, res: Response, next: NextFunction) => {
            try {
                const token = req.headers.authorization?.replace('Bearer ', '');
                
                if (token) {
                    const user = await SecurityManager.getInstance().validateToken(token);
                    if (user) {
                        req['user'] = user;
                        req['session'] = await this.novaApp.createSession(user);
                    }
                }
                next();
            } catch (error) {
                next(error);
            }
        });
    }

    private setupRoutes(): void {
        // Health check
        this.app.get('/health', (req: Request, res: Response) => {
            res.json({
                status: 'healthy',
                timestamp: new Date(),
                uptime: this.novaApp.getUptime(),
                version: process.env.npm_package_version
            });
        });

        // API Routes
        this.app.use('/api', this.createAPIRoutes());

        // OData Routes
        this.app.use('/odata', this.createODataRoutes());

        // Metadata Routes
        this.app.use('/metadata', this.createMetadataRoutes());

        // Report Routes
        this.app.use('/reports', this.createReportRoutes());

        // Admin Routes
        if (process.env.NODE_ENV === 'development') {
            this.app.use('/admin', this.createAdminRoutes());
        }

        // Static files
        this.app.use('/static', express.static('public'));

        // 404 handler
        this.app.use((req: Request, res: Response) => {
            res.status(404).json({ error: 'Route not found' });
        });
    }

    private createAPIRoutes(): Router {
        const router = express.Router();
        const restService = new RESTService();

        // Register REST resources
        // This would load from metadata

        return restService.getRouter();
    }

    private createODataRoutes(): Router {
        const router = express.Router();
        const odataService = new ODataService();

        // Register OData endpoints
        // This would load from metadata

        router.get('/$metadata', (req: Request, res: Response) => {
            res.json(odataService.getServiceDocument());
        });

        router.all('/*', async (req: Request, res: Response) => {
            try {
                const response = await odataService.handleRequest(req, req['session']);
                res.status(response.statusCode).json(response.data);
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        return router;
    }

    private createMetadataRoutes(): Router {
        const router = express.Router();
        const metadataManager = MetadataManager.getInstance();

        router.get('/objects', async (req: Request, res: Response) => {
            const objects = await metadataManager.getAllObjects();
            res.json(objects);
        });

        router.get('/objects/:type/:id', async (req: Request, res: Response) => {
            const object = await metadataManager.getObject(
                req.params.type as any,
                parseInt(req.params.id)
            );
            res.json(object);
        });

        return router;
    }

    private createReportRoutes(): Router {
        const router = express.Router();
        const reportEngine = new ReportEngine();

        router.post('/:reportId/execute', async (req: Request, res: Response) => {
            const result = await reportEngine.generateReport(
                parseInt(req.params.reportId),
                req.body
            );
            res.json(result);
        });

        router.post('/:reportId/export/:format', async (req: Request, res: Response) => {
            const report = await reportEngine.generateReport(
                parseInt(req.params.reportId),
                req.body.parameters
            );
            
            const exporter = new ReportExporter();
            const data = await exporter.export(
                report.datasets,
                req.params.format as any,
                req.body.options
            );

            res.setHeader('Content-Type', exporter.getContentType(req.params.format as any));
            res.send(data);
        });

        return router;
    }

    private createAdminRoutes(): Router {
        const router = express.Router();

        // Bull Board for queue management
        const { router: bullRouter } = createBullBoard([
            new BullAdapter(this.novaApp.getEventDispatcher()['queue'])
        ]);
        router.use('/queues', bullRouter);

        // Database management
        router.get('/database/stats', async (req: Request, res: Response) => {
            const db = this.novaApp.getDatabase();
            const metrics = db.getMetrics();
            res.json(metrics);
        });

        // Cache management
        router.delete('/cache', async (req: Request, res: Response) => {
            // Clear cache
            res.json({ success: true });
        });

        return router;
    }

    private setupWebSocket(): void {
        this.io.on('connection', (socket) => {
            console.log('Client connected:', socket.id);

            socket.on('authenticate', async (token: string) => {
                try {
                    const user = await SecurityManager.getInstance().validateToken(token);
                    if (user) {
                        socket.data.user = user;
                        socket.emit('authenticated', { success: true });
                    }
                } catch (error) {
                    socket.emit('authenticated', { success: false, error: error.message });
                }
            });

            socket.on('subscribe', (event: string) => {
                socket.join(event);
            });

            socket.on('unsubscribe', (event: string) => {
                socket.leave(event);
            });

            socket.on('disconnect', () => {
                console.log('Client disconnected:', socket.id);
            });
        });
    }

    private setupErrorHandling(): void {
        this.app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
            console.error('Unhandled error:', err);
            
            res.status(500).json({
                error: process.env.NODE_ENV === 'production' 
                    ? 'Internal server error' 
                    : err.message,
                stack: process.env.NODE_ENV === 'production' ? undefined : err.stack
            });
        });

        process.on('uncaughtException', (error) => {
            console.error('Uncaught Exception:', error);
        });

        process.on('unhandledRejection', (reason) => {
            console.error('Unhandled Rejection:', reason);
        });

        process.on('SIGTERM', async () => {
            console.log('SIGTERM received, shutting down...');
            await this.novaApp.shutdown();
            process.exit(0);
        });

        process.on('SIGINT', async () => {
            console.log('SIGINT received, shutting down...');
            await this.novaApp.shutdown();
            process.exit(0);
        });
    }

    async start(): Promise<void> {
        await this.initialize();

        const port = process.env.PORT || 3000;
        this.server.listen(port, () => {
            console.log(`🚀 NOVA Runtime Server running on port ${port}`);
            console.log(`📊 Environment: ${process.env.NODE_ENV}`);
            console.log(`🔗 API: http://localhost:${port}/api`);
            console.log(`📄 OData: http://localhost:${port}/odata`);
            console.log(`📈 Health: http://localhost:${port}/health`);
        });
    }
}

// Start server
if (require.main === module) {
    const server = new RuntimeServer();
    server.start().catch(error => {
        console.error('Failed to start server:', error);
        process.exit(1);
    });
}

export default RuntimeServer;