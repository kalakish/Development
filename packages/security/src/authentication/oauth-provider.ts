import axios from 'axios';
import { BaseAuthProvider, AuthProviderType, Credentials, AuthResult } from './auth-provider';
import { User } from '@nova/core/session';
import { SecurityManager } from '../security-manager';
import { v4 as uuidv4 } from 'uuid';

export interface OAuth2Config {
    provider: string;
    clientId: string;
    clientSecret: string;
    authorizationURL: string;
    tokenURL: string;
    userInfoURL: string;
    callbackURL: string;
    scope: string[];
    state?: boolean;
    pkce?: boolean;
    responseType?: string;
    grantType?: string;
    userMapping?: {
        id?: string;
        username?: string;
        email?: string;
        displayName?: string;
        firstName?: string;
        lastName?: string;
        avatar?: string;
    };
}

export interface OAuth2Token {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    token_type: string;
    scope?: string;
}

export class OAuth2Provider extends BaseAuthProvider {
    private config: OAuth2Config;
    private securityManager: SecurityManager;
    
    constructor(securityManager: SecurityManager, config: OAuth2Config) {
        super({
            enabled: true,
            priority: 75,
            type: AuthProviderType.OAUTH2
        });
        
        this.securityManager = securityManager;
        this.config = {
            responseType: 'code',
            grantType: 'authorization_code',
            state: true,
            pkce: false,
            userMapping: {
                id: 'id',
                username: 'username',
                email: 'email',
                displayName: 'name',
                firstName: 'given_name',
                lastName: 'family_name',
                avatar: 'picture'
            },
            ...config
        };
    }
    
    async authenticate(credentials: Credentials): Promise<AuthResult> {
        const { code, redirectUri, codeVerifier } = credentials;
        
        if (!code) {
            throw new Error('Authorization code is required');
        }
        
        try {
            // Exchange code for token
            const token = await this.exchangeCode(code, redirectUri, codeVerifier);
            
            // Get user info
            const userInfo = await this.getUserInfo(token.access_token);
            
            // Map OAuth user to application user
            const user = await this.mapOAuthUser(userInfo);
            
            // Generate JWT token
            const jwtToken = this.generateToken(user);
            const refreshToken = token.refresh_token || this.generateRefreshToken();
            
            return {
                user,
                token: jwtToken,
                refreshToken,
                expiresIn: token.expires_in,
                tokenType: token.token_type
            };
            
        } catch (error) {
            throw new Error(`OAuth authentication failed: ${error.message}`);
        }
    }
    
    async validateToken(token: string): Promise<User | null> {
        // JWT validation is handled by JWT provider
        return null;
    }
    
    async refreshToken(refreshToken: string): Promise<AuthResult> {
        try {
            const response = await axios.post(this.config.tokenURL, {
                grant_type: 'refresh_token',
                refresh_token: refreshToken,
                client_id: this.config.clientId,
                client_secret: this.config.clientSecret
            }, {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            });
            
            const token: OAuth2Token = response.data;
            
            // Get user info
            const userInfo = await this.getUserInfo(token.access_token);
            
            // Map OAuth user to application user
            const user = await this.mapOAuthUser(userInfo);
            
            // Generate new JWT token
            const jwtToken = this.generateToken(user);
            
            return {
                user,
                token: jwtToken,
                refreshToken: token.refresh_token || refreshToken,
                expiresIn: token.expires_in,
                tokenType: token.token_type
            };
            
        } catch (error) {
            throw new Error(`Token refresh failed: ${error.message}`);
        }
    }
    
    async revokeToken(token: string): Promise<void> {
        // OAuth2 token revocation (if supported by provider)
        try {
            await axios.post(`${this.config.tokenURL}/revoke`, {
                token,
                client_id: this.config.clientId,
                client_secret: this.config.clientSecret
            });
        } catch (error) {
            // Ignore revocation errors
        }
    }
    
    getType(): AuthProviderType {
        return AuthProviderType.OAUTH2;
    }
    
    getAuthorizationURL(state?: string, codeVerifier?: string): string {
        const params = new URLSearchParams({
            client_id: this.config.clientId,
            redirect_uri: this.config.callbackURL,
            response_type: this.config.responseType!,
            scope: this.config.scope.join(' ')
        });
        
        if (this.config.state && state) {
            params.append('state', state);
        }
        
        if (this.config.pkce && codeVerifier) {
            // PKCE code challenge
            const codeChallenge = this.generateCodeChallenge(codeVerifier);
            params.append('code_challenge', codeChallenge);
            params.append('code_challenge_method', 'S256');
        }
        
        return `${this.config.authorizationURL}?${params.toString()}`;
    }
    
    private async exchangeCode(code: string, redirectUri?: string, codeVerifier?: string): Promise<OAuth2Token> {
        const params = new URLSearchParams({
            grant_type: this.config.grantType!,
            client_id: this.config.clientId,
            client_secret: this.config.clientSecret,
            code,
            redirect_uri: redirectUri || this.config.callbackURL
        });
        
        if (this.config.pkce && codeVerifier) {
            params.append('code_verifier', codeVerifier);
        }
        
        const response = await axios.post(this.config.tokenURL, params.toString(), {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        });
        
        return response.data;
    }
    
    private async getUserInfo(accessToken: string): Promise<any> {
        const response = await axios.get(this.config.userInfoURL, {
            headers: {
                'Authorization': `Bearer ${accessToken}`
            }
        });
        
        return response.data;
    }
    
    private async mapOAuthUser(userInfo: any): Promise<User> {
        const mapping = this.config.userMapping!;
        
        // Map OAuth user attributes
        const oauthId = userInfo[mapping.id || 'id'] || userInfo.sub;
        const username = userInfo[mapping.username || 'username'] || oauthId;
        const email = userInfo[mapping.email || 'email'];
        const displayName = userInfo[mapping.displayName || 'name'] || username;
        const firstName = userInfo[mapping.firstName || 'given_name'];
        const lastName = userInfo[mapping.lastName || 'family_name'];
        const avatar = userInfo[mapping.avatar || 'picture'];
        
        // Check if user exists in local database
        let user = await this.securityManager.getUserByUsername(username);
        
        if (!user) {
            // Create new user
            user = await this.securityManager.createUser({
                id: uuidv4(),
                username,
                email: email || `${username}@${this.config.provider}.local`,
                displayName: displayName || `${firstName || ''} ${lastName || ''}`.trim() || username,
                password: '', // OAuth users don't have local password
                roles: ['user'],
                isSuperAdmin: false,
                avatar,
                metadata: {
                    oauthId,
                    oauthProvider: this.config.provider,
                    oauthData: userInfo
                }
            });
        }
        
        return user;
    }
    
    private generateCodeChallenge(codeVerifier: string): string {
        const crypto = require('crypto');
        const hash = crypto.createHash('sha256').update(codeVerifier).digest();
        return hash.toString('base64')
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=/g, '');
    }
    
    generateCodeVerifier(): string {
        const crypto = require('crypto');
        return crypto.randomBytes(32)
            .toString('base64')
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=/g, '');
    }
    
    generateState(): string {
        return `state_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
}