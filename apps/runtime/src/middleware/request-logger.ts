import { Request, Response, NextFunction } from 'express';
import { Logger } from '@nova/core/utils/logger';
import { v4 as uuidv4 } from 'uuid';

export class RequestLoggerMiddleware {
    private logger: Logger;
    private slowRequestThreshold: number = 1000; // 1 second

    constructor() {
        this.logger = new Logger('HTTP');
    }

    log = (req: Request, res: Response, next: NextFunction) => {
        const startTime = Date.now();
        const requestId = uuidv4();
        const correlationId = req.headers['x-correlation-id'] as string || requestId;

        // Attach IDs to request
        req.id = requestId;
        (req as any).correlationId = correlationId;

        // Set response headers
        res.setHeader('x-request-id', requestId);
        res.setHeader('x-correlation-id', correlationId);

        // Log request
        this.logRequest(req, requestId, correlationId);

        // Capture response
        const originalSend = res.json;
        const originalEnd = res.end;
        let responseBody: any;

        res.json = function(body: any) {
            responseBody = body;
            return originalSend.call(this, body);
        };

        // Log response when finished
        res.on('finish', () => {
            const duration = Date.now() - startTime;
            this.logResponse(req, res, responseBody, duration, requestId, correlationId);
        });

        next();
    };

    private logRequest(req: Request, requestId: string, correlationId: string) {
        const logData = {
            requestId,
            correlationId,
            method: req.method,
            url: req.originalUrl || req.url,
            path: req.path,
            query: req.query,
            params: req.params,
            headers: this.sanitizeHeaders(req.headers),
            ip: req.ip,
            userAgent: req.get('user-agent'),
            referer: req.get('referer'),
            userId: (req as any).user?.id,
            sessionId: (req as any).session?.id
        };

        // Don't log body for file uploads
        if (!req.is('multipart/form-data')) {
            (logData as any).body = this.sanitizeBody(req.body);
        }

        this.logger.info(`→ ${req.method} ${req.path}`, logData);
    }

    private logResponse(
        req: Request,
        res: Response,
        responseBody: any,
        duration: number,
        requestId: string,
        correlationId: string
    ) {
        const logData = {
            requestId,
            correlationId,
            method: req.method,
            url: req.originalUrl || req.url,
            statusCode: res.statusCode,
            duration: `${duration}ms`,
            contentLength: res.get('content-length'),
            userId: (req as any).user?.id,
            sessionId: (req as any).session?.id
        };

        const isSlow = duration > this.slowRequestThreshold;
        const isError = res.statusCode >= 400;

        if (isError) {
            if (res.statusCode >= 500) {
                this.logger.error(`← ${req.method} ${req.path} ${res.statusCode} ${duration}ms`, logData);
            } else {
                this.logger.warn(`← ${req.method} ${req.path} ${res.statusCode} ${duration}ms`, logData);
            }
        } else if (isSlow) {
            this.logger.warn(`← ${req.method} ${req.path} ${res.statusCode} ${duration}ms (SLOW)`, logData);
        } else {
            this.logger.info(`← ${req.method} ${req.path} ${res.statusCode} ${duration}ms`, logData);
        }

        // Log response body for errors
        if (isError && responseBody && process.env.NODE_ENV !== 'production') {
            this.logger.debug('Response body', { body: responseBody });
        }
    }

    private sanitizeHeaders(headers: any): any {
        const sanitized = { ...headers };
        const sensitiveHeaders = ['authorization', 'cookie', 'set-cookie', 'x-api-key'];
        
        sensitiveHeaders.forEach(header => {
            if (sanitized[header]) {
                sanitized[header] = '[REDACTED]';
            }
        });
        
        return sanitized;
    }

    private sanitizeBody(body: any): any {
        if (!body) return body;
        
        const sanitized = { ...body };
        const sensitiveFields = ['password', 'passwordConfirm', 'currentPassword', 'newPassword', 'token', 'secret', 'apiKey'];
        
        sensitiveFields.forEach(field => {
            if (sanitized[field]) {
                sanitized[field] = '[REDACTED]';
            }
        });
        
        return sanitized;
    }
}

export const createRequestLogger = () => {
    const middleware = new RequestLoggerMiddleware();
    return middleware.log;
};