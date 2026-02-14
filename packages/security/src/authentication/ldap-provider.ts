import ldap from 'ldapjs';
import { BaseAuthProvider, AuthProviderType, Credentials, AuthResult } from './auth-provider';
import { User } from '@nova/core/session';
import { SecurityManager } from '../security-manager';
import { v4 as uuidv4 } from 'uuid';

export interface LDAPConfig {
    url: string;
    bindDN?: string;
    bindCredentials?: string;
    searchBase: string;
    searchFilter: string;
    reconnect?: boolean;
    timeout?: number;
    connectTimeout?: number;
    tlsOptions?: any;
    attributes?: string[];
    userMapping?: {
        id?: string;
        username?: string;
        email?: string;
        displayName?: string;
        firstName?: string;
        lastName?: string;
    };
}

export class LDAPProvider extends BaseAuthProvider {
    private config: LDAPConfig;
    private securityManager: SecurityManager;
    private client: ldap.Client | null = null;
    
    constructor(securityManager: SecurityManager, config: LDAPConfig) {
        super({
            enabled: true,
            priority: 50,
            type: AuthProviderType.LDAP
        });
        
        this.securityManager = securityManager;
        this.config = {
            reconnect: true,
            timeout: 10000,
            connectTimeout: 5000,
            attributes: ['dn', 'cn', 'uid', 'mail', 'givenName', 'sn'],
            userMapping: {
                id: 'uid',
                username: 'uid',
                email: 'mail',
                displayName: 'cn',
                firstName: 'givenName',
                lastName: 'sn'
            },
            ...config
        };
    }
    
    async authenticate(credentials: Credentials): Promise<AuthResult> {
        const { username, password } = credentials;
        
        if (!username || !password) {
            throw new Error('Username and password are required');
        }
        
        let client: ldap.Client | null = null;
        
        try {
            // Create LDAP client
            client = this.createClient();
            
            // Bind to LDAP server
            if (this.config.bindDN && this.config.bindCredentials) {
                await this.bindAsync(client, this.config.bindDN, this.config.bindCredentials);
            }
            
            // Search for user
            const searchFilter = this.config.searchFilter.replace('{{username}}', username);
            const users = await this.searchAsync(client, this.config.searchBase, {
                scope: 'sub',
                filter: searchFilter,
                attributes: this.config.attributes
            });
            
            if (users.length === 0) {
                throw new Error('User not found');
            }
            
            const userEntry = users[0];
            
            // Authenticate user
            const userDN = userEntry.dn.toString();
            await this.bindAsync(client, userDN, password);
            
            // Map LDAP user to application user
            const user = await this.mapLDAPUser(userEntry);
            
            // Generate JWT token
            const token = this.generateToken(user);
            const refreshToken = this.generateRefreshToken();
            
            return {
                user,
                token,
                refreshToken,
                expiresIn: 3600,
                tokenType: 'Bearer'
            };
            
        } finally {
            if (client) {
                client.unbind();
            }
        }
    }
    
    async validateToken(token: string): Promise<User | null> {
        // JWT validation is handled by JWT provider
        // This provider only handles LDAP authentication
        return null;
    }
    
    async refreshToken(refreshToken: string): Promise<AuthResult> {
        throw new Error('Refresh token not supported by LDAP provider');
    }
    
    async revokeToken(token: string): Promise<void> {
        // LDAP doesn't support token revocation
    }
    
    getType(): AuthProviderType {
        return AuthProviderType.LDAP;
    }
    
    private createClient(): ldap.Client {
        const client = ldap.createClient({
            url: this.config.url,
            reconnect: this.config.reconnect,
            timeout: this.config.timeout,
            connectTimeout: this.config.connectTimeout,
            tlsOptions: this.config.tlsOptions
        });
        
        return client;
    }
    
    private bindAsync(client: ldap.Client, dn: string, password: string): Promise<void> {
        return new Promise((resolve, reject) => {
            client.bind(dn, password, (err) => {
                if (err) {
                    reject(err);
                } else {
                    resolve();
                }
            });
        });
    }
    
    private searchAsync(client: ldap.Client, base: string, options: ldap.SearchOptions): Promise<any[]> {
        return new Promise((resolve, reject) => {
            const entries: any[] = [];
            
            client.search(base, options, (err, res) => {
                if (err) {
                    reject(err);
                    return;
                }
                
                res.on('searchEntry', (entry) => {
                    entries.push(entry);
                });
                
                res.on('error', (err) => {
                    reject(err);
                });
                
                res.on('end', (result) => {
                    if (result.status === 0) {
                        resolve(entries);
                    } else {
                        reject(new Error(`LDAP search failed with status: ${result.status}`));
                    }
                });
            });
        });
    }
    
    private async mapLDAPUser(entry: any): Promise<User> {
        const mapping = this.config.userMapping!;
        const attributes = entry.attributes;
        
        // Extract LDAP attributes
        const getAttribute = (name: string): string | null => {
            const attr = attributes.find((a: any) => a.type === name);
            return attr ? attr.vals[0] : null;
        };
        
        // Map to application user
        const ldapId = getAttribute(mapping.id || 'uid') || entry.dn.toString();
        const username = getAttribute(mapping.username || 'uid') || ldapId;
        const email = getAttribute(mapping.email || 'mail');
        const displayName = getAttribute(mapping.displayName || 'cn') || username;
        
        // Check if user exists in local database
        let user = await this.securityManager.getUserByUsername(username);
        
        if (!user) {
            // Create new user
            const firstName = getAttribute(mapping.firstName || 'givenName') || '';
            const lastName = getAttribute(mapping.lastName || 'sn') || '';
            
            user = await this.securityManager.createUser({
                id: uuidv4(),
                username,
                email: email || `${username}@ldap.local`,
                displayName: displayName || `${firstName} ${lastName}`.trim() || username,
                password: '', // LDAP users don't have local password
                roles: ['user'],
                isSuperAdmin: false,
                metadata: {
                    ldapId,
                    ldapDN: entry.dn.toString(),
                    ldapProvider: this.config.url
                }
            });
        }
        
        return user;
    }
}