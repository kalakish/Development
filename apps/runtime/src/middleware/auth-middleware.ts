import { Request, Response, NextFunction } from 'express';
import { SecurityManager } from '@nova/security';
import { NovaApplication } from '@nova/core';

declare global {
    namespace Express {
        interface Request {
            user?: any;
            session?: any;
            company?: any;
            tenant?: any;
        }
    }
}

export class AuthMiddleware {
    private securityManager: SecurityManager;
    private app: NovaApplication;

    constructor(app: NovaApplication) {
        this.app = app;
        this.securityManager = SecurityManager.getInstance();
    }

    authenticate = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const token = this.extractToken(req);
            
            if (!token) {
                return res.status(401).json({
                    error: 'No authentication token provided',
                    code: 'UNAUTHORIZED'
                });
            }

            const user = await this.securityManager.validateToken(token);
            
            if (!user) {
                return res.status(401).json({
                    error: 'Invalid or expired token',
                    code: 'INVALID_TOKEN'
                });
            }

            req.user = user;
            
            // Create session
            const session = await this.app.createSession(user);
            req.session = session;

            next();
        } catch (error) {
            return res.status(401).json({
                error: 'Authentication failed',
                details: error.message,
                code: 'AUTH_FAILED'
            });
        }
    };

    authorize = (permissions: string | string[]) => {
        return async (req: Request, res: Response, next: NextFunction) => {
            try {
                if (!req.user) {
                    return res.status(401).json({
                        error: 'User not authenticated',
                        code: 'UNAUTHENTICATED'
                    });
                }

                const requiredPermissions = Array.isArray(permissions) ? permissions : [permissions];
                const hasPermission = await this.securityManager.checkPermission(
                    req.user,
                    requiredPermissions,
                    {
                        companyId: req.company?.id,
                        tenantId: req.tenant?.id
                    }
                );

                if (!hasPermission) {
                    return res.status(403).json({
                        error: 'Insufficient permissions',
                        required: requiredPermissions,
                        code: 'FORBIDDEN'
                    });
                }

                next();
            } catch (error) {
                return res.status(403).json({
                    error: 'Authorization failed',
                    details: error.message,
                    code: 'AUTHZ_FAILED'
                });
            }
        };
    };

    optional = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const token = this.extractToken(req);
            
            if (token) {
                const user = await this.securityManager.validateToken(token);
                if (user) {
                    req.user = user;
                    const session = await this.app.createSession(user);
                    req.session = session;
                }
            }
            
            next();
        } catch (error) {
            // Continue even if auth fails
            next();
        }
    };

    requireCompany = async (req: Request, res: Response, next: NextFunction) => {
        const companyId = req.headers['x-company-id'] as string;
        
        if (!companyId) {
            return res.status(400).json({
                error: 'Company ID is required',
                code: 'COMPANY_REQUIRED'
            });
        }

        const company = await this.app.getCompany(companyId);
        
        if (!company) {
            return res.status(404).json({
                error: 'Company not found',
                code: 'COMPANY_NOT_FOUND'
            });
        }

        req.company = company;
        next();
    };

    requireTenant = async (req: Request, res: Response, next: NextFunction) => {
        const tenantId = req.headers['x-tenant-id'] as string;
        
        if (!tenantId) {
            return res.status(400).json({
                error: 'Tenant ID is required',
                code: 'TENANT_REQUIRED'
            });
        }

        const tenant = await this.app.getTenant(tenantId);
        
        if (!tenant) {
            return res.status(404).json({
                error: 'Tenant not found',
                code: 'TENANT_NOT_FOUND'
            });
        }

        req.tenant = tenant;
        next();
    };

    private extractToken(req: Request): string | null {
        const authHeader = req.headers.authorization;
        
        if (authHeader && authHeader.startsWith('Bearer ')) {
            return authHeader.substring(7);
        }
        
        if (req.query?.token) {
            return req.query.token as string;
        }
        
        if (req.cookies?.token) {
            return req.cookies.token;
        }
        
        return null;
    }
}

export const createAuthMiddleware = (app: NovaApplication) => {
    const middleware = new AuthMiddleware(app);
    return {
        authenticate: middleware.authenticate,
        authorize: middleware.authorize,
        optional: middleware.optional,
        requireCompany: middleware.requireCompany,
        requireTenant: middleware.requireTenant
    };
};