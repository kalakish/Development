import { SQLServerConnection } from '@nova/core/database/sqlserver-connection';
import { TOTPProvider } from './totp-provider';
import { EncryptionService } from '../encryption/encryption-service';
import { v4 as uuidv4 } from 'uuid';

export interface MFAConfig {
    enabled: boolean;
    required: boolean;
    methods: MFAMethod[];
    rememberDeviceDays?: number;
    maxAttempts?: number;
    lockoutDuration?: number;
}

export enum MFAMethod {
    TOTP = 'totp',
    SMS = 'sms',
    EMAIL = 'email',
    BACKUP_CODE = 'backup_code',
    WEBAUTHN = 'webauthn'
}

export interface MFARequest {
    userId: string;
    method: MFAMethod;
    challenge?: string;
    expiresAt: Date;
    attempts: number;
}

export interface MFAVerification {
    success: boolean;
    method: MFAMethod;
    message?: string;
    remainingAttempts?: number;
    backupCodes?: string[];
}

export interface MFADevice {
    id: string;
    userId: string;
    method: MFAMethod;
    name: string;
    secret?: string;
    phoneNumber?: string;
    email?: string;
    publicKey?: string;
    credentialId?: string;
    registeredAt: Date;
    lastUsedAt?: Date;
    verified: boolean;
}

export class MFAService {
    private connection: SQLServerConnection;
    private encryptionService: EncryptionService;
    private totpProvider: TOTPProvider;
    private config: MFAConfig;
    
    constructor(
        connection: SQLServerConnection,
        encryptionService: EncryptionService,
        config: MFAConfig
    ) {
        this.connection = connection;
        this.encryptionService = encryptionService;
        this.totpProvider = new TOTPProvider();
        this.config = config;
    }
    
    async initialize(): Promise<void> {
        await this.ensureMFATables();
    }
    
    private async ensureMFATables(): Promise<void> {
        // Create MFADevices table
        await this.connection.query(`
            IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'MFADevices')
            BEGIN
                CREATE TABLE [MFADevices] (
                    [Id] INT IDENTITY(1,1) NOT NULL,
                    [SystemId] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [DF_MFADevices_SystemId] DEFAULT NEWID(),
                    [UserId] UNIQUEIDENTIFIER NOT NULL,
                    [Method] NVARCHAR(20) NOT NULL,
                    [Name] NVARCHAR(255) NOT NULL,
                    [Secret] NVARCHAR(500) NULL,
                    [PhoneNumber] NVARCHAR(50) NULL,
                    [Email] NVARCHAR(255) NULL,
                    [PublicKey] NVARCHAR(MAX) NULL,
                    [CredentialId] NVARCHAR(500) NULL,
                    [RegisteredAt] DATETIME2 NOT NULL CONSTRAINT [DF_MFADevices_RegisteredAt] DEFAULT GETUTCDATE(),
                    [LastUsedAt] DATETIME2 NULL,
                    [Verified] BIT NOT NULL CONSTRAINT [DF_MFADevices_Verified] DEFAULT 0,
                    [SystemDeletedAt] DATETIME2 NULL,
                    CONSTRAINT [PK_MFADevices] PRIMARY KEY CLUSTERED ([Id])
                );
                
                CREATE UNIQUE INDEX [UX_MFADevices_SystemId] ON [MFADevices] ([SystemId]);
                CREATE INDEX [IX_MFADevices_UserId] ON [MFADevices] ([UserId]);
                CREATE INDEX [IX_MFADevices_Method] ON [MFADevices] ([Method]);
                
                PRINT '✅ Created MFADevices table';
            END
        `);
        
        // Create MFARequests table
        await this.connection.query(`
            IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'MFARequests')
            BEGIN
                CREATE TABLE [MFARequests] (
                    [Id] INT IDENTITY(1,1) NOT NULL,
                    [SystemId] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [DF_MFARequests_SystemId] DEFAULT NEWID(),
                    [UserId] UNIQUEIDENTIFIER NOT NULL,
                    [Method] NVARCHAR(20) NOT NULL,
                    [Challenge] NVARCHAR(500) NULL,
                    [ExpiresAt] DATETIME2 NOT NULL,
                    [Attempts] INT NOT NULL CONSTRAINT [DF_MFARequests_Attempts] DEFAULT 0,
                    [SystemCreatedAt] DATETIME2 NOT NULL CONSTRAINT [DF_MFARequests_CreatedAt] DEFAULT GETUTCDATE(),
                    CONSTRAINT [PK_MFARequests] PRIMARY KEY CLUSTERED ([Id])
                );
                
                CREATE INDEX [IX_MFARequests_UserId] ON [MFARequests] ([UserId]);
                CREATE INDEX [IX_MFARequests_ExpiresAt] ON [MFARequests] ([ExpiresAt]);
                
                PRINT '✅ Created MFARequests table';
            END
        `);
        
        // Create BackupCodes table
        await this.connection.query(`
            IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'BackupCodes')
            BEGIN
                CREATE TABLE [BackupCodes] (
                    [Id] INT IDENTITY(1,1) NOT NULL,
                    [SystemId] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [DF_BackupCodes_SystemId] DEFAULT NEWID(),
                    [UserId] UNIQUEIDENTIFIER NOT NULL,
                    [Code] NVARCHAR(100) NOT NULL,
                    [UsedAt] DATETIME2 NULL,
                    [ExpiresAt] DATETIME2 NULL,
                    [SystemCreatedAt] DATETIME2 NOT NULL CONSTRAINT [DF_BackupCodes_CreatedAt] DEFAULT GETUTCDATE(),
                    CONSTRAINT [PK_BackupCodes] PRIMARY KEY CLUSTERED ([Id])
                );
                
                CREATE INDEX [IX_BackupCodes_UserId] ON [BackupCodes] ([UserId]);
                CREATE UNIQUE INDEX [UX_BackupCodes_Code] ON [BackupCodes] ([Code]);
                
                PRINT '✅ Created BackupCodes table';
            END
        `);
    }
    
    // ============ Device Registration ============
    
    async registerTOTPDevice(
        userId: string,
        deviceName: string
    ): Promise<{ secret: string; qrCode: string; backupCodes: string[] }> {
        // Generate TOTP secret
        const secret = this.totpProvider.generateSecret();
        const qrCode = this.totpProvider.getQRCode(secret, deviceName, userId);
        
        // Encrypt secret for storage
        const encryptedSecret = this.encryptionService.encrypt(secret, process.env.MFA_ENCRYPTION_KEY!);
        const encryptedSecretString = JSON.stringify(encryptedSecret);
        
        // Create device
        const deviceId = uuidv4();
        
        await this.connection.query(`
            INSERT INTO [MFADevices] (
                [SystemId], [UserId], [Method], [Name], [Secret], [Verified]
            ) VALUES (
                @DeviceId, @UserId, 'totp', @DeviceName, @Secret, 0
            )
        `, [
            deviceId,
            userId,
            deviceName,
            encryptedSecretString
        ]);
        
        // Generate backup codes
        const backupCodes = await this.generateBackupCodes(userId, 10);
        
        return {
            secret,
            qrCode,
            backupCodes
        };
    }
    
    async verifyTOTPDevice(
        userId: string,
        deviceId: string,
        code: string
    ): Promise<boolean> {
        // Get device
        const result = await this.connection.query(`
            SELECT * FROM [MFADevices]
            WHERE [SystemId] = @DeviceId AND [UserId] = @UserId AND [SystemDeletedAt] IS NULL
        `, [deviceId, userId]);
        
        if (result.recordset.length === 0) {
            throw new Error('Device not found');
        }
        
        const device = result.recordset[0];
        
        // Decrypt secret
        const encryptedSecret = JSON.parse(device.Secret);
        const secret = this.encryptionService.decrypt(encryptedSecret, process.env.MFA_ENCRYPTION_KEY!);
        
        // Verify code
        const isValid = this.totpProvider.verifyToken(code, secret);
        
        if (isValid) {
            await this.connection.query(`
                UPDATE [MFADevices]
                SET [Verified] = 1, [LastUsedAt] = GETUTCDATE()
                WHERE [SystemId] = @DeviceId
            `, [deviceId]);
        }
        
        return isValid;
    }
    
    async registerSMSDevice(
        userId: string,
        phoneNumber: string,
        deviceName: string
    ): Promise<void> {
        const deviceId = uuidv4();
        
        await this.connection.query(`
            INSERT INTO [MFADevices] (
                [SystemId], [UserId], [Method], [Name], [PhoneNumber], [Verified]
            ) VALUES (
                @DeviceId, @UserId, 'sms', @DeviceName, @PhoneNumber, 0
            )
        `, [
            deviceId,
            userId,
            deviceName,
            phoneNumber
        ]);
    }
    
    async registerEmailDevice(
        userId: string,
        email: string,
        deviceName: string
    ): Promise<void> {
        const deviceId = uuidv4();
        
        await this.connection.query(`
            INSERT INTO [MFADevices] (
                [SystemId], [UserId], [Method], [Name], [Email], [Verified]
            ) VALUES (
                @DeviceId, @UserId, 'email', @DeviceName, @Email, 0
            )
        `, [
            deviceId,
            userId,
            deviceName,
            email
        ]);
    }
    
    // ============ MFA Requests ============
    
    async createMFARequest(
        userId: string,
        method: MFAMethod
    ): Promise<MFARequest> {
        // Clean up expired requests
        await this.cleanupExpiredRequests();
        
        const requestId = uuidv4();
        const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes
        
        await this.connection.query(`
            INSERT INTO [MFARequests] (
                [SystemId], [UserId], [Method], [ExpiresAt], [Attempts]
            ) VALUES (
                @RequestId, @UserId, @Method, @ExpiresAt, 0
            )
        `, [
            requestId,
            userId,
            method,
            expiresAt
        ]);
        
        return {
            userId,
            method,
            challenge: requestId,
            expiresAt,
            attempts: 0
        };
    }
    
    async verifyMFARequest(
        requestId: string,
        code: string
    ): Promise<MFAVerification> {
        // Get request
        const result = await this.connection.query(`
            SELECT * FROM [MFARequests]
            WHERE [SystemId] = @RequestId AND [ExpiresAt] > GETUTCDATE()
        `, [requestId]);
        
        if (result.recordset.length === 0) {
            return {
                success: false,
                method: MFAMethod.TOTP,
                message: 'MFA request expired or not found'
            };
        }
        
        const request = result.recordset[0];
        
        // Increment attempts
        await this.connection.query(`
            UPDATE [MFARequests]
            SET [Attempts] = [Attempts] + 1
            WHERE [SystemId] = @RequestId
        `, [requestId]);
        
        const attempts = request.Attempts + 1;
        
        // Check max attempts
        if (attempts > (this.config.maxAttempts || 5)) {
            await this.connection.query(`
                DELETE FROM [MFARequests]
                WHERE [SystemId] = @RequestId
            `, [requestId]);
            
            return {
                success: false,
                method: request.Method,
                message: 'Too many failed attempts',
                remainingAttempts: 0
            };
        }
        
        // Verify code based on method
        let isValid = false;
        
        switch (request.Method) {
            case 'totp':
                isValid = await this.verifyTOTPCode(request.UserId, code);
                break;
            case 'sms':
            case 'email':
                isValid = await this.verifyOTPCode(request.UserId, request.Method, code);
                break;
            case 'backup_code':
                isValid = await this.verifyBackupCode(request.UserId, code);
                break;
        }
        
        if (isValid) {
            // Delete request
            await this.connection.query(`
                DELETE FROM [MFARequests]
                WHERE [SystemId] = @RequestId
            `, [requestId]);
            
            // Update device last used
            await this.connection.query(`
                UPDATE [MFADevices]
                SET [LastUsedAt] = GETUTCDATE()
                WHERE [UserId] = @UserId AND [Method] = @Method AND [Verified] = 1
            `, [request.UserId, request.Method]);
            
            return {
                success: true,
                method: request.Method,
                message: 'Verification successful'
            };
        }
        
        return {
            success: false,
            method: request.Method,
            message: 'Invalid verification code',
            remainingAttempts: (this.config.maxAttempts || 5) - attempts
        };
    }
    
    private async verifyTOTPCode(userId: string, code: string): Promise<boolean> {
        const result = await this.connection.query(`
            SELECT * FROM [MFADevices]
            WHERE [UserId] = @UserId AND [Method] = 'totp' AND [Verified] = 1
        `, [userId]);
        
        for (const device of result.recordset) {
            const encryptedSecret = JSON.parse(device.Secret);
            const secret = this.encryptionService.decrypt(encryptedSecret, process.env.MFA_ENCRYPTION_KEY!);
            
            if (this.totpProvider.verifyToken(code, secret)) {
                return true;
            }
        }
        
        return false;
    }
    
    private async verifyOTPCode(userId: string, method: string, code: string): Promise<boolean> {
        // This would integrate with SMS/Email service
        return false;
    }
    
    // ============ Backup Codes ============
    
    private async generateBackupCodes(userId: string, count: number): Promise<string[]> {
        const codes: string[] = [];
        
        for (let i = 0; i < count; i++) {
            const code = this.generateBackupCode();
            codes.push(code);
            
            const codeId = uuidv4();
            const expiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000); // 1 year
            
            await this.connection.query(`
                INSERT INTO [BackupCodes] (
                    [SystemId], [UserId], [Code], [ExpiresAt]
                ) VALUES (
                    @CodeId, @UserId, @Code, @ExpiresAt
                )
            `, [
                codeId,
                userId,
                code,
                expiresAt
            ]);
        }
        
        return codes;
    }
    
    private async verifyBackupCode(userId: string, code: string): Promise<boolean> {
        const result = await this.connection.query(`
            SELECT * FROM [BackupCodes]
            WHERE [UserId] = @UserId AND [Code] = @Code
                AND [UsedAt] IS NULL
                AND ([ExpiresAt] IS NULL OR [ExpiresAt] > GETUTCDATE())
        `, [userId, code]);
        
        if (result.recordset.length > 0) {
            // Mark as used
            await this.connection.query(`
                UPDATE [BackupCodes]
                SET [UsedAt] = GETUTCDATE()
                WHERE [UserId] = @UserId AND [Code] = @Code
            `, [userId, code]);
            
            return true;
        }
        
        return false;
    }
    
    private generateBackupCode(): string {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        let code = '';
        
        for (let i = 0; i < 8; i++) {
            code += chars[Math.floor(Math.random() * chars.length)];
            if (i === 3) code += '-';
        }
        
        return code;
    }
    
    // ============ Device Management ============
    
    async getUserDevices(userId: string): Promise<MFADevice[]> {
        const result = await this.connection.query(`
            SELECT * FROM [MFADevices]
            WHERE [UserId] = @UserId AND [SystemDeletedAt] IS NULL
            ORDER BY [Verified] DESC, [RegisteredAt] ASC
        `, [userId]);
        
        return result.recordset.map(row => ({
            id: row.SystemId,
            userId: row.UserId,
            method: row.Method,
            name: row.Name,
            phoneNumber: row.PhoneNumber,
            email: row.Email,
            publicKey: row.PublicKey,
            credentialId: row.CredentialId,
            registeredAt: row.RegisteredAt,
            lastUsedAt: row.LastUsedAt,
            verified: row.Verified === 1
        }));
    }
    
    async deleteDevice(deviceId: string, userId: string): Promise<void> {
        await this.connection.query(`
            UPDATE [MFADevices]
            SET [SystemDeletedAt] = GETUTCDATE()
            WHERE [SystemId] = @DeviceId AND [UserId] = @UserId
        `, [deviceId, userId]);
    }
    
    async getBackupCodes(userId: string): Promise<string[]> {
        const result = await this.connection.query(`
            SELECT [Code] FROM [BackupCodes]
            WHERE [UserId] = @UserId AND [UsedAt] IS NULL
                AND ([ExpiresAt] IS NULL OR [ExpiresAt] > GETUTCDATE())
        `, [userId]);
        
        return result.recordset.map(row => row.Code);
    }
    
    async regenerateBackupCodes(userId: string): Promise<string[]> {
        // Delete old codes
        await this.connection.query(`
            DELETE FROM [BackupCodes]
            WHERE [UserId] = @UserId
        `, [userId]);
        
        // Generate new codes
        return this.generateBackupCodes(userId, 10);
    }
    
    // ============ Cleanup ============
    
    private async cleanupExpiredRequests(): Promise<void> {
        await this.connection.query(`
            DELETE FROM [MFARequests]
            WHERE [ExpiresAt] <= GETUTCDATE()
        `);
    }
    
    async cleanup(): Promise<void> {
        await this.cleanupExpiredRequests();
    }
    
    // ============ Configuration ============
    
    isMFAEnabled(): boolean {
        return this.config.enabled;
    }
    
    isMFARequired(): boolean {
        return this.config.required;
    }
    
    getAvailableMethods(userId?: string): MFAMethod[] {
        return this.config.methods;
    }
    
    async isUserMFAEnabled(userId: string): Promise<boolean> {
        const devices = await this.getUserDevices(userId);
        return devices.some(d => d.verified);
    }
}