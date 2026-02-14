import dotenv from 'dotenv';
import { SQLServerConfig } from '@nova/core';

dotenv.config();

export const sqlServerConfig: SQLServerConfig = {
    server: process.env.SQL_SERVER || 'localhost',
    port: parseInt(process.env.SQL_PORT || '1433'),
    database: process.env.SQL_DATABASE || 'NOVA_DB',
    user: process.env.SQL_USER || 'sa',
    password: process.env.SQL_PASSWORD || '',
    poolSize: parseInt(process.env.SQL_POOL_SIZE || '20'),
    encrypt: process.env.SQL_ENCRYPT === 'true',
    trustServerCertificate: process.env.SQL_TRUST_SERVER_CERTIFICATE === 'true',
    azure: false,
    requestTimeout: 30000,
    connectionTimeout: 15000
};