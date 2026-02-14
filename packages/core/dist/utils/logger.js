"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Logger = exports.LogLevel = void 0;
const fs = __importStar(require("fs-extra"));
const path = __importStar(require("path"));
var LogLevel;
(function (LogLevel) {
    LogLevel[LogLevel["DEBUG"] = 0] = "DEBUG";
    LogLevel[LogLevel["INFO"] = 1] = "INFO";
    LogLevel[LogLevel["SUCCESS"] = 2] = "SUCCESS";
    LogLevel[LogLevel["WARN"] = 3] = "WARN";
    LogLevel[LogLevel["ERROR"] = 4] = "ERROR";
    LogLevel[LogLevel["FATAL"] = 5] = "FATAL";
})(LogLevel || (exports.LogLevel = LogLevel = {}));
class Logger {
    context;
    logLevel;
    logToFile;
    logPath;
    sessionId;
    constructor(context, options) {
        this.context = context;
        this.logLevel = options?.level ?? LogLevel.INFO;
        this.logToFile = options?.logToFile ?? false;
        this.logPath = options?.logPath;
        this.sessionId = options?.sessionId;
    }
    debug(message, ...args) {
        this.log(LogLevel.DEBUG, 'DEBUG', message, args);
    }
    info(message, ...args) {
        this.log(LogLevel.INFO, 'INFO', message, args);
    }
    success(message, ...args) {
        this.log(LogLevel.SUCCESS, 'SUCCESS', message, args);
    }
    warn(message, ...args) {
        this.log(LogLevel.WARN, 'WARN', message, args);
    }
    error(message, ...args) {
        this.log(LogLevel.ERROR, 'ERROR', message, args);
    }
    fatal(message, ...args) {
        this.log(LogLevel.FATAL, 'FATAL', message, args);
    }
    log(level, levelName, message, args) {
        if (level < this.logLevel)
            return;
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
    formatMessage(message, args) {
        if (args.length === 0)
            return message;
        let formatted = message;
        args.forEach(arg => {
            if (typeof arg === 'object') {
                try {
                    formatted = formatted.replace('%o', JSON.stringify(arg, null, 2));
                }
                catch {
                    formatted = formatted.replace('%o', String(arg));
                }
            }
            else {
                formatted = formatted.replace('%s', String(arg));
                formatted = formatted.replace('%d', String(arg));
                formatted = formatted.replace('%j', JSON.stringify(arg));
            }
        });
        return formatted;
    }
    consoleLog(level, message) {
        const colors = {
            [LogLevel.DEBUG]: '\x1b[36m', // Cyan
            [LogLevel.INFO]: '\x1b[34m', // Blue
            [LogLevel.SUCCESS]: '\x1b[32m', // Green
            [LogLevel.WARN]: '\x1b[33m', // Yellow
            [LogLevel.ERROR]: '\x1b[31m', // Red
            [LogLevel.FATAL]: '\x1b[35m' // Magenta
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
    async fileLog(message) {
        if (!this.logPath)
            return;
        const date = new Date().toISOString().split('T')[0];
        const logFile = path.join(this.logPath, `${date}.log`);
        await fs.ensureDir(this.logPath);
        await fs.appendFile(logFile, message + '\n');
    }
    createChild(context) {
        return new Logger(`${this.context}:${context}`, {
            level: this.logLevel,
            logToFile: this.logToFile,
            logPath: this.logPath,
            sessionId: this.sessionId
        });
    }
    withSession(sessionId) {
        return new Logger(this.context, {
            level: this.logLevel,
            logToFile: this.logToFile,
            logPath: this.logPath,
            sessionId
        });
    }
    static async cleanupLogs(logPath, retentionDays = 30) {
        if (!await fs.pathExists(logPath))
            return;
        const files = await fs.readdir(logPath);
        const now = new Date();
        for (const file of files) {
            if (!file.endsWith('.log'))
                continue;
            const filePath = path.join(logPath, file);
            const stats = await fs.stat(filePath);
            const ageDays = (now.getTime() - stats.mtime.getTime()) / (1000 * 60 * 60 * 24);
            if (ageDays > retentionDays) {
                await fs.remove(filePath);
            }
        }
    }
}
exports.Logger = Logger;
exports.default = Logger;
//# sourceMappingURL=logger.js.map