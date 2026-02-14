import cors from 'cors';

export const corsMiddleware = (options?: cors.CorsOptions) => {
    return cors({
        origin: options?.origin || '*',
        methods: options?.methods || ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
        allowedHeaders: options?.allowedHeaders || ['Content-Type', 'Authorization'],
        credentials: options?.credentials || true,
        maxAge: options?.maxAge || 86400
    });
};