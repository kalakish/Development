import { User } from '@nova/core/session';
import { SQLServerConnection } from '@nova/core/database/sqlserver-connection';

export interface Policy {
    id: string;
    name: string;
    description?: string;
    effect: 'allow' | 'deny';
    actions: string[];
    resources: string[];
    conditions?: PolicyCondition[];
    priority: number;
    version: number;
}

export interface PolicyCondition {
    type: 'string' | 'number' | 'boolean' | 'date' | 'array';
    field: string;
    operator: PolicyOperator;
    value: any;
}

export type PolicyOperator =
    | 'eq'
    | 'neq'
    | 'gt'
    | 'gte'
    | 'lt'
    | 'lte'
    | 'in'
    | 'nin'
    | 'contains'
    | 'startswith'
    | 'endswith'
    | 'regex'
    | 'exists'
    | '!exists';

export interface PolicyEvaluationContext {
    user: User;
    action: string;
    resource: string;
    resourceId?: string;
    attributes?: Record<string, any>;
    timestamp: Date;
}

export interface PolicyEvaluationResult {
    allowed: boolean;
    policy?: Policy;
    reason?: string;
    obligations?: any[];
    advice?: any[];
}

export class PolicyEngine {
    private connection: SQLServerConnection;
    private policies: Map<string, Policy> = new Map();
    
    constructor(connection: SQLServerConnection) {
        this.connection = connection;
    }
    
    async initialize(): Promise<void> {
        await this.ensurePolicyTables();
        await this.loadPolicies();
    }
    
    private async ensurePolicyTables(): Promise<void> {
        await this.connection.query(`
            IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Policies')
            BEGIN
                CREATE TABLE [Policies] (
                    [Id] INT IDENTITY(1,1) NOT NULL,
                    [SystemId] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [DF_Policies_SystemId] DEFAULT NEWID(),
                    [Name] NVARCHAR(255) NOT NULL,
                    [Description] NVARCHAR(500) NULL,
                    [Effect] NVARCHAR(10) NOT NULL,
                    [Actions] NVARCHAR(MAX) NOT NULL,
                    [Resources] NVARCHAR(MAX) NOT NULL,
                    [Conditions] NVARCHAR(MAX) NULL,
                    [Priority] INT NOT NULL CONSTRAINT [DF_Policies_Priority] DEFAULT 0,
                    [Version] INT NOT NULL CONSTRAINT [DF_Policies_Version] DEFAULT 1,
                    [Enabled] BIT NOT NULL CONSTRAINT [DF_Policies_Enabled] DEFAULT 1,
                    [SystemCreatedAt] DATETIME2 NOT NULL CONSTRAINT [DF_Policies_CreatedAt] DEFAULT GETUTCDATE(),
                    [SystemModifiedAt] DATETIME2 NULL,
                    [SystemDeletedAt] DATETIME2 NULL,
                    CONSTRAINT [PK_Policies] PRIMARY KEY CLUSTERED ([Id])
                );
                
                CREATE UNIQUE INDEX [UX_Policies_SystemId] ON [Policies] ([SystemId]);
                CREATE INDEX [IX_Policies_Effect] ON [Policies] ([Effect]);
                CREATE INDEX [IX_Policies_Priority] ON [Policies] ([Priority]);
                
                PRINT '✅ Created Policies table';
            END
        `);
    }
    
    private async loadPolicies(): Promise<void> {
        const result = await this.connection.query(`
            SELECT * FROM [Policies]
            WHERE [Enabled] = 1 AND [SystemDeletedAt] IS NULL
            ORDER BY [Priority] DESC, [SystemCreatedAt] ASC
        `);
        
        this.policies.clear();
        
        for (const row of result.recordset) {
            this.policies.set(row.SystemId, {
                id: row.SystemId,
                name: row.Name,
                description: row.Description,
                effect: row.Effect,
                actions: JSON.parse(row.Actions),
                resources: JSON.parse(row.Resources),
                conditions: row.Conditions ? JSON.parse(row.Conditions) : undefined,
                priority: row.Priority,
                version: row.Version
            });
        }
    }
    
    // ============ Policy Management ============
    
    async createPolicy(policy: Omit<Policy, 'id' | 'version'>): Promise<string> {
        const systemId = `pol_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        await this.connection.query(`
            INSERT INTO [Policies] (
                [SystemId], [Name], [Description], [Effect],
                [Actions], [Resources], [Conditions], [Priority], [Version]
            ) VALUES (
                @SystemId, @Name, @Description, @Effect,
                @Actions, @Resources, @Conditions, @Priority, 1
            )
        `, [
            systemId,
            policy.name,
            policy.description || null,
            policy.effect,
            JSON.stringify(policy.actions),
            JSON.stringify(policy.resources),
            policy.conditions ? JSON.stringify(policy.conditions) : null,
            policy.priority || 0
        ]);
        
        await this.loadPolicies();
        
        return systemId;
    }
    
    async updatePolicy(policyId: string, updates: Partial<Policy>): Promise<void> {
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
        
        if (updates.effect !== undefined) {
            sets.push('[Effect] = @Effect');
            params.push(updates.effect);
        }
        
        if (updates.actions !== undefined) {
            sets.push('[Actions] = @Actions');
            params.push(JSON.stringify(updates.actions));
        }
        
        if (updates.resources !== undefined) {
            sets.push('[Resources] = @Resources');
            params.push(JSON.stringify(updates.resources));
        }
        
        if (updates.conditions !== undefined) {
            sets.push('[Conditions] = @Conditions');
            params.push(JSON.stringify(updates.conditions));
        }
        
        if (updates.priority !== undefined) {
            sets.push('[Priority] = @Priority');
            params.push(updates.priority);
        }
        
        sets.push('[Version] = [Version] + 1');
        sets.push('[SystemModifiedAt] = GETUTCDATE()');
        
        params.push(policyId);
        
        await this.connection.query(`
            UPDATE [Policies]
            SET ${sets.join(', ')}
            WHERE [SystemId] = @PolicyId AND [SystemDeletedAt] IS NULL
        `, params);
        
        await this.loadPolicies();
    }
    
    async deletePolicy(policyId: string): Promise<void> {
        await this.connection.query(`
            UPDATE [Policies]
            SET [SystemDeletedAt] = GETUTCDATE()
            WHERE [SystemId] = @PolicyId
        `, [policyId]);
        
        this.policies.delete(policyId);
    }
    
    async enablePolicy(policyId: string): Promise<void> {
        await this.connection.query(`
            UPDATE [Policies]
            SET [Enabled] = 1
            WHERE [SystemId] = @PolicyId
        `, [policyId]);
        
        await this.loadPolicies();
    }
    
    async disablePolicy(policyId: string): Promise<void> {
        await this.connection.query(`
            UPDATE [Policies]
            SET [Enabled] = 0
            WHERE [SystemId] = @PolicyId
        `, [policyId]);
        
        this.policies.delete(policyId);
    }
    
    // ============ Policy Evaluation ============
    
    async evaluate(context: PolicyEvaluationContext): Promise<PolicyEvaluationResult> {
        const applicablePolicies = Array.from(this.policies.values())
            .filter(policy => this.isPolicyApplicable(policy, context))
            .sort((a, b) => b.priority - a.priority);
        
        // Deny takes precedence
        const denyPolicies = applicablePolicies.filter(p => p.effect === 'deny');
        
        for (const policy of denyPolicies) {
            if (await this.evaluateConditions(policy, context)) {
                return {
                    allowed: false,
                    policy,
                    reason: `Denied by policy: ${policy.name}`,
                    obligations: this.getObligations(policy, context),
                    advice: this.getAdvice(policy, context)
                };
            }
        }
        
        // Then allow policies
        const allowPolicies = applicablePolicies.filter(p => p.effect === 'allow');
        
        for (const policy of allowPolicies) {
            if (await this.evaluateConditions(policy, context)) {
                return {
                    allowed: true,
                    policy,
                    reason: `Allowed by policy: ${policy.name}`,
                    obligations: this.getObligations(policy, context),
                    advice: this.getAdvice(policy, context)
                };
            }
        }
        
        // Default deny
        return {
            allowed: false,
            reason: 'No applicable policy found - default deny'
        };
    }
    
    async evaluateBulk(contexts: PolicyEvaluationContext[]): Promise<PolicyEvaluationResult[]> {
        return Promise.all(contexts.map(context => this.evaluate(context)));
    }
    
    private isPolicyApplicable(policy: Policy, context: PolicyEvaluationContext): boolean {
        // Check action
        const actionMatch = policy.actions.some(action => 
            this.matchPattern(action, context.action)
        );
        
        if (!actionMatch) {
            return false;
        }
        
        // Check resource
        const resourceMatch = policy.resources.some(resource => {
            if (resource.includes(':')) {
                const [resourceType, resourceId] = resource.split(':');
                return this.matchPattern(resourceType, context.resource) &&
                       (!context.resourceId || this.matchPattern(resourceId, context.resourceId));
            }
            return this.matchPattern(resource, context.resource);
        });
        
        if (!resourceMatch) {
            return false;
        }
        
        return true;
    }
    
    private async evaluateConditions(policy: Policy, context: PolicyEvaluationContext): Promise<boolean> {
        if (!policy.conditions || policy.conditions.length === 0) {
            return true;
        }
        
        return policy.conditions.every(condition => 
            this.evaluateCondition(condition, context)
        );
    }
    
    private evaluateCondition(condition: PolicyCondition, context: PolicyEvaluationContext): boolean {
        const value = this.getAttributeValue(context, condition.field);
        
        switch (condition.operator) {
            case 'eq':
                return this.compareEq(value, condition.value);
            case 'neq':
                return !this.compareEq(value, condition.value);
            case 'gt':
                return this.compareGt(value, condition.value);
            case 'gte':
                return this.compareGte(value, condition.value);
            case 'lt':
                return this.compareLt(value, condition.value);
            case 'lte':
                return this.compareLte(value, condition.value);
            case 'in':
                return Array.isArray(condition.value) && condition.value.includes(value);
            case 'nin':
                return !Array.isArray(condition.value) || !condition.value.includes(value);
            case 'contains':
                return typeof value === 'string' && value.includes(condition.value);
            case 'startswith':
                return typeof value === 'string' && value.startsWith(condition.value);
            case 'endswith':
                return typeof value === 'string' && value.endsWith(condition.value);
            case 'regex':
                return typeof value === 'string' && new RegExp(condition.value).test(value);
            case 'exists':
                return value !== undefined && value !== null;
            case '!exists':
                return value === undefined || value === null;
            default:
                return false;
        }
    }
    
    private getAttributeValue(context: PolicyEvaluationContext, field: string): any {
        const parts = field.split('.');
        let value: any = context;
        
        for (const part of parts) {
            if (value === null || value === undefined) {
                return undefined;
            }
            value = value[part];
        }
        
        return value;
    }
    
    private compareEq(a: any, b: any): boolean {
        if (a === null || a === undefined) return b === null || b === undefined;
        if (typeof a === 'string' && typeof b === 'string') {
            return a.toLowerCase() === b.toLowerCase();
        }
        return a === b;
    }
    
    private compareGt(a: any, b: any): boolean {
        if (a === null || a === undefined) return false;
        if (typeof a === 'string' && typeof b === 'string') return a > b;
        if (typeof a === 'number' && typeof b === 'number') return a > b;
        if (a instanceof Date && b instanceof Date) return a.getTime() > b.getTime();
        return false;
    }
    
    private compareGte(a: any, b: any): boolean {
        return this.compareEq(a, b) || this.compareGt(a, b);
    }
    
    private compareLt(a: any, b: any): boolean {
        if (a === null || a === undefined) return false;
        if (typeof a === 'string' && typeof b === 'string') return a < b;
        if (typeof a === 'number' && typeof b === 'number') return a < b;
        if (a instanceof Date && b instanceof Date) return a.getTime() < b.getTime();
        return false;
    }
    
    private compareLte(a: any, b: any): boolean {
        return this.compareEq(a, b) || this.compareLt(a, b);
    }
    
    private matchPattern(pattern: string, value: string): boolean {
        if (pattern === '*' || pattern === value) {
            return true;
        }
        
        // Convert wildcard pattern to regex
        const regexPattern = pattern
            .replace(/\./g, '\\.')
            .replace(/\*/g, '.*')
            .replace(/\?/g, '.');
        
        return new RegExp(`^${regexPattern}$`).test(value);
    }
    
    private getObligations(policy: Policy, context: PolicyEvaluationContext): any[] {
        // Override in derived classes to add policy obligations
        return [];
    }
    
    private getAdvice(policy: Policy, context: PolicyEvaluationContext): any[] {
        // Override in derived classes to add policy advice
        return [];
    }
    
    // ============ Policy Testing ============
    
    async simulate(policy: Policy, contexts: PolicyEvaluationContext[]): Promise<PolicySimulationResult> {
        const results: PolicyEvaluationResult[] = [];
        
        for (const context of contexts) {
            const result = await this.evaluate(context);
            results.push(result);
        }
        
        const allowedCount = results.filter(r => r.allowed).length;
        
        return {
            policy,
            contextsEvaluated: contexts.length,
            allowed: allowedCount,
            denied: contexts.length - allowedCount,
            results
        };
    }
    
    // ============ Policy Validation ============
    
    async validatePolicy(policy: Policy): Promise<ValidationResult> {
        const errors: string[] = [];
        const warnings: string[] = [];
        
        if (!policy.name) {
            errors.push('Policy name is required');
        }
        
        if (!policy.effect || !['allow', 'deny'].includes(policy.effect)) {
            errors.push('Policy effect must be either "allow" or "deny"');
        }
        
        if (!policy.actions || policy.actions.length === 0) {
            errors.push('Policy must specify at least one action');
        }
        
        if (!policy.resources || policy.resources.length === 0) {
            errors.push('Policy must specify at least one resource');
        }
        
        // Check for conflicting policies
        const conflictingPolicies = Array.from(this.policies.values())
            .filter(p => 
                p.id !== policy.id &&
                p.effect !== policy.effect &&
                p.priority === policy.priority &&
                this.policiesConflict(p, policy)
            );
        
        if (conflictingPolicies.length > 0) {
            warnings.push(`Policy may conflict with existing policies: ${conflictingPolicies.map(p => p.name).join(', ')}`);
        }
        
        return {
            valid: errors.length === 0,
            errors,
            warnings
        };
    }
    
    private policiesConflict(p1: Policy, p2: Policy): boolean {
        // Check if policies have overlapping actions and resources
        const actionOverlap = p1.actions.some(a1 => 
            p2.actions.some(a2 => this.matchPattern(a1, a2) || this.matchPattern(a2, a1))
        );
        
        const resourceOverlap = p1.resources.some(r1 => 
            p2.resources.some(r2 => this.matchPattern(r1, r2) || this.matchPattern(r2, r1))
        );
        
        return actionOverlap && resourceOverlap;
    }
}

export interface ValidationResult {
    valid: boolean;
    errors: string[];
    warnings: string[];
}

export interface PolicySimulationResult {
    policy: Policy;
    contextsEvaluated: number;
    allowed: number;
    denied: number;
    results: PolicyEvaluationResult[];
}