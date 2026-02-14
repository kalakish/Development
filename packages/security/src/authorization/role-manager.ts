import { SQLServerConnection } from '@nova/core/database/sqlserver-connection';
import { Role } from '../role';
import { PermissionManager } from './permission-manager';
import { PermissionType } from '../permission';

export interface RoleDefinition {
    id?: string;
    name: string;
    code: string;
    description?: string;
    isSystem?: boolean;
    permissions?: string[];
    parentRoleId?: string;
    metadata?: Record<string, any>;
}

export interface RoleAssignment {
    id: string;
    userId: string;
    roleId: string;
    assignedAt: Date;
    assignedBy: string;
    expiresAt?: Date;
}

export class RoleManager {
    private connection: SQLServerConnection;
    private permissionManager: PermissionManager;
    
    constructor(connection: SQLServerConnection, permissionManager: PermissionManager) {
        this.connection = connection;
        this.permissionManager = permissionManager;
    }
    
    async initialize(): Promise<void> {
        await this.ensureRoleTables();
        await this.createBuiltInRoles();
    }
    
    private async ensureRoleTables(): Promise<void> {
        // Create Roles table
        await this.connection.query(`
            IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Roles')
            BEGIN
                CREATE TABLE [Roles] (
                    [Id] INT IDENTITY(1,1) NOT NULL,
                    [SystemId] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [DF_Roles_SystemId] DEFAULT NEWID(),
                    [Code] NVARCHAR(50) NOT NULL,
                    [Name] NVARCHAR(255) NOT NULL,
                    [Description] NVARCHAR(500) NULL,
                    [IsSystem] BIT NOT NULL CONSTRAINT [DF_Roles_IsSystem] DEFAULT 0,
                    [ParentRoleId] UNIQUEIDENTIFIER NULL,
                    [Metadata] NVARCHAR(MAX) NULL,
                    [SystemCreatedAt] DATETIME2 NOT NULL CONSTRAINT [DF_Roles_CreatedAt] DEFAULT GETUTCDATE(),
                    [SystemModifiedAt] DATETIME2 NULL,
                    [SystemDeletedAt] DATETIME2 NULL,
                    CONSTRAINT [PK_Roles] PRIMARY KEY CLUSTERED ([Id])
                );
                
                CREATE UNIQUE INDEX [UX_Roles_SystemId] ON [Roles] ([SystemId]);
                CREATE UNIQUE INDEX [UX_Roles_Code] ON [Roles] ([Code]) WHERE [SystemDeletedAt] IS NULL;
                CREATE INDEX [IX_Roles_ParentRole] ON [Roles] ([ParentRoleId]);
                
                PRINT '✅ Created Roles table';
            END
        `);
        
        // Create UserRoles table
        await this.connection.query(`
            IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'UserRoles')
            BEGIN
                CREATE TABLE [UserRoles] (
                    [Id] INT IDENTITY(1,1) NOT NULL,
                    [SystemId] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [DF_UserRoles_SystemId] DEFAULT NEWID(),
                    [UserId] UNIQUEIDENTIFIER NOT NULL,
                    [RoleId] UNIQUEIDENTIFIER NOT NULL,
                    [AssignedAt] DATETIME2 NOT NULL CONSTRAINT [DF_UserRoles_AssignedAt] DEFAULT GETUTCDATE(),
                    [AssignedBy] NVARCHAR(100) NULL,
                    [ExpiresAt] DATETIME2 NULL,
                    CONSTRAINT [PK_UserRoles] PRIMARY KEY CLUSTERED ([Id])
                );
                
                CREATE UNIQUE INDEX [UX_UserRoles_SystemId] ON [UserRoles] ([SystemId]);
                CREATE UNIQUE INDEX [UX_UserRoles_Assignment] ON [UserRoles] ([UserId], [RoleId]);
                CREATE INDEX [IX_UserRoles_UserId] ON [UserRoles] ([UserId]);
                CREATE INDEX [IX_UserRoles_RoleId] ON [UserRoles] ([RoleId]);
                
                PRINT '✅ Created UserRoles table';
            END
        `);
    }
    
    private async createBuiltInRoles(): Promise<void> {
        const builtInRoles = [
            {
                code: 'SUPER',
                name: 'Super Administrator',
                description: 'Full system access with all permissions',
                isSystem: true,
                permissions: ['*']
            },
            {
                code: 'ADMIN',
                name: 'Administrator',
                description: 'Administrative access with most permissions',
                isSystem: true,
                permissions: ['read:*', 'write:*', 'delete:*', 'execute:*']
            },
            {
                code: 'USER',
                name: 'Standard User',
                description: 'Standard user with basic permissions',
                isSystem: true,
                permissions: ['read:*', 'write:own']
            },
            {
                code: 'READONLY',
                name: 'Read Only User',
                description: 'Read-only access to the system',
                isSystem: true,
                permissions: ['read:*']
            },
            {
                code: 'GUEST',
                name: 'Guest User',
                description: 'Limited access for guest users',
                isSystem: true,
                permissions: ['read:public']
            }
        ];
        
        for (const roleDef of builtInRoles) {
            const existing = await this.getRoleByCode(roleDef.code);
            
            if (!existing) {
                await this.createRole(roleDef);
            }
        }
    }
    
    // ============ Role Management ============
    
    async createRole(definition: RoleDefinition): Promise<Role> {
        // Check if role already exists
        const existing = await this.getRoleByCode(definition.code);
        if (existing) {
            throw new Error(`Role with code ${definition.code} already exists`);
        }
        
        const systemId = `role_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        await this.connection.query(`
            INSERT INTO [Roles] (
                [SystemId], [Code], [Name], [Description],
                [IsSystem], [ParentRoleId], [Metadata]
            ) VALUES (
                @SystemId, @Code, @Name, @Description,
                @IsSystem, @ParentRoleId, @Metadata
            )
        `, [
            systemId,
            definition.code.toUpperCase(),
            definition.name,
            definition.description || null,
            definition.isSystem ? 1 : 0,
            definition.parentRoleId || null,
            definition.metadata ? JSON.stringify(definition.metadata) : null
        ]);
        
        // Create role permissions
        if (definition.permissions && definition.permissions.length > 0) {
            await this.createRolePermissions(systemId, definition.permissions);
        }
        
        return this.getRole(systemId) as Promise<Role>;
    }
    
    async updateRole(roleId: string, updates: Partial<RoleDefinition>): Promise<void> {
        const role = await this.getRole(roleId);
        
        if (!role) {
            throw new Error(`Role not found: ${roleId}`);
        }
        
        if (role.isSystem) {
            throw new Error(`Cannot modify system role: ${role.code}`);
        }
        
        const sets: string[] = [];
        const params: any[] = [];
        
        if (updates.name !== undefined) {
            sets.push('[Name] = @Name');
            params.push(updates.name);
        }
        
        if (updates.description !== undefined) {
            sets.push('[Description] = @Description');
            params.push(updates.description);
        }
        
        if (updates.parentRoleId !== undefined) {
            sets.push('[ParentRoleId] = @ParentRoleId');
            params.push(updates.parentRoleId);
        }
        
        if (updates.metadata !== undefined) {
            sets.push('[Metadata] = @Metadata');
            params.push(JSON.stringify(updates.metadata));
        }
        
        sets.push('[SystemModifiedAt] = GETUTCDATE()');
        
        params.push(roleId);
        
        await this.connection.query(`
            UPDATE [Roles]
            SET ${sets.join(', ')}
            WHERE [SystemId] = @RoleId AND [SystemDeletedAt] IS NULL
        `, params);
    }
    
    async deleteRole(roleId: string, softDelete: boolean = true): Promise<void> {
        const role = await this.getRole(roleId);
        
        if (!role) {
            throw new Error(`Role not found: ${roleId}`);
        }
        
        if (role.isSystem) {
            throw new Error(`Cannot delete system role: ${role.code}`);
        }
        
        // Check if role is assigned to any users
        const assignments = await this.getRoleAssignments(roleId);
        if (assignments.length > 0) {
            throw new Error(`Cannot delete role that is assigned to ${assignments.length} users`);
        }
        
        if (softDelete) {
            await this.connection.query(`
                UPDATE [Roles]
                SET [SystemDeletedAt] = GETUTCDATE()
                WHERE [SystemId] = @RoleId
            `, [roleId]);
        } else {
            await this.connection.query(`
                DELETE FROM [Roles]
                WHERE [SystemId] = @RoleId
            `, [roleId]);
        }
    }
    
    async getRole(roleId: string): Promise<Role | null> {
        const result = await this.connection.query(`
            SELECT * FROM [Roles]
            WHERE [SystemId] = @RoleId AND [SystemDeletedAt] IS NULL
        `, [roleId]);
        
        if (result.recordset.length === 0) {
            return null;
        }
        
        return this.mapToRole(result.recordset[0]);
    }
    
    async getRoleByCode(code: string): Promise<Role | null> {
        const result = await this.connection.query(`
            SELECT * FROM [Roles]
            WHERE [Code] = @Code AND [SystemDeletedAt] IS NULL
        `, [code.toUpperCase()]);
        
        if (result.recordset.length === 0) {
            return null;
        }
        
        return this.mapToRole(result.recordset[0]);
    }
    
    async getRoles(includeSystem: boolean = true): Promise<Role[]> {
        let query = `
            SELECT * FROM [Roles]
            WHERE [SystemDeletedAt] IS NULL
        `;
        
        if (!includeSystem) {
            query += ` AND [IsSystem] = 0`;
        }
        
        query += ` ORDER BY [IsSystem] DESC, [Name] ASC`;
        
        const result = await this.connection.query(query);
        
        return result.recordset.map(row => this.mapToRole(row));
    }
    
    private async mapToRole(row: any): Promise<Role> {
        const role: Role = {
            id: row.SystemId,
            name: row.Name,
            code: row.Code,
            description: row.Description,
            isSystem: row.IsSystem === 1,
            createdAt: row.SystemCreatedAt,
            updatedAt: row.SystemModifiedAt
        };
        
        // Get role permissions
        const permissions = await this.getRolePermissions(role.id);
        role.permissions = permissions;
        
        return role;
    }
    
    // ============ Role Permissions ============
    
    private async createRolePermissions(roleId: string, permissions: string[]): Promise<void> {
        for (const permission of permissions) {
            // Parse permission string (e.g., "read:customer:123:fields=1,2,3")
            const parsed = this.parsePermissionString(permission);
            
            await this.permissionManager.createPermission({
                objectId: parsed.objectId || -1,
                objectType: parsed.objectType || '*',
                permissionType: parsed.permissionType,
                fields: parsed.fields,
                conditions: parsed.conditions
            });
        }
    }
    
    private parsePermissionString(permission: string): any {
        const parts = permission.split(':');
        
        let permissionType: PermissionType;
        let objectType = '*';
        let objectId: number | undefined = -1;
        let fields: number[] | undefined;
        let conditions: any[] | undefined;
        
        // Parse permission type
        switch (parts[0].toLowerCase()) {
            case '*':
            case 'all':
                permissionType = PermissionType.All;
                break;
            case 'read':
                permissionType = PermissionType.Read;
                break;
            case 'insert':
                permissionType = PermissionType.Insert;
                break;
            case 'modify':
                permissionType = PermissionType.Modify;
                break;
            case 'delete':
                permissionType = PermissionType.Delete;
                break;
            case 'execute':
                permissionType = PermissionType.Execute;
                break;
            case 'export':
                permissionType = PermissionType.Export;
                break;
            case 'import':
                permissionType = PermissionType.Import;
                break;
            default:
                permissionType = PermissionType.Read;
        }
        
        // Parse object type and ID
        if (parts.length > 1) {
            const objectParts = parts[1].split('.');
            objectType = objectParts[0];
            
            if (objectParts.length > 1) {
                objectId = parseInt(objectParts[1], 10);
            }
        }
        
        // Parse fields
        if (parts.length > 2) {
            const fieldParts = parts[2].split('=');
            if (fieldParts[0] === 'fields' && fieldParts[1]) {
                fields = fieldParts[1].split(',').map(f => parseInt(f, 10));
            }
        }
        
        return {
            permissionType,
            objectType,
            objectId,
            fields,
            conditions
        };
    }
    
    async getRolePermissions(roleId: string): Promise<string[]> {
        const permissions = await this.permissionManager.getPrincipalPermissions(roleId, 'role');
        
        return permissions.map(p => {
            let perm = p.permissionType.toLowerCase();
            
            if (p.objectType !== '*') {
                perm += `:${p.objectType}`;
                
                if (p.objectId !== -1) {
                    perm += `.${p.objectId}`;
                }
            }
            
            if (p.fields && p.fields.length > 0) {
                perm += `:fields=${p.fields.join(',')}`;
            }
            
            return perm;
        });
    }
    
    // ============ User Role Assignments ============
    
    async assignRoleToUser(
        userId: string,
        roleId: string,
        assignedBy?: string,
        expiresAt?: Date
    ): Promise<string> {
        const role = await this.getRole(roleId);
        if (!role) {
            throw new Error(`Role not found: ${roleId}`);
        }
        
        const systemId = `assn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        await this.connection.query(`
            INSERT INTO [UserRoles] (
                [SystemId], [UserId], [RoleId], [AssignedBy], [ExpiresAt]
            ) VALUES (
                @SystemId, @UserId, @RoleId, @AssignedBy, @ExpiresAt
            )
        `, [
            systemId,
            userId,
            roleId,
            assignedBy || null,
            expiresAt || null
        ]);
        
        return systemId;
    }
    
    async removeRoleFromUser(userId: string, roleId: string): Promise<void> {
        await this.connection.query(`
            DELETE FROM [UserRoles]
            WHERE [UserId] = @UserId AND [RoleId] = @RoleId
        `, [userId, roleId]);
    }
    
    async getUserRoles(userId: string): Promise<Role[]> {
        const result = await this.connection.query(`
            SELECT r.* FROM [Roles] r
            INNER JOIN [UserRoles] ur
                ON r.[SystemId] = ur.[RoleId]
            WHERE ur.[UserId] = @UserId
                AND r.[SystemDeletedAt] IS NULL
                AND (ur.[ExpiresAt] IS NULL OR ur.[ExpiresAt] > GETUTCDATE())
            ORDER BY r.[IsSystem] DESC, r.[Name] ASC
        `, [userId]);
        
        const roles: Role[] = [];
        
        for (const row of result.recordset) {
            const role = await this.mapToRole(row);
            roles.push(role);
        }
        
        return roles;
    }
    
    async getRoleAssignments(roleId: string): Promise<RoleAssignment[]> {
        const result = await this.connection.query(`
            SELECT * FROM [UserRoles]
            WHERE [RoleId] = @RoleId
        `, [roleId]);
        
        return result.recordset.map(row => ({
            id: row.SystemId,
            userId: row.UserId,
            roleId: row.RoleId,
            assignedAt: row.AssignedAt,
            assignedBy: row.AssignedBy,
            expiresAt: row.ExpiresAt
        }));
    }
    
    async getUsersInRole(roleId: string): Promise<string[]> {
        const result = await this.connection.query(`
            SELECT [UserId] FROM [UserRoles]
            WHERE [RoleId] = @RoleId
                AND ([ExpiresAt] IS NULL OR [ExpiresAt] > GETUTCDATE())
        `, [roleId]);
        
        return result.recordset.map(row => row.UserId);
    }
    
    // ============ Role Hierarchy ============
    
    async getInheritedRoles(roleId: string): Promise<Role[]> {
        const role = await this.getRole(roleId);
        
        if (!role) {
            return [];
        }
        
        const inheritedRoles: Role[] = [];
        
        let currentRoleId = role.parentRoleId;
        while (currentRoleId) {
            const parentRole = await this.getRole(currentRoleId);
            if (parentRole) {
                inheritedRoles.push(parentRole);
                currentRoleId = parentRole.parentRoleId;
            } else {
                break;
            }
        }
        
        return inheritedRoles;
    }
    
    async getEffectivePermissions(roleId: string): Promise<string[]> {
        const roles = [roleId, ...(await this.getInheritedRoles(roleId)).map(r => r.id)];
        const allPermissions: string[] = [];
        
        for (const rid of roles) {
            const permissions = await this.getRolePermissions(rid);
            allPermissions.push(...permissions);
        }
        
        // Remove duplicates
        return [...new Set(allPermissions)];
    }
}