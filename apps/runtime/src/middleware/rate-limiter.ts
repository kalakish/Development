import { Request, Response, NextFunction } from 'express';
import Redis from 'ioredis';
import { Logger } from '@nova/core/utils/logger';

export interface RateLimitOptions {
    windowMs: number;
    max: number;
    message?: string;
    statusCode?: number;
    keyGenerator?: (req: Request) => string;
    skip?: (req: Request) => boolean;
    skipFailedRequests?: boolean;
    skipSuccessfulRequests?: boolean;
}

export class RateLimiterMiddleware {
    private redis: Redis;
    private logger: Logger;
    private options: RateLimitOptions;

    constructor(redis: Redis, options?: Partial<RateLimitOptions>) {
        this.redis = redis;
        this.logger = new Logger('RateLimiter');
        
        this.options = {
            windowMs: 60000, // 1 minute
            max: 100, // 100 requests per window
            message: 'Too many requests, please try again later.',
            statusCode: 429,
            keyGenerator: this.defaultKeyGenerator,
            skip: () => false,
            skipFailedRequests: false,
            skipSuccessfulRequests: false,
            ...options
        };
    }

    limit = async (req: Request, res: Response, next: NextFunction) => {
        try {
            // Check if request should be skipped
            if (this.options.skip!(req)) {
                return next();
            }

            const key = this.options.keyGenerator!(req);
            const redisKey = `rate_limit:${key}`;

            // Get current count
            const current = await this.redis.get(redisKey);
            const currentCount = current ? parseInt(current, 10) : 0;

            // Check if over limit
            if (currentCount >= this.options.max) {
                const resetTime = await this.redis.ttl(redisKey);
                
                res.setHeader('X-RateLimit-Limit', this.options.max);
                res.setHeader('X-RateLimit-Remaining', 0);
                res.setHeader('X-RateLimit-Reset', resetTime);

                return res.status(this.options.statusCode!).json({
                    error: this.options.message,
                    code: 'RATE_LIMIT_EXCEEDED',
                    retryAfter: resetTime
                });
            }

            // Increment count
            if (currentCount === 0) {
                await this.redis.setex(redisKey, Math.ceil(this.options.windowMs / 1000), 1);
            } else {
                await this.redis.incr(redisKey);
            }

            // Get updated count
            const newCount = await this.redis.get(redisKey);
            
            // Set rate limit headers
            res.setHeader('X-RateLimit-Limit', this.options.max);
            res.setHeader('X-RateLimit-Remaining', Math.max(0, this.options.max - (parseInt(newCount!, 10) || 0)));
            res.setHeader('X-RateLimit-Reset', await this.redis.ttl(redisKey));

            // Track response for skip options
            const originalSend = res.json;
            const originalEnd = res.end;
            let responseStatus: number;

            res.json = function(body: any) {
                responseStatus = res.statusCode;
                return originalSend.call(this, body);
            };

            res.end = function(chunk?: any, encoding?: any, cb?: any) {
                if (!responseStatus) {
                    responseStatus = res.statusCode;
                }
                return originalEnd.call(this, chunk, encoding, cb);
            };

            // Decrement count if request failed/succeeded and skip options enabled
            res.on('finish', async () => {
                if (responseStatus >= 400 && this.options.skipFailedRequests) {
                    await this.redis.decr(redisKey);
                } else if (responseStatus < 400 && this.options.skipSuccessfulRequests) {
                    await this.redis.decr(redisKey);
                }
            });

            next();
        } catch (error) {
            this.logger.error('Rate limiter error:', error);
            // Fail open - allow request if rate limiter fails
            next();
        }
    };

    private defaultKeyGenerator = (req: Request): string => {
        // Use user ID if authenticated, otherwise use IP
        const userId = (req as any).user?.id;
        if (userId) {
            return `user:${userId}`;
        }
        
        const ip = req.ip || 
                   req.connection.remoteAddress || 
                   req.socket.remoteAddress ||
                   'unknown';
        
        return `ip:${ip}`;
    };

    // Create a new instance with custom options
    static create(options?: Partial<RateLimitOptions>) {
        return (redis: Redis) => {
            const limiter = new RateLimiterMiddleware(redis, options);
            return limiter.limit;
        };
    }
}

// Pre-configured limiters
export const createStrictLimiter = (redis: Redis) => {
    return new RateLimiterMiddleware(redis, {
        windowMs: 60000, // 1 minute
        max: 10, // 10 requests per minute
        message: 'Too many requests from this IP, please try again in a minute.'
    }).limit;
};

export const createDefaultLimiter = (redis: Redis) => {
    return new RateLimiterMiddleware(redis, {
        windowMs: 60000, // 1 minute
        max: 100 // 100 requests per minute
    }).limit;
};

export const createAuthLimiter = (redis: Redis) => {
    return new RateLimiterMiddleware(redis, {
        windowMs: 900000, // 15 minutes
        max: 5, // 5 requests per 15 minutes
        message: 'Too many authentication attempts, please try again later.',
        skipSuccessfulRequests: true // Don't count successful logins
    }).limit;
};

export const createAPILimiter = (redis: Redis) => {
    return new RateLimiterMiddleware(redis, {
        windowMs: 3600000, // 1 hour
        max: 1000, // 1000 requests per hour
        keyGenerator: (req) => {
            // Rate limit by API key
            const apiKey = req.headers['x-api-key'] as string;
            return apiKey ? `api:${apiKey}` : `ip:${req.ip}`;
        }
    }).limit;
};