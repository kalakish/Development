import { User } from '@nova/core/session';

export interface AuthProvider {
    /**
     * Authenticate user with credentials
     */
    authenticate(credentials: Credentials): Promise<AuthResult>;
    
    /**
     * Validate token and return user
     */
    validateToken(token: string): Promise<User | null>;
    
    /**
     * Refresh authentication token
     */
    refreshToken(refreshToken: string): Promise<AuthResult>;
    
    /**
     * Revoke authentication token
     */
    revokeToken(token: string): Promise<void>;
    
    /**
     * Get provider type
     */
    getType(): AuthProviderType;
}

export interface Credentials {
    username?: string;
    password?: string;
    token?: string;
    apiKey?: string;
    [key: string]: any;
}

export interface AuthResult {
    user: User;
    token: string;
    refreshToken?: string;
    expiresIn: number;
    tokenType: string;
}

export interface AuthProviderConfig {
    enabled: boolean;
    priority: number;
    [key: string]: any;
}

export enum AuthProviderType {
    JWT = 'jwt',
    LDAP = 'ldap',
    OAUTH2 = 'oauth2',
    SAML = 'saml',
    API_KEY = 'api_key',
    BASIC = 'basic'
}

export abstract class BaseAuthProvider implements AuthProvider {
    protected config: AuthProviderConfig;
    
    constructor(config: AuthProviderConfig) {
        this.config = config;
    }
    
    abstract authenticate(credentials: Credentials): Promise<AuthResult>;
    abstract validateToken(token: string): Promise<User | null>;
    abstract refreshToken(refreshToken: string): Promise<AuthResult>;
    abstract revokeToken(token: string): Promise<void>;
    abstract getType(): AuthProviderType;
    
    isEnabled(): boolean {
        return this.config.enabled !== false;
    }
    
    getPriority(): number {
        return this.config.priority || 0;
    }
    
    getConfig(): AuthProviderConfig {
        return { ...this.config };
    }
    
    protected generateToken(user: User, expiresIn: number = 3600): string {
        // Override in derived classes
        return Buffer.from(JSON.stringify({
            id: user.id,
            username: user.username,
            exp: Date.now() + (expiresIn * 1000)
        })).toString('base64');
    }
    
    protected generateRefreshToken(): string {
        return `ref_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
}