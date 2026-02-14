"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ApplicationStatus = exports.NovaApplication = void 0;
const events_1 = require("events");
const sqlserver_connection_1 = require("../database/sqlserver-connection");
const metadata_1 = require("@nova/metadata");
const event_dispatcher_1 = require("../events/event-dispatcher");
const security_1 = require("@nova/security");
const session_1 = require("./session");
const company_1 = require("./company");
const tenant_1 = require("./tenant");
const extension_1 = require("./extension");
const logger_1 = require("./utils/logger");
const uuid_1 = require("uuid");
class NovaApplication extends events_1.EventEmitter {
    static instance;
    metadataManager;
    database;
    eventDispatcher;
    securityManager;
    extensionManager;
    tenantManager;
    logger;
    sessions = new Map();
    companies = new Map();
    tenants = new Map();
    extensions = new Map();
    status = ApplicationStatus.Initializing;
    startTime;
    config;
    instanceId;
    constructor(config) {
        super();
        this.config = config;
        this.startTime = new Date();
        this.instanceId = (0, uuid_1.v4)();
        this.logger = new logger_1.Logger('NovaApplication');
    }
    static async initialize(config) {
        if (!NovaApplication.instance) {
            NovaApplication.instance = new NovaApplication(config);
            await NovaApplication.instance.start();
        }
        return NovaApplication.instance;
    }
    static getInstance() {
        if (!NovaApplication.instance) {
            throw new Error('Application not initialized. Call NovaApplication.initialize() first.');
        }
        return NovaApplication.instance;
    }
    async start() {
        try {
            this.logger.info('Initializing NOVA Application...');
            // Initialize metadata manager
            this.metadataManager = metadata_1.MetadataManager.getInstance();
            await this.metadataManager.initialize({
                connection: this.config.metadata,
                cacheTTL: this.config.metadata?.cacheTTL || 3600
            });
            // Initialize database connection
            this.database = new sqlserver_connection_1.SQLServerConnection(this.config.database);
            await this.database.connect();
            // Initialize event dispatcher
            this.eventDispatcher = event_dispatcher_1.EventDispatcher.getInstance();
            await this.eventDispatcher.initialize();
            // Initialize security manager
            this.securityManager = security_1.SecurityManager.getInstance();
            await this.securityManager.initialize(this.config.security);
            // Initialize extension manager
            this.extensionManager = new extension_1.ExtensionManager();
            await this.extensionManager.loadExtensions(this.config.extensions);
            // Initialize tenant manager
            this.tenantManager = tenant_1.TenantManager.getInstance();
            await this.tenantManager.initialize(this.database);
            // Load companies
            await this.loadCompanies();
            // Load tenants
            await this.loadTenants();
            // Register system event handlers
            this.registerSystemEvents();
            this.status = ApplicationStatus.Running;
            this.logger.success('NOVA Application initialized successfully');
            this.emit('initialized', {
                instanceId: this.instanceId,
                timestamp: new Date(),
                config: this.config
            });
        }
        catch (error) {
            this.status = ApplicationStatus.Error;
            this.logger.error(`Failed to initialize application: ${error.message}`);
            throw error;
        }
    }
    async shutdown() {
        this.logger.info('Shutting down NOVA Application...');
        this.status = ApplicationStatus.ShuttingDown;
        // Close all sessions
        for (const [id, session] of this.sessions) {
            await session.close();
            this.sessions.delete(id);
        }
        // Close database connection
        await this.database.disconnect();
        // Stop background services
        this.stopBackgroundServices();
        this.status = ApplicationStatus.Stopped;
        this.logger.success('NOVA Application shutdown complete');
        this.emit('shutdown', {
            instanceId: this.instanceId,
            timestamp: new Date(),
            uptime: this.getUptime()
        });
    }
    async createSession(user, companyId, tenantId) {
        // Authenticate user
        const authenticatedUser = await this.securityManager.authenticate({
            username: user.username,
            password: user.password
        });
        // Get company
        let company;
        if (companyId) {
            company = this.companies.get(companyId);
        }
        else {
            company = this.getDefaultCompany();
        }
        if (!company) {
            throw new Error('No company available for session');
        }
        // Get tenant
        let tenant;
        if (tenantId) {
            tenant = this.tenants.get(tenantId);
        }
        else {
            tenant = this.getDefaultTenant();
        }
        // Create session
        const session = new session_1.Session({
            id: this.generateSessionId(),
            user: authenticatedUser,
            company,
            tenant,
            application: this,
            createdAt: new Date()
        });
        // Initialize session
        await session.initialize();
        // Store session
        this.sessions.set(session.id, session);
        // Emit event
        await this.eventDispatcher.dispatch('application:sessionCreated', {
            sessionId: session.id,
            userId: authenticatedUser.id,
            companyId: company.id,
            tenantId: tenant?.id,
            timestamp: new Date()
        });
        return session;
    }
    async getSession(sessionId) {
        return this.sessions.get(sessionId);
    }
    async endSession(sessionId) {
        const session = this.sessions.get(sessionId);
        if (session) {
            await session.close();
            this.sessions.delete(sessionId);
            await this.eventDispatcher.dispatch('application:sessionEnded', {
                sessionId,
                timestamp: new Date()
            });
        }
    }
    async loadCompanies() {
        try {
            const result = await this.database.query('SELECT * FROM [Company] WHERE [SystemDeletedAt] IS NULL');
            for (const row of result.recordset) {
                const company = new company_1.Company({
                    id: row.SystemId,
                    name: row.Name,
                    displayName: row.DisplayName,
                    database: row.DatabaseName,
                    status: row.Status,
                    settings: JSON.parse(row.Settings || '{}'),
                    tenantId: row.TenantId
                });
                await company.initialize(this);
                this.companies.set(company.id, company);
            }
            this.logger.info(`Loaded ${this.companies.size} companies`);
        }
        catch (error) {
            this.logger.error(`Failed to load companies: ${error.message}`);
        }
    }
    async loadTenants() {
        try {
            const tenants = await this.tenantManager.getTenants();
            for (const tenant of tenants) {
                this.tenants.set(tenant.id, tenant);
            }
            this.logger.info(`Loaded ${this.tenants.size} tenants`);
        }
        catch (error) {
            this.logger.error(`Failed to load tenants: ${error.message}`);
        }
    }
    registerSystemEvents() {
        // Global error handler
        process.on('uncaughtException', (error) => {
            this.logger.error(`Uncaught Exception: ${error.message}`);
            this.emit('error', { error, type: 'uncaughtException' });
        });
        process.on('unhandledRejection', (reason) => {
            this.logger.error(`Unhandled Rejection: ${reason}`);
            this.emit('error', { error: reason, type: 'unhandledRejection' });
        });
        // Graceful shutdown
        process.on('SIGTERM', () => this.shutdown());
        process.on('SIGINT', () => this.shutdown());
    }
    startBackgroundServices() {
        // Session cleanup service
        setInterval(() => {
            this.cleanupSessions();
        }, 1800000); // Every 30 minutes
        // Cache cleanup service
        setInterval(() => {
            this.cleanupCache();
        }, 3600000); // Every hour
    }
    stopBackgroundServices() {
        // Clear all intervals
        // Implementation would track and clear intervals
    }
    async cleanupSessions() {
        const now = Date.now();
        const sessionTimeout = this.config.security?.sessionTimeout || 3600000; // 1 hour
        for (const [id, session] of this.sessions) {
            if (now - session.lastActivity.getTime() > sessionTimeout) {
                await this.endSession(id);
            }
        }
    }
    cleanupCache() {
        // Clear expired cache entries
        this.metadataManager.clearCache();
    }
    generateSessionId() {
        return `ses_${Date.now()}_${(0, uuid_1.v4)()}`;
    }
    getDefaultCompany() {
        return Array.from(this.companies.values())[0];
    }
    getDefaultTenant() {
        return Array.from(this.tenants.values())[0];
    }
    // ============ Public API ============
    getMetadataManager() {
        return this.metadataManager;
    }
    getDatabase() {
        return this.database;
    }
    getEventDispatcher() {
        return this.eventDispatcher;
    }
    getSecurityManager() {
        return this.securityManager;
    }
    getExtensionManager() {
        return this.extensionManager;
    }
    getTenantManager() {
        return this.tenantManager;
    }
    getCompanies() {
        return Array.from(this.companies.values());
    }
    getCompany(id) {
        return this.companies.get(id);
    }
    getTenants() {
        return Array.from(this.tenants.values());
    }
    getTenant(id) {
        return this.tenants.get(id);
    }
    getSessions() {
        return Array.from(this.sessions.values());
    }
    getStatus() {
        return this.status;
    }
    getUptime() {
        return Date.now() - this.startTime.getTime();
    }
    getConfig() {
        return { ...this.config };
    }
    getInstanceId() {
        return this.instanceId;
    }
}
exports.NovaApplication = NovaApplication;
var ApplicationStatus;
(function (ApplicationStatus) {
    ApplicationStatus["Initializing"] = "initializing";
    ApplicationStatus["Running"] = "running";
    ApplicationStatus["ShuttingDown"] = "shuttingDown";
    ApplicationStatus["Stopped"] = "stopped";
    ApplicationStatus["Error"] = "error";
})(ApplicationStatus || (exports.ApplicationStatus = ApplicationStatus = {}));
//# sourceMappingURL=application.js.map