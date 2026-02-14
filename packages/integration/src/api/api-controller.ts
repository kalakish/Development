import { Router } from 'express';
import { APIRoute } from './api-route';
import { Session } from '@nova/core/session';

export abstract class APIController {
    protected router: Router;
    protected routes: APIRoute[] = [];

    constructor() {
        this.router = Router();
    }

    abstract getBasePath(): string;
    abstract initializeRoutes(): void;

    protected createRoute(
        method: 'get' | 'post' | 'put' | 'patch' | 'delete',
        path: string,
        handler: (req: any, res: any, next: any) => Promise<any>,
        options?: Partial<APIRoute>
    ): APIRoute {
        const route: APIRoute = {
            id: `${method}:${path}`,
            method,
            path,
            handler,
            controller: this.constructor.name,
            controllerInstance: this,
            middleware: options?.middleware || [],
            isPublic: options?.isPublic || false,
            summary: options?.summary,
            description: options?.description,
            tags: options?.tags,
            parameters: options?.parameters,
            requestBody: options?.requestBody,
            responses: options?.responses
        };

        this.routes.push(route);
        return route;
    }

    protected getSession(req: any): Session {
        return req.session;
    }

    protected getUser(req: any): any {
        return req.user;
    }

    protected isAuthenticated(req: any): boolean {
        return !!req.user;
    }

    getRoutes(): APIRoute[] {
        return [...this.routes];
    }

    getRouter(): Router {
        return this.router;
    }
}