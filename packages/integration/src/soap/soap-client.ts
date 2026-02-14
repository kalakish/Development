import soap from 'soap';
import { EventEmitter } from 'events';
import { Logger } from '@nova/core/utils/logger';

export interface SOAPClientOptions {
    wsdl: string;
    endpoint?: string;
    username?: string;
    password?: string;
    ntlm?: boolean;
    timeout?: number;
    headers?: Record<string, string>;
}

export interface SOAPRequestOptions {
    method: string;
    args: any;
    endpoint?: string;
    headers?: Record<string, string>;
}

export class SOAPClient extends EventEmitter {
    private client: any;
    private options: SOAPClientOptions;
    private logger: Logger;
    private connected: boolean = false;

    constructor(options: SOAPClientOptions) {
        super();
        this.options = options;
        this.logger = new Logger('SOAPClient');
    }

    async connect(): Promise<void> {
        try {
            this.client = await soap.createClientAsync(this.options.wsdl, {
                endpoint: this.options.endpoint,
                timeout: this.options.timeout || 30000,
                wsdl_headers: this.options.headers,
                wsdl_options: this.getWSDLOptions()
            });

            // Add authentication
            if (this.options.username && this.options.password) {
                if (this.options.ntlm) {
                    this.client.setSecurity(new soap.NTLMSecurity(
                        this.options.username,
                        this.options.password
                    ));
                } else {
                    this.client.setSecurity(new soap.BasicAuthSecurity(
                        this.options.username,
                        this.options.password
                    ));
                }
            }

            this.connected = true;
            this.logger.success(`Connected to SOAP service: ${this.options.wsdl}`);
            this.emit('connected');

        } catch (error) {
            this.logger.error(`Failed to connect to SOAP service: ${error.message}`);
            throw new Error(`SOAP connection failed: ${error.message}`);
        }
    }

    async request<T = any>(options: SOAPRequestOptions): Promise<T> {
        if (!this.connected) {
            await this.connect();
        }

        return new Promise((resolve, reject) => {
            const method = this.client[options.method];
            
            if (!method) {
                reject(new Error(`SOAP method not found: ${options.method}`));
                return;
            }

            method(options.args, (err: any, result: any, raw: any, soapHeader: any) => {
                if (err) {
                    this.logger.error(`SOAP request failed: ${err.message}`);
                    reject(err);
                } else {
                    this.emit('response', { method: options.method, result });
                    resolve(result);
                }
            });
        });
    }

    async call<T = any>(method: string, args: any): Promise<T> {
        return this.request({ method, args });
    }

    async getServices(): Promise<string[]> {
        if (!this.client) {
            await this.connect();
        }
        return Object.keys(this.client.describe() || {});
    }

    async getMethods(service?: string): Promise<string[]> {
        if (!this.client) {
            await this.connect();
        }

        const description = this.client.describe();
        
        if (service) {
            return Object.keys(description[service] || {});
        }

        const methods: string[] = [];
        Object.keys(description).forEach(svc => {
            Object.keys(description[svc]).forEach(port => {
                Object.keys(description[svc][port]).forEach(method => {
                    methods.push(method);
                });
            });
        });

        return methods;
    }

    private getWSDLOptions(): any {
        return {
            timeout: this.options.timeout,
            forever: true,
            wsdl_headers: this.options.headers
        };
    }

    async disconnect(): Promise<void> {
        if (this.client) {
            this.client = null;
            this.connected = false;
            this.emit('disconnected');
            this.logger.info('SOAP client disconnected');
        }
    }

    isConnected(): boolean {
        return this.connected;
    }

    getClient(): any {
        return this.client;
    }
}