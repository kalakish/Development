import { EventEmitter } from 'events';
import { Logger } from '@nova/core/utils/logger';
import axios, { AxiosInstance } from 'axios';

export interface DynamicsConnectorOptions {
    tenantId: string;
    clientId: string;
    clientSecret: string;
    resourceUrl: string;
    apiUrl: string;
    version?: string;
}

export class DynamicsConnector extends EventEmitter {
    private options: DynamicsConnectorOptions;
    private logger: Logger;
    private client: AxiosInstance;
    private accessToken: string | null = null;
    private tokenExpiry: Date | null = null;
    private connected: boolean = false;

    constructor(options: DynamicsConnectorOptions) {
        super();
        this.options = {
            version: 'v9.2',
            ...options
        };

        this.logger = new Logger('DynamicsConnector');
        this.client = axios.create({
            baseURL: `${this.options.apiUrl}/api/data/${this.options.version}`,
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'OData-MaxVersion': '4.0',
                'OData-Version': '4.0'
            }
        });

        // Add auth interceptor
        this.client.interceptors.request.use(async (config) => {
            await this.ensureToken();
            config.headers.Authorization = `Bearer ${this.accessToken}`;
            return config;
        });

        // Add response interceptor
        this.client.interceptors.response.use(
            response => response,
            async (error) => {
                if (error.response?.status === 401) {
                    this.accessToken = null;
                    return this.client.request(error.config);
                }
                return Promise.reject(error);
            }
        );
    }

    private async acquireToken(): Promise<string> {
        const url = `https://login.microsoftonline.com/${this.options.tenantId}/oauth2/token`;
        
        const params = new URLSearchParams();
        params.append('grant_type', 'client_credentials');
        params.append('client_id', this.options.clientId);
        params.append('client_secret', this.options.clientSecret);
        params.append('resource', this.options.resourceUrl);

        try {
            const response = await axios.post(url, params, {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            });

            this.accessToken = response.data.access_token;
            this.tokenExpiry = new Date(Date.now() + (response.data.expires_in * 1000));
            
            return this.accessToken;
        } catch (error) {
            this.logger.error(`Failed to acquire token: ${error.message}`);
            throw error;
        }
    }

    private async ensureToken(): Promise<void> {
        if (!this.accessToken || !this.tokenExpiry || this.tokenExpiry <= new Date()) {
            await this.acquireToken();
        }
    }

    async connect(): Promise<void> {
        try {
            await this.acquireToken();
            this.connected = true;
            this.logger.success('Connected to Dynamics 365');
            this.emit('connected');
        } catch (error) {
            this.logger.error(`Failed to connect to Dynamics 365: ${error.message}`);
            throw error;
        }
    }

    async disconnect(): Promise<void> {
        this.accessToken = null;
        this.tokenExpiry = null;
        this.connected = false;
        this.logger.info('Disconnected from Dynamics 365');
        this.emit('disconnected');
    }

    // ============ CRUD Operations ============

    async create(entitySet: string, data: any): Promise<string> {
        const response = await this.client.post(`/${entitySet}`, data);
        
        const id = response.headers['odata-entityid']?.split('(')[1]?.split(')')[0];
        return id;
    }

    async retrieve(entitySet: string, id: string, expand?: string[]): Promise<any> {
        let url = `/${entitySet}(${id})`;
        
        if (expand && expand.length > 0) {
            url += `?$expand=${expand.join(',')}`;
        }

        const response = await this.client.get(url);
        return response.data;
    }

    async update(entitySet: string, id: string, data: any): Promise<void> {
        await this.client.patch(`/${entitySet}(${id})`, data);
    }

    async delete(entitySet: string, id: string): Promise<void> {
        await this.client.delete(`/${entitySet}(${id})`);
    }

    async upsert(entitySet: string, keyField: string, keyValue: string, data: any): Promise<string> {
        const response = await this.client.patch(
            `/${entitySet}(${keyField}='${keyValue}')`,
            data,
            {
                headers: {
                    'If-Match': '*'
                }
            }
        );

        const id = response.headers['odata-entityid']?.split('(')[1]?.split(')')[0];
        return id;
    }

    // ============ Query Operations ============

    async query(entitySet: string, options?: QueryOptions): Promise<any[]> {
        let url = `/${entitySet}`;
        const params: string[] = [];

        if (options) {
            if (options.select) params.push(`$select=${options.select.join(',')}`);
            if (options.filter) params.push(`$filter=${options.filter}`);
            if (options.orderBy) params.push(`$orderby=${options.orderBy}`);
            if (options.top) params.push(`$top=${options.top}`);
            if (options.skip) params.push(`$skip=${options.skip}`);
            if (options.expand) params.push(`$expand=${options.expand.join(',')}`);
            if (options.count) params.push(`$count=true`);
            
            if (params.length > 0) {
                url += `?${params.join('&')}`;
            }
        }

        const response = await this.client.get(url);
        return response.data.value;
    }

    async count(entitySet: string, filter?: string): Promise<number> {
        let url = `/${entitySet}/$count`;
        
        if (filter) {
            url += `?$filter=${filter}`;
        }

        const response = await this.client.get(url);
        return parseInt(response.data);
    }

    async fetchAll(entitySet: string, options?: QueryOptions): Promise<any[]> {
        const allRecords: any[] = [];
        let page = 1;
        const pageSize = options?.top || 100;

        while (true) {
            const records = await this.query(entitySet, {
                ...options,
                top: pageSize,
                skip: (page - 1) * pageSize
            });

            allRecords.push(...records);

            if (records.length < pageSize) {
                break;
            }

            page++;
        }

        return allRecords;
    }

    // ============ Batch Operations ============

    async batch(operations: BatchOperation[]): Promise<any[]> {
        const boundary = `batch_${Date.now()}`;
        let body = '';

        body += `--${boundary}\n`;
        body += 'Content-Type: application/http\n';
        body += 'Content-Transfer-Encoding: binary\n\n';

        operations.forEach((op, index) => {
            body += `${op.method} ${op.url} HTTP/1.1\n`;
            body += 'Content-Type: application/json;type=entry\n\n';
            
            if (op.data) {
                body += `${JSON.stringify(op.data)}\n`;
            }

            if (index < operations.length - 1) {
                body += `\n--${boundary}\n`;
            }
        });

        body += `\n--${boundary}--\n`;

        const response = await this.client.post('/$batch', body, {
            headers: {
                'Content-Type': `multipart/mixed; boundary=${boundary}`
            }
        });

        return response.data.responses;
    }

    // ============ Functions and Actions ============

    async executeFunction(functionName: string, parameters?: Record<string, any>): Promise<any> {
        let url = `/${functionName}`;
        
        if (parameters) {
            const params = Object.entries(parameters)
                .map(([key, value]) => `${key}=${value}`)
                .join(',');
            url += `(${params})`;
        }

        const response = await this.client.get(url);
        return response.data;
    }

    async executeAction(actionName: string, data?: any): Promise<any> {
        const response = await this.client.post(`/${actionName}`, data);
        return response.data;
    }

    // ============ Metadata ============

    async getEntityDefinitions(entityName?: string): Promise<any> {
        let url = '/EntityDefinitions';
        
        if (entityName) {
            url += `(LogicalName='${entityName}')`;
        }

        const response = await this.client.get(url);
        return response.data;
    }

    async getAttributeDefinitions(entityName: string, attributeName?: string): Promise<any> {
        let url = `/EntityDefinitions(LogicalName='${entityName}')/Attributes`;
        
        if (attributeName) {
            url += `(LogicalName='${attributeName}')`;
        }

        const response = await this.client.get(url);
        return response.data;
    }

    // ============ WhoAmI ============

    async whoAmI(): Promise<any> {
        const response = await this.client.get('/WhoAmI');
        return response.data;
    }

    // ============ Status ============

    isConnected(): boolean {
        return this.connected;
    }

    getAccessToken(): string | null {
        return this.accessToken;
    }
}

export interface QueryOptions {
    select?: string[];
    filter?: string;
    orderBy?: string;
    top?: number;
    skip?: number;
    expand?: string[];
    count?: boolean;
}

export interface BatchOperation {
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
    url: string;
    data?: any;
}