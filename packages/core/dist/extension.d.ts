/// <reference types="node" />
import { EventEmitter } from 'events';
import { Session } from './session';
export declare class ExtensionManager extends EventEmitter {
    private extensions;
    private extensionContexts;
    private dependencies;
    private extensionStates;
    private extensionHooks;
    loadExtensions(config?: ExtensionConfig): Promise<void>;
    loadExtensionFromPath(extensionPath: string): Promise<Extension>;
    installExtension(extensionPackage: string, source?: string): Promise<Extension>;
    uninstallExtension(extensionId: string): Promise<void>;
    enableExtension(extensionId: string): Promise<void>;
    disableExtension(extensionId: string): Promise<void>;
    updateExtension(extensionId: string, newVersion: string): Promise<Extension>;
    getExtension(extensionId: string): Extension | undefined;
    getExtensions(): Extension[];
    getEnabledExtensions(): Extension[];
    getExtensionState(extensionId: string): ExtensionState | undefined;
    registerHook(extensionId: string, hook: ExtensionHook): void;
    executeHook(hookPoint: string, context: any, session?: Session): Promise<any[]>;
    private registerHooks;
    private unregisterHooks;
    registerObject(extensionId: string, objectType: string, object: any): void;
    getExtensionObjects(extensionId: string, objectType?: string): any[];
    private validateManifest;
    private isValidVersion;
    private isValidId;
    private resolveDependencies;
    private initializeExtensions;
    private createExtensionContext;
    private downloadExtension;
    private runInstallScript;
    private runUninstallScript;
    private migrateExtensionData;
    private getDependents;
    private getEnabledDependents;
    getExtensionLogs(extensionId: string, limit?: number): Promise<any[]>;
    getExtensionMetrics(extensionId: string): Promise<ExtensionMetrics>;
    validateExtension(extensionId: string): Promise<ValidationResult>;
}
export declare enum ExtensionState {
    Loaded = "loaded",
    Enabled = "enabled",
    Disabled = "disabled",
    Error = "error",
    Installing = "installing",
    Updating = "updating",
    Uninstalling = "uninstalling"
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
    subscriptions: {
        dispose(): void;
    }[];
    objects: Array<{
        type: string;
        definition: any;
        registeredAt: Date;
    }>;
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
//# sourceMappingURL=extension.d.ts.map