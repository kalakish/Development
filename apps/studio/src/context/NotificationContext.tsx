import React, { createContext, useContext, useState, useCallback } from 'react';
import { Alert, Snackbar } from '@mui/material';

export interface Notification {
    id: string;
    message: string;
    severity: 'success' | 'error' | 'warning' | 'info';
    duration?: number;
    timestamp: Date;
}

interface NotificationContextType {
    notifications: Notification[];
    showNotification: (message: string, severity: Notification['severity'], duration?: number) => void;
    hideNotification: (id: string) => void;
    clearAllNotifications: () => void;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export const useNotification = () => {
    const context = useContext(NotificationContext);
    if (!context) {
        throw new Error('useNotification must be used within NotificationProvider');
    }
    return context;
};

export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [currentNotification, setCurrentNotification] = useState<Notification | null>(null);

    const showNotification = useCallback((
        message: string,
        severity: Notification['severity'] = 'info',
        duration: number = 6000
    ) => {
        const id = `notification_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const notification: Notification = {
            id,
            message,
            severity,
            duration,
            timestamp: new Date()
        };
        
        setNotifications(prev => [notification, ...prev].slice(0, 50)); // Keep last 50
        setCurrentNotification(notification);
    }, []);

    const hideNotification = useCallback((id: string) => {
        setNotifications(prev => prev.filter(n => n.id !== id));
        if (currentNotification?.id === id) {
            setCurrentNotification(null);
        }
    }, [currentNotification]);

    const clearAllNotifications = useCallback(() => {
        setNotifications([]);
        setCurrentNotification(null);
    }, []);

    const handleClose = (event?: React.SyntheticEvent | Event, reason?: string) => {
        if (reason === 'clickaway') {
            return;
        }
        setCurrentNotification(null);
    };

    return (
        <NotificationContext.Provider value={{
            notifications,
            showNotification,
            hideNotification,
            clearAllNotifications
        }}>
            {children}
            
            {/* Current Toast Notification */}
            <Snackbar
                open={!!currentNotification}
                autoHideDuration={currentNotification?.duration}
                onClose={handleClose}
                anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
            >
                {currentNotification && (
                    <Alert
                        onClose={handleClose}
                        severity={currentNotification.severity}
                        variant="filled"
                        sx={{ width: '100%' }}
                    >
                        {currentNotification.message}
                    </Alert>
                )}
            </Snackbar>
        </NotificationContext.Provider>
    );
};