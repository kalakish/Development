import { NovaApplication, User } from '../application';
import { Session } from '../session';
import { Company } from '../company';
import { Tenant } from '../tenant';

export class SessionFactory {
    private application: NovaApplication;

    constructor(application: NovaApplication) {
        this.application = application;
    }

    async createSession(
        user: User,
        companyId?: string,
        tenantId?: string
    ): Promise<Session> {
        return this.application.createSession(user, companyId, tenantId);
    }

    async createSystemSession(): Promise<Session> {
        const systemUser: User = {
            id: 'system',
            username: 'system',
            displayName: 'System',
            email: 'system@nova.local',
            roles: ['super'],
            isSuperAdmin: true
        };

        return this.createSession(systemUser);
    }

    async createAnonymousSession(): Promise<Session> {
        const anonymousUser: User = {
            id: 'anonymous',
            username: 'anonymous',
            displayName: 'Anonymous',
            email: 'anonymous@nova.local',
            roles: ['guest'],
            isSuperAdmin: false
        };

        return this.createSession(anonymousUser);
    }

    async createUserSession(
        username: string,
        password: string,
        companyId?: string,
        tenantId?: string
    ): Promise<Session> {
        // Authenticate user
        const user = await this.application.getSecurityManager()
            .authenticate({ username, password });
        
        return this.createSession(user, companyId, tenantId);
    }

    async createImpersonatedSession(
        adminUser: User,
        targetUserId: string,
        companyId?: string,
        tenantId?: string
    ): Promise<Session> {
        // Verify admin has impersonation permission
        const hasPermission = await this.application.getSecurityManager()
            .checkPermission(adminUser, 'impersonate', { type: 'user', id: targetUserId });

        if (!hasPermission) {
            throw new Error('User does not have permission to impersonate');
        }

        // Get target user
        // This would load from database
        const targetUser: User = {
            id: targetUserId,
            username: `impersonated_${targetUserId}`,
            displayName: 'Impersonated User',
            email: 'impersonated@nova.local',
            roles: ['user'],
            isSuperAdmin: false,
            preferences: {
                impersonatedBy: adminUser.id,
                impersonatedAt: new Date()
            }
        };

        return this.createSession(targetUser, companyId, tenantId);
    }

    async createTenantSession(
        tenant: Tenant,
        user: User
    ): Promise<Session> {
        return this.createSession(user, undefined, tenant.id);
    }

    async createCompanySession(
        company: Company,
        user: User
    ): Promise<Session> {
        return this.createSession(user, company.id);
    }
}