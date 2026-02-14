import { SQLServerConnection } from '@nova/core/database/sqlserver-connection';
import { SessionData } from './session-manager';

export class SessionStore {
    private connection: SQLServerConnection;
    
    constructor(connection: SQLServerConnection) {
        this.connection = connection;
    }
    
    async initialize(): Promise<void> {
        await this.ensureSessionTable();
    }
    
    private async ensureSessionTable(): Promise<void> {
        await this.connection.query(`
            IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Sessions')
            BEGIN
                CREATE TABLE [Sessions] (
                    [Id] INT IDENTITY(1,1) NOT NULL,
                    [SessionId] NVARCHAR(100) NOT NULL,
                    [UserId] UNIQUEIDENTIFIER NOT NULL,
                    [Username] NVARCHAR(100) NOT NULL,
                    [Token] NVARCHAR(255) NOT NULL,
                    [IpAddress] NVARCHAR(50) NULL,
                    [UserAgent] NVARCHAR(500) NULL,
                    [Data] NVARCHAR(MAX) NULL,
                    [CreatedAt] DATETIME2 NOT NULL,
                    [UpdatedAt] DATETIME2 NOT NULL,
                    [ExpiresAt] DATETIME2 NOT NULL,
                    [IsActive] BIT NOT NULL CONSTRAINT [DF_Sessions_IsActive] DEFAULT 1,
                    [SystemCreatedAt] DATETIME2 NOT NULL CONSTRAINT [DF_Sessions_CreatedAt] DEFAULT GETUTCDATE(),
                    CONSTRAINT [PK_Sessions] PRIMARY KEY CLUSTERED ([Id])
                );
                
                CREATE UNIQUE INDEX [UX_Sessions_SessionId] ON [Sessions] ([SessionId]);
                CREATE INDEX [IX_Sessions_UserId] ON [Sessions] ([UserId]);
                CREATE INDEX [IX_Sessions_ExpiresAt] ON [Sessions] ([ExpiresAt]);
                
                PRINT '✅ Created Sessions table';
            END
        `);
    }
    
    // ============ CRUD Operations ============
    
    async save(session: SessionData): Promise<void> {
        const query = `
            MERGE INTO [Sessions] AS target
            USING (SELECT @SessionId AS SessionId) AS source
            ON target.[SessionId] = source.[SessionId]
            WHEN MATCHED THEN
                UPDATE SET 
                    [Token] = @Token,
                    [IpAddress] = @IpAddress,
                    [UserAgent] = @UserAgent,
                    [Data] = @Data,
                    [UpdatedAt] = @UpdatedAt,
                    [ExpiresAt] = @ExpiresAt,
                    [IsActive] = @IsActive
            WHEN NOT MATCHED THEN
                INSERT ([SessionId], [UserId], [Username], [Token], 
                        [IpAddress], [UserAgent], [Data], 
                        [CreatedAt], [UpdatedAt], [ExpiresAt], [IsActive])
                VALUES (@SessionId, @UserId, @Username, @Token,
                        @IpAddress, @UserAgent, @Data,
                        @CreatedAt, @UpdatedAt, @ExpiresAt, @IsActive);
        `;
        
        await this.connection.query(query, [
            session.id,
            session.userId,
            session.username,
            session.token,
            session.ipAddress || null,
            session.userAgent || null,
            JSON.stringify(session.data),
            session.createdAt,
            session.updatedAt,
            session.expiresAt,
            session.isActive ? 1 : 0
        ]);
    }
    
    async get(sessionId: string): Promise<SessionData | null> {
        const result = await this.connection.query(`
            SELECT * FROM [Sessions]
            WHERE [SessionId] = @SessionId
        `, [sessionId]);
        
        if (result.recordset.length === 0) {
            return null;
        }
        
        const row = result.recordset[0];
        
        return {
            id: row.SessionId,
            userId: row.UserId,
            username: row.Username,
            token: row.Token,
            ipAddress: row.IpAddress,
            userAgent: row.UserAgent,
            data: row.Data ? JSON.parse(row.Data) : {},
            createdAt: row.CreatedAt,
            updatedAt: row.UpdatedAt,
            expiresAt: row.ExpiresAt,
            isActive: row.IsActive === 1
        };
    }
    
    async delete(sessionId: string): Promise<void> {
        await this.connection.query(`
            DELETE FROM [Sessions]
            WHERE [SessionId] = @SessionId
        `, [sessionId]);
    }
    
    async deleteByUserId(userId: string): Promise<number> {
        const result = await this.connection.query(`
            DELETE FROM [Sessions]
            WHERE [UserId] = @UserId
        `, [userId]);
        
        return result.rowsAffected[0];
    }
    
    // ============ Query Operations ============
    
    async getByUserId(userId: string): Promise<SessionData[]> {
        const result = await this.connection.query(`
            SELECT * FROM [Sessions]
            WHERE [UserId] = @UserId AND [IsActive] = 1
            ORDER BY [UpdatedAt] DESC
        `, [userId]);
        
        return result.recordset.map(row => ({
            id: row.SessionId,
            userId: row.UserId,
            username: row.Username,
            token: row.Token,
            ipAddress: row.IpAddress,
            userAgent: row.UserAgent,
            data: row.Data ? JSON.parse(row.Data) : {},
            createdAt: row.CreatedAt,
            updatedAt: row.UpdatedAt,
            expiresAt: row.ExpiresAt,
            isActive: row.IsActive === 1
        }));
    }
    
    async getActiveSessions(): Promise<SessionData[]> {
        const result = await this.connection.query(`
            SELECT * FROM [Sessions]
            WHERE [ExpiresAt] > GETUTCDATE() AND [IsActive] = 1
            ORDER BY [UpdatedAt] DESC
        `);
        
        return result.recordset.map(row => ({
            id: row.SessionId,
            userId: row.UserId,
            username: row.Username,
            token: row.Token,
            ipAddress: row.IpAddress,
            userAgent: row.UserAgent,
            data: row.Data ? JSON.parse(row.Data) : {},
            createdAt: row.CreatedAt,
            updatedAt: row.UpdatedAt,
            expiresAt: row.ExpiresAt,
            isActive: row.IsActive === 1
        }));
    }
    
    async getExpiredSessions(): Promise<SessionData[]> {
        const result = await this.connection.query(`
            SELECT * FROM [Sessions]
            WHERE [ExpiresAt] <= GETUTCDATE()
            ORDER BY [ExpiresAt] ASC
        `);
        
        return result.recordset.map(row => ({
            id: row.SessionId,
            userId: row.UserId,
            username: row.Username,
            token: row.Token,
            ipAddress: row.IpAddress,
            userAgent: row.UserAgent,
            data: row.Data ? JSON.parse(row.Data) : {},
            createdAt: row.CreatedAt,
            updatedAt: row.UpdatedAt,
            expiresAt: row.ExpiresAt,
            isActive: row.IsActive === 1
        }));
    }
    
    // ============ Statistics ============
    
    async getCount(): Promise<number> {
        const result = await this.connection.query(`
            SELECT COUNT(*) AS Count FROM [Sessions]
            WHERE [IsActive] = 1
        `);
        
        return result.recordset[0].Count;
    }
    
    async getUserSessionCount(userId: string): Promise<number> {
        const result = await this.connection.query(`
            SELECT COUNT(*) AS Count FROM [Sessions]
            WHERE [UserId] = @UserId AND [IsActive] = 1
        `, [userId]);
        
        return result.recordset[0].Count;
    }
    
    async cleanup(): Promise<number> {
        const result = await this.connection.query(`
            DELETE FROM [Sessions]
            WHERE [ExpiresAt] <= GETUTCDATE()
        `);
        
        return result.rowsAffected[0];
    }
}