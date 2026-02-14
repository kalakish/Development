import jwt from 'jsonwebtoken';
import { BaseAuthProvider, AuthProviderType, Credentials, AuthResult } from './auth-provider';
import { User } from '@nova/core/session';
import { SecurityManager } from '../security-manager';

export interface JWTConfig {
    secret: string;
    expiresIn: string | number;
    refreshExpiresIn: string | number;
    algorithm?: jwt.Algorithm;
    issuer?: string;
    audience?: string;
    subject?: string;
    clockTolerance?: number;
}

export class JWTProvider extends BaseAuthProvider {
    private config: JWTConfig;
    private securityManager: SecurityManager;
    
    constructor(securityManager: SecurityManager, config: JWTConfig) {
        super({
            enabled: true,
            priority: 100,
            type: AuthProviderType.JWT
        });
        
        this.securityManager = securityManager;
        this.config = {
            secret: config.secret,
            expiresIn: config.expiresIn || '24h',
            refreshExpiresIn: config.refreshExpiresIn || '7d',
            algorithm: config.algorithm || 'HS256',
            issuer: config.issuer || 'nova-framework',
            audience: config.audience,
            subject: config.subject,
            clockTolerance: config.clockTolerance || 0
        };
    }
    
    async authenticate(credentials: Credentials): Promise<AuthResult> {
        const { username, password } = credentials;
        
        if (!username || !password) {
            throw new Error('Username and password are required');
        }
        
        // Authenticate user
        const user = await this.securityManager.authenticate({
            username,
            password
        });
        
        // Generate tokens
        const token = this.generateJWT(user);
        const refreshToken = this.generateRefreshJWT(user);
        
        return {
            user,
            token,
            refreshToken,
            expiresIn: this.getExpiresInSeconds(this.config.expiresIn),
            tokenType: 'Bearer'
        };
    }
    
    async validateToken(token: string): Promise<User | null> {
        try {
            const decoded = jwt.verify(token, this.config.secret, {
                algorithms: [this.config.algorithm],
                issuer: this.config.issuer,
                audience: this.config.audience,
                subject: this.config.subject,
                clockTolerance: this.config.clockTolerance
            }) as any;
            
            // Get user from database
            const user = await this.securityManager.getUserById(decoded.sub || decoded.id);
            
            if (!user) {
                return null;
            }
            
            // Check if token is revoked
            const isRevoked = await this.securityManager.isTokenRevoked(token);
            if (isRevoked) {
                return null;
            }
            
            return user;
            
        } catch (error) {
            return null;
        }
    }
    
    async refreshToken(refreshToken: string): Promise<AuthResult> {
        try {
            // Validate refresh token
            const decoded = jwt.verify(refreshToken, this.config.secret, {
                algorithms: [this.config.algorithm],
                issuer: this.config.issuer
            }) as any;
            
            // Check if refresh token is revoked
            const isRevoked = await this.securityManager.isTokenRevoked(refreshToken);
            if (isRevoked) {
                throw new Error('Refresh token has been revoked');
            }
            
            // Get user
            const user = await this.securityManager.getUserById(decoded.sub || decoded.id);
            
            if (!user) {
                throw new Error('User not found');
            }
            
            // Generate new tokens
            const token = this.generateJWT(user);
            const newRefreshToken = this.generateRefreshJWT(user);
            
            // Revoke old refresh token
            await this.securityManager.revokeToken(refreshToken);
            
            return {
                user,
                token,
                refreshToken: newRefreshToken,
                expiresIn: this.getExpiresInSeconds(this.config.expiresIn),
                tokenType: 'Bearer'
            };
            
        } catch (error) {
            throw new Error(`Invalid refresh token: ${error.message}`);
        }
    }
    
    async revokeToken(token: string): Promise<void> {
        await this.securityManager.revokeToken(token);
    }
    
    getType(): AuthProviderType {
        return AuthProviderType.JWT;
    }
    
    private generateJWT(user: User): string {
        const payload = {
            id: user.id,
            username: user.username,
            email: user.email,
            roles: user.roles,
            isSuperAdmin: user.isSuperAdmin
        };
        
        const options: jwt.SignOptions = {
            algorithm: this.config.algorithm,
            expiresIn: this.config.expiresIn,
            issuer: this.config.issuer,
            audience: this.config.audience,
            subject: user.id,
            jwtid: this.generateJWTId()
        };
        
        return jwt.sign(payload, this.config.secret, options);
    }
    
    private generateRefreshJWT(user: User): string {
        const payload = {
            id: user.id,
            type: 'refresh'
        };
        
        const options: jwt.SignOptions = {
            algorithm: this.config.algorithm,
            expiresIn: this.config.refreshExpiresIn,
            issuer: this.config.issuer,
            subject: user.id,
            jwtid: this.generateJWTId()
        };
        
        return jwt.sign(payload, this.config.secret, options);
    }
    
    private generateJWTId(): string {
        return `jti_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
    
    private getExpiresInSeconds(expiresIn: string | number): number {
        if (typeof expiresIn === 'number') {
            return expiresIn;
        }
        
        const match = expiresIn.match(/^(\d+)([smhd])$/);
        if (!match) {
            return 3600; // Default 1 hour
        }
        
        const value = parseInt(match[1], 10);
        const unit = match[2];
        
        switch (unit) {
            case 's': return value;
            case 'm': return value * 60;
            case 'h': return value * 3600;
            case 'd': return value * 86400;
            default: return 3600;
        }
    }
}