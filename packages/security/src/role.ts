import { Redis } from 'ioredis';
import { PermissionSet, PermissionType, ObjectPermission, FieldPermission } from './permission';

export class RoleManager {
    private redis: Redis;
    private roles: Map<string, Role> = new Map();
    private userRoles: Map<string, string[]> = new Map();

    constructor(redis: Redis) {
        this.redis = redis;
    }

    async initialize(): Promise<void> {
        await this.loadBuiltInRoles();
        await this.loadCustomRoles();
    }

    async createRole(role: Role): Promise<Role> {
        // Validate role
        this.validateRole(role);

        // Check if role exists
        const existing = await this.getRole(role.id);
        if (existing) {
            throw new Error(`Role already exists: ${role.id}`);
        }

        // Store role
        await this.redis.set(`role:${role.id}`, JSON.stringify(role));
        this.roles.set(role.id, role);

        this.emit('roleCreated', role);

        return role;
    }

    async updateRole(roleId: string, updates: Partial<Role>): Promise<Role> {
        const role = await this.getRole(roleId);
        
        if (!role) {
            throw new Error(`Role not found: ${roleId}`);
        }

        if (role.isSystem) {
            throw new Error(`Cannot modify system role: ${roleId}`);
        }

        const updatedRole = { ...role, ...updates };
        
        await this.redis.set(`role:${roleId}`, JSON.stringify(updatedRole));
        this.roles.set(roleId, updatedRole);

        // Clear permission cache for all users with this role
        await this.clearUserPermissionCache(roleId);

        this.emit('roleUpdated', updatedRole);

        return updatedRole;
    }

    async deleteRole(roleId: string): Promise<void> {
        const role = await this.getRole(roleId);
        
        if (!role) {
            throw new Error(`Role not found: ${roleId}`);
        }

        if (role.isSystem) {
            throw new Error(`Cannot delete system role: ${roleId}`);
        }

        // Check if role is assigned
        const assignedUsers = await this.getUsersWithRole(roleId);
        if (assignedUsers.length > 0) {
            throw new Error(
                `Cannot delete role assigned to ${assignedUsers.length} user(s)`
            );
        }

        await this.redis.del(`role:${roleId}`);
        this.roles.delete(roleId);

        this.emit('roleDeleted', roleId);
    }

    async getRole(roleId: string): Promise<Role | undefined> {
        // Check cache
        if (this.roles.has(roleId)) {
            return this.roles.get(roleId);
        }

        // Load from Redis
        const data = await this.redis.get(`role:${roleId}`);
        if (data) {
            const role = JSON.parse(data);
            this.roles.set(roleId, role);
            return role;
        }

        return undefined;
    }

    async getRoles(): Promise<Role[]> {
        if (this.roles.size === 0) {
            await this.loadAllRoles();
        }
        return Array.from(this.roles.values());
    }

    async assignRoleToUser(userId: string, roleId: string): Promise<void> {
        const role = await this.getRole(roleId);
        if (!role) {
            throw new Error(`Role not found: ${roleId}`);
        }

        // Get user's current roles
        const userRoles = await this.getUserRoles(userId);
        
        if (!userRoles.includes(roleId)) {
            userRoles.push(roleId);
            await this.redis.set(`user:${userId}:roles`, JSON.stringify(userRoles));
            this.userRoles.set(userId, userRoles);
            
            // Clear permission cache
            await this.clearUserPermissionCache(userId);
            
            this.emit('roleAssigned', { userId, roleId });
        }
    }

    async removeRoleFromUser(userId: string, roleId: string): Promise<void> {
        const userRoles = await this.getUserRoles(userId);
        
        const index = userRoles.indexOf(roleId);
        if (index > -1) {
            userRoles.splice(index, 1);
            await this.redis.set(`user:${userId}:roles`, JSON.stringify(userRoles));
            this.userRoles.set(userId, userRoles);
            
            // Clear permission cache
            await this.clearUserPermissionCache(userId);
            
            this.emit('roleRemoved', { userId, roleId });
        }
    }

    async getUserRoles(userId: string): Promise<string[]> {
        // Check cache
        if (this.userRoles.has(userId)) {
            return this.userRoles.get(userId)!;
        }

        // Load from Redis
        const data = await this.redis.get(`user:${userId}:roles`);
        const roles = data ? JSON.parse(data) : [];
        this.userRoles.set(userId, roles);
        
        return roles;
    }

    async getUsersWithRole(roleId: string): Promise<string[]> {
        const users: string[] = [];
        
        // Scan for users with this role
        let cursor = '0';
        do {
            const [nextCursor, keys] = await this.redis.scan(
                cursor, 'MATCH', 'user:*:roles', 'COUNT', '100'
            );
            cursor = nextCursor;

            for (const key of keys) {
                const data = await this.redis.get(key);
                if (data) {
                    const roles = JSON.parse(data);
                    if (roles.includes(roleId)) {
                        const userId = key.split(':')[1];
                        users.push(userId);
                    }
                }
            }
        } while (cursor !== '0');

        return users;
    }

    async addPermissionToRole(
        roleId: string,
        permission: RolePermission
    ): Promise<void> {
        const role = await this.getRole(roleId);
        
        if (!role) {
            throw new Error(`Role not found: ${roleId}`);
        }

        if (!role.permissions) {
            role.permissions = [];
        }

        // Check if permission already exists
        const existingIndex = role.permissions.findIndex(p => 
            p.objectId === permission.objectId && 
            p.type === permission.type
        );

        if (existingIndex === -1) {
            role.permissions.push(permission);
            await this.updateRole(roleId, { permissions: role.permissions });
        }
    }

    async removePermissionFromRole(
        roleId: string,
        objectId: number,
        permissionType: PermissionType
    ): Promise<void> {
        const role = await this.getRole(roleId);
        
        if (!role) {
            throw new Error(`Role not found: ${roleId}`);
        }

        if (role.permissions) {
            const index = role.permissions.findIndex(p => 
                p.objectId === objectId && p.type === permissionType
            );

            if (index > -1) {
                role.permissions.splice(index, 1);
                await this.updateRole(roleId, { permissions: role.permissions });
            }
        }
    }

    async getRolePermissions(roleId: string): Promise<PermissionSet> {
        const role = await this.getRole(roleId);
        const permissionSet = new PermissionSet();

        if (role?.permissions) {
            for (const perm of role.permissions) {
                const objectPerm = new ObjectPermission(perm.objectId, [perm.type]);
                permissionSet.addObjectPermission(perm.objectId, objectPerm);

                if (perm.fields) {
                    for (const fieldId of perm.fields) {
                        const fieldPerm = new FieldPermission(perm.objectId, fieldId, [perm.type]);
                        permissionSet.addFieldPermission(perm.objectId, fieldId, fieldPerm);
                    }
                }
            }
        }

        return permissionSet;
    }

    async cloneRole(sourceRoleId: string, targetRoleId: string, targetRoleName: string): Promise<Role> {
        const sourceRole = await this.getRole(sourceRoleId);
        
        if (!sourceRole) {
            throw new Error(`Source role not found: ${sourceRoleId}`);
        }

        const newRole: Role = {
            id: targetRoleId,
            name: targetRoleName,
            description: `Clone of ${sourceRole.name}`,
            permissions: [...(sourceRole.permissions || [])],
            isSystem: false,
            metadata: {
                clonedFrom: sourceRoleId,
                clonedAt: new Date().toISOString()
            }
        };

        return this.createRole(newRole);
    }

    async importRoles(roles: Role[]): Promise<Role[]> {
        const imported: Role[] = [];

        for (const role of roles) {
            // Generate new ID if it conflicts
            if (await this.getRole(role.id)) {
                role.id = `${role.id}_imported_${Date.now()}`;
            }
            
            role.isSystem = false;
            const created = await this.createRole(role);
            imported.push(created);
        }

        return imported;
    }

    async exportRoles(roleIds?: string[]): Promise<Role[]> {
        let roles: Role[];

        if (roleIds) {
            roles = await Promise.all(
                roleIds.map(id => this.getRole(id))
            ).then(results => results.filter((r): r is Role => r !== undefined));
        } else {
            roles = await this.getRoles();
        }

        // Remove sensitive data
        return roles.map(({ isSystem, ...role }) => ({
            ...role,
            isSystem: false // Mark as non-system for import
        }));
    }

    private async loadBuiltInRoles(): Promise<void> {
        const builtInRoles = [
            {
                id: 'super',
                name: 'Super Administrator',
                description: 'Full system access',
                permissions: [{
                    objectId: -1,
                    type: PermissionType.All
                }],
                isSystem: true
            },
            {
                id: 'admin',
                name: 'Administrator',
                description: 'Administrative access',
                permissions: [
                    { objectId: -1, type: PermissionType.Read },
                    { objectId: -1, type: PermissionType.Insert },
                    { objectId: -1, type: PermissionType.Modify },
                    { objectId: -1, type: PermissionType.Delete }
                ],
                isSystem: true
            },
            {
                id: 'user',
                name: 'Standard User',
                description: 'Standard user access',
                permissions: [
                    { objectId: -1, type: PermissionType.Read }
                ],
                isSystem: true
            }
        ];

        for (const role of builtInRoles) {
            await this.redis.set(`role:${role.id}`, JSON.stringify(role));
            this.roles.set(role.id, role);
        }
    }

    private async loadCustomRoles(): Promise<void> {
        let cursor = '0';
        do {
            const [nextCursor, keys] = await this.redis.scan(
                cursor, 'MATCH', 'role:*', 'COUNT', '100'
            );
            cursor = nextCursor;

            for (const key of keys) {
                const roleId = key.split(':')[1];
                
                // Skip if already loaded
                if (this.roles.has(roleId)) continue;

                const data = await this.redis.get(key);
                if (data) {
                    const role = JSON.parse(data);
                    this.roles.set(roleId, role);
                }
            }
        } while (cursor !== '0');
    }

    private async loadAllRoles(): Promise<void> {
        this.roles.clear();
        await this.loadBuiltInRoles();
        await this.loadCustomRoles();
    }

    private async clearUserPermissionCache(userIdOrRoleId: string): Promise<void> {
        if (userIdOrRoleId.startsWith('role:')) {
            // Clear cache for all users with this role
            const users = await this.getUsersWithRole(userIdOrRoleId);
            for (const userId of users) {
                await this.redis.del(`permissions:user:${userId}`);
            }
        } else {
            // Clear cache for specific user
            await this.redis.del(`permissions:user:${userIdOrRoleId}`);
        }
    }

    private validateRole(role: Role): void {
        if (!role.id) {
            throw new Error('Role ID is required');
        }
        if (!role.name) {
            throw new Error('Role name is required');
        }
        if (!/^[a-z0-9_\-]+$/.test(role.id)) {
            throw new Error('Role ID can only contain lowercase letters, numbers, underscores and hyphens');
        }
    }

    private emit(event: string, data: any): void {
        // Emit through event system
    }
}

export interface Role {
    id: string;
    name: string;
    description?: string;
    permissions?: RolePermission[];
    isSystem?: boolean;
    metadata?: Record<string, any>;
}

export interface RolePermission {
    objectId: number;
    type: PermissionType;
    fields?: number[];
}