import { SQLServerConfig } from '../database/sqlserver-connection';
export declare class DatabaseConfig {
    private config;
    private pools;
    constructor();
    private loadFromEnv;
    getConfig(): SQLServerConfig;
    updateConfig(updates: Partial<SQLServerConfig>): void;
    getConnectionString(usePool?: boolean): string;
    registerPool(name: string, config: SQLServerConfig): void;
    getPool(name: string): SQLServerConfig | undefined;
    removePool(name: string): void;
    getAllPools(): Record<string, SQLServerConfig>;
    isAzure(): boolean;
    isLocalDb(): boolean;
    validate(): ValidationResult;
    getDevelopmentConfig(): SQLServerConfig;
    getTestConfig(): SQLServerConfig;
    getProductionConfig(): SQLServerConfig;
    getMasterConnectionConfig(): SQLServerConfig;
    getTenantConnectionConfig(tenantId: string): SQLServerConfig;
    getCompanyConnectionConfig(companyId: string): SQLServerConfig;
}
export interface ValidationResult {
    valid: boolean;
    errors: string[];
    warnings: string[];
}
//# sourceMappingURL=database-config.d.ts.map