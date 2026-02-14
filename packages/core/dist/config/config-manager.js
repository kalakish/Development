"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConfigManager = void 0;
const events_1 = require("events");
const environment_config_1 = require("./environment-config");
const database_config_1 = require("./database-config");
const fs = __importStar(require("fs-extra"));
const path = __importStar(require("path"));
const yaml = __importStar(require("yaml"));
const dotenv = __importStar(require("dotenv"));
class ConfigManager extends events_1.EventEmitter {
    static instance;
    config = new Map();
    sources = new Map();
    watchers = new Map();
    environment;
    databaseConfig;
    initialized = false;
    constructor() {
        super();
        this.environment = new environment_config_1.EnvironmentConfig();
        this.databaseConfig = new database_config_1.DatabaseConfig();
    }
    static getInstance() {
        if (!ConfigManager.instance) {
            ConfigManager.instance = new ConfigManager();
        }
        return ConfigManager.instance;
    }
    async initialize(options) {
        if (this.initialized)
            return;
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
    async loadEnvironmentConfig() {
        dotenv.config();
        const envConfig = this.environment.getAll();
        for (const [key, value] of Object.entries(envConfig)) {
            if (value !== undefined) {
                this.set(key, value, 'environment');
            }
        }
        this.emit('environmentLoaded');
    }
    async loadConfigFiles(configPath) {
        const files = await this.findConfigFiles(configPath);
        for (const file of files) {
            try {
                const ext = path.extname(file).toLowerCase();
                let config;
                if (ext === '.json') {
                    config = await fs.readJson(file);
                }
                else if (ext === '.yaml' || ext === '.yml') {
                    const content = await fs.readFile(file, 'utf8');
                    config = yaml.parse(content);
                }
                else if (ext === '.js' || ext === '.ts') {
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
            }
            catch (error) {
                this.emit('configFileError', { file, error });
            }
        }
    }
    async findConfigFiles(configPath) {
        const files = [];
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
        }
        else {
            files.push(configPath);
        }
        return files;
    }
    async loadDatabaseConfig() {
        // This would load configuration from database
        // Implementation depends on database schema
        this.registerSource('database', { type: 'database', priority: 25, name: 'Database' });
    }
    mergeConfig(config, source, prefix = '') {
        for (const [key, value] of Object.entries(config)) {
            const configKey = prefix ? `${prefix}.${key}` : key;
            if (value && typeof value === 'object' && !Array.isArray(value)) {
                this.mergeConfig(value, source, configKey);
            }
            else {
                this.set(configKey, value, source);
            }
        }
    }
    // ============ Source Management ============
    registerSource(name, source) {
        this.sources.set(name, source);
    }
    unregisterSource(name) {
        this.sources.delete(name);
    }
    getSources() {
        return Array.from(this.sources.values())
            .sort((a, b) => b.priority - a.priority);
    }
    // ============ Configuration Access ============
    get(key, defaultValue) {
        const value = this.config.get(key);
        return value !== undefined ? value : defaultValue;
    }
    set(key, value, source = 'memory') {
        const oldValue = this.config.get(key);
        this.config.set(key, value);
        this.emit('changed', {
            key,
            oldValue,
            newValue: value,
            source,
            timestamp: new Date()
        });
        // Notify watchers
        const watchers = this.watchers.get(key);
        if (watchers) {
            watchers.forEach(callback => callback(value));
        }
    }
    has(key) {
        return this.config.has(key);
    }
    delete(key) {
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
    getAll(prefix) {
        const result = {};
        for (const [key, value] of this.config) {
            if (!prefix || key.startsWith(prefix)) {
                result[key] = value;
            }
        }
        return result;
    }
    // ============ Watch Configuration ============
    watch(key, callback) {
        if (!this.watchers.has(key)) {
            this.watchers.set(key, new Set());
        }
        this.watchers.get(key).add(callback);
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
    isDevelopment() {
        return this.get('NODE_ENV') === 'development';
    }
    isProduction() {
        return this.get('NODE_ENV') === 'production';
    }
    isTest() {
        return this.get('NODE_ENV') === 'test';
    }
    getEnvironment() {
        return this.get('NODE_ENV', 'development');
    }
    // ============ Type-Safe Getters ============
    getString(key, defaultValue) {
        const value = this.get(key, defaultValue);
        return value !== undefined ? String(value) : defaultValue;
    }
    getNumber(key, defaultValue) {
        const value = this.get(key, defaultValue);
        if (value === undefined) {
            return defaultValue;
        }
        const num = Number(value);
        return isNaN(num) ? defaultValue : num;
    }
    getBoolean(key, defaultValue) {
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
    getArray(key, defaultValue) {
        const value = this.get(key, defaultValue);
        if (Array.isArray(value)) {
            return value;
        }
        if (typeof value === 'string') {
            try {
                return JSON.parse(value);
            }
            catch {
                return value.split(',').map(v => v.trim());
            }
        }
        return defaultValue || [];
    }
    getObject(key, defaultValue) {
        const value = this.get(key, defaultValue);
        if (value && typeof value === 'object') {
            return value;
        }
        if (typeof value === 'string') {
            try {
                return JSON.parse(value);
            }
            catch { }
        }
        return defaultValue;
    }
    // ============ Configuration Export/Import ============
    async exportConfig() {
        const config = {};
        for (const [key, value] of this.config) {
            config[key] = value;
        }
        return config;
    }
    async importConfig(config, source = 'import') {
        this.mergeConfig(config, source);
        this.emit('imported', { source, count: Object.keys(config).length });
    }
    // ============ Reset ============
    async reset() {
        this.config.clear();
        this.watchers.clear();
        this.initialized = false;
        this.emit('reset');
    }
    // ============ Specific Configurations ============
    getDatabaseConfig() {
        return this.databaseConfig;
    }
    getEnvironmentConfig() {
        return this.environment;
    }
}
exports.ConfigManager = ConfigManager;
//# sourceMappingURL=config-manager.js.map