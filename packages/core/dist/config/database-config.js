"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DatabaseConfig = void 0;
class DatabaseConfig {
    config;
    pools = new Map();
    constructor() {
        this.config = this.loadFromEnv();
    }
    // ============ Main Configuration ============
    loadFromEnv() {
        return {
            server: process.env.DB_HOST || 'localhost',
            port: parseInt(process.env.DB_PORT || '1433', 10),
            database: process.env.DB_NAME || 'NOVA_DB',
            user: process.env.DB_USER || 'sa',
            password: process.env.DB_PASSWORD || '',
            poolSize: parseInt(process.env.DB_POOL_SIZE || '10', 10),
            encrypt: process.env.DB_ENCRYPT === 'true',
            trustServerCertificate: process.env.DB_TRUST_SERVER_CERTIFICATE === 'true',
            requestTimeout: parseInt(process.env.DB_REQUEST_TIMEOUT || '30000', 10),
            connectionTimeout: parseInt(process.env.DB_CONNECTION_TIMEOUT || '15000', 10)
        };
    }
    getConfig() {
        return { ...this.config };
    }
    updateConfig(updates) {
        this.config = { ...this.config, ...updates };
    }
    // ============ Connection String ============
    getConnectionString(usePool = true) {
        const config = this.config;
        return `Server=${config.server},${config.port};` +
            `Database=${config.database};` +
            `User Id=${config.user};` +
            `Password=${config.password};` +
            `Encrypt=${config.encrypt};` +
            `TrustServerCertificate=${config.trustServerCertificate};` +
            `Connection Timeout=${config.connectionTimeout || 15};`;
    }
    // ============ Pool Management ============
    registerPool(name, config) {
        this.pools.set(name, { ...config });
    }
    getPool(name) {
        const pool = this.pools.get(name);
        return pool ? { ...pool } : undefined;
    }
    removePool(name) {
        this.pools.delete(name);
    }
    getAllPools() {
        const pools = {};
        for (const [name, config] of this.pools) {
            pools[name] = { ...config };
        }
        return pools;
    }
    // ============ Database Type ============
    isAzure() {
        return this.config.server.includes('.database.windows.net');
    }
    isLocalDb() {
        return this.config.server.includes('(localdb)') ||
            this.config.server === 'localhost' ||
            this.config.server === '127.0.0.1';
    }
    // ============ Validation ============
    validate() {
        const errors = [];
        const warnings = [];
        if (!this.config.server) {
            errors.push('Database server is required');
        }
        if (!this.config.database) {
            errors.push('Database name is required');
        }
        if (!this.config.user) {
            errors.push('Database user is required');
        }
        if (!this.config.password) {
            warnings.push('Database password is empty - this is not secure for production');
        }
        if (this.config.poolSize && this.config.poolSize < 1) {
            errors.push('Pool size must be at least 1');
        }
        if (this.config.poolSize && this.config.poolSize > 100) {
            warnings.push('Pool size greater than 100 may impact performance');
        }
        if (this.config.encrypt && this.config.trustServerCertificate) {
            warnings.push('Using TrustServerCertificate with Encrypt enabled may not be secure');
        }
        return {
            valid: errors.length === 0,
            errors,
            warnings
        };
    }
    // ============ Environment Specific ============
    getDevelopmentConfig() {
        return {
            server: 'localhost',
            port: 1433,
            database: 'NOVA_Dev',
            user: 'sa',
            password: 'YourStrong!Password',
            poolSize: 5,
            encrypt: false,
            trustServerCertificate: true,
            requestTimeout: 30000,
            connectionTimeout: 15000
        };
    }
    getTestConfig() {
        return {
            server: 'localhost',
            port: 1433,
            database: 'NOVA_Test',
            user: 'sa',
            password: 'YourStrong!Password',
            poolSize: 2,
            encrypt: false,
            trustServerCertificate: true,
            requestTimeout: 10000,
            connectionTimeout: 5000
        };
    }
    getProductionConfig() {
        return {
            server: process.env.DB_HOST || '',
            port: parseInt(process.env.DB_PORT || '1433', 10),
            database: process.env.DB_NAME || '',
            user: process.env.DB_USER || '',
            password: process.env.DB_PASSWORD || '',
            poolSize: parseInt(process.env.DB_POOL_SIZE || '20', 10),
            encrypt: true,
            trustServerCertificate: false,
            requestTimeout: 60000,
            connectionTimeout: 30000
        };
    }
    // ============ Migration Helpers ============
    getMasterConnectionConfig() {
        return {
            ...this.config,
            database: 'master'
        };
    }
    getTenantConnectionConfig(tenantId) {
        return {
            ...this.config,
            database: `Tenant_${tenantId}`
        };
    }
    getCompanyConnectionConfig(companyId) {
        return {
            ...this.config,
            database: `Company_${companyId}`
        };
    }
}
exports.DatabaseConfig = DatabaseConfig;
//# sourceMappingURL=database-config.js.map