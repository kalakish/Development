import { SQLServerConnection } from '@nova/core';
import * as fs from 'fs-extra';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config();

async function rollbackMigration() {
    const targetVersion = process.argv[2];
    
    const config = {
        server: process.env.SQL_SERVER || 'localhost',
        port: parseInt(process.env.SQL_PORT || '1433'),
        database: process.env.SQL_DATABASE || 'NOVA_DB',
        user: process.env.SQL_USER || 'sa',
        password: process.env.SQL_PASSWORD || '',
        encrypt: process.env.SQL_ENCRYPT === 'true',
        trustServerCertificate: process.env.SQL_TRUST_SERVER_CERTIFICATE === 'true'
    };

    const connection = new SQLServerConnection(config);
    await connection.connect();

    try {
        // Get last migration
        const result = await connection.query(`
            SELECT TOP 1 [Version], [Description]
            FROM [SchemaVersion]
            ORDER BY [Id] DESC
        `);

        const lastMigration = result.recordset[0];
        
        if (!lastMigration) {
            console.log('No migrations found');
            return;
        }

        if (targetVersion && targetVersion !== lastMigration.Version) {
            console.log(`Target version ${targetVersion} is not the last migration`);
            return;
        }

        // Find rollback script
        const migrationFiles = await fs.readdir(path.join(process.cwd(), 'migrations'));
        const targetFile = migrationFiles.find(f => f.includes(lastMigration.Version));
        
        if (!targetFile) {
            console.log(`Migration file for version ${lastMigration.Version} not found`);
            return;
        }

        const migrationContent = await fs.readFile(
            path.join(process.cwd(), 'migrations', targetFile),
            'utf-8'
        );

        // Extract rollback section
        const rollbackMatch = migrationContent.match(/-- ROLLBACK START\n([\s\S]*?)-- ROLLBACK END/);
        
        if (!rollbackMatch) {
            console.log('No rollback script found in migration file');
            
            // Prompt to proceed without rollback
            const readline = require('readline').createInterface({
                input: process.stdin,
                output: process.stdout
            });

            const answer = await new Promise(resolve => {
                readline.question('No rollback script found. Delete version record only? (y/N): ', resolve);
            });

            readline.close();

            if (answer.toLowerCase() !== 'y') {
                console.log('Rollback cancelled');
                return;
            }

            // Delete version record
            await connection.query(`
                DELETE FROM [SchemaVersion]
                WHERE [Version] = '${lastMigration.Version}'
            `);

            console.log(`✅ Version record deleted: ${lastMigration.Version}`);
            return;
        }

        const rollbackScript = rollbackMatch[1];

        // Execute rollback
        console.log(`Rolling back migration: ${lastMigration.Description}`);
        console.log(`Version: ${lastMigration.Version}`);

        await connection.query(rollbackScript);

        // Delete version record
        await connection.query(`
            DELETE FROM [SchemaVersion]
            WHERE [Version] = '${lastMigration.Version}'
        `);

        console.log('✅ Rollback completed successfully');

    } finally {
        await connection.disconnect();
    }
}

rollbackMigration().catch(console.error);