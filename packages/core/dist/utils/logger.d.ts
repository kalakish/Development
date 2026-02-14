export declare enum LogLevel {
    DEBUG = 0,
    INFO = 1,
    SUCCESS = 2,
    WARN = 3,
    ERROR = 4,
    FATAL = 5
}
export declare class Logger {
    private context;
    private logLevel;
    private logToFile;
    private logPath?;
    private sessionId?;
    constructor(context: string, options?: LoggerOptions);
    debug(message: string, ...args: any[]): void;
    info(message: string, ...args: any[]): void;
    success(message: string, ...args: any[]): void;
    warn(message: string, ...args: any[]): void;
    error(message: string, ...args: any[]): void;
    fatal(message: string, ...args: any[]): void;
    private log;
    private formatMessage;
    private consoleLog;
    private fileLog;
    createChild(context: string): Logger;
    withSession(sessionId: string): Logger;
    static cleanupLogs(logPath: string, retentionDays?: number): Promise<void>;
}
export interface LoggerOptions {
    level?: LogLevel;
    logToFile?: boolean;
    logPath?: string;
    sessionId?: string;
}
export default Logger;
//# sourceMappingURL=logger.d.ts.map