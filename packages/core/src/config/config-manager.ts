import { EventEmitter } from 'events';
import { EnvironmentConfig } from './environment-config';
import { DatabaseConfig } from './database-config';
import * as fs from 'fs-extra';
import * as path from 'path';
import * as yaml from 'yaml';
import * as dotenv from 'dotenv';

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

export class ConfigManager extends EventEmitter {
    private static instance: ConfigManager;
    private config: Map<string, any> = new Map();
    private sources: Map<string, ConfigSource> = new Map();
    private watchers: Map<string, Set<(value: any) => void>> = new Map();
    private environment: EnvironmentConfig;
    private databaseConfig: DatabaseConfig;
    private initialized: boolean = false;

    private constructor() {
        super();
        this.environment = new EnvironmentConfig();
        this.databaseConfig = new DatabaseConfig();
    }

    static getInstance(): ConfigManager {
        if (!ConfigManager.instance) {
            ConfigManager.instance = new ConfigManager();
        }
        return ConfigManager.instance;
    }

    async initialize(options?: ConfigManagerOptions): Promise<void> {
        if (this.initialized) return;

        // Register default sources
        this.registerSource('environment', { type: 'env', priority: 100, name: 'Environment' });
        this.registerSource('memory', { type: 'memory', priority: 50, name: 'Memory' });

        // Load environment variables
        await this.loadEnvironmentConfig();

        // Load configuration files
        if (options?.configPath) {
            await this.loadConfigFiles(options.configPath);
        }

        // Load from database
        if (options?.loadFromDatabase) {
            await this.loadDatabaseConfig();
        }

        this.initialized = true;
        this.emit('initialized');
    }

    // ============ Configuration Loading ============

    private async loadEnvironmentConfig(): Promise<void> {
        dotenv.config();

        const envConfig = this.environment.getAll();
        
        for (const [key, value] of Object.entries(envConfig)) {
            if (value !== undefined) {
                this.set(key, value, 'environment');
            }
        }

        this.emit('environmentLoaded');
    }

    private async loadConfigFiles(configPath: string): Promise<void> {
        const files = await this.findConfigFiles(configPath);

        for (const file of files) {
            try {
                const ext = path.extname(file).toLowerCase();
                let config: any;

                if (ext === '.json') {
                    config = await fs.readJson(file);
                } else if (ext === '.yaml' || ext === '.yml') {
                    const content = await fs.readFile(file, 'utf8');
                    config = yaml.parse(content);
                } else if (ext === '.js' || ext === '.ts') {
                    config = require(file);
                }

                if (config) {
                    const sourceName = path.basename(file);
                    this.registerSource(sourceName, { 
                        type: 'file', 
                        priority: 75, 
                        name: sourceName 
                    });

                    this.mergeConfig(config, sourceName);
                }
            } catch (error) {
                this.emit('configFileError', { file, error });
            }
        }
    }

    private async findConfigFiles(configPath: string): Promise<string[]> {
        const files: string[] = [];
        
        if (!await fs.pathExists(configPath)) {
            return files;
        }

        const stat = await fs.stat(configPath);
        
        if (stat.isDirectory()) {
            const dirFiles = await fs.readdir(configPath);
            
            for (const file of dirFiles) {
                const fullPath = path.join(configPath, file);
                const ext = path.extname(file).toLowerCase();
                
                if (['.json', '.yaml', '.yml', '.js', '.ts'].includes(ext)) {
                    files.push(fullPath);
                }
            }
        } else {
            files.push(configPath);
        }

        return files;
    }

    private async loadDatabaseConfig(): Promise<void> {
        // This would load configuration from database
        // Implementation depends on database schema
        this.registerSource('database', { type: 'database', priority: 25, name: 'Database' });
    }

    private mergeConfig(config: any, source: string, prefix: string = ''): void {
        for (const [key, value] of Object.entries(config)) {
            const configKey = prefix ? `${prefix}.${key}` : key;

            if (value && typeof value === 'object' && !Array.isArray(value)) {
                this.mergeConfig(value, source, configKey);
            } else {
                this.set(configKey, value, source);
            }
        }
    }

    // ============ Source Management ============

    registerSource(name: string, source: ConfigSource): void {
        this.sources.set(name, source);
    }

    unregisterSource(name: string): void {
        this.sources.delete(name);
    }

    getSources(): ConfigSource[] {
        return Array.from(this.sources.values())
            .sort((a, b) => b.priority - a.priority);
    }

    // ============ Configuration Access ============

    get<T = any>(key: string, defaultValue?: T): T {
        const value = this.config.get(key);
        return value !== undefined ? value : defaultValue;
    }

    set(key: string, value: any, source: string = 'memory'): void {
        const oldValue = this.config.get(key);
        
        this.config.set(key, value);
        
        this.emit('changed', {
            key,
            oldValue,
            newValue: value,
            source,
            timestamp: new Date()
        } as ConfigChangeEvent);

        // Notify watchers
        const watchers = this.watchers.get(key);
        if (watchers) {
            watchers.forEach(callback => callback(value));
        }
    }

    has(key: string): boolean {
        return this.config.has(key);
    }

    delete(key: string): boolean {
        const oldValue = this.config.get(key);
        const result = this.config.delete(key);
        
        if (result) {
            this.emit('deleted', {
                key,
                oldValue,
                timestamp: new Date()
            });
        }

        return result;
    }

    getAll(prefix?: string): Record<string, any> {
        const result: Record<string, any> = {};

        for (const [key, value] of this.config) {
            if (!prefix || key.startsWith(prefix)) {
                result[key] = value;
            }
        }

        return result;
    }

    // ============ Watch Configuration ============

    watch<T = any>(key: string, callback: (value: T) => void): () => void {
        if (!this.watchers.has(key)) {
            this.watchers.set(key, new Set());
        }

        this.watchers.get(key)!.add(callback);

        // Return unsubscribe function
        return () => {
            const watchers = this.watchers.get(key);
            if (watchers) {
                watchers.delete(callback);
                if (watchers.size === 0) {
                    this.watchers.delete(key);
                }
            }
        };
    }

    // ============ Environment Helpers ============

    isDevelopment(): boolean {
        return this.get('NODE_ENV') === 'development';
    }

    isProduction(): boolean {
        return this.get('NODE_ENV') === 'production';
    }

    isTest(): boolean {
        return this.get('NODE_ENV') === 'test';
    }

    getEnvironment(): string {
        return this.get('NODE_ENV', 'development');
    }

    // ============ Type-Safe Getters ============

    getString(key: string, defaultValue?: string): string {
        const value = this.get(key, defaultValue);
        return value !== undefined ? String(value) : defaultValue;
    }

    getNumber(key: string, defaultValue?: number): number {
        const value = this.get(key, defaultValue);
        
        if (value === undefined) {
            return defaultValue;
        }

        const num = Number(value);
        return isNaN(num) ? defaultValue : num;
    }

    getBoolean(key: string, defaultValue?: boolean): boolean {
        const value = this.get(key, defaultValue);
        
        if (typeof value === 'boolean') {
            return value;
        }

        if (typeof value === 'string') {
            return value.toLowerCase() === 'true';
        }

        if (typeof value === 'number') {
            return value !== 0;
        }

        return defaultValue;
    }

    getArray<T = any>(key: string, defaultValue?: T[]): T[] {
        const value = this.get(key, defaultValue);
        
        if (Array.isArray(value)) {
            return value;
        }

        if (typeof value === 'string') {
            try {
                return JSON.parse(value);
            } catch {
                return value.split(',').map(v => v.trim());
            }
        }

        return defaultValue || [];
    }

    getObject<T = Record<string, any>>(key: string, defaultValue?: T): T {
        const value = this.get(key, defaultValue);
        
        if (value && typeof value === 'object') {
            return value;
        }

        if (typeof value === 'string') {
            try {
                return JSON.parse(value);
            } catch {}
        }

        return defaultValue;
    }

    // ============ Configuration Export/Import ============

    async exportConfig(): Promise<Record<string, any>> {
        const config: Record<string, any> = {};

        for (const [key, value] of this.config) {
            config[key] = value;
        }

        return config;
    }

    async importConfig(config: Record<string, any>, source: string = 'import'): Promise<void> {
        this.mergeConfig(config, source);
        this.emit('imported', { source, count: Object.keys(config).length });
    }

    // ============ Reset ============

    async reset(): Promise<void> {
        this.config.clear();
        this.watchers.clear();
        this.initialized = false;
        this.emit('reset');
    }

    // ============ Specific Configurations ============

    getDatabaseConfig(): DatabaseConfig {
        return this.databaseConfig;
    }

    getEnvironmentConfig(): EnvironmentConfig {
        return this.environment;
    }
}

export interface ConfigManagerOptions {
    configPath?: string;
    loadFromDatabase?: boolean;
    watchFiles?: boolean;
}