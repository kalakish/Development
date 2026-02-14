"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EnvironmentConfig = void 0;
class EnvironmentConfig {
    env;
    constructor() {
        this.env = process.env;
    }
    // ============ Node Environment ============
    getNodeEnv() {
        return this.env.NODE_ENV || 'development';
    }
    isDevelopment() {
        return this.getNodeEnv() === 'development';
    }
    isProduction() {
        return this.getNodeEnv() === 'production';
    }
    isTest() {
        return this.getNodeEnv() === 'test';
    }
    // ============ Server Configuration ============
    getPort() {
        return parseInt(this.env.PORT || '3000', 10);
    }
    getHost() {
        return this.env.HOST || 'localhost';
    }
    getApiUrl() {
        return this.env.API_URL || `http://${this.getHost()}:${this.getPort()}`;
    }
    getClientUrl() {
        return this.env.CLIENT_URL || `http://localhost:3001`;
    }
    // ============ Database Configuration ============
    getDbHost() {
        return this.env.DB_HOST || 'localhost';
    }
    getDbPort() {
        return parseInt(this.env.DB_PORT || '1433', 10);
    }
    getDbName() {
        return this.env.DB_NAME || 'NOVA_DB';
    }
    getDbUser() {
        return this.env.DB_USER || 'sa';
    }
    getDbPassword() {
        return this.env.DB_PASSWORD || '';
    }
    getDbPoolSize() {
        return parseInt(this.env.DB_POOL_SIZE || '10', 10);
    }
    getDbEncrypt() {
        return this.env.DB_ENCRYPT === 'true';
    }
    getDbTrustServerCertificate() {
        return this.env.DB_TRUST_SERVER_CERTIFICATE === 'true';
    }
    // ============ Redis Configuration ============
    getRedisHost() {
        return this.env.REDIS_HOST || 'localhost';
    }
    getRedisPort() {
        return parseInt(this.env.REDIS_PORT || '6379', 10);
    }
    getRedisPassword() {
        return this.env.REDIS_PASSWORD || '';
    }
    getRedisDb() {
        return parseInt(this.env.REDIS_DB || '0', 10);
    }
    // ============ Security Configuration ============
    getJwtSecret() {
        return this.env.JWT_SECRET || 'your-secret-key-change-in-production';
    }
    getJwtExpiry() {
        return this.env.JWT_EXPIRY || '24h';
    }
    getBcryptRounds() {
        return parseInt(this.env.BCRYPT_ROUNDS || '10', 10);
    }
    getSessionTimeout() {
        return parseInt(this.env.SESSION_TIMEOUT || '3600000', 10);
    }
    // ============ Logging Configuration ============
    getLogLevel() {
        return this.env.LOG_LEVEL || 'info';
    }
    getLogPath() {
        return this.env.LOG_PATH || './logs';
    }
    // ============ Email Configuration ============
    getSmtpHost() {
        return this.env.SMTP_HOST || 'smtp.gmail.com';
    }
    getSmtpPort() {
        return parseInt(this.env.SMTP_PORT || '587', 10);
    }
    getSmtpSecure() {
        return this.env.SMTP_SECURE === 'true';
    }
    getSmtpUser() {
        return this.env.SMTP_USER || '';
    }
    getSmtpPassword() {
        return this.env.SMTP_PASSWORD || '';
    }
    getEmailFrom() {
        return this.env.EMAIL_FROM || 'noreply@nova.local';
    }
    // ============ Storage Configuration ============
    getStoragePath() {
        return this.env.STORAGE_PATH || './storage';
    }
    getUploadPath() {
        return this.env.UPLOAD_PATH || './uploads';
    }
    getTempPath() {
        return this.env.TEMP_PATH || './temp';
    }
    // ============ Cache Configuration ============
    getCacheProvider() {
        return this.env.CACHE_PROVIDER || 'memory';
    }
    getCacheTTL() {
        return parseInt(this.env.CACHE_TTL || '3600', 10);
    }
    getCacheMaxSize() {
        return parseInt(this.env.CACHE_MAX_SIZE || '10000', 10);
    }
    // ============ Feature Flags ============
    isFeatureEnabled(feature) {
        const flag = this.env[`FEATURE_${feature.toUpperCase()}`];
        return flag === 'true' || flag === '1';
    }
    // ============ External Services ============
    getServiceUrl(service) {
        return this.env[`${service.toUpperCase()}_URL`] || '';
    }
    getServiceApiKey(service) {
        return this.env[`${service.toUpperCase()}_API_KEY`] || '';
    }
    // ============ Get All ============
    getAll() {
        return { ...this.env };
    }
    getMasked() {
        const masked = {};
        const sensitiveKeys = ['PASSWORD', 'SECRET', 'KEY', 'TOKEN'];
        for (const [key, value] of Object.entries(this.env)) {
            if (value !== undefined) {
                if (sensitiveKeys.some(sk => key.includes(sk))) {
                    masked[key] = value.replace(/./g, '*');
                }
                else {
                    masked[key] = value;
                }
            }
        }
        return masked;
    }
}
exports.EnvironmentConfig = EnvironmentConfig;
//# sourceMappingURL=environment-config.js.map