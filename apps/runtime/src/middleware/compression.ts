import compression from 'compression';
import { Request, Response } from 'express';

export interface CompressionOptions {
    level?: number;
    threshold?: number;
    filter?: (req: Request, res: Response) => boolean;
    memLevel?: number;
    strategy?: number;
}

export class CompressionMiddleware {
    private options: CompressionOptions;

    constructor(options?: CompressionOptions) {
        this.options = {
            level: 6, // Default compression level
            threshold: 1024, // Compress responses > 1kb
            memLevel: 8, // Memory level
            strategy: 0, // Default strategy
            filter: this.defaultFilter,
            ...options
        };
    }

    compress = compression({
        level: this.options.level,
        threshold: this.options.threshold,
        memLevel: this.options.memLevel,
        strategy: this.options.strategy,
        filter: this.options.filter
    });

    private defaultFilter = (req: Request, res: Response): boolean => {
        // Don't compress responses with specific content types
        const contentType = res.getHeader('Content-Type') as string;
        
        if (contentType) {
            // Skip compression for images, videos, etc.
            const skipTypes = [
                'image/',
                'video/',
                'audio/',
                'application/pdf',
                'application/zip',
                'application/x-gzip'
            ];

            for (const type of skipTypes) {
                if (contentType.includes(type)) {
                    return false;
                }
            }
        }

        // Skip compression for small responses
        const contentLength = parseInt(res.getHeader('Content-Length') as string, 10);
        if (contentLength && contentLength < (this.options.threshold || 1024)) {
            return false;
        }

        // Use compression by default
        return true;
    };

    // Create middleware for dynamic compression based on Accept-Encoding
    static create(options?: CompressionOptions) {
        const instance = new CompressionMiddleware(options);
        return instance.compress;
    }
}

// Pre-configured compression strategies
export const createDefaultCompression = () => {
    return new CompressionMiddleware({
        level: 6,
        threshold: 1024,
        memLevel: 8,
        strategy: 0
    }).compress;
};

export const createHighCompression = () => {
    return new CompressionMiddleware({
        level: 9, // Maximum compression
        threshold: 512, // Compress even small responses
        memLevel: 9, // Maximum memory
        strategy: 0
    }).compress;
};

export const createFastCompression = () => {
    return new CompressionMiddleware({
        level: 1, // Fastest compression
        threshold: 2048, // Only compress larger responses
        memLevel: 1, // Minimum memory
        strategy: 0
    }).compress;
};

export const createNoCompression = () => {
    return new CompressionMiddleware({
        level: 0, // No compression
        threshold: 0,
        filter: () => false // Never compress
    }).compress;
};

// Dynamic compression based on file type
export const createSmartCompression = () => {
    return new CompressionMiddleware({
        level: 6,
        threshold: 1024,
        filter: (req: Request, res: Response) => {
            const contentType = res.getHeader('Content-Type') as string;
            
            // Compress text-based responses
            const compressTypes = [
                'text/',
                'application/json',
                'application/javascript',
                'application/xml',
                'application/xhtml+xml',
                'application/atom+xml',
                'application/rss+xml',
                'application/ld+json',
                'application/manifest+json',
                'font/ttf',
                'font/otf',
                'font/woff',
                'font/woff2',
                'image/svg+xml'
            ];

            for (const type of compressTypes) {
                if (contentType?.includes(type)) {
                    return true;
                }
            }

            return false;
        }
    }).compress;
};