import * as fs from 'fs-extra';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';

export enum LogLevel {
    DEBUG = 0,
    INFO = 1,
    SUCCESS = 2,
    WARN = 3,
    ERROR = 4,
    FATAL = 5
}

export class Logger {
    private context: string;
    private logLevel: LogLevel;
    private logToFile: boolean;
    private logPath?: string;
    private sessionId?: string;

    constructor(context: string, options?: LoggerOptions) {
        this.context = context;
        this.logLevel = options?.level ?? LogLevel.INFO;
        this.logToFile = options?.logToFile ?? false;
        this.logPath = options?.logPath;
        this.sessionId = options?.sessionId;
    }

    debug(message: string, ...args: any[]): void {
        this.log(LogLevel.DEBUG, 'DEBUG', message, args);
    }

    info(message: string, ...args: any[]): void {
        this.log(LogLevel.INFO, 'INFO', message, args);
    }

    success(message: string, ...args: any[]): void {
        this.log(LogLevel.SUCCESS, 'SUCCESS', message, args);
    }

    warn(message: string, ...args: any[]): void {
        this.log(LogLevel.WARN, 'WARN', message, args);
    }

    error(message: string, ...args: any[]): void {
        this.log(LogLevel.ERROR, 'ERROR', message, args);
    }

    fatal(message: string, ...args: any[]): void {
        this.log(LogLevel.FATAL, 'FATAL', message, args);
    }

    private log(level: LogLevel, levelName: string, message: string, args: any[]): void {
        if (level < this.logLevel) return;

        const timestamp = new Date().toISOString();
        const session = this.sessionId ? `[${this.sessionId}]` : '';
        const formattedMessage = this.formatMessage(message, args);
        
        const logEntry = `[${timestamp}] ${session}[${levelName}] [${this.context}] ${formattedMessage}`;

        // Console output with colors
        this.consoleLog(level, logEntry);

        // File output
        if (this.logToFile && this.logPath) {
            this.fileLog(logEntry).catch(error => {
                console.error('Failed to write log to file:', error);
            });
        }
    }

    private formatMessage(message: string, args: any[]): string {
        if (args.length === 0) return message;

        let formatted = message;
        args.forEach(arg => {
            if (typeof arg === 'object') {
                try {
                    formatted = formatted.replace('%o', JSON.stringify(arg, null, 2));
                } catch {
                    formatted = formatted.replace('%o', String(arg));
                }
            } else {
                formatted = formatted.replace('%s', String(arg));
                formatted = formatted.replace('%d', String(arg));
                formatted = formatted.replace('%j', JSON.stringify(arg));
            }
        });

        return formatted;
    }

    private consoleLog(level: LogLevel, message: string): void {
        const colors = {
            [LogLevel.DEBUG]: '\x1b[36m', // Cyan
            [LogLevel.INFO]: '\x1b[34m',  // Blue
            [LogLevel.SUCCESS]: '\x1b[32m', // Green
            [LogLevel.WARN]: '\x1b[33m',  // Yellow
            [LogLevel.ERROR]: '\x1b[31m', // Red
            [LogLevel.FATAL]: '\x1b[35m'  // Magenta
        };

        const reset = '\x1b[0m';
        const color = colors[level] || '\x1b[37m';

        switch (level) {
            case LogLevel.ERROR:
            case LogLevel.FATAL:
                console.error(`${color}${message}${reset}`);
                break;
            case LogLevel.WARN:
                console.warn(`${color}${message}${reset}`);
                break;
            default:
                console.log(`${color}${message}${reset}`);
        }
    }

    private async fileLog(message: string): Promise<void> {
        if (!this.logPath) return;

        const date = new Date().toISOString().split('T')[0];
        const logFile = path.join(this.logPath, `${date}.log`);

        await fs.ensureDir(this.logPath);
        await fs.appendFile(logFile, message + '\n');
    }

    createChild(context: string): Logger {
        return new Logger(`${this.context}:${context}`, {
            level: this.logLevel,
            logToFile: this.logToFile,
            logPath: this.logPath,
            sessionId: this.sessionId
        });
    }

    withSession(sessionId: string): Logger {
        return new Logger(this.context, {
            level: this.logLevel,
            logToFile: this.logToFile,
            logPath: this.logPath,
            sessionId
        });
    }

    static async cleanupLogs(logPath: string, retentionDays: number = 30): Promise<void> {
        if (!await fs.pathExists(logPath)) return;

        const files = await fs.readdir(logPath);
        const now = new Date();

        for (const file of files) {
            if (!file.endsWith('.log')) continue;

            const filePath = path.join(logPath, file);
            const stats = await fs.stat(filePath);
            const ageDays = (now.getTime() - stats.mtime.getTime()) / (1000 * 60 * 60 * 24);

            if (ageDays > retentionDays) {
                await fs.remove(filePath);
            }
        }
    }
}

export interface LoggerOptions {
    level?: LogLevel;
    logToFile?: boolean;
    logPath?: string;
    sessionId?: string;
}

export default Logger;