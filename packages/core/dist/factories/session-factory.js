"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SessionFactory = void 0;
class SessionFactory {
    application;
    constructor(application) {
        this.application = application;
    }
    async createSession(user, companyId, tenantId) {
        return this.application.createSession(user, companyId, tenantId);
    }
    async createSystemSession() {
        const systemUser = {
            id: 'system',
            username: 'system',
            displayName: 'System',
            email: 'system@nova.local',
            roles: ['super'],
            isSuperAdmin: true
        };
        return this.createSession(systemUser);
    }
    async createAnonymousSession() {
        const anonymousUser = {
            id: 'anonymous',
            username: 'anonymous',
            displayName: 'Anonymous',
            email: 'anonymous@nova.local',
            roles: ['guest'],
            isSuperAdmin: false
        };
        return this.createSession(anonymousUser);
    }
    async createUserSession(username, password, companyId, tenantId) {
        // Authenticate user
        const user = await this.application.getSecurityManager()
            .authenticate({ username, password });
        return this.createSession(user, companyId, tenantId);
    }
    async createImpersonatedSession(adminUser, targetUserId, companyId, tenantId) {
        // Verify admin has impersonation permission
        const hasPermission = await this.application.getSecurityManager()
            .checkPermission(adminUser, 'impersonate', { type: 'user', id: targetUserId });
        if (!hasPermission) {
            throw new Error('User does not have permission to impersonate');
        }
        // Get target user
        // This would load from database
        const targetUser = {
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
    async createTenantSession(tenant, user) {
        return this.createSession(user, undefined, tenant.id);
    }
    async createCompanySession(company, user) {
        return this.createSession(user, company.id);
    }
}
exports.SessionFactory = SessionFactory;
//# sourceMappingURL=session-factory.js.map