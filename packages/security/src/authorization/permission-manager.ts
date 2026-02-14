import { SQLServerConnection } from '@nova/core/database/sqlserver-connection';
import { PermissionSet, ObjectPermission, FieldPermission, PermissionType } from '../permission';
import { User } from '@nova/core/session';

export interface PermissionDefinition {
    id?: string;
    objectId: number;
    objectType: string;
    permissionType: PermissionType;
    fields?: number[];
    conditions?: PermissionCondition[];
    priority?: number;
}

export interface PermissionCondition {
    field: string;
    operator: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'contains';
    value: any;
}

export interface PermissionAssignment {
    id: string;
    principalId: string;
    principalType: 'user' | 'role' | 'group';
    permissionId: string;
    granted: boolean;
    grantedAt: Date;
    grantedBy: string;
    expiresAt?: Date;
}

export class PermissionManager {
    private connection: SQLServerConnection;
    
    constructor(connection: SQLServerConnection) {
        this.connection = connection;
    }
    
    async initialize(): Promise<void> {
        await this.ensurePermissionTables();
    }
    
    private async ensurePermissionTables(): Promise<void> {
        // Create Permissions table
        await this.connection.query(`
            IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Permissions')
            BEGIN
                CREATE TABLE [Permissions] (
                    [Id] INT IDENTITY(1,1) NOT NULL,
                    [SystemId] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [DF_Permissions_SystemId] DEFAULT NEWID(),
                    [ObjectId] INT NOT NULL,
                    [ObjectType] NVARCHAR(50) NOT NULL,
                    [PermissionType] NVARCHAR(50) NOT NULL,
                    [Fields] NVARCHAR(MAX) NULL,
                    [Conditions] NVARCHAR(MAX) NULL,
                    [Priority] INT NOT NULL CONSTRAINT [DF_Permissions_Priority] DEFAULT 0,
                    [SystemCreatedAt] DATETIME2 NOT NULL CONSTRAINT [DF_Permissions_CreatedAt] DEFAULT GETUTCDATE(),
                    [SystemModifiedAt] DATETIME2 NULL,
                    [SystemDeletedAt] DATETIME2 NULL,
                    CONSTRAINT [PK_Permissions] PRIMARY KEY CLUSTERED ([Id])
                );
                
                CREATE UNIQUE INDEX [UX_Permissions_SystemId] ON [Permissions] ([SystemId]);
                CREATE INDEX [IX_Permissions_Object] ON [Permissions] ([ObjectType], [ObjectId]);
                CREATE INDEX [IX_Permissions_Type] ON [Permissions] ([PermissionType]);
                
                PRINT '✅ Created Permissions table';
            END
        `);
        
        // Create PermissionAssignments table
        await this.connection.query(`
            IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'PermissionAssignments')
            BEGIN
                CREATE TABLE [PermissionAssignments] (
                    [Id] INT IDENTITY(1,1) NOT NULL,
                    [SystemId] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [DF_PermissionAssignments_SystemId] DEFAULT NEWID(),
                    [PrincipalId] NVARCHAR(100) NOT NULL,
                    [PrincipalType] NVARCHAR(20) NOT NULL,
                    [PermissionId] UNIQUEIDENTIFIER NOT NULL,
                    [Granted] BIT NOT NULL CONSTRAINT [DF_PermissionAssignments_Granted] DEFAULT 1,
                    [GrantedAt] DATETIME2 NOT NULL CONSTRAINT [DF_PermissionAssignments_GrantedAt] DEFAULT GETUTCDATE(),
                    [GrantedBy] NVARCHAR(100) NULL,
                    [ExpiresAt] DATETIME2 NULL,
                    [SystemCreatedAt] DATETIME2 NOT NULL CONSTRAINT [DF_PermissionAssignments_CreatedAt] DEFAULT GETUTCDATE(),
                    CONSTRAINT [PK_PermissionAssignments] PRIMARY KEY CLUSTERED ([Id])
                );
                
                CREATE UNIQUE INDEX [UX_PermissionAssignments_SystemId] ON [PermissionAssignments] ([SystemId]);
                CREATE INDEX [IX_PermissionAssignments_Principal] ON [PermissionAssignments] ([PrincipalId], [PrincipalType]);
                CREATE INDEX [IX_PermissionAssignments_Permission] ON [PermissionAssignments] ([PermissionId]);
                
                PRINT '✅ Created PermissionAssignments table';
            END
        `);
    }
    
    // ============ Permission Management ============
    
    async createPermission(definition: PermissionDefinition): Promise<string> {
        const systemId = `perm_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        await this.connection.query(`
            INSERT INTO [Permissions] (
                [SystemId], [ObjectId], [ObjectType], [PermissionType],
                [Fields], [Conditions], [Priority]
            ) VALUES (
                @SystemId, @ObjectId, @ObjectType, @PermissionType,
                @Fields, @Conditions, @Priority
            )
        `, [
            systemId,
            definition.objectId,
            definition.objectType,
            definition.permissionType,
            definition.fields ? JSON.stringify(definition.fields) : null,
            definition.conditions ? JSON.stringify(definition.conditions) : null,
            definition.priority || 0
        ]);
        
        return systemId;
    }
    
    async updatePermission(permissionId: string, updates: Partial<PermissionDefinition>): Promise<void> {
        const sets: string[] = [];
        const params: any[] = [];
        
        if (updates.objectId !== undefined) {
            sets.push('[ObjectId] = @ObjectId');
            params.push(updates.objectId);
        }
        
        if (updates.objectType !== undefined) {
            sets.push('[ObjectType] = @ObjectType');
            params.push(updates.objectType);
        }
        
        if (updates.permissionType !== undefined) {
            sets.push('[PermissionType] = @PermissionType');
            params.push(updates.permissionType);
        }
        
        if (updates.fields !== undefined) {
            sets.push('[Fields] = @Fields');
            params.push(JSON.stringify(updates.fields));
        }
        
        if (updates.conditions !== undefined) {
            sets.push('[Conditions] = @Conditions');
            params.push(JSON.stringify(updates.conditions));
        }
        
        if (updates.priority !== undefined) {
            sets.push('[Priority] = @Priority');
            params.push(updates.priority);
        }
        
        sets.push('[SystemModifiedAt] = GETUTCDATE()');
        
        params.push(permissionId);
        
        await this.connection.query(`
            UPDATE [Permissions]
            SET ${sets.join(', ')}
            WHERE [SystemId] = @PermissionId AND [SystemDeletedAt] IS NULL
        `, params);
    }
    
    async deletePermission(permissionId: string, softDelete: boolean = true): Promise<void> {
        if (softDelete) {
            await this.connection.query(`
                UPDATE [Permissions]
                SET [SystemDeletedAt] = GETUTCDATE()
                WHERE [SystemId] = @PermissionId
            `, [permissionId]);
        } else {
            await this.connection.query(`
                DELETE FROM [Permissions]
                WHERE [SystemId] = @PermissionId
            `, [permissionId]);
        }
    }
    
    async getPermission(permissionId: string): Promise<PermissionDefinition | null> {
        const result = await this.connection.query(`
            SELECT * FROM [Permissions]
            WHERE [SystemId] = @PermissionId AND [SystemDeletedAt] IS NULL
        `, [permissionId]);
        
        if (result.recordset.length === 0) {
            return null;
        }
        
        const row = result.recordset[0];
        return {
            id: row.SystemId,
            objectId: row.ObjectId,
            objectType: row.ObjectType,
            permissionType: row.PermissionType,
            fields: row.Fields ? JSON.parse(row.Fields) : undefined,
            conditions: row.Conditions ? JSON.parse(row.Conditions) : undefined,
            priority: row.Priority
        };
    }
    
    async getPermissions(
        objectType?: string,
        objectId?: number
    ): Promise<PermissionDefinition[]> {
        let query = `
            SELECT * FROM [Permissions]
            WHERE [SystemDeletedAt] IS NULL
        `;
        
        const params: any[] = [];
        
        if (objectType) {
            query += ` AND [ObjectType] = @ObjectType`;
            params.push(objectType);
        }
        
        if (objectId !== undefined) {
            query += ` AND [ObjectId] = @ObjectId`;
            params.push(objectId);
        }
        
        query += ` ORDER BY [Priority] DESC, [SystemCreatedAt] DESC`;
        
        const result = await this.connection.query(query, params);
        
        return result.recordset.map(row => ({
            id: row.SystemId,
            objectId: row.ObjectId,
            objectType: row.ObjectType,
            permissionType: row.PermissionType,
            fields: row.Fields ? JSON.parse(row.Fields) : undefined,
            conditions: row.Conditions ? JSON.parse(row.Conditions) : undefined,
            priority: row.Priority
        }));
    }
    
    // ============ Permission Assignment ============
    
    async assignPermission(
        principalId: string,
        principalType: 'user' | 'role' | 'group',
        permissionId: string,
        grantedBy?: string,
        expiresAt?: Date
    ): Promise<string> {
        const systemId = `assign_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        await this.connection.query(`
            INSERT INTO [PermissionAssignments] (
                [SystemId], [PrincipalId], [PrincipalType], [PermissionId],
                [Granted], [GrantedBy], [ExpiresAt]
            ) VALUES (
                @SystemId, @PrincipalId, @PrincipalType, @PermissionId,
                1, @GrantedBy, @ExpiresAt
            )
        `, [
            systemId,
            principalId,
            principalType,
            permissionId,
            grantedBy || null,
            expiresAt || null
        ]);
        
        return systemId;
    }
    
    async revokePermission(assignmentId: string): Promise<void> {
        await this.connection.query(`
            UPDATE [PermissionAssignments]
            SET [Granted] = 0
            WHERE [SystemId] = @AssignmentId
        `, [assignmentId]);
    }
    
    async getPrincipalPermissions(
        principalId: string,
        principalType: 'user' | 'role' | 'group'
    ): Promise<PermissionDefinition[]> {
        const result = await this.connection.query(`
            SELECT p.* FROM [Permissions] p
            INNER JOIN [PermissionAssignments] pa
                ON p.[SystemId] = pa.[PermissionId]
            WHERE pa.[PrincipalId] = @PrincipalId
                AND pa.[PrincipalType] = @PrincipalType
                AND pa.[Granted] = 1
                AND (pa.[ExpiresAt] IS NULL OR pa.[ExpiresAt] > GETUTCDATE())
                AND p.[SystemDeletedAt] IS NULL
            ORDER BY p.[Priority] DESC
        `, [principalId, principalType]);
        
        return result.recordset.map(row => ({
            id: row.SystemId,
            objectId: row.ObjectId,
            objectType: row.ObjectType,
            permissionType: row.PermissionType,
            fields: row.Fields ? JSON.parse(row.Fields) : undefined,
            conditions: row.Conditions ? JSON.parse(row.Conditions) : undefined,
            priority: row.Priority
        }));
    }
    
    async hasPermission(
        principalId: string,
        principalType: 'user' | 'role' | 'group',
        objectType: string,
        objectId: number,
        permissionType: PermissionType,
        fieldId?: number,
        context?: Record<string, any>
    ): Promise<boolean> {
        const permissions = await this.getPrincipalPermissions(principalId, principalType);
        
        // Filter relevant permissions
        const relevantPermissions = permissions.filter(p => 
            (p.objectId === -1 || p.objectId === objectId) &&
            p.objectType === objectType &&
            (p.permissionType === permissionType || p.permissionType === PermissionType.All) &&
            (!fieldId || !p.fields || p.fields.length === 0 || p.fields.includes(fieldId))
        );
        
        if (relevantPermissions.length === 0) {
            return false;
        }
        
        // Check conditions
        for (const permission of relevantPermissions) {
            if (!permission.conditions || permission.conditions.length === 0) {
                return true;
            }
            
            // Evaluate conditions
            const conditionsMet = permission.conditions.every(condition => 
                this.evaluateCondition(condition, context)
            );
            
            if (conditionsMet) {
                return true;
            }
        }
        
        return false;
    }
    
    private evaluateCondition(condition: PermissionCondition, context?: Record<string, any>): boolean {
        if (!context) {
            return false;
        }
        
        const value = context[condition.field];
        
        switch (condition.operator) {
            case 'eq':
                return value === condition.value;
            case 'neq':
                return value !== condition.value;
            case 'gt':
                return value > condition.value;
            case 'gte':
                return value >= condition.value;
            case 'lt':
                return value < condition.value;
            case 'lte':
                return value <= condition.value;
            case 'in':
                return Array.isArray(condition.value) && condition.value.includes(value);
            case 'contains':
                return typeof value === 'string' && 
                       typeof condition.value === 'string' && 
                       value.includes(condition.value);
            default:
                return false;
        }
    }
    
    // ============ Permission Set Generation ============
    
    async buildPermissionSet(user: User): Promise<PermissionSet> {
        const permissionSet = new PermissionSet();
        
        // Get user's direct permissions
        const userPermissions = await this.getPrincipalPermissions(user.id, 'user');
        this.addPermissionsToSet(permissionSet, userPermissions);
        
        // Get role-based permissions
        for (const roleId of user.roles) {
            const rolePermissions = await this.getPrincipalPermissions(roleId, 'role');
            this.addPermissionsToSet(permissionSet, rolePermissions);
        }
        
        return permissionSet;
    }
    
    private addPermissionsToSet(permissionSet: PermissionSet, permissions: PermissionDefinition[]): void {
        for (const perm of permissions) {
            const objectPerm = new ObjectPermission(perm.objectId, [perm.permissionType]);
            permissionSet.addObjectPermission(perm.objectId, objectPerm);
            
            if (perm.fields && perm.fields.length > 0) {
                for (const fieldId of perm.fields) {
                    const fieldPerm = new FieldPermission(perm.objectId, fieldId, [perm.permissionType]);
                    permissionSet.addFieldPermission(perm.objectId, fieldId, fieldPerm);
                }
            }
        }
    }
}