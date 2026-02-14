import { Request, Response, NextFunction } from 'express';
import { Logger } from '@nova/core/utils/logger';

export interface AppError extends Error {
    status?: number;
    code?: string;
    details?: any;
    isOperational?: boolean;
}

export class ErrorHandlerMiddleware {
    private logger: Logger;
    private isProduction: boolean;

    constructor() {
        this.logger = new Logger('ErrorHandler');
        this.isProduction = process.env.NODE_ENV === 'production';
    }

    handle = (err: AppError, req: Request, res: Response, next: NextFunction) => {
        const status = err.status || 500;
        const code = err.code || 'INTERNAL_ERROR';
        
        // Log error
        this.logError(err, req);

        // Don't leak error details in production
        const message = this.isProduction && status === 500
            ? 'Internal server error'
            : err.message || 'An unexpected error occurred';

        const response: any = {
            error: message,
            code,
            timestamp: new Date().toISOString(),
            path: req.path
        };

        // Add stack trace in development
        if (!this.isProduction && err.stack) {
            response.stack = err.stack;
        }

        // Add validation details if available
        if (err.details) {
            response.details = err.details;
        }

        res.status(status).json(response);
    };

    notFound = (req: Request, res: Response, next: NextFunction) => {
        const err: AppError = new Error(`Cannot ${req.method} ${req.path}`);
        err.status = 404;
        err.code = 'NOT_FOUND';
        next(err);
    };

    private logError(err: AppError, req: Request) {
        const logData = {
            method: req.method,
            path: req.path,
            ip: req.ip,
            userId: (req as any).user?.id,
            sessionId: (req as any).session?.id,
            status: err.status || 500,
            code: err.code,
            message: err.message,
            stack: err.stack
        };

        if (err.status && err.status < 500) {
            this.logger.warn(`Client error: ${err.message}`, logData);
        } else {
            this.logger.error(`Server error: ${err.message}`, logData);
        }
    }
}

// Custom error classes
export class ValidationError extends Error implements AppError {
    status = 400;
    code = 'VALIDATION_ERROR';
    details: any;
    isOperational = true;

    constructor(message: string, details?: any) {
        super(message);
        this.name = 'ValidationError';
        this.details = details;
    }
}

export class AuthenticationError extends Error implements AppError {
    status = 401;
    code = 'AUTHENTICATION_ERROR';
    isOperational = true;

    constructor(message: string = 'Authentication failed') {
        super(message);
        this.name = 'AuthenticationError';
    }
}

export class AuthorizationError extends Error implements AppError {
    status = 403;
    code = 'AUTHORIZATION_ERROR';
    isOperational = true;

    constructor(message: string = 'Insufficient permissions') {
        super(message);
        this.name = 'AuthorizationError';
    }
}

export class NotFoundError extends Error implements AppError {
    status = 404;
    code = 'NOT_FOUND_ERROR';
    isOperational = true;

    constructor(resource: string) {
        super(`${resource} not found`);
        this.name = 'NotFoundError';
    }
}

export class ConflictError extends Error implements AppError {
    status = 409;
    code = 'CONFLICT_ERROR';
    isOperational = true;

    constructor(message: string) {
        super(message);
        this.name = 'ConflictError';
    }
}

export class BusinessError extends Error implements AppError {
    status = 422;
    code = 'BUSINESS_ERROR';
    isOperational = true;

    constructor(message: string) {
        super(message);
        this.name = 'BusinessError';
    }
}

export const createErrorHandler = () => {
    const handler = new ErrorHandlerMiddleware();
    return {
        handle: handler.handle,
        notFound: handler.notFound
    };
};