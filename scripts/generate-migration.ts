import { SQLServerSchemaGenerator } from '@nova/compiler';
import { SQLServerConnection } from '@nova/core';
import * as fs from 'fs-extra';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config();

async function generateMigration() {
    const migrationName = process.argv[2];
    if (!migrationName) {
        console.error('Please provide a migration name');
        console.error('Usage: npm run generate:migration <name>');
        process.exit(1);
    }

    const timestamp = new Date().getTime();
    const migrationFileName = `${timestamp}_${migrationName}.sql`;
    const migrationPath = path.join(process.cwd(), 'migrations', migrationFileName);

    // Ensure migrations directory exists
    await fs.ensureDir(path.join(process.cwd(), 'migrations'));

    // Generate migration template
    const migrationTemplate = `-- Migration: ${migrationName}
-- Generated at: ${new Date().toISOString()}
-- Description: 

BEGIN TRANSACTION;

SET XACT_ABORT ON;

PRINT 'Starting migration: ${migrationName}';

-- Write your migration here



-- Update schema version
INSERT INTO [SchemaVersion] ([Version], [Description])
VALUES ('${timestamp}', '${migrationName}');

PRINT 'Migration completed successfully';

COMMIT TRANSACTION;
`;

    await fs.writeFile(migrationPath, migrationTemplate);
    console.log(`✅ Generated migration: ${migrationFileName}`);
}

generateMigration().catch(console.error);