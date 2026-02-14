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
exports.ExtensionState = exports.ExtensionManager = void 0;
const events_1 = require("events");
const fs = __importStar(require("fs-extra"));
const path = __importStar(require("path"));
class ExtensionManager extends events_1.EventEmitter {
    extensions = new Map();
    extensionContexts = new Map();
    dependencies = new Map();
    extensionStates = new Map();
    extensionHooks = new Map();
    async loadExtensions(config) {
        if (!config)
            return;
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
    async loadExtensionFromPath(extensionPath) {
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
        }
        catch (error) {
            throw new Error(`Failed to load extension module: ${error.message}`);
        }
        const extension = {
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
    async installExtension(extensionPackage, source) {
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
    async uninstallExtension(extensionId) {
        const extension = this.extensions.get(extensionId);
        if (!extension) {
            throw new Error(`Extension not found: ${extensionId}`);
        }
        // Check if other extensions depend on this one
        const dependents = this.getDependents(extensionId);
        if (dependents.length > 0) {
            throw new Error(`Cannot uninstall extension ${extensionId}. ` +
                `Required by: ${dependents.join(', ')}`);
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
    async enableExtension(extensionId) {
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
            }
            catch (error) {
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
    async disableExtension(extensionId) {
        const extension = this.extensions.get(extensionId);
        if (!extension) {
            throw new Error(`Extension not found: ${extensionId}`);
        }
        // Check if other enabled extensions depend on this one
        const dependents = this.getEnabledDependents(extensionId);
        if (dependents.length > 0) {
            throw new Error(`Cannot disable extension ${extensionId}. ` +
                `Required by: ${dependents.join(', ')}`);
        }
        const context = this.extensionContexts.get(extensionId);
        // Call deactivate function
        if (extension.module.deactivate && context) {
            try {
                await extension.module.deactivate(context);
            }
            catch (error) {
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
    async updateExtension(extensionId, newVersion) {
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
    getExtension(extensionId) {
        return this.extensions.get(extensionId);
    }
    getExtensions() {
        return Array.from(this.extensions.values());
    }
    getEnabledExtensions() {
        return this.getExtensions().filter(ext => this.extensionStates.get(ext.id) === ExtensionState.Enabled);
    }
    getExtensionState(extensionId) {
        return this.extensionStates.get(extensionId);
    }
    // ============ Hooks ============
    registerHook(extensionId, hook) {
        if (!this.extensionHooks.has(hook.point)) {
            this.extensionHooks.set(hook.point, []);
        }
        this.extensionHooks.get(hook.point).push({
            ...hook,
            extensionId
        });
    }
    async executeHook(hookPoint, context, session) {
        const hooks = this.extensionHooks.get(hookPoint) || [];
        const results = [];
        for (const hook of hooks) {
            const extension = this.extensions.get(hook.extensionId);
            if (extension && this.extensionStates.get(extension.id) === ExtensionState.Enabled) {
                try {
                    const result = await hook.handler(context, session);
                    results.push(result);
                }
                catch (error) {
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
    registerHooks(extension, context) {
        for (const hook of extension.hooks || []) {
            this.registerHook(extension.id, hook);
        }
    }
    unregisterHooks(extensionId) {
        for (const [point, hooks] of this.extensionHooks) {
            const filtered = hooks.filter(h => h.extensionId !== extensionId);
            if (filtered.length === 0) {
                this.extensionHooks.delete(point);
            }
            else {
                this.extensionHooks.set(point, filtered);
            }
        }
    }
    // ============ Object Registration ============
    registerObject(extensionId, objectType, object) {
        const context = this.extensionContexts.get(extensionId);
        if (context) {
            context.objects.push({
                type: objectType,
                definition: object,
                registeredAt: new Date()
            });
        }
    }
    getExtensionObjects(extensionId, objectType) {
        const context = this.extensionContexts.get(extensionId);
        const objects = context?.objects || [];
        if (objectType) {
            return objects.filter(o => o.type === objectType);
        }
        return objects;
    }
    // ============ Private Methods ============
    validateManifest(manifest) {
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
    isValidVersion(version) {
        return /^\d+\.\d+\.\d+$/.test(version);
    }
    isValidId(id) {
        return /^[a-z0-9\-]+$/.test(id);
    }
    resolveDependencies() {
        const visited = new Set();
        const resolved = [];
        const resolve = (extensionId) => {
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
        this.dependencies = new Map(resolved.map(id => [id, this.dependencies.get(id) || []]));
    }
    async initializeExtensions() {
        // Initialize in dependency order
        for (const [extensionId] of this.dependencies) {
            if (this.extensionStates.get(extensionId) === ExtensionState.Loaded) {
                await this.enableExtension(extensionId);
            }
        }
    }
    createExtensionContext(extension) {
        return {
            extensionId: extension.id,
            extensionPath: extension.path,
            subscriptions: [],
            objects: [],
            secrets: new Map(),
            workspaceState: new Map(),
            globalState: new Map(),
            storagePath: path.join(process.cwd(), 'storage', extension.id),
            async registerObject(type, object) {
                this.objects.push({
                    type,
                    definition: object,
                    registeredAt: new Date()
                });
            },
            async getSecret(key) {
                return this.secrets.get(key);
            },
            async storeSecret(key, value) {
                this.secrets.set(key, value);
                // Persist to secure storage
                await this.persistSecrets();
            },
            async getWorkspaceState(key) {
                return this.workspaceState.get(key);
            },
            async updateWorkspaceState(key, value) {
                this.workspaceState.set(key, value);
                // Persist to storage
                await this.persistWorkspaceState();
            },
            async getGlobalState(key) {
                return this.globalState.get(key);
            },
            async updateGlobalState(key, value) {
                this.globalState.set(key, value);
                // Persist to storage
                await this.persistGlobalState();
            },
            async persistSecrets() {
                const secretsPath = path.join(this.storagePath, 'secrets.json');
                await fs.ensureDir(this.storagePath);
                const data = Object.fromEntries(this.secrets);
                await fs.writeJson(secretsPath, data, { spaces: 2 });
            },
            async persistWorkspaceState() {
                const statePath = path.join(this.storagePath, 'workspace.json');
                await fs.ensureDir(this.storagePath);
                const data = Object.fromEntries(this.workspaceState);
                await fs.writeJson(statePath, data, { spaces: 2 });
            },
            async persistGlobalState() {
                const statePath = path.join(process.cwd(), 'storage', 'global', `${extension.id}.json`);
                await fs.ensureDir(path.dirname(statePath));
                const data = Object.fromEntries(this.globalState);
                await fs.writeJson(statePath, data, { spaces: 2 });
            },
            subscriptions: [],
            dispose() {
                this.subscriptions.forEach(sub => sub.dispose());
                this.subscriptions = [];
                this.objects = [];
                this.secrets.clear();
                this.workspaceState.clear();
                this.globalState.clear();
            }
        };
    }
    async downloadExtension(extensionPackage, source) {
        // Create extension directory
        const extensionId = extensionPackage.split('@')[0];
        const extensionDir = path.join(process.cwd(), 'extensions', extensionId);
        await fs.ensureDir(extensionDir);
        // Download from registry
        if (source) {
            // Download from custom source
        }
        else {
            // Download from default registry
        }
        return extensionDir;
    }
    async runInstallScript(extension) {
        const installPath = path.join(extension.path, 'install.js');
        if (await fs.pathExists(installPath)) {
            const script = require(installPath);
            if (script.install) {
                const context = this.createExtensionContext(extension);
                await script.install(context);
            }
        }
    }
    async runUninstallScript(extension) {
        const uninstallPath = path.join(extension.path, 'uninstall.js');
        if (await fs.pathExists(uninstallPath)) {
            const script = require(uninstallPath);
            if (script.uninstall) {
                const context = this.createExtensionContext(extension);
                await script.uninstall(context);
            }
        }
    }
    async migrateExtensionData(oldExtension, newExtension) {
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
    getDependents(extensionId) {
        const dependents = [];
        for (const [id, deps] of this.dependencies) {
            if (deps.includes(extensionId)) {
                dependents.push(id);
            }
        }
        return dependents;
    }
    getEnabledDependents(extensionId) {
        const dependents = this.getDependents(extensionId);
        return dependents.filter(id => this.extensionStates.get(id) === ExtensionState.Enabled);
    }
    // ============ Utility ============
    async getExtensionLogs(extensionId, limit = 100) {
        // Load logs from storage
        return [];
    }
    async getExtensionMetrics(extensionId) {
        return {
            activationCount: 0,
            errorCount: 0,
            lastActivation: undefined,
            lastError: undefined,
            memoryUsage: 0,
            uptime: 0
        };
    }
    async validateExtension(extensionId) {
        const extension = this.extensions.get(extensionId);
        if (!extension) {
            return {
                valid: false,
                errors: [`Extension not found: ${extensionId}`]
            };
        }
        const errors = [];
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
exports.ExtensionManager = ExtensionManager;
var ExtensionState;
(function (ExtensionState) {
    ExtensionState["Loaded"] = "loaded";
    ExtensionState["Enabled"] = "enabled";
    ExtensionState["Disabled"] = "disabled";
    ExtensionState["Error"] = "error";
    ExtensionState["Installing"] = "installing";
    ExtensionState["Updating"] = "updating";
    ExtensionState["Uninstalling"] = "uninstalling";
})(ExtensionState || (exports.ExtensionState = ExtensionState = {}));
//# sourceMappingURL=extension.js.map