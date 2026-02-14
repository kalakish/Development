import { useContext } from 'react';
import { NotificationContext } from '../context/NotificationContext';

export const useNotification = () => {
    const context = useContext(NotificationContext);
    
    if (!context) {
        throw new Error('useNotification must be used within NotificationProvider');
    }
    
    return {
        notifications: context.notifications,
        showNotification: context.showNotification,
        hideNotification: context.hideNotification,
        clearAllNotifications: context.clearAllNotifications,
        
        // Convenience methods
        showSuccess: (message: string, duration?: number) => 
            context.showNotification(message, 'success', duration),
        showError: (message: string, duration?: number) => 
            context.showNotification(message, 'error', duration),
        showWarning: (message: string, duration?: number) => 
            context.showNotification(message, 'warning', duration),
        showInfo: (message: string, duration?: number) => 
            context.showNotification(message, 'info', duration)
    };
};