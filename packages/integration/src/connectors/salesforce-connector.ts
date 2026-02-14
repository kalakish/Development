import { EventEmitter } from 'events';
import { Logger } from '@nova/core/utils/logger';
import jsforce from 'jsforce';

export interface SalesforceConnectorOptions {
    username: string;
    password: string;
    securityToken?: string;
    loginUrl?: string;
    version?: string;
}

export class SalesforceConnector extends EventEmitter {
    private options: SalesforceConnectorOptions;
    private logger: Logger;
    private connection: jsforce.Connection;
    private connected: boolean = false;

    constructor(options: SalesforceConnectorOptions) {
        super();
        this.options = {
            loginUrl: 'https://login.salesforce.com',
            version: '57.0',
            ...options
        };

        this.logger = new Logger('SalesforceConnector');
        this.connection = new jsforce.Connection({
            loginUrl: this.options.loginUrl,
            version: this.options.version
        });
    }

    async connect(): Promise<void> {
        try {
            const password = this.options.securityToken
                ? `${this.options.password}${this.options.securityToken}`
                : this.options.password;

            await this.connection.login(
                this.options.username,
                password
            );

            this.connected = true;
            this.logger.success('Connected to Salesforce');
            this.emit('connected');

        } catch (error) {
            this.logger.error(`Failed to connect to Salesforce: ${error.message}`);
            throw error;
        }
    }

    async disconnect(): Promise<void> {
        try {
            await this.connection.logout();
            this.connected = false;
            this.logger.info('Disconnected from Salesforce');
            this.emit('disconnected');
        } catch (error) {
            this.logger.error(`Failed to disconnect: ${error.message}`);
            throw error;
        }
    }

    // ============ SOQL Queries ============

    async query<T = any>(soql: string): Promise<T[]> {
        if (!this.connected) {
            await this.connect();
        }

        const result = await this.connection.query(soql);
        return result.records as T[];
    }

    async queryById<T = any>(objectType: string, id: string): Promise<T | null> {
        const result = await this.connection.sobject(objectType).retrieve(id);
        return result || null;
    }

    // ============ CRUD Operations ============

    async create(objectType: string, data: any): Promise<string> {
        const result = await this.connection.sobject(objectType).create(data);
        return result.id;
    }

    async update(objectType: string, id: string, data: any): Promise<void> {
        await this.connection.sobject(objectType).update({
            Id: id,
            ...data
        });
    }

    async upsert(objectType: string, externalField: string, data: any): Promise<string> {
        const result = await this.connection.sobject(objectType)
            .upsert(data, externalField);
        return result.id;
    }

    async delete(objectType: string, id: string): Promise<void> {
        await this.connection.sobject(objectType).destroy(id);
    }

    // ============ Describe Operations ============

    async describe(objectType: string): Promise<any> {
        return this.connection.sobject(objectType).describe();
    }

    async getObjectTypes(): Promise<string[]> {
        const describe = await this.connection.describeGlobal();
        return describe.sobjects.map(s => s.name);
    }

    // ============ Bulk API ============

    async bulkInsert(objectType: string, records: any[]): Promise<any> {
        const job = this.connection.bulk.createJob(objectType, 'insert');
        const batch = job.createBatch();
        
        return new Promise((resolve, reject) => {
            batch.execute(records);
            batch.on('error', reject);
            batch.on('response', resolve);
        });
    }

    async bulkQuery(objectType: string, soql: string): Promise<any[]> {
        const records: any[] = [];
        
        return new Promise((resolve, reject) => {
            const query = this.connection.bulk.query(soql);
            
            query.on('record', (record) => records.push(record));
            query.on('error', reject);
            query.on('end', () => resolve(records));
        });
    }

    // ============ Metadata API ============

    async describeMetadata(): Promise<any> {
        return this.connection.metadata.describe();
    }

    async readMetadata(type: string, fullNames: string[]): Promise<any> {
        return this.connection.metadata.read(type, fullNames);
    }

    async createMetadata(type: string, metadata: any): Promise<any> {
        return this.connection.metadata.create(type, metadata);
    }

    async updateMetadata(type: string, metadata: any): Promise<any> {
        return this.connection.metadata.update(type, metadata);
    }

    async deleteMetadata(type: string, fullNames: string[]): Promise<any> {
        return this.connection.metadata.delete(type, fullNames);
    }

    // ============ Tooling API ============

    async executeAnonymous(apex: string): Promise<any> {
        return this.connection.tooling.executeAnonymous(apex);
    }

    async runTests(testClasses: string[]): Promise<any> {
        return this.connection.tooling.runTests({
            classNames: testClasses
        });
    }

    // ============ Limits ============

    async getLimits(): Promise<any> {
        return this.connection.limits();
    }

    // ============ Identity ============

    async getIdentity(): Promise<any> {
        return this.connection.identity();
    }

    // ============ Status ============

    isConnected(): boolean {
        return this.connected;
    }

    getConnection(): jsforce.Connection {
        return this.connection;
    }

    getAccessToken(): string | undefined {
        return this.connection.accessToken;
    }

    getInstanceUrl(): string | undefined {
        return this.connection.instanceUrl;
    }
}