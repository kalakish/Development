// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.SQL_SERVER = 'DESKTOP-FLN7TSF\\SQLEXPRESS';
process.env.SQL_PORT = '1433';
process.env.SQL_DATABASE = 'NOVA_Test';
process.env.SQL_USER = 'sa';
process.env.SQL_PASSWORD = 'pass@word1';
process.env.JWT_SECRET = 'test-secret-key';

// Increase timeout for integration tests
jest.setTimeout(30000);