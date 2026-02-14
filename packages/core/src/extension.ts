import { EventEmitter } from 'events';
import * as fs from 'fs-extra';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { Session } from './session';

export class ExtensionManager extends EventEmitter {
    private extensions: Map<string, Extension> = new Map();
    private extensionContexts: Map<string, ExtensionContext> = new Map();
    private dependencies: Map<string, string[]> = new Map();
    private extensionStates: Map<string, ExtensionState> = new Map();
    private extensionHooks: Map<string, ExtensionHook[]> = new Map();

    async loadExtensions(config?: ExtensionConfig): Promise<void> {
        if (!config) return;

        // Load from configured paths
        for (const extensionPath of config.paths) {
            await this.loadExtensionFromPath(extensionPath);
        }

        // Resolve dependencies
        this.resolveDependencies();

        // Initialize extensions in dependency order
        if (config.autoLoad) {
            await this.initializeExtensions();
        }

        this.emit('extensionsLoaded', {
            count: this.extensions.size,
            timestamp: new Date()
        });
    }

    async loadExtensionFromPath(extensionPath: string): Promise<Extension> {
        const manifestPath = path.join(extensionPath, 'extension.json');
        
        if (!await fs.pathExists(manifestPath)) {
            throw new Error(`Extension manifest not found: ${manifestPath}`);
        }

        const manifest = await fs.readJson(manifestPath);
        
        // Validate manifest
        this.validateManifest(manifest);

        // Load extension module
        const entryPoint = path.join(extensionPath, manifest.entryPoint || 'index.js');
        
        let extensionModule;
        try {
            extensionModule = require(entryPoint);
        } catch (error) {
            throw new Error(`Failed to load extension module: ${error.message}`);
        }

        const extension: Extension = {
            id: manifest.id,
            name: manifest.name,
            version: manifest.version,
            publisher: manifest.publisher,
            description: manifest.description,
            dependencies: manifest.dependencies || [],
            permissions: manifest.permissions || [],
            objects: manifest.objects || [],
            features: manifest.features || [],
            hooks: manifest.hooks || [],
            module: extensionModule,
            path: extensionPath,
            installedAt: new Date(),
            updatedAt: new Date()
        };

        this.extensions.set(extension.id, extension);
        this.extensionStates.set(extension.id, ExtensionState.Loaded);
        this.dependencies.set(extension.id, extension.dependencies);

        this.emit('extensionLoaded', {
            extensionId: extension.id,
            name: extension.name,
            version: extension.version
        });

        return extension;
    }

    async installExtension(extensionPackage: string, source?: string): Promise<Extension> {
        // Download and extract extension package
        const extensionPath = await this.downloadExtension(extensionPackage, source);
        
        // Load the extension
        const extension = await this.loadExtensionFromPath(extensionPath);
        
        // Run installation scripts
        await this.runInstallScript(extension);
        
        // Activate extension
        await this.enableExtension(extension.id);
        
        return extension;
    }

    async uninstallExtension(extensionId: string): Promise<void> {
        const extension = this.extensions.get(extensionId);
        
        if (!extension) {
            throw new Error(`Extension not found: ${extensionId}`);
        }

        // Check if other extensions depend on this one
        const dependents = this.getDependents(extensionId);
        if (dependents.length > 0) {
            throw new Error(
                `Cannot uninstall extension ${extensionId}. ` +
                `Required by: ${dependents.join(', ')}`
            );
        }

        // Disable extension first
        if (this.extensionStates.get(extensionId) === ExtensionState.Enabled) {
            await this.disableExtension(extensionId);
        }

        // Run uninstall scripts
        await this.runUninstallScript(extension);

        // Remove extension
        this.extensions.delete(extensionId);
        this.extensionStates.delete(extensionId);
        this.dependencies.delete(extensionId);
        this.extensionContexts.delete(extensionId);

        this.emit('extensionUninstalled', {
            extensionId,
            name: extension.name,
            timestamp: new Date()
        });
    }

    async enableExtension(extensionId: string): Promise<void> {
        const extension = this.extensions.get(extensionId);
        
        if (!extension) {
            throw new Error(`Extension not found: ${extensionId}`);
        }

        const state = this.extensionStates.get(extensionId);
        if (state === ExtensionState.Enabled) {
            return;
        }

        // Enable dependencies first
        for (const depId of extension.dependencies) {
            await this.enableExtension(depId);
        }

        // Create extension context
        const context = this.createExtensionContext(extension);
        this.extensionContexts.set(extensionId, context);

        // Call activate function
        if (extension.module.activate) {
            try {
                await extension.module.activate(context);
            } catch (error) {
                this.extensionStates.set(extensionId, ExtensionState.Error);
                throw new Error(`Failed to activate extension ${extensionId}: ${error.message}`);
            }
        }

        // Register hooks
        this.registerHooks(extension, context);

        this.extensionStates.set(extensionId, ExtensionState.Enabled);
        
        this.emit('extensionEnabled', {
            extensionId,
            name: extension.name,
            timestamp: new Date()
        });
    }

    async disableExtension(extensionId: string): Promise<void> {
        const extension = this.extensions.get(extensionId);
        
        if (!extension) {
            throw new Error(`Extension not found: ${extensionId}`);
        }

        // Check if other enabled extensions depend on this one
        const dependents = this.getEnabledDependents(extensionId);
        if (dependents.length > 0) {
            throw new Error(
                `Cannot disable extension ${extensionId}. ` +
                `Required by: ${dependents.join(', ')}`
            );
        }

        const context = this.extensionContexts.get(extensionId);
        
        // Call deactivate function
        if (extension.module.deactivate && context) {
            try {
                await extension.module.deactivate(context);
            } catch (error) {
                this.extensionStates.set(extensionId, ExtensionState.Error);
                throw new Error(`Failed to deactivate extension ${extensionId}: ${error.message}`);
            }
        }

        // Unregister hooks
        this.unregisterHooks(extensionId);

        this.extensionContexts.delete(extensionId);
        this.extensionStates.set(extensionId, ExtensionState.Disabled);
        
        this.emit('extensionDisabled', {
            extensionId,
            name: extension.name,
            timestamp: new Date()
        });
    }

    async updateExtension(extensionId: string, newVersion: string): Promise<Extension> {
        const extension = this.extensions.get(extensionId);
        
        if (!extension) {
            throw new Error(`Extension not found: ${extensionId}`);
        }

        // Download new version
        const newExtension = await this.installExtension(`${extensionId}@${newVersion}`);
        
        // Migrate data
        await this.migrateExtensionData(extension, newExtension);
        
        // Replace old version
        await this.uninstallExtension(extensionId);
        
        return newExtension;
    }

    getExtension(extensionId: string): Extension | undefined {
        return this.extensions.get(extensionId);
    }

    getExtensions(): Extension[] {
        return Array.from(this.extensions.values());
    }

    getEnabledExtensions(): Extension[] {
        return this.getExtensions().filter(ext => 
            this.extensionStates.get(ext.id) === ExtensionState.Enabled
        );
    }

    getExtensionState(extensionId: string): ExtensionState | undefined {
        return this.extensionStates.get(extensionId);
    }

    // ============ Hooks ============

    registerHook(extensionId: string, hook: ExtensionHook): void {
        if (!this.extensionHooks.has(hook.point)) {
            this.extensionHooks.set(hook.point, []);
        }
        
        this.extensionHooks.get(hook.point)!.push({
            ...hook,
            extensionId
        });
    }

    async executeHook(hookPoint: string, context: any, session?: Session): Promise<any[]> {
        const hooks = this.extensionHooks.get(hookPoint) || [];
        const results = [];

        for (const hook of hooks) {
            const extension = this.extensions.get(hook.extensionId);
            
            if (extension && this.extensionStates.get(extension.id) === ExtensionState.Enabled) {
                try {
                    const result = await hook.handler(context, session);
                    results.push(result);
                } catch (error) {
                    this.emit('hookError', {
                        extensionId: hook.extensionId,
                        hookPoint,
                        error: error.message
                    });
                }
            }
        }

        return results;
    }

    private registerHooks(extension: Extension, context: ExtensionContext): void {
        for (const hook of extension.hooks || []) {
            this.registerHook(extension.id, hook);
        }
    }

    private unregisterHooks(extensionId: string): void {
        for (const [point, hooks] of this.extensionHooks) {
            const filtered = hooks.filter(h => h.extensionId !== extensionId);
            
            if (filtered.length === 0) {
                this.extensionHooks.delete(point);
            } else {
                this.extensionHooks.set(point, filtered);
            }
        }
    }

    // ============ Object Registration ============

    registerObject(extensionId: string, objectType: string, object: any): void {
        const context = this.extensionContexts.get(extensionId);
        if (context) {
            context.objects.push({
                type: objectType,
                definition: object,
                registeredAt: new Date()
            });
        }
    }

    getExtensionObjects(extensionId: string, objectType?: string): any[] {
        const context = this.extensionContexts.get(extensionId);
        const objects = context?.objects || [];
        
        if (objectType) {
            return objects.filter(o => o.type === objectType);
        }
        
        return objects;
    }

    // ============ Private Methods ============

    private validateManifest(manifest: any): void {
        const requiredFields = ['id', 'name', 'version', 'publisher'];
        
        for (const field of requiredFields) {
            if (!manifest[field]) {
                throw new Error(`Extension manifest missing required field: ${field}`);
            }
        }

        // Validate version format
        if (!this.isValidVersion(manifest.version)) {
            throw new Error(`Invalid version format: ${manifest.version}. Expected format: x.y.z`);
        }

        // Validate ID format
        if (!this.isValidId(manifest.id)) {
            throw new Error(`Invalid extension ID format: ${manifest.id}. Use lowercase letters, numbers, hyphens`);
        }
    }

    private isValidVersion(version: string): boolean {
        return /^\d+\.\d+\.\d+$/.test(version);
    }

    private isValidId(id: string): boolean {
        return /^[a-z0-9\-]+$/.test(id);
    }

    private resolveDependencies(): void {
        const visited = new Set<string>();
        const resolved: string[] = [];

        const resolve = (extensionId: string) => {
            if (visited.has(extensionId)) {
                // Check for circular dependency
                if (!resolved.includes(extensionId)) {
                    throw new Error(`Circular dependency detected: ${extensionId}`);
                }
                return;
            }

            visited.add(extensionId);

            const deps = this.dependencies.get(extensionId) || [];
            for (const depId of deps) {
                if (!this.extensions.has(depId)) {
                    throw new Error(`Missing dependency: ${extensionId} requires ${depId}`);
                }
                resolve(depId);
            }

            resolved.push(extensionId);
        };

        for (const extensionId of this.extensions.keys()) {
            resolve(extensionId);
        }

        // Store resolved order
        this.dependencies = new Map(
            resolved.map(id => [id, this.dependencies.get(id) || []])
        );
    }

    private async initializeExtensions(): Promise<void> {
        // Initialize in dependency order
        for (const [extensionId] of this.dependencies) {
            if (this.extensionStates.get(extensionId) === ExtensionState.Loaded) {
                await this.enableExtension(extensionId);
            }
        }
    }

    private createExtensionContext(extension: Extension): ExtensionContext {
        return {
            extensionId: extension.id,
            extensionPath: extension.path,
            subscriptions: [],
            objects: [],
            secrets: new Map(),
            workspaceState: new Map(),
            globalState: new Map(),
            storagePath: path.join(process.cwd(), 'storage', extension.id),
            
            async registerObject(type: string, object: any): Promise<void> {
                this.objects.push({ 
                    type, 
                    definition: object,
                    registeredAt: new Date() 
                });
            },

            async getSecret(key: string): Promise<string | undefined> {
                return this.secrets.get(key);
            },

            async storeSecret(key: string, value: string): Promise<void> {
                this.secrets.set(key, value);
                
                // Persist to secure storage
                await this.persistSecrets();
            },

            async getWorkspaceState(key: string): Promise<any> {
                return this.workspaceState.get(key);
            },

            async updateWorkspaceState(key: string, value: any): Promise<void> {
                this.workspaceState.set(key, value);
                
                // Persist to storage
                await this.persistWorkspaceState();
            },

            async getGlobalState(key: string): Promise<any> {
                return this.globalState.get(key);
            },

            async updateGlobalState(key: string, value: any): Promise<void> {
                this.globalState.set(key, value);
                
                // Persist to storage
                await this.persistGlobalState();
            },

            async persistSecrets(): Promise<void> {
                const secretsPath = path.join(this.storagePath, 'secrets.json');
                await fs.ensureDir(this.storagePath);
                
                const data = Object.fromEntries(this.secrets);
                await fs.writeJson(secretsPath, data, { spaces: 2 });
            },

            async persistWorkspaceState(): Promise<void> {
                const statePath = path.join(this.storagePath, 'workspace.json');
                await fs.ensureDir(this.storagePath);
                
                const data = Object.fromEntries(this.workspaceState);
                await fs.writeJson(statePath, data, { spaces: 2 });
            },

            async persistGlobalState(): Promise<void> {
                const statePath = path.join(process.cwd(), 'storage', 'global', `${extension.id}.json`);
                await fs.ensureDir(path.dirname(statePath));
                
                const data = Object.fromEntries(this.globalState);
                await fs.writeJson(statePath, data, { spaces: 2 });
            },

            subscriptions: [],
            
            dispose(): void {
                this.subscriptions.forEach(sub => sub.dispose());
                this.subscriptions = [];
                this.objects = [];
                this.secrets.clear();
                this.workspaceState.clear();
                this.globalState.clear();
            }
        };
    }

    private async downloadExtension(extensionPackage: string, source?: string): Promise<string> {
        // Create extension directory
        const extensionId = extensionPackage.split('@')[0];
        const extensionDir = path.join(process.cwd(), 'extensions', extensionId);
        
        await fs.ensureDir(extensionDir);
        
        // Download from registry
        if (source) {
            // Download from custom source
        } else {
            // Download from default registry
        }
        
        return extensionDir;
    }

    private async runInstallScript(extension: Extension): Promise<void> {
        const installPath = path.join(extension.path, 'install.js');
        
        if (await fs.pathExists(installPath)) {
            const script = require(installPath);
            if (script.install) {
                const context = this.createExtensionContext(extension);
                await script.install(context);
            }
        }
    }

    private async runUninstallScript(extension: Extension): Promise<void> {
        const uninstallPath = path.join(extension.path, 'uninstall.js');
        
        if (await fs.pathExists(uninstallPath)) {
            const script = require(uninstallPath);
            if (script.uninstall) {
                const context = this.createExtensionContext(extension);
                await script.uninstall(context);
            }
        }
    }

    private async migrateExtensionData(oldExtension: Extension, newExtension: Extension): Promise<void> {
        // Migrate workspace state
        const oldContext = this.extensionContexts.get(oldExtension.id);
        const newContext = this.extensionContexts.get(newExtension.id);
        
        if (oldContext && newContext) {
            // Copy workspace state
            for (const [key, value] of oldContext.workspaceState) {
                await newContext.updateWorkspaceState(key, value);
            }
            
            // Copy secrets
            for (const [key, value] of oldContext.secrets) {
                await newContext.storeSecret(key, value);
            }
        }
    }

    private getDependents(extensionId: string): string[] {
        const dependents: string[] = [];
        
        for (const [id, deps] of this.dependencies) {
            if (deps.includes(extensionId)) {
                dependents.push(id);
            }
        }
        
        return dependents;
    }

    private getEnabledDependents(extensionId: string): string[] {
        const dependents = this.getDependents(extensionId);
        return dependents.filter(id => 
            this.extensionStates.get(id) === ExtensionState.Enabled
        );
    }

    // ============ Utility ============

    async getExtensionLogs(extensionId: string, limit: number = 100): Promise<any[]> {
        // Load logs from storage
        return [];
    }

    async getExtensionMetrics(extensionId: string): Promise<ExtensionMetrics> {
        return {
            activationCount: 0,
            errorCount: 0,
            lastActivation: undefined,
            lastError: undefined,
            memoryUsage: 0,
            uptime: 0
        };
    }

    async validateExtension(extensionId: string): Promise<ValidationResult> {
        const extension = this.extensions.get(extensionId);
        
        if (!extension) {
            return {
                valid: false,
                errors: [`Extension not found: ${extensionId}`]
            };
        }

        const errors: string[] = [];

        // Check dependencies
        for (const depId of extension.dependencies) {
            if (!this.extensions.has(depId)) {
                errors.push(`Missing dependency: ${depId}`);
            }
        }

        // Check permissions
        // Validate extension module exports

        return {
            valid: errors.length === 0,
            errors
        };
    }
}

export enum ExtensionState {
    Loaded = 'loaded',
    Enabled = 'enabled',
    Disabled = 'disabled',
    Error = 'error',
    Installing = 'installing',
    Updating = 'updating',
    Uninstalling = 'uninstalling'
}

export interface Extension {
    id: string;
    name: string;
    version: string;
    publisher: string;
    description?: string;
    dependencies: string[];
    permissions: string[];
    objects: any[];
    features: string[];
    hooks: ExtensionHook[];
    module: any;
    path: string;
    installedAt: Date;
    updatedAt: Date;
}

export interface ExtensionHook {
    point: string;
    handler: (context: any, session?: Session) => Promise<any>;
    priority?: number;
    extensionId?: string;
}

export interface ExtensionContext {
    extensionId: string;
    extensionPath: string;
    storagePath: string;
    subscriptions: { dispose(): void }[];
    objects: Array<{ type: string; definition: any; registeredAt: Date }>;
    secrets: Map<string, string>;
    workspaceState: Map<string, any>;
    globalState: Map<string, any>;
    
    registerObject(type: string, object: any): Promise<void>;
    getSecret(key: string): Promise<string | undefined>;
    storeSecret(key: string, value: string): Promise<void>;
    getWorkspaceState(key: string): Promise<any>;
    updateWorkspaceState(key: string, value: any): Promise<void>;
    getGlobalState(key: string): Promise<any>;
    updateGlobalState(key: string, value: any): Promise<void>;
    persistSecrets(): Promise<void>;
    persistWorkspaceState(): Promise<void>;
    persistGlobalState(): Promise<void>;
    dispose(): void;
}

export interface ExtensionConfig {
    paths: string[];
    autoLoad: boolean;
    registry?: string;
    offline?: boolean;
    allowPrerelease?: boolean;
}

export interface ExtensionMetrics {
    activationCount: number;
    errorCount: number;
    lastActivation?: Date;
    lastError?: Date;
    memoryUsage: number;
    uptime: number;
}

export interface ValidationResult {
    valid: boolean;
    errors: string[];
    warnings?: string[];
}