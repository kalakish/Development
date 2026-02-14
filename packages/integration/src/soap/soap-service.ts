import soap from 'soap';
import { EventEmitter } from 'events';
import { Logger } from '@nova/core/utils/logger';
import { Server } from 'http';

export interface SOAPServiceOptions {
    name: string;
    namespace: string;
    port?: number;
    path?: string;
    services: SOAPServiceDefinition[];
}

export interface SOAPServiceDefinition {
    name: string;
    port: string;
    binding: string;
    methods: SOAPMethodDefinition[];
}

export interface SOAPMethodDefinition {
    name: string;
    input: any;
    output: any;
    handler: (args: any, cb: (err: any, result: any) => void) => void;
}

export class SOAPService extends EventEmitter {
    private server: any;
    private httpServer: Server;
    private options: SOAPServiceOptions;
    private logger: Logger;
    private started: boolean = false;

    constructor(httpServer: Server, options: SOAPServiceOptions) {
        super();
        this.httpServer = httpServer;
        this.options = options;
        this.logger = new Logger('SOAPService');
    }

    async start(): Promise<void> {
        try {
            const service = this.buildServiceDefinition();
            const wsdl = this.buildWSDL();

            this.server = soap.listen(
                this.httpServer,
                this.options.path || '/soap',
                service,
                wsdl
            );

            this.started = true;
            this.logger.success(`SOAP service started: ${this.options.name}`);
            this.emit('started');

        } catch (error) {
            this.logger.error(`Failed to start SOAP service: ${error.message}`);
            throw error;
        }
    }

    private buildServiceDefinition(): any {
        const service: any = {};

        this.options.services.forEach(svc => {
            service[svc.name] = service[svc.name] || {};
            service[svc.name][svc.port] = {};

            svc.methods.forEach(method => {
                service[svc.name][svc.port][method.name] = {
                    input: method.input,
                    output: method.output,
                    action: `${this.options.namespace}/${method.name}`,
                    handler: method.handler
                };
            });
        });

        return service;
    }

    private buildWSDL(): any {
        return {
            name: this.options.name,
            namespace: this.options.namespace,
            xmlns: {
                'tns': this.options.namespace
            }
        };
    }

    addMethod(serviceName: string, portName: string, method: SOAPMethodDefinition): void {
        const service = this.options.services.find(s => s.name === serviceName);
        
        if (service) {
            service.methods.push(method);
            
            if (this.started) {
                // Rebuild service definition
                this.stop();
                this.start();
            }
        }
    }

    async stop(): Promise<void> {
        if (this.server) {
            this.server = null;
            this.started = false;
            this.emit('stopped');
            this.logger.info('SOAP service stopped');
        }
    }

    isRunning(): boolean {
        return this.started;
    }
}