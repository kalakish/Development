import { EventEmitter } from 'events';
import { Logger } from '@nova/core/utils/logger';
import { SOAPClient } from '../soap/soap-client';

export interface SAPConnectorOptions {
    host: string;
    client: string;
    username: string;
    password: string;
    systemNumber: string;
    language?: string;
    poolSize?: number;
}

export class SAPConnector extends EventEmitter {
    private options: SAPConnectorOptions;
    private logger: Logger;
    private soapClient: SOAPClient;
    private connected: boolean = false;

    constructor(options: SAPConnectorOptions) {
        super();
        this.options = options;
        this.logger = new Logger('SAPConnector');

        this.soapClient = new SOAPClient({
            wsdl: `${options.host}/sap/bc/srt/wsdl`,
            endpoint: options.host,
            username: options.username,
            password: options.password
        });
    }

    async connect(): Promise<void> {
        try {
            await this.soapClient.connect();
            this.connected = true;
            this.logger.success('Connected to SAP');
            this.emit('connected');
        } catch (error) {
            this.logger.error(`Failed to connect to SAP: ${error.message}`);
            throw error;
        }
    }

    async disconnect(): Promise<void> {
        await this.soapClient.disconnect();
        this.connected = false;
        this.logger.info('Disconnected from SAP');
        this.emit('disconnected');
    }

    async callBAPI(bapiName: string, parameters: any): Promise<any> {
        if (!this.connected) {
            await this.connect();
        }

        return this.soapClient.call(bapiName, parameters);
    }

    async getCustomer(customerId: string): Promise<any> {
        return this.callBAPI('BAPI_CUSTOMER_GETDETAIL', {
            Customerno: customerId
        });
    }

    async createCustomer(customerData: any): Promise<string> {
        const result = await this.callBAPI('BAPI_CUSTOMER_CREATEFROMDATA', {
            Customerdata: customerData
        });

        return result.Customerno;
    }

    async updateCustomer(customerId: string, customerData: any): Promise<void> {
        await this.callBAPI('BAPI_CUSTOMER_CHANGEFROMDATA', {
            Customerno: customerId,
            Customerdata: customerData
        });
    }

    async getSalesOrder(orderId: string): Promise<any> {
        return this.callBAPI('BAPI_SALESORDER_GETDETAIL', {
            Salesorder: orderId
        });
    }

    async createSalesOrder(orderData: any): Promise<string> {
        const result = await this.callBAPI('BAPI_SALESORDER_CREATEFROMDAT2', {
            Orderdata: orderData
        });

        return result.Salesorder;
    }

    async getMaterial(materialId: string): Promise<any> {
        return this.callBAPI('BAPI_MATERIAL_GETDETAIL', {
            Material: materialId
        });
    }

    async createMaterial(materialData: any): Promise<string> {
        const result = await this.callBAPI('BAPI_MATERIAL_CREATE', {
            Materialdata: materialData
        });

        return result.Material;
    }

    async commit(): Promise<void> {
        await this.callBAPI('BAPI_TRANSACTION_COMMIT', {});
    }

    async rollback(): Promise<void> {
        await this.callBAPI('BAPI_TRANSACTION_ROLLBACK', {});
    }

    isConnected(): boolean {
        return this.connected;
    }
}