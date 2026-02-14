import { SQLServerConnection } from '@nova/core/database/sqlserver-connection';
import { EncryptionService } from '../encryption/encryption-service';
import { User } from '@nova/core/session';
import { SessionStore } from './session-store';
import { v4 as uuidv4 } from 'uuid';

export interface SessionConfig {
    cookieName?: string;
    maxAge?: number;
    httpOnly?: boolean;
    secure?: boolean;
    sameSite?: 'strict' | 'lax' | 'none';
    path?: string;
    domain?: string;
    rolling?: boolean;
    renew?: boolean;
}

export interface SessionData {
    id: string;
    userId: string;
    username: string;
    token: string;
    ipAddress?: string;
    userAgent?: string;
    createdAt: Date;
    updatedAt: Date;
    expiresAt: Date;
    data: Record<string, any>;
    isActive: boolean;
}

export class SessionManager {
    private connection: SQLServerConnection;
    private encryptionService: EncryptionService;
    private sessionStore: SessionStore;
    private config: Required<SessionConfig>;
    
    constructor(
        connection: SQLServerConnection,
        encryptionService: EncryptionService,
        config?: SessionConfig
    ) {
        this.connection = connection;
        this.encryptionService = encryptionService;
        this.sessionStore = new SessionStore(connection);
        this.config = {
            cookieName: config?.cookieName || 'nova.sid',
            maxAge: config?.maxAge || 86400000, // 24 hours
            httpOnly: config?.httpOnly !== false,
            secure: config?.secure || false,
            sameSite: config?.sameSite || 'lax',
            path: config?.path || '/',
            domain: config?.domain || '',
            rolling: config?.rolling || false,
            renew: config?.renew || false
        };
    }
    
    async initialize(): Promise<void> {
        await this.sessionStore.initialize();
    }
    
    // ============ Session Operations ============
    
    async createSession(
        user: User,
        ipAddress?: string,
        userAgent?: string
    ): Promise<SessionData> {
        const sessionId = uuidv4();
        const token = this.generateSessionToken();
        const now = new Date();
        const expiresAt = new Date(now.getTime() + this.config.maxAge);
        
        const session: SessionData = {
            id: sessionId,
            userId: user.id,
            username: user.username,
            token,
            ipAddress,
            userAgent,
            createdAt: now,
            updatedAt: now,
            expiresAt,
            data: {},
            isActive: true
        };
        
        await this.sessionStore.save(session);
        
        return session;
    }
    
    async getSession(sessionId: string): Promise<SessionData | null> {
        const session = await this.sessionStore.get(sessionId);
        
        if (!session) {
            return null;
        }
        
        // Check if expired
        if (session.expiresAt < new Date()) {
            await this.destroySession(sessionId);
            return null;
        }
        
        // Update last access
        if (this.config.rolling) {
            await this.touchSession(sessionId);
        }
        
        return session;
    }
    
    async updateSession(
        sessionId: string,
        data: Partial<SessionData>
    ): Promise<SessionData | null> {
        const session = await this.getSession(sessionId);
        
        if (!session) {
            return null;
        }
        
        Object.assign(session, data);
        session.updatedAt = new Date();
        
        await this.sessionStore.save(session);
        
        return session;
    }
    
    async destroySession(sessionId: string): Promise<void> {
        await this.sessionStore.delete(sessionId);
    }
    
    async destroyAllUserSessions(userId: string): Promise<number> {
        return this.sessionStore.deleteByUserId(userId);
    }
    
    // ============ Session Data ============
    
    async setSessionData(
        sessionId: string,
        key: string,
        value: any
    ): Promise<void> {
        const session = await this.getSession(sessionId);
        
        if (session) {
            session.data[key] = value;
            session.updatedAt = new Date();
            await this.sessionStore.save(session);
        }
    }
    
    async getSessionData<T = any>(
        sessionId: string,
        key: string
    ): Promise<T | null> {
        const session = await this.getSession(sessionId);
        return session?.data[key] || null;
    }
    
    async removeSessionData(
        sessionId: string,
        key: string
    ): Promise<void> {
        const session = await this.getSession(sessionId);
        
        if (session) {
            delete session.data[key];
            session.updatedAt = new Date();
            await this.sessionStore.save(session);
        }
    }
    
    async clearSessionData(sessionId: string): Promise<void> {
        const session = await this.getSession(sessionId);
        
        if (session) {
            session.data = {};
            session.updatedAt = new Date();
            await this.sessionStore.save(session);
        }
    }
    
    // ============ Session Management ============
    
    async touchSession(sessionId: string): Promise<void> {
        const session = await this.sessionStore.get(sessionId);
        
        if (session) {
            session.updatedAt = new Date();
            
            if (this.config.renew) {
                session.expiresAt = new Date(Date.now() + this.config.maxAge);
            }
            
            await this.sessionStore.save(session);
        }
    }
    
    async renewSession(sessionId: string): Promise<SessionData | null> {
        const session = await this.getSession(sessionId);
        
        if (session) {
            session.expiresAt = new Date(Date.now() + this.config.maxAge);
            session.updatedAt = new Date();
            await this.sessionStore.save(session);
        }
        
        return session;
    }
    
    // ============ Session Validation ============
    
    async validateSession(sessionId: string, token: string): Promise<boolean> {
        const session = await this.getSession(sessionId);
        
        if (!session) {
            return false;
        }
        
        return session.token === token && session.isActive;
    }
    
    async validateSessionByUser(
        userId: string,
        sessionId: string
    ): Promise<boolean> {
        const session = await this.getSession(sessionId);
        
        if (!session) {
            return false;
        }
        
        return session.userId === userId;
    }
    
    // ============ Session Queries ============
    
    async getUserSessions(userId: string): Promise<SessionData[]> {
        return this.sessionStore.getByUserId(userId);
    }
    
    async getActiveSessions(): Promise<SessionData[]> {
        return this.sessionStore.getActiveSessions();
    }
    
    async getExpiredSessions(): Promise<SessionData[]> {
        return this.sessionStore.getExpiredSessions();
    }
    
    async getSessionCount(): Promise<number> {
        return this.sessionStore.getCount();
    }
    
    async getUserSessionCount(userId: string): Promise<number> {
        return this.sessionStore.getUserSessionCount(userId);
    }
    
    // ============ Session Cleanup ============
    
    async cleanupExpiredSessions(): Promise<number> {
        const expired = await this.getExpiredSessions();
        
        for (const session of expired) {
            await this.destroySession(session.id);
        }
        
        return expired.length;
    }
    
    // ============ Cookie Helpers ============
    
    getCookieOptions(): any {
        return {
            httpOnly: this.config.httpOnly,
            secure: this.config.secure,
            sameSite: this.config.sameSite,
            maxAge: this.config.maxAge,
            path: this.config.path,
            domain: this.config.domain
        };
    }
    
    createCookie(sessionId: string): string {
        return `${this.config.cookieName}=${sessionId}; ` +
               `Max-Age=${this.config.maxAge / 1000}; ` +
               `Path=${this.config.path}; ` +
               `${this.config.httpOnly ? 'HttpOnly; ' : ''}` +
               `${this.config.secure ? 'Secure; ' : ''}` +
               `SameSite=${this.config.sameSite}; ` +
               `${this.config.domain ? `Domain=${this.config.domain}; ` : ''}`;
    }
    
    parseCookie(cookieHeader: string): string | null {
        const cookies = cookieHeader.split(';').reduce((acc, cookie) => {
            const [key, value] = cookie.trim().split('=');
            acc[key] = value;
            return acc;
        }, {} as Record<string, string>);
        
        return cookies[this.config.cookieName] || null;
    }
    
    // ============ Utility ============
    
    private generateSessionToken(): string {
        return this.encryptionService.generateSecureToken(32);
    }
    
    getConfig(): SessionConfig {
        return { ...this.config };
    }
    
    updateConfig(config: Partial<SessionConfig>): void {
        Object.assign(this.config, config);
    }
}