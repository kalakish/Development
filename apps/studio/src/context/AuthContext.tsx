import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { StudioService } from '../services/StudioService';
import { useNotification } from '../hooks/useNotification';

interface User {
    id: string;
    username: string;
    displayName: string;
    email: string;
    roles: string[];
    avatar?: string;
}

interface AuthContextType {
    user: User | null;
    token: string | null;
    isAuthenticated: boolean;
    isLoading: boolean;
    login: (username: string, password: string, rememberMe?: boolean) => Promise<boolean>;
    logout: () => Promise<void>;
    refreshToken: () => Promise<string>;
    hasPermission: (permission: string) => boolean;
    hasRole: (role: string) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within AuthProvider');
    }
    return context;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { showNotification } = useNotification();
    
    const [user, setUser] = useState<User | null>(null);
    const [token, setToken] = useState<string | null>(localStorage.getItem('nova_token'));
    const [isLoading, setIsLoading] = useState(true);
    const [refreshTimer, setRefreshTimer] = useState<NodeJS.Timeout | null>(null);

    useEffect(() => {
        initializeAuth();
        return () => {
            if (refreshTimer) clearInterval(refreshTimer);
        };
    }, []);

    const initializeAuth = async () => {
        setIsLoading(true);
        try {
            if (token) {
                const userData = await StudioService.validateToken(token);
                if (userData) {
                    setUser(userData);
                    startRefreshTimer();
                } else {
                    localStorage.removeItem('nova_token');
                    setToken(null);
                }
            }
        } catch (error) {
            console.error('Failed to initialize auth:', error);
            localStorage.removeItem('nova_token');
            setToken(null);
        } finally {
            setIsLoading(false);
        }
    };

    const login = useCallback(async (username: string, password: string, rememberMe: boolean = false) => {
        try {
            const response = await StudioService.login(username, password);
            
            if (response.success) {
                setUser(response.user);
                setToken(response.token);
                
                if (rememberMe) {
                    localStorage.setItem('nova_token', response.token);
                } else {
                    sessionStorage.setItem('nova_token', response.token);
                }
                
                startRefreshTimer();
                showNotification('Login successful', 'success');
                return true;
            }
            return false;
        } catch (error) {
            console.error('Login failed:', error);
            showNotification('Login failed', 'error');
            return false;
        }
    }, [showNotification]);

    const logout = useCallback(async () => {
        try {
            await StudioService.logout();
        } catch (error) {
            console.error('Logout error:', error);
        } finally {
            setUser(null);
            setToken(null);
            localStorage.removeItem('nova_token');
            sessionStorage.removeItem('nova_token');
            if (refreshTimer) clearInterval(refreshTimer);
            showNotification('Logged out successfully', 'info');
        }
    }, [refreshTimer, showNotification]);

    const refreshToken = useCallback(async () => {
        try {
            const newToken = await StudioService.refreshToken();
            setToken(newToken);
            localStorage.setItem('nova_token', newToken);
            return newToken;
        } catch (error) {
            console.error('Failed to refresh token:', error);
            await logout();
            throw error;
        }
    }, [logout]);

    const startRefreshTimer = useCallback(() => {
        // Refresh token every 30 minutes
        const timer = setInterval(async () => {
            try {
                await refreshToken();
            } catch (error) {
                console.error('Failed to refresh token in background:', error);
            }
        }, 30 * 60 * 1000);
        
        setRefreshTimer(timer);
    }, [refreshToken]);

    const hasPermission = useCallback((permission: string): boolean => {
        if (!user) return false;
        if (user.roles.includes('super')) return true;
        // Implement permission checking logic
        return true;
    }, [user]);

    const hasRole = useCallback((role: string): boolean => {
        if (!user) return false;
        return user.roles.includes(role);
    }, [user]);

    const value = {
        user,
        token,
        isAuthenticated: !!user,
        isLoading,
        login,
        logout,
        refreshToken,
        hasPermission,
        hasRole
    };

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
};