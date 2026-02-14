import { NovaApplication, User } from '../application';
import { Session } from '../session';
import { Company } from '../company';
import { Tenant } from '../tenant';
export declare class SessionFactory {
    private application;
    constructor(application: NovaApplication);
    createSession(user: User, companyId?: string, tenantId?: string): Promise<Session>;
    createSystemSession(): Promise<Session>;
    createAnonymousSession(): Promise<Session>;
    createUserSession(username: string, password: string, companyId?: string, tenantId?: string): Promise<Session>;
    createImpersonatedSession(adminUser: User, targetUserId: string, companyId?: string, tenantId?: string): Promise<Session>;
    createTenantSession(tenant: Tenant, user: User): Promise<Session>;
    createCompanySession(company: Company, user: User): Promise<Session>;
}
//# sourceMappingURL=session-factory.d.ts.map