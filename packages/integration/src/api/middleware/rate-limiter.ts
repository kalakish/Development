import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import Redis from 'ioredis';

export interface RateLimiterOptions {
    windowMs?: number;
    max?: number;
    message?: string;
    statusCode?: number;
    skipSuccessful?: boolean;
    skipFailed?: boolean;
    keyGenerator?: (req: any) => string;
    redis?: Redis;
}

export const rateLimiterMiddleware = (options: RateLimiterOptions = {}) => {
    const store = options.redis
        ? new RedisStore({
            client: options.redis,
            prefix: 'rl:'
        })
        : undefined;

    return rateLimit({
        windowMs: options.windowMs || 15 * 60 * 1000, // 15 minutes
        max: options.max || 100, // limit each IP to 100 requests per windowMs
        message: options.message || 'Too many requests, please try again later.',
        statusCode: options.statusCode || 429,
        skipSuccessfulRequests: options.skipSuccessful || false,
        skipFailedRequests: options.skipFailed || false,
        keyGenerator: options.keyGenerator || ((req) => req.ip),
        store
    });
};