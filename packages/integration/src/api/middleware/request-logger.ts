import { Logger } from '@nova/core/utils/logger';

const logger = new Logger('HTTP');

export const requestLoggerMiddleware = () => {
    return (req: any, res: any, next: any) => {
        const start = Date.now();

        res.on('finish', () => {
            const duration = Date.now() - start;
            const message = `${req.method} ${req.originalUrl} ${res.statusCode} - ${duration}ms`;

            if (res.statusCode >= 500) {
                logger.error(message);
            } else if (res.statusCode >= 400) {
                logger.warn(message);
            } else {
                logger.info(message);
            }
        });

        next();
    };
};