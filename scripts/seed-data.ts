import sql from 'mssql';
import dotenv from 'dotenv';
import bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';

dotenv.config();

export class SQLServerSeeder {
    private pool: sql.ConnectionPool;

    constructor() {
        this.pool = new sql.ConnectionPool({
            server: process.env.SQL_SERVER || 'localhost',
            port: parseInt(process.env.SQL_PORT || '1433'),
            database: process.env.SQL_DATABASE || 'NOVA_DB',
            user: process.env.SQL_USER || 'sa',
            password: process.env.SQL_PASSWORD || '',
            options: {
                encrypt: process.env.SQL_ENCRYPT === 'true',
                trustServerCertificate: process.env.SQL_TRUST_SERVER_CERTIFICATE === 'true'
            }
        });
    }

    async initialize(): Promise<void> {
        await this.pool.connect();
        console.log('✅ Connected to SQL Server');
    }

    async seedAll(): Promise<void> {
        console.log('\n🌱 Seeding database...');

        await this.seedCompanies();
        await this.seedUsers();
        await this.seedRoles();
        await this.seedPermissions();
        await this.seedUserRoles();
        await this.seedSystemSettings();
        await this.seedCurrencies();
        await this.seedCountries();
        await this.seedLanguages();

        console.log('\n✅ Database seeding completed!');
    }

    private async seedCompanies(): Promise<void> {
        console.log('📁 Seeding companies...');

        const companies = [
            {
                SystemId: uuidv4(),
                Name: 'Default Company',
                DisplayName: 'Default Company',
                Status: 'Active',
                Settings: JSON.stringify({
                    currency: 'USD',
                    dateFormat: 'MM/dd/yyyy',
                    timeZone: 'UTC',
                    fiscalYearStart: '01-01'
                })
            }
        ];

        for (const company of companies) {
            await this.pool.request()
                .input('SystemId', sql.UniqueIdentifier, company.SystemId)
                .input('Name', sql.NVarChar, company.Name)
                .input('DisplayName', sql.NVarChar, company.DisplayName)
                .input('Status', sql.NVarChar, company.Status)
                .input('Settings', sql.NVarChar, company.Settings)
                .input('CreatedAt', sql.DateTime2, new Date())
                .query(`
                    IF NOT EXISTS (SELECT 1 FROM [Company] WHERE [Name] = @Name)
                    BEGIN
                        INSERT INTO [Company] (
                            [SystemId], [Name], [DisplayName], [Status], 
                            [Settings], [SystemCreatedAt], [SystemCreatedBy]
                        ) VALUES (
                            @SystemId, @Name, @DisplayName, @Status,
                            @Settings, @CreatedAt, 'system'
                        )
                    END
                `);
        }

        console.log(`✅ Seeded ${companies.length} company(ies)`);
    }

    private async seedUsers(): Promise<void> {
        console.log('👤 Seeding users...');

        const saltRounds = 10;
        const passwordHash = await bcrypt.hash('Admin@123', saltRounds);

        const users = [
            {
                SystemId: uuidv4(),
                Username: 'admin',
                Email: 'admin@nova.local',
                DisplayName: 'System Administrator',
                PasswordHash: passwordHash,
                IsSuperAdmin: true,
                Status: 'Active'
            },
            {
                SystemId: uuidv4(),
                Username: 'user',
                Email: 'user@nova.local',
                DisplayName: 'Standard User',
                PasswordHash: passwordHash,
                IsSuperAdmin: false,
                Status: 'Active'
            }
        ];

        for (const user of users) {
            await this.pool.request()
                .input('SystemId', sql.UniqueIdentifier, user.SystemId)
                .input('Username', sql.NVarChar, user.Username)
                .input('Email', sql.NVarChar, user.Email)
                .input('DisplayName', sql.NVarChar, user.DisplayName)
                .input('PasswordHash', sql.NVarChar, user.PasswordHash)
                .input('IsSuperAdmin', sql.Bit, user.IsSuperAdmin)
                .input('Status', sql.NVarChar, user.Status)
                .input('CreatedAt', sql.DateTime2, new Date())
                .query(`
                    IF NOT EXISTS (SELECT 1 FROM [User] WHERE [Username] = @Username)
                    BEGIN
                        INSERT INTO [User] (
                            [SystemId], [Username], [Email], [DisplayName],
                            [PasswordHash], [IsSuperAdmin], [Status],
                            [SystemCreatedAt], [SystemCreatedBy]
                        ) VALUES (
                            @SystemId, @Username, @Email, @DisplayName,
                            @PasswordHash, @IsSuperAdmin, @Status,
                            @CreatedAt, 'system'
                        )
                    END
                `);
        }

        console.log(`✅ Seeded ${users.length} user(s)`);
    }

    private async seedRoles(): Promise<void> {
        console.log('🔐 Seeding roles...');

        const roles = [
            {
                SystemId: uuidv4(),
                Name: 'Super Administrator',
                Code: 'SUPER',
                Description: 'Full system access',
                IsSystem: true
            },
            {
                SystemId: uuidv4(),
                Name: 'Administrator',
                Code: 'ADMIN',
                Description: 'Administrative access',
                IsSystem: true
            },
            {
                SystemId: uuidv4(),
                Name: 'User',
                Code: 'USER',
                Description: 'Standard user access',
                IsSystem: true
            },
            {
                SystemId: uuidv4(),
                Name: 'ReadOnly',
                Code: 'READONLY',
                Description: 'Read-only access',
                IsSystem: true
            }
        ];

        for (const role of roles) {
            await this.pool.request()
                .input('SystemId', sql.UniqueIdentifier, role.SystemId)
                .input('Name', sql.NVarChar, role.Name)
                .input('Code', sql.NVarChar, role.Code)
                .input('Description', sql.NVarChar, role.Description)
                .input('IsSystem', sql.Bit, role.IsSystem)
                .input('CreatedAt', sql.DateTime2, new Date())
                .query(`
                    IF NOT EXISTS (SELECT 1 FROM [Role] WHERE [Code] = @Code)
                    BEGIN
                        INSERT INTO [Role] (
                            [SystemId], [Name], [Code], [Description],
                            [IsSystem], [SystemCreatedAt], [SystemCreatedBy]
                        ) VALUES (
                            @SystemId, @Name, @Code, @Description,
                            @IsSystem, @CreatedAt, 'system'
                        )
                    END
                `);
        }

        console.log(`✅ Seeded ${roles.length} role(s)`);
    }

    private async seedPermissions(): Promise<void> {
        console.log('🔑 Seeding permissions...');

        // Get roles
        const rolesResult = await this.pool.request().query(`
            SELECT [SystemId], [Code] FROM [Role]
        `);

        const roles = rolesResult.recordset;

        const permissions = [
            // Super Admin - all permissions
            { roleCode: 'SUPER', objectId: -1, permissionType: '*', fields: null },
            
            // Admin permissions
            { roleCode: 'ADMIN', objectId: -1, permissionType: 'Read', fields: null },
            { roleCode: 'ADMIN', objectId: -1, permissionType: 'Insert', fields: null },
            { roleCode: 'ADMIN', objectId: -1, permissionType: 'Modify', fields: null },
            { roleCode: 'ADMIN', objectId: -1, permissionType: 'Delete', fields: null },
            
            // User permissions
            { roleCode: 'USER', objectId: -1, permissionType: 'Read', fields: null },
            
            // ReadOnly permissions
            { roleCode: 'READONLY', objectId: -1, permissionType: 'Read', fields: null }
        ];

        for (const perm of permissions) {
            const role = roles.find(r => r.Code === perm.roleCode);
            if (!role) continue;

            await this.pool.request()
                .input('SystemId', sql.UniqueIdentifier, uuidv4())
                .input('RoleId', sql.UniqueIdentifier, role.SystemId)
                .input('ObjectId', sql.Int, perm.objectId)
                .input('PermissionType', sql.NVarChar, perm.permissionType)
                .input('Fields', sql.NVarChar, perm.fields)
                .input('CreatedAt', sql.DateTime2, new Date())
                .query(`
                    IF NOT EXISTS (
                        SELECT 1 FROM [Permission] 
                        WHERE [RoleId] = @RoleId 
                        AND [ObjectId] = @ObjectId 
                        AND [PermissionType] = @PermissionType
                    )
                    BEGIN
                        INSERT INTO [Permission] (
                            [SystemId], [RoleId], [ObjectId], 
                            [PermissionType], [Fields], 
                            [SystemCreatedAt], [SystemCreatedBy]
                        ) VALUES (
                            @SystemId, @RoleId, @ObjectId,
                            @PermissionType, @Fields,
                            @CreatedAt, 'system'
                        )
                    END
                `);
        }

        console.log(`✅ Seeded ${permissions.length} permission(s)`);
    }

    private async seedUserRoles(): Promise<void> {
        console.log('👥 Seeding user roles...');

        // Get admin user
        const userResult = await this.pool.request()
            .input('Username', sql.NVarChar, 'admin')
            .query(`
                SELECT [SystemId] FROM [User] WHERE [Username] = @Username
            `);

        const adminUser = userResult.recordset[0];

        // Get roles
        const rolesResult = await this.pool.request().query(`
            SELECT [SystemId], [Code] FROM [Role]
        `);

        const roles = rolesResult.recordset;

        // Assign SUPER role to admin
        const superRole = roles.find(r => r.Code === 'SUPER');
        if (adminUser && superRole) {
            await this.pool.request()
                .input('UserId', sql.UniqueIdentifier, adminUser.SystemId)
                .input('RoleId', sql.UniqueIdentifier, superRole.SystemId)
                .query(`
                    IF NOT EXISTS (
                        SELECT 1 FROM [UserRole] 
                        WHERE [UserId] = @UserId AND [RoleId] = @RoleId
                    )
                    BEGIN
                        INSERT INTO [UserRole] ([UserId], [RoleId])
                        VALUES (@UserId, @RoleId)
                    END
                `);
        }

        console.log('✅ Seeded user roles');
    }

    private async seedSystemSettings(): Promise<void> {
        console.log('⚙️ Seeding system settings...');

        const settings = [
            {
                Key: 'ApplicationName',
                Value: 'NOVA Framework',
                Type: 'String',
                Category: 'General'
            },
            {
                Key: 'Version',
                Value: '2.0.0',
                Type: 'String',
                Category: 'System'
            },
            {
                Key: 'MaintenanceMode',
                Value: 'false',
                Type: 'Boolean',
                Category: 'System'
            },
            {
                Key: 'DefaultLanguage',
                Value: 'en-US',
                Type: 'String',
                Category: 'Localization'
            },
            {
                Key: 'SessionTimeout',
                Value: '3600',
                Type: 'Integer',
                Category: 'Security'
            },
            {
                Key: 'MaxLoginAttempts',
                Value: '5',
                Type: 'Integer',
                Category: 'Security'
            },
            {
                Key: 'PasswordExpiryDays',
                Value: '90',
                Type: 'Integer',
                Category: 'Security'
            }
        ];

        for (const setting of settings) {
            await this.pool.request()
                .input('Key', sql.NVarChar, setting.Key)
                .input('Value', sql.NVarChar, setting.Value)
                .input('Type', sql.NVarChar, setting.Type)
                .input('Category', sql.NVarChar, setting.Category)
                .query(`
                    IF NOT EXISTS (SELECT 1 FROM [SystemSetting] WHERE [Key] = @Key)
                    BEGIN
                        INSERT INTO [SystemSetting] ([Key], [Value], [Type], [Category])
                        VALUES (@Key, @Value, @Type, @Category)
                    END
                    ELSE
                    BEGIN
                        UPDATE [SystemSetting] 
                        SET [Value] = @Value, [Type] = @Type, [Category] = @Category
                        WHERE [Key] = @Key
                    END
                `);
        }

        console.log(`✅ Seeded ${settings.length} system settings`);
    }

    private async seedCurrencies(): Promise<void> {
        console.log('💰 Seeding currencies...');

        const currencies = [
            { Code: 'USD', Name: 'US Dollar', Symbol: '$', DecimalPlaces: 2, IsDefault: true },
            { Code: 'EUR', Name: 'Euro', Symbol: '€', DecimalPlaces: 2, IsDefault: false },
            { Code: 'GBP', Name: 'British Pound', Symbol: '£', DecimalPlaces: 2, IsDefault: false },
            { Code: 'JPY', Name: 'Japanese Yen', Symbol: '¥', DecimalPlaces: 0, IsDefault: false },
            { Code: 'CAD', Name: 'Canadian Dollar', Symbol: 'C$', DecimalPlaces: 2, IsDefault: false },
            { Code: 'AUD', Name: 'Australian Dollar', Symbol: 'A$', DecimalPlaces: 2, IsDefault: false }
        ];

        for (const currency of currencies) {
            await this.pool.request()
                .input('SystemId', sql.UniqueIdentifier, uuidv4())
                .input('Code', sql.NVarChar, currency.Code)
                .input('Name', sql.NVarChar, currency.Name)
                .input('Symbol', sql.NVarChar, currency.Symbol)
                .input('DecimalPlaces', sql.Int, currency.DecimalPlaces)
                .input('IsDefault', sql.Bit, currency.IsDefault)
                .query(`
                    IF NOT EXISTS (SELECT 1 FROM [Currency] WHERE [Code] = @Code)
                    BEGIN
                        INSERT INTO [Currency] (
                            [SystemId], [Code], [Name], [Symbol], 
                            [DecimalPlaces], [IsDefault]
                        ) VALUES (
                            @SystemId, @Code, @Name, @Symbol,
                            @DecimalPlaces, @IsDefault
                        )
                    END
                `);
        }

        console.log(`✅ Seeded ${currencies.length} currencies`);
    }

    private async seedCountries(): Promise<void> {
        console.log('🌍 Seeding countries...');

        const countries = [
            { Code: 'US', Name: 'United States', PhoneCode: '1', IsDefault: true },
            { Code: 'CA', Name: 'Canada', PhoneCode: '1', IsDefault: false },
            { Code: 'GB', Name: 'United Kingdom', PhoneCode: '44', IsDefault: false },
            { Code: 'DE', Name: 'Germany', PhoneCode: '49', IsDefault: false },
            { Code: 'FR', Name: 'France', PhoneCode: '33', IsDefault: false },
            { Code: 'JP', Name: 'Japan', PhoneCode: '81', IsDefault: false },
            { Code: 'AU', Name: 'Australia', PhoneCode: '61', IsDefault: false },
            { Code: 'IN', Name: 'India', PhoneCode: '91', IsDefault: false }
        ];

        for (const country of countries) {
            await this.pool.request()
                .input('SystemId', sql.UniqueIdentifier, uuidv4())
                .input('Code', sql.NVarChar, country.Code)
                .input('Name', sql.NVarChar, country.Name)
                .input('PhoneCode', sql.NVarChar, country.PhoneCode)
                .input('IsDefault', sql.Bit, country.IsDefault)
                .query(`
                    IF NOT EXISTS (SELECT 1 FROM [Country] WHERE [Code] = @Code)
                    BEGIN
                        INSERT INTO [Country] (
                            [SystemId], [Code], [Name], [PhoneCode], [IsDefault]
                        ) VALUES (
                            @SystemId, @Code, @Name, @PhoneCode, @IsDefault
                        )
                    END
                `);
        }

        console.log(`✅ Seeded ${countries.length} countries`);
    }

    private async seedLanguages(): Promise<void> {
        console.log('🗣️ Seeding languages...');

        const languages = [
            { Code: 'en-US', Name: 'English (US)', IsDefault: true, IsActive: true },
            { Code: 'en-GB', Name: 'English (UK)', IsDefault: false, IsActive: true },
            { Code: 'es', Name: 'Spanish', IsDefault: false, IsActive: true },
            { Code: 'fr', Name: 'French', IsDefault: false, IsActive: true },
            { Code: 'de', Name: 'German', IsDefault: false, IsActive: true },
            { Code: 'ja', Name: 'Japanese', IsDefault: false, IsActive: true },
            { Code: 'zh', Name: 'Chinese', IsDefault: false, IsActive: true },
            { Code: 'hi', Name: 'Hindi', IsDefault: false, IsActive: true }
        ];

        for (const lang of languages) {
            await this.pool.request()
                .input('SystemId', sql.UniqueIdentifier, uuidv4())
                .input('Code', sql.NVarChar, lang.Code)
                .input('Name', sql.NVarChar, lang.Name)
                .input('IsDefault', sql.Bit, lang.IsDefault)
                .input('IsActive', sql.Bit, lang.IsActive)
                .query(`
                    IF NOT EXISTS (SELECT 1 FROM [Language] WHERE [Code] = @Code)
                    BEGIN
                        INSERT INTO [Language] (
                            [SystemId], [Code], [Name], [IsDefault], [IsActive]
                        ) VALUES (
                            @SystemId, @Code, @Name, @IsDefault, @IsActive
                        )
                    END
                `);
        }

        console.log(`✅ Seeded ${languages.length} languages`);
    }

    async seedSpecific(tables: string[]): Promise<void> {
        console.log(`🌱 Seeding specific tables: ${tables.join(', ')}`);

        for (const table of tables) {
            switch (table.toLowerCase()) {
                case 'users':
                    await this.seedUsers();
                    break;
                case 'roles':
                    await this.seedRoles();
                    break;
                case 'permissions':
                    await this.seedPermissions();
                    break;
                case 'companies':
                    await this.seedCompanies();
                    break;
                case 'currencies':
                    await this.seedCurrencies();
                    break;
                case 'countries':
                    await this.seedCountries();
                    break;
                case 'languages':
                    await this.seedLanguages();
                    break;
                case 'settings':
                    await this.seedSystemSettings();
                    break;
                default:
                    console.log(`⚠️ Unknown table: ${table}`);
            }
        }
    }

    async truncateTables(tables: string[]): Promise<void> {
        console.log(`🗑️ Truncating tables: ${tables.join(', ')}`);

        for (const table of tables) {
            await this.pool.request().query(`
                IF EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'[${table}]') AND type in (N'U'))
                BEGIN
                    DELETE FROM [${table}];
                    DBCC CHECKIDENT ('${table}', RESEED, 0);
                END
            `);
            console.log(`   Truncated ${table}`);
        }
    }

    async close(): Promise<void> {
        await this.pool.close();
    }
}

// CLI Interface
async function main() {
    const command = process.argv[2];
    const args = process.argv.slice(3);

    const seeder = new SQLServerSeeder();

    try {
        await seeder.initialize();

        switch (command) {
            case 'all':
                await seeder.seedAll();
                break;

            case 'seed':
                if (args.length === 0) {
                    await seeder.seedAll();
                } else {
                    await seeder.seedSpecific(args);
                }
                break;

            case 'truncate':
                if (args.length > 0) {
                    await seeder.truncateTables(args);
                } else {
                    console.log('⚠️ Please specify tables to truncate');
                }
                break;

            case 'refresh':
                // Truncate and reseed
                await seeder.truncateTables([
                    'UserRole', 'Permission', 'Role', 'User',
                    'SystemSetting', 'Currency', 'Country', 'Language'
                ]);
                await seeder.seedAll();
                break;

            default:
                console.log(`
Usage:
  npm run db:seed all                    Seed all tables
  npm run db:seed seed <tables...>       Seed specific tables
  npm run db:seed truncate <tables...>   Truncate specific tables
  npm run db:seed refresh                Refresh all data (truncate + seed)
                `);
        }
    } catch (error) {
        console.error('Seeding failed:', error);
        process.exit(1);
    } finally {
        await seeder.close();
    }
}

if (require.main === module) {
    main().catch(console.error);
}

export default SQLServerSeeder;