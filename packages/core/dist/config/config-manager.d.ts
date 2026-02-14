/// <reference types="node" />
import { EventEmitter } from 'events';
import { EnvironmentConfig } from './environment-config';
import { DatabaseConfig } from './database-config';
export interface ConfigSource {
    type: 'env' | 'file' | 'memory' | 'database';
    priority: number;
    name: string;
}
export interface ConfigChangeEvent {
    key: string;
    oldValue: any;
    newValue: any;
    source: string;
    timestamp: Date;
}
export declare class ConfigManager extends EventEmitter {
    private static instance;
    private config;
    private sources;
    private watchers;
    private environment;
    private databaseConfig;
    private initialized;
    private constructor();
    static getInstance(): ConfigManager;
    initialize(options?: ConfigManagerOptions): Promise<void>;
    private loadEnvironmentConfig;
    private loadConfigFiles;
    private findConfigFiles;
    private loadDatabaseConfig;
    private mergeConfig;
    registerSource(name: string, source: ConfigSource): void;
    unregisterSource(name: string): void;
    getSources(): ConfigSource[];
    get<T = any>(key: string, defaultValue?: T): T;
    set(key: string, value: any, source?: string): void;
    has(key: string): boolean;
    delete(key: string): boolean;
    getAll(prefix?: string): Record<string, any>;
    watch<T = any>(key: string, callback: (value: T) => void): () => void;
    isDevelopment(): boolean;
    isProduction(): boolean;
    isTest(): boolean;
    getEnvironment(): string;
    getString(key: string, defaultValue?: string): string;
    getNumber(key: string, defaultValue?: number): number;
    getBoolean(key: string, defaultValue?: boolean): boolean;
    getArray<T = any>(key: string, defaultValue?: T[]): T[];
    getObject<T = Record<string, any>>(key: string, defaultValue?: T): T;
    exportConfig(): Promise<Record<string, any>>;
    importConfig(config: Record<string, any>, source?: string): Promise<void>;
    reset(): Promise<void>;
    getDatabaseConfig(): DatabaseConfig;
    getEnvironmentConfig(): EnvironmentConfig;
}
export interface ConfigManagerOptions {
    configPath?: string;
    loadFromDatabase?: boolean;
    watchFiles?: boolean;
}
//# sourceMappingURL=config-manager.d.ts.map