export class SecurityManager {
    private static instance: SecurityManager;
    private permissionCache: Map<string, PermissionSet>;
    private roleManager: RoleManager;

    private constructor() {
        this.permissionCache = new Map();
        this.roleManager = new RoleManager();
    }

    static getInstance(): SecurityManager {
        if (!SecurityManager.instance) {
            SecurityManager.instance = new SecurityManager();
        }
        return SecurityManager.instance;
    }

    async checkPermission(
        user: User,
        permissionType: PermissionType,
        resource: ObjectMetadata
    ): Promise<boolean> {
        // Super admin override
        if (user.isSuperAdmin) {
            return true;
        }

        const permissionSet = await this.getUserPermissionSet(user);
        
        // Check object-level permission
        if (!this.hasObjectPermission(permissionSet, resource, permissionType)) {
            return false;
        }

        // Check field-level permissions if applicable
        if (resource.fields) {
            for (const field of resource.fields) {
                if (!this.hasFieldPermission(permissionSet, resource, field, permissionType)) {
                    return false;
                }
            }
        }

        return true;
    }

    async getUserPermissionSet(user: User): Promise<PermissionSet> {
        const cacheKey = `user:${user.id}`;
        
        if (this.permissionCache.has(cacheKey)) {
            return this.permissionCache.get(cacheKey)!;
        }

        const roles = await this.roleManager.getUserRoles(user);
        const permissionSet = new PermissionSet();

        for (const role of roles) {
            const rolePermissions = await this.roleManager.getRolePermissions(role);
            permissionSet.merge(rolePermissions);
        }

        this.permissionCache.set(cacheKey, permissionSet);
        
        // Cache invalidation after 5 minutes
        setTimeout(() => {
            this.permissionCache.delete(cacheKey);
        }, 300000);

        return permissionSet;
    }

    private hasObjectPermission(
        permissionSet: PermissionSet,
        object: ObjectMetadata,
        permissionType: PermissionType
    ): boolean {
        const permission = permissionSet.getObjectPermission(object.id);
        
        if (!permission) {
            return false;
        }

        return permission.hasPermission(permissionType);
    }

    private hasFieldPermission(
        permissionSet: PermissionSet,
        object: ObjectMetadata,
        field: FieldMetadata,
        permissionType: PermissionType
    ): boolean {
        const fieldPermission = permissionSet.getFieldPermission(object.id, field.id);
        
        if (!fieldPermission) {
            // If no specific field permission, check object permission
            return this.hasObjectPermission(permissionSet, object, permissionType);
        }

        return fieldPermission.hasPermission(permissionType);
    }
}

export class PermissionSet {
    private objectPermissions: Map<number, ObjectPermission>;
    private fieldPermissions: Map<string, FieldPermission>;

    constructor() {
        this.objectPermissions = new Map();
        this.fieldPermissions = new Map();
    }

    merge(permissionSet: PermissionSet): void {
        // Merge permissions with higher precedence for explicit grants
        permissionSet.objectPermissions.forEach((value, key) => {
            this.objectPermissions.set(key, value);
        });

        permissionSet.fieldPermissions.forEach((value, key) => {
            this.fieldPermissions.set(key, value);
        });
    }

    getObjectPermission(objectId: number): ObjectPermission | undefined {
        return this.objectPermissions.get(objectId);
    }

    getFieldPermission(objectId: number, fieldId: number): FieldPermission | undefined {
        const key = `${objectId}:${fieldId}`;
        return this.fieldPermissions.get(key);
    }
}

export enum PermissionType {
    Read = 'Read',
    Insert = 'Insert',
    Modify = 'Modify',
    Delete = 'Delete',
    Execute = 'Execute',
    Export = 'Export',
    Import = 'Import'
}