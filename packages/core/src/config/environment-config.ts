export class EnvironmentConfig {
    private env: NodeJS.ProcessEnv;

    constructor() {
        this.env = process.env;
    }

    // ============ Node Environment ============

    getNodeEnv(): string {
        return this.env.NODE_ENV || 'development';
    }

    isDevelopment(): boolean {
        return this.getNodeEnv() === 'development';
    }

    isProduction(): boolean {
        return this.getNodeEnv() === 'production';
    }

    isTest(): boolean {
        return this.getNodeEnv() === 'test';
    }

    // ============ Server Configuration ============

    getPort(): number {
        return parseInt(this.env.PORT || '3000', 10);
    }

    getHost(): string {
        return this.env.HOST || 'localhost';
    }

    getApiUrl(): string {
        return this.env.API_URL || `http://${this.getHost()}:${this.getPort()}`;
    }

    getClientUrl(): string {
        return this.env.CLIENT_URL || `http://localhost:3001`;
    }

    // ============ Database Configuration ============

    getDbHost(): string {
        return this.env.DB_HOST || 'localhost';
    }

    getDbPort(): number {
        return parseInt(this.env.DB_PORT || '1433', 10);
    }

    getDbName(): string {
        return this.env.DB_NAME || 'NOVA_DB';
    }

    getDbUser(): string {
        return this.env.DB_USER || 'sa';
    }

    getDbPassword(): string {
        return this.env.DB_PASSWORD || '';
    }

    getDbPoolSize(): number {
        return parseInt(this.env.DB_POOL_SIZE || '10', 10);
    }

    getDbEncrypt(): boolean {
        return this.env.DB_ENCRYPT === 'true';
    }

    getDbTrustServerCertificate(): boolean {
        return this.env.DB_TRUST_SERVER_CERTIFICATE === 'true';
    }

    // ============ Redis Configuration ============

    getRedisHost(): string {
        return this.env.REDIS_HOST || 'localhost';
    }

    getRedisPort(): number {
        return parseInt(this.env.REDIS_PORT || '6379', 10);
    }

    getRedisPassword(): string {
        return this.env.REDIS_PASSWORD || '';
    }

    getRedisDb(): number {
        return parseInt(this.env.REDIS_DB || '0', 10);
    }

    // ============ Security Configuration ============

    getJwtSecret(): string {
        return this.env.JWT_SECRET || 'your-secret-key-change-in-production';
    }

    getJwtExpiry(): string {
        return this.env.JWT_EXPIRY || '24h';
    }

    getBcryptRounds(): number {
        return parseInt(this.env.BCRYPT_ROUNDS || '10', 10);
    }

    getSessionTimeout(): number {
        return parseInt(this.env.SESSION_TIMEOUT || '3600000', 10);
    }

    // ============ Logging Configuration ============

    getLogLevel(): string {
        return this.env.LOG_LEVEL || 'info';
    }

    getLogPath(): string {
        return this.env.LOG_PATH || './logs';
    }

    // ============ Email Configuration ============

    getSmtpHost(): string {
        return this.env.SMTP_HOST || 'smtp.gmail.com';
    }

    getSmtpPort(): number {
        return parseInt(this.env.SMTP_PORT || '587', 10);
    }

    getSmtpSecure(): boolean {
        return this.env.SMTP_SECURE === 'true';
    }

    getSmtpUser(): string {
        return this.env.SMTP_USER || '';
    }

    getSmtpPassword(): string {
        return this.env.SMTP_PASSWORD || '';
    }

    getEmailFrom(): string {
        return this.env.EMAIL_FROM || 'noreply@nova.local';
    }

    // ============ Storage Configuration ============

    getStoragePath(): string {
        return this.env.STORAGE_PATH || './storage';
    }

    getUploadPath(): string {
        return this.env.UPLOAD_PATH || './uploads';
    }

    getTempPath(): string {
        return this.env.TEMP_PATH || './temp';
    }

    // ============ Cache Configuration ============

    getCacheProvider(): 'memory' | 'redis' | 'hybrid' {
        return (this.env.CACHE_PROVIDER as any) || 'memory';
    }

    getCacheTTL(): number {
        return parseInt(this.env.CACHE_TTL || '3600', 10);
    }

    getCacheMaxSize(): number {
        return parseInt(this.env.CACHE_MAX_SIZE || '10000', 10);
    }

    // ============ Feature Flags ============

    isFeatureEnabled(feature: string): boolean {
        const flag = this.env[`FEATURE_${feature.toUpperCase()}`];
        return flag === 'true' || flag === '1';
    }

    // ============ External Services ============

    getServiceUrl(service: string): string {
        return this.env[`${service.toUpperCase()}_URL`] || '';
    }

    getServiceApiKey(service: string): string {
        return this.env[`${service.toUpperCase()}_API_KEY`] || '';
    }

    // ============ Get All ============

    getAll(): Record<string, string | undefined> {
        return { ...this.env };
    }

    getMasked(): Record<string, string> {
        const masked: Record<string, string> = {};
        const sensitiveKeys = ['PASSWORD', 'SECRET', 'KEY', 'TOKEN'];

        for (const [key, value] of Object.entries(this.env)) {
            if (value !== undefined) {
                if (sensitiveKeys.some(sk => key.includes(sk))) {
                    masked[key] = value.replace(/./g, '*');
                } else {
                    masked[key] = value;
                }
            }
        }

        return masked;
    }
}