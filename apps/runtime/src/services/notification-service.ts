import { EventEmitter } from 'events';
import { Logger } from '@nova/core/utils/logger';
import { Session } from '@nova/core/session';
import { EmailService } from '@nova/integration';
import { WebSocketServer } from '@nova/integration/websocket';

export interface Notification {
    id: string;
    type: NotificationType;
    title: string;
    message: string;
    severity: 'info' | 'success' | 'warning' | 'error';
    userId?: string;
    companyId?: string;
    tenantId?: string;
    data?: any;
    read: boolean;
    readAt?: Date;
    createdAt: Date;
    expiresAt?: Date;
    actions?: NotificationAction[];
}

export interface NotificationAction {
    id: string;
    label: string;
    icon?: string;
    handler: string;
    data?: any;
}

export enum NotificationType {
    System = 'system',
    User = 'user',
    Report = 'report',
    Workflow = 'workflow',
    Task = 'task',
    Approval = 'approval',
    Alert = 'alert',
    Message = 'message'
}

export class NotificationService extends EventEmitter {
    private logger: Logger;
    private websocketServer?: WebSocketServer;
    private emailService?: EmailService;
    private notifications: Map<string, Notification> = new Map();
    private subscriptions: Map<string, NotificationSubscription[]> = new Map();
    private retentionPeriod: number = 604800000; // 7 days

    constructor(websocketServer?: WebSocketServer, emailService?: EmailService) {
        super();
        this.logger = new Logger('NotificationService');
        this.websocketServer = websocketServer;
        this.emailService = emailService;
        
        this.startCleanupInterval();
    }

    async send(notification: Omit<Notification, 'id' | 'read' | 'createdAt'>): Promise<Notification> {
        const id = this.generateId();
        
        const newNotification: Notification = {
            id,
            ...notification,
            read: false,
            createdAt: new Date()
        };

        // Store notification
        this.notifications.set(id, newNotification);

        // Trim old notifications
        this.trimOldNotifications();

        // Send via WebSocket if user is connected
        if (this.websocketServer && notification.userId) {
            await this.sendWebSocket(newNotification);
        }

        // Send email for important notifications
        if (this.emailService && notification.severity === 'error' || notification.type === NotificationType.Approval) {
            await this.sendEmail(newNotification);
        }

        // Emit event
        this.emit('notification', newNotification);

        this.logger.info(`Notification sent: ${id}`, {
            type: notification.type,
            userId: notification.userId,
            severity: notification.severity
        });

        return newNotification;
    }

    async broadcast(notification: Omit<Notification, 'id' | 'read' | 'createdAt' | 'userId'>): Promise<Notification> {
        const id = this.generateId();
        
        const newNotification: Notification = {
            id,
            ...notification,
            read: false,
            createdAt: new Date()
        };

        // Store notification
        this.notifications.set(id, newNotification);

        // Broadcast via WebSocket to all connected clients
        if (this.websocketServer) {
            await this.websocketServer.broadcast('notification', newNotification);
        }

        this.emit('broadcast', newNotification);

        return newNotification;
    }

    async markAsRead(notificationId: string, userId: string): Promise<boolean> {
        const notification = this.notifications.get(notificationId);
        
        if (notification && notification.userId === userId) {
            notification.read = true;
            notification.readAt = new Date();
            
            this.emit('read', notification);
            return true;
        }

        return false;
    }

    async markAllAsRead(userId: string): Promise<number> {
        let count = 0;
        
        for (const notification of this.notifications.values()) {
            if (notification.userId === userId && !notification.read) {
                notification.read = true;
                notification.readAt = new Date();
                count++;
            }
        }

        if (count > 0) {
            this.emit('allRead', { userId, count });
        }

        return count;
    }

    async delete(notificationId: string, userId: string): Promise<boolean> {
        const notification = this.notifications.get(notificationId);
        
        if (notification && notification.userId === userId) {
            this.notifications.delete(notificationId);
            this.emit('deleted', notification);
            return true;
        }

        return false;
    }

    async deleteAll(userId: string): Promise<number> {
        let count = 0;
        
        for (const [id, notification] of this.notifications) {
            if (notification.userId === userId) {
                this.notifications.delete(id);
                count++;
            }
        }

        if (count > 0) {
            this.emit('allDeleted', { userId, count });
        }

        return count;
    }

    async getNotifications(userId: string, options?: NotificationQueryOptions): Promise<Notification[]> {
        let notifications = Array.from(this.notifications.values())
            .filter(n => n.userId === userId);

        // Apply filters
        if (options?.type) {
            notifications = notifications.filter(n => n.type === options.type);
        }

        if (options?.severity) {
            notifications = notifications.filter(n => n.severity === options.severity);
        }

        if (options?.read !== undefined) {
            notifications = notifications.filter(n => n.read === options.read);
        }

        if (options?.startDate) {
            notifications = notifications.filter(n => n.createdAt >= options.startDate!);
        }

        if (options?.endDate) {
            notifications = notifications.filter(n => n.createdAt <= options.endDate!);
        }

        // Apply sorting
        notifications.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

        // Apply pagination
        if (options?.limit) {
            notifications = notifications.slice(0, options.limit);
        }

        if (options?.offset) {
            notifications = notifications.slice(options.offset);
        }

        return notifications;
    }

    async getUnreadCount(userId: string): Promise<number> {
        return Array.from(this.notifications.values())
            .filter(n => n.userId === userId && !n.read)
            .length;
    }

    // ============ Subscriptions ============

    subscribe(userId: string, subscription: NotificationSubscription): string {
        const id = this.generateId();
        
        if (!this.subscriptions.has(userId)) {
            this.subscriptions.set(userId, []);
        }

        this.subscriptions.get(userId)!.push({
            ...subscription,
            id
        });

        return id;
    }

    unsubscribe(userId: string, subscriptionId: string): boolean {
        const subs = this.subscriptions.get(userId);
        
        if (subs) {
            const index = subs.findIndex(s => s.id === subscriptionId);
            if (index !== -1) {
                subs.splice(index, 1);
                return true;
            }
        }

        return false;
    }

    getSubscriptions(userId: string): NotificationSubscription[] {
        return this.subscriptions.get(userId) || [];
    }

    // ============ Private Methods ============

    private async sendWebSocket(notification: Notification): Promise<void> {
        if (!this.websocketServer) return;

        const room = `user:${notification.userId}`;
        await this.websocketServer.to(room).emit('notification', notification);
        
        // Also send unread count
        const unreadCount = await this.getUnreadCount(notification.userId!);
        await this.websocketServer.to(room).emit('unread_count', unreadCount);
    }

    private async sendEmail(notification: Notification): Promise<void> {
        if (!this.emailService || !notification.userId) return;

        // Get user email from session or user service
        // This would be implemented based on your user management

        await this.emailService.send({
            to: 'user@example.com',
            subject: notification.title,
            html: `<h1>${notification.title}</h1><p>${notification.message}</p>`
        });
    }

    private generateId(): string {
        return `notif_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    private startCleanupInterval(): void {
        setInterval(() => {
            this.trimOldNotifications();
        }, 3600000); // Every hour
    }

    private trimOldNotifications(): void {
        const cutoff = Date.now() - this.retentionPeriod;
        let deletedCount = 0;

        for (const [id, notification] of this.notifications) {
            if (notification.createdAt.getTime() < cutoff) {
                this.notifications.delete(id);
                deletedCount++;
            }
        }

        if (deletedCount > 0) {
            this.logger.info(`Cleaned up ${deletedCount} old notifications`);
        }
    }

    // ============ Utility ============

    setRetentionPeriod(ms: number): void {
        this.retentionPeriod = ms;
    }

    async clear(): Promise<void> {
        this.notifications.clear();
        this.subscriptions.clear();
        this.logger.info('All notifications cleared');
    }

    getStats(): NotificationStats {
        const notifications = Array.from(this.notifications.values());
        
        return {
            total: notifications.length,
            unread: notifications.filter(n => !n.read).length,
            byType: notifications.reduce((acc, n) => {
                acc[n.type] = (acc[n.type] || 0) + 1;
                return acc;
            }, {} as Record<string, number>),
            bySeverity: notifications.reduce((acc, n) => {
                acc[n.severity] = (acc[n.severity] || 0) + 1;
                return acc;
            }, {} as Record<string, number>)
        };
    }
}

export interface NotificationSubscription {
    id?: string;
    types?: NotificationType[];
    severities?: string[];
    channels: ('websocket' | 'email' | 'sms')[];
    endpoint?: string;
    filter?: (notification: Notification) => boolean;
}

export interface NotificationQueryOptions {
    type?: NotificationType;
    severity?: string;
    read?: boolean;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
    offset?: number;
}

export interface NotificationStats {
    total: number;
    unread: number;
    byType: Record<string, number>;
    bySeverity: Record<string, number>;
}

export const createNotificationService = (
    websocketServer?: WebSocketServer,
    emailService?: EmailService
) => {
    return new NotificationService(websocketServer, emailService);
};