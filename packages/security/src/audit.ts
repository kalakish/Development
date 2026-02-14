import { EventEmitter } from 'events';
import { Redis } from 'ioredis';
import { Session } from '../core/session';

export class AuditService extends EventEmitter {
    private redis: Redis;
    private enabled: boolean = true;
    private retentionDays: number = 90;
    private batchSize: number = 100;
    private auditBuffer: AuditEntry[] = [];
    private flushInterval: NodeJS.Timeout;

    constructor(redis: Redis) {
        super();
        this.redis = redis;
        this.startFlushInterval();
    }

    async log(
        session: Session,
        action: string,
        resource: AuditResource,
        options?: AuditOptions
    ): Promise<string> {
        if (!this.enabled) return '';

        const entry: AuditEntry = {
            id: this.generateAuditId(),
            timestamp: new Date(),
            sessionId: session.id,
            userId: session.user.id,
            userName: session.user.username,
            companyId: session.company.id,
            companyName: session.company.name,
            action,
            resource,
            ipAddress: options?.ipAddress || session['ipAddress'],
            userAgent: options?.userAgent || session['userAgent'],
            clientId: options?.clientId,
            correlationId: options?.correlationId,
            metadata: options?.metadata,
            severity: options?.severity || 'info'
        };

        // Add to buffer for batch writing
        this.auditBuffer.push(entry);

        // Flush if buffer is full
        if (this.auditBuffer.length >= this.batchSize) {
            await this.flush();
        }

        this.emit('auditLogged', entry);

        return entry.id;
    }

    async logSecurity(
        session: Session,
        action: AuditAction.Security,
        resource: AuditResource,
        outcome: 'success' | 'failure',
        details?: string
    ): Promise<string> {
        return this.log(session, action, resource, {
            severity: 'warning',
            metadata: { outcome, details }
        });
    }

    async logData(
        session: Session,
        action: AuditAction.Data,
        resource: AuditResource,
        changes?: Record<string, any>
    ): Promise<string> {
        return this.log(session, action, resource, {
            severity: 'info',
            metadata: { changes }
        });
    }

    async logSystem(
        session: Session,
        action: AuditAction.System,
        resource: AuditResource,
        status: string
    ): Promise<string> {
        return this.log(session, action, resource, {
            severity: 'info',
            metadata: { status }
        });
    }

    async query(filter: AuditFilter): Promise<AuditEntry[]> {
        const entries: AuditEntry[] = [];
        
        // Get audit logs from Redis
        const keys = await this.redis.keys('audit:*');
        
        for (const key of keys) {
            const data = await this.redis.lrange(key, 0, -1);
            
            for (const item of data) {
                const entry = JSON.parse(item) as AuditEntry;
                
                if (this.matchesFilter(entry, filter)) {
                    entries.push(entry);
                    
                    if (filter.limit && entries.length >= filter.limit) {
                        break;
                    }
                }
            }
        }

        // Sort by timestamp descending
        return entries.sort((a, b) => 
            b.timestamp.getTime() - a.timestamp.getTime()
        );
    }

    async getByUser(userId: string, limit: number = 100): Promise<AuditEntry[]> {
        return this.query({
            userId,
            limit
        });
    }

    async getByResource(
        resourceType: string,
        resourceId: string,
        limit: number = 100
    ): Promise<AuditEntry[]> {
        return this.query({
            resourceType,
            resourceId,
            limit
        });
    }

    async getByDateRange(
        startDate: Date,
        endDate: Date,
        limit: number = 1000
    ): Promise<AuditEntry[]> {
        return this.query({
            startDate,
            endDate,
            limit
        });
    }

    async export(format: 'json' | 'csv', filter?: AuditFilter): Promise<string> {
        const entries = await this.query(filter || {});
        
        if (format === 'json') {
            return JSON.stringify(entries, null, 2);
        } else {
            // Convert to CSV
            const headers = ['timestamp', 'userId', 'userName', 'action', 'resourceType', 'resourceId'];
            const rows = entries.map(entry => [
                entry.timestamp.toISOString(),
                entry.userId,
                entry.userName,
                entry.action,
                entry.resource.type,
                entry.resource.id,
                JSON.stringify(entry.resource.data)
            ]);
            
            return [
                headers.join(','),
                ...rows.map(row => row.map(cell => 
                    typeof cell === 'string' ? `"${cell.replace(/"/g, '""')}"` : cell
                ).join(','))
            ].join('\n');
        }
    }

    async flush(): Promise<void> {
        if (this.auditBuffer.length === 0) return;

        const buffer = [...this.auditBuffer];
        this.auditBuffer = [];

        // Group by date for Redis keys
        const grouped = new Map<string, AuditEntry[]>();
        
        for (const entry of buffer) {
            const dateKey = `audit:${entry.timestamp.toISOString().split('T')[0]}`;
            
            if (!grouped.has(dateKey)) {
                grouped.set(dateKey, []);
            }
            
            grouped.get(dateKey)!.push(entry);
        }

        // Store in Redis
        const pipeline = this.redis.pipeline();
        
        for (const [dateKey, entries] of grouped) {
            for (const entry of entries) {
                pipeline.lpush(dateKey, JSON.stringify(entry));
            }
            pipeline.expire(dateKey, this.retentionDays * 86400);
        }

        await pipeline.exec();

        this.emit('flushed', {
            count: buffer.length,
            timestamp: new Date()
        });
    }

    async archive(beforeDate: Date): Promise<number> {
        let archivedCount = 0;
        const dateStr = beforeDate.toISOString().split('T')[0];
        
        const keys = await this.redis.keys('audit:*');
        
        for (const key of keys) {
            const keyDate = key.split(':')[1];
            
            if (keyDate < dateStr) {
                // Archive to file before deleting
                await this.archiveToFile(key);
                
                // Delete from Redis
                await this.redis.del(key);
                archivedCount++;
            }
        }

        return archivedCount;
    }

    async cleanup(retentionDays?: number): Promise<number> {
        const days = retentionDays || this.retentionDays;
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - days);
        
        return this.archive(cutoffDate);
    }

    private startFlushInterval(): void {
        // Flush every 10 seconds
        this.flushInterval = setInterval(() => {
            this.flush().catch(error => {
                this.emit('error', error);
            });
        }, 10000);
    }

    private stopFlushInterval(): void {
        if (this.flushInterval) {
            clearInterval(this.flushInterval);
        }
    }

    private async archiveToFile(key: string): Promise<void> {
        // Implementation would write to file system or object storage
        this.emit('archived', { key, timestamp: new Date() });
    }

    private matchesFilter(entry: AuditEntry, filter: AuditFilter): boolean {
        if (filter.userId && entry.userId !== filter.userId) return false;
        if (filter.sessionId && entry.sessionId !== filter.sessionId) return false;
        if (filter.companyId && entry.companyId !== filter.companyId) return false;
        if (filter.action && entry.action !== filter.action) return false;
        if (filter.resourceType && entry.resource.type !== filter.resourceType) return false;
        if (filter.resourceId && entry.resource.id !== filter.resourceId) return false;
        if (filter.severity && entry.severity !== filter.severity) return false;
        
        if (filter.startDate && entry.timestamp < filter.startDate) return false;
        if (filter.endDate && entry.timestamp > filter.endDate) return false;
        
        if (filter.search) {
            const searchLower = filter.search.toLowerCase();
            const matches = 
                entry.userName.toLowerCase().includes(searchLower) ||
                entry.action.toLowerCase().includes(searchLower) ||
                JSON.stringify(entry.resource).toLowerCase().includes(searchLower);
            
            if (!matches) return false;
        }
        
        return true;
    }

    private generateAuditId(): string {
        return `aud_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    enable(): void {
        this.enabled = true;
        this.startFlushInterval();
        this.emit('enabled');
    }

    disable(): void {
        this.enabled = false;
        this.stopFlushInterval();
        this.emit('disabled');
    }

    setRetention(days: number): void {
        this.retentionDays = days;
    }

    async getStats(): Promise<AuditStats> {
        const totalKeys = await this.redis.keys('audit:*').then(keys => keys.length);
        const bufferSize = this.auditBuffer.length;
        
        // Get today's count
        const todayKey = `audit:${new Date().toISOString().split('T')[0]}`;
        const todayCount = await this.redis.llen(todayKey);
        
        return {
            enabled: this.enabled,
            retentionDays: this.retentionDays,
            totalKeys,
            bufferSize,
            todayCount
        };
    }
}

export interface AuditEntry {
    id: string;
    timestamp: Date;
    sessionId: string;
    userId: string;
    userName: string;
    companyId: string;
    companyName: string;
    action: string;
    resource: AuditResource;
    ipAddress?: string;
    userAgent?: string;
    clientId?: string;
    correlationId?: string;
    metadata?: Record<string, any>;
    severity: 'info' | 'warning' | 'error' | 'critical';
}

export interface AuditResource {
    type: string;
    id: string;
    name?: string;
    data?: any;
}

export interface AuditOptions {
    ipAddress?: string;
    userAgent?: string;
    clientId?: string;
    correlationId?: string;
    metadata?: Record<string, any>;
    severity?: 'info' | 'warning' | 'error' | 'critical';
}

export interface AuditFilter {
    userId?: string;
    sessionId?: string;
    companyId?: string;
    action?: string;
    resourceType?: string;
    resourceId?: string;
    severity?: string;
    startDate?: Date;
    endDate?: Date;
    search?: string;
    limit?: number;
    offset?: number;
}

export interface AuditStats {
    enabled: boolean;
    retentionDays: number;
    totalKeys: number;
    bufferSize: number;
    todayCount: number;
}

export enum AuditAction {
    // Security actions
    Security = 'security',
    Login = 'security.login',
    Logout = 'security.logout',
    FailedLogin = 'security.failed_login',
    PasswordChange = 'security.password_change',
    PermissionChange = 'security.permission_change',
    RoleAssignment = 'security.role_assignment',
    
    // Data actions
    Data = 'data',
    Create = 'data.create',
    Read = 'data.read',
    Update = 'data.update',
    Delete = 'data.delete',
    Export = 'data.export',
    Import = 'data.import',
    
    // System actions
    System = 'system',
    Configuration = 'system.configuration',
    Backup = 'system.backup',
    Restore = 'system.restore',
    Maintenance = 'system.maintenance'
}