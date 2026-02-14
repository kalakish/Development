import { Redis } from 'ioredis';
import { Session } from '../core/session';

export class SecurityManager {
    private static instance: SecurityManager;
    private redis: Redis;
    private permissions: Map<string, PermissionSet> = new Map();
    private initialized: boolean = false;

    private constructor() {
        this.redis = new Redis({
            host: process.env.REDIS_HOST || 'localhost',
            port: parseInt(process.env.REDIS_PORT || '6379')
        });
    }

    static getInstance(): SecurityManager {
        if (!SecurityManager.instance) {
            SecurityManager.instance = new SecurityManager();
        }
        return SecurityManager.instance;
    }

    async initialize(config: SecurityConfig): Promise<void> {
        if (this.initialized) return;
        
        // Load built-in roles
        await this.loadBuiltInRoles();
        
        // Initialize permission cache
        await this.initializeCache();
        
        this.initialized = true;
    }

    async authenticate(credentials: Credentials): Promise<User> {
        // Validate credentials
        const user = await this.validateCredentials(credentials);
        
        // Load user roles
        user.roles = await this.getUserRoles(user.id);
        
        // Generate token
        user.token = this.generateToken(user);
        
        return user;
    }

    async authorize(session: Session, permission: string, resource?: string): Promise<boolean> {
        const user = session.user;
        
        // Super admin bypass
        if (user.isSuperAdmin) {
            return true;
        }
        
        // Check permissions
        const permissionSet = await this.getUserPermissionSet(user);
        return permissionSet.hasPermission(permission, resource);
    }

    async checkPermission(
        user: User,
        permissionType: PermissionType,
        resource: PermissionResource
    ): Promise<boolean> {
        if (user.isSuperAdmin) return true;
        
        const permissionSet = await this.getUserPermissionSet(user);
        
        // Check object-level permission
        if (!permissionSet.hasObjectPermission(resource.objectId, permissionType)) {
            return false;
        }
        
        // Check field-level permissions
        if (resource.fields) {
            for (const field of resource.fields) {
                if (!permissionSet.hasFieldPermission(resource.objectId, field, permissionType)) {
                    return false;
                }
            }
        }
        
        return true;
    }

    async getUserPermissionSet(user: User): Promise<PermissionSet> {
        const cacheKey = `permissions:user:${user.id}`;
        
        // Check cache
        const cached = await this.redis.get(cacheKey);
        if (cached) {
            return PermissionSet.fromJSON(JSON.parse(cached));
        }
        
        // Build permission set from roles
        const permissionSet = new PermissionSet();
        
        for (const roleId of user.roles) {
            const rolePermissions = await this.getRolePermissions(roleId);
            permissionSet.merge(rolePermissions);
        }
        
        // Cache for 5 minutes
        await this.redis.setex(cacheKey, 300, JSON.stringify(permissionSet.toJSON()));
        
        return permissionSet;
    }

    private async validateCredentials(credentials: Credentials): Promise<User> {
        // Validate username/password
        // This would check against the database
        return {
            id: '1',
            username: credentials.username,
            displayName: credentials.username,
            email: `${credentials.username}@example.com`,
            roles: ['USER'],
            isSuperAdmin: false
        };
    }

    private async getUserRoles(userId: string): Promise<string[]> {
        // Load roles from database
        return ['USER'];
    }

    private async getRolePermissions(roleId: string): Promise<PermissionSet> {
        const cacheKey = `permissions:role:${roleId}`;
        
        // Check cache
        const cached = await this.redis.get(cacheKey);
        if (cached) {
            return PermissionSet.fromJSON(JSON.parse(cached));
        }
        
        // Load from database
        const permissionSet = new PermissionSet();
        
        // Add role permissions
        // This would load from the database
        
        // Cache for 1 hour
        await this.redis.setex(cacheKey, 3600, JSON.stringify(permissionSet.toJSON()));
        
        return permissionSet;
    }

    private generateToken(user: User): string {
        // Generate JWT token
        return Buffer.from(JSON.stringify({
            id: user.id,
            username: user.username,
            exp: Date.now() + 3600000 // 1 hour
        })).toString('base64');
    }

    private async loadBuiltInRoles(): Promise<void> {
        // Create SUPER role
        const superRole: Role = {
            id: 'super',
            name: 'Super Administrator',
            permissions: ['*'],
            isSystem: true
        };
        
        // Create ADMIN role
        const adminRole: Role = {
            id: 'admin',
            name: 'Administrator',
            permissions: ['read:*', 'write:*', 'delete:*'],
            isSystem: true
        };
        
        // Create USER role
        const userRole: Role = {
            id: 'user',
            name: 'User',
            permissions: ['read:*', 'write:own'],
            isSystem: true
        };
        
        // Store roles
        await this.redis.set('role:super', JSON.stringify(superRole));
        await this.redis.set('role:admin', JSON.stringify(adminRole));
        await this.redis.set('role:user', JSON.stringify(userRole));
    }

    private async initializeCache(): Promise<void> {
        // Clear expired cache entries
        // Initialize cache warming if needed
    }

    async validateToken(token: string): Promise<User | null> {
        try {
            const decoded = JSON.parse(Buffer.from(token, 'base64').toString());
            
            if (decoded.exp < Date.now()) {
                return null; // Expired
            }
            
            return {
                id: decoded.id,
                username: decoded.username,
                displayName: decoded.username,
                email: '',
                roles: [],
                isSuperAdmin: false
            };
        } catch {
            return null;
        }
    }

    async logAudit(session: Session, action: string, resource: any): Promise<void> {
        const auditEntry: AuditEntry = {
            id: this.generateAuditId(),
            timestamp: new Date(),
            userId: session.user.id,
            sessionId: session.id,
            companyId: session.company.id,
            action,
            resource,
            ipAddress: session['ipAddress'],
            userAgent: session['userAgent']
        };
        
        // Store audit log
        await this.redis.lpush('audit:log', JSON.stringify(auditEntry));
        
        // Trim old entries
        await this.redis.ltrim('audit:log', 0, 9999);
    }

    private generateAuditId(): string {
        return `aud_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
}

export class PermissionSet {
    private objectPermissions: Map<number, ObjectPermission> = new Map();
    private fieldPermissions: Map<string, FieldPermission> = new Map();

    merge(permissionSet: PermissionSet): void {
        // Merge object permissions
        permissionSet.objectPermissions.forEach((value, key) => {
            this.objectPermissions.set(key, value);
        });
        
        // Merge field permissions
        permissionSet.fieldPermissions.forEach((value, key) => {
            this.fieldPermissions.set(key, value);
        });
    }

    hasPermission(permission: string, resource?: string): boolean {
        // Check for wildcard permission
        if (this.objectPermissions.has(-1) && 
            this.objectPermissions.get(-1)?.hasPermission(PermissionType.All)) {
            return true;
        }
        
        // Parse permission string (e.g., "read:customer")
        const [action, object] = permission.split(':');
        const permissionType = this.mapToPermissionType(action);
        
        if (!resource && object) {
            resource = object;
        }
        
        // Check specific permission
        if (resource) {
            // Check object permission
            const objPerm = this.getObjectPermission(parseInt(resource) || 0);
            if (objPerm?.hasPermission(permissionType)) {
                return true;
            }
        }
        
        // Check wildcard object
        const wildcardPerm = this.getObjectPermission(-1);
        return wildcardPerm?.hasPermission(permissionType) || false;
    }

    hasObjectPermission(objectId: number, permissionType: PermissionType): boolean {
        const permission = this.objectPermissions.get(objectId);
        return permission?.hasPermission(permissionType) || false;
    }

    hasFieldPermission(objectId: number, fieldId: number, permissionType: PermissionType): boolean {
        const key = `${objectId}:${fieldId}`;
        const permission = this.fieldPermissions.get(key);
        
        if (permission) {
            return permission.hasPermission(permissionType);
        }
        
        // Fall back to object permission
        return this.hasObjectPermission(objectId, permissionType);
    }

    getObjectPermission(objectId: number): ObjectPermission | undefined {
        return this.objectPermissions.get(objectId);
    }

    addObjectPermission(objectId: number, permission: ObjectPermission): void {
        this.objectPermissions.set(objectId, permission);
    }

    addFieldPermission(objectId: number, fieldId: number, permission: FieldPermission): void {
        const key = `${objectId}:${fieldId}`;
        this.fieldPermissions.set(key, permission);
    }

    private mapToPermissionType(action: string): PermissionType {
        switch (action.toLowerCase()) {
            case 'read': return PermissionType.Read;
            case 'insert': return PermissionType.Insert;
            case 'modify': return PermissionType.Modify;
            case 'delete': return PermissionType.Delete;
            case 'execute': return PermissionType.Execute;
            case 'export': return PermissionType.Export;
            case 'import': return PermissionType.Import;
            case '*':
            case 'all': return PermissionType.All;
            default: return PermissionType.Read;
        }
    }

    toJSON(): any {
        return {
            objectPermissions: Array.from(this.objectPermissions.entries()),
            fieldPermissions: Array.from(this.fieldPermissions.entries())
        };
    }

    static fromJSON(data: any): PermissionSet {
        const permissionSet = new PermissionSet();
        
        permissionSet.objectPermissions = new Map(data.objectPermissions);
        permissionSet.fieldPermissions = new Map(data.fieldPermissions);
        
        return permissionSet;
    }
}

export class ObjectPermission {
    constructor(
        public objectId: number,
        public permissions: PermissionType[] = []
    ) {}

    hasPermission(permission: PermissionType): boolean {
        if (this.permissions.includes(PermissionType.All)) {
            return true;
        }
        return this.permissions.includes(permission);
    }

    addPermission(permission: PermissionType): void {
        if (!this.permissions.includes(permission)) {
            this.permissions.push(permission);
        }
    }

    removePermission(permission: PermissionType): void {
        const index = this.permissions.indexOf(permission);
        if (index > -1) {
            this.permissions.splice(index, 1);
        }
    }
}

export class FieldPermission {
    constructor(
        public objectId: number,
        public fieldId: number,
        public permissions: PermissionType[] = []
    ) {}

    hasPermission(permission: PermissionType): boolean {
        return this.permissions.includes(permission);
    }

    addPermission(permission: PermissionType): void {
        if (!this.permissions.includes(permission)) {
            this.permissions.push(permission);
        }
    }
}

export enum PermissionType {
    Read = 'Read',
    Insert = 'Insert',
    Modify = 'Modify',
    Delete = 'Delete',
    Execute = 'Execute',
    Export = 'Export',
    Import = 'Import',
    All = 'All'
}

export interface User {
    id: string;
    username: string;
    displayName: string;
    email: string;
    roles: string[];
    isSuperAdmin: boolean;
    token?: string;
    preferences?: Record<string, any>;
}

export interface Credentials {
    username: string;
    password: string;
}

export interface Role {
    id: string;
    name: string;
    permissions: string[];
    isSystem: boolean;
    description?: string;
}

export interface PermissionResource {
    objectId: number;
    objectType: string;
    fields?: number[];
}

export interface AuditEntry {
    id: string;
    timestamp: Date;
    userId: string;
    sessionId: string;
    companyId: string;
    action: string;
    resource: any;
    ipAddress?: string;
    userAgent?: string;
}

export interface SecurityConfig {
    jwtSecret: string;
    tokenExpiry: string;
    bcryptRounds: number;
    sessionTimeout: number;
    maxLoginAttempts?: number;
    lockoutDuration?: number;
    requireMfa?: boolean;
}