import axios from 'axios';

const METADATA_API = process.env.REACT_APP_METADATA_URL || 'http://localhost:3000/metadata';

export class MetadataService {
    private static api = axios.create({
        baseURL: METADATA_API,
        headers: {
            'Content-Type': 'application/json'
        }
    });

    // ============ Object Metadata ============
    static async getObject(objectType: string, objectId: number): Promise<any> {
        const response = await this.api.get(`/objects/${objectType}/${objectId}`);
        return response.data;
    }

    static async getAllObjects(): Promise<any[]> {
        const response = await this.api.get('/objects');
        return response.data;
    }

    static async getObjectsByType(objectType: string): Promise<any[]> {
        const response = await this.api.get(`/objects/${objectType}`);
        return response.data;
    }

    static async saveObject(metadata: any): Promise<any> {
        const response = await this.api.post('/objects', metadata);
        return response.data;
    }

    static async updateObject(objectId: string, metadata: any): Promise<any> {
        const response = await this.api.put(`/objects/${objectId}`, metadata);
        return response.data;
    }

    static async deleteObject(objectId: string): Promise<void> {
        await this.api.delete(`/objects/${objectId}`);
    }

    static async compileObject(definition: string): Promise<any> {
        const response = await this.api.post('/compile', { definition });
        return response.data;
    }

    // ============ Table Metadata ============
    static async getTable(tableId: number): Promise<any> {
        return this.getObject('Table', tableId);
    }

    static async getTables(): Promise<any[]> {
        return this.getObjectsByType('Table');
    }

    static async createTable(metadata: any): Promise<any> {
        return this.saveObject({ ...metadata, objectType: 'Table' });
    }

    static async getTableSchema(tableId: number): Promise<any> {
        const response = await this.api.get(`/tables/${tableId}/schema`);
        return response.data;
    }

    static async generateSQL(tableId: number): Promise<string> {
        const response = await this.api.get(`/tables/${tableId}/sql`);
        return response.data.sql;
    }

    // ============ Page Metadata ============
    static async getPage(pageId: number): Promise<any> {
        return this.getObject('Page', pageId);
    }

    static async getPages(): Promise<any[]> {
        return this.getObjectsByType('Page');
    }

    static async createPage(metadata: any): Promise<any> {
        return this.saveObject({ ...metadata, objectType: 'Page' });
    }

    static async getPageLayout(pageId: number): Promise<any> {
        const response = await this.api.get(`/pages/${pageId}/layout`);
        return response.data;
    }

    static async generateUI(pageId: number): Promise<any> {
        const response = await this.api.get(`/pages/${pageId}/ui`);
        return response.data;
    }

    // ============ Codeunit Metadata ============
    static async getCodeunit(codeunitId: number): Promise<any> {
        return this.getObject('Codeunit', codeunitId);
    }

    static async getCodeunits(): Promise<any[]> {
        return this.getObjectsByType('Codeunit');
    }

    static async createCodeunit(metadata: any): Promise<any> {
        return this.saveObject({ ...metadata, objectType: 'Codeunit' });
    }

    static async getProcedures(codeunitId: number): Promise<any[]> {
        const response = await this.api.get(`/codeunits/${codeunitId}/procedures`);
        return response.data;
    }

    static async getEvents(codeunitId: number): Promise<any[]> {
        const response = await this.api.get(`/codeunits/${codeunitId}/events`);
        return response.data;
    }

    // ============ Report Metadata ============
    static async getReport(reportId: number): Promise<any> {
        return this.getObject('Report', reportId);
    }

    static async getReports(): Promise<any[]> {
        return this.getObjectsByType('Report');
    }

    static async createReport(metadata: any): Promise<any> {
        return this.saveObject({ ...metadata, objectType: 'Report' });
    }

    static async getDataset(reportId: number): Promise<any> {
        const response = await this.api.get(`/reports/${reportId}/dataset`);
        return response.data;
    }

    // ============ XMLPort Metadata ============
    static async getXMLPort(xmlportId: number): Promise<any> {
        return this.getObject('XMLPort', xmlportId);
    }

    static async getXMLPorts(): Promise<any[]> {
        return this.getObjectsByType('XMLPort');
    }

    static async createXMLPort(metadata: any): Promise<any> {
        return this.saveObject({ ...metadata, objectType: 'XMLPort' });
    }

    static async getSchema(xmlportId: number): Promise<any> {
        const response = await this.api.get(`/xmlports/${xmlportId}/schema`);
        return response.data;
    }

    // ============ Query Metadata ============
    static async getQuery(queryId: number): Promise<any> {
        return this.getObject('Query', queryId);
    }

    static async getQueries(): Promise<any[]> {
        return this.getObjectsByType('Query');
    }

    static async createQuery(metadata: any): Promise<any> {
        return this.saveObject({ ...metadata, objectType: 'Query' });
    }

    static async executeQuery(queryId: number, parameters?: any): Promise<any[]> {
        const response = await this.api.post(`/queries/${queryId}/execute`, parameters);
        return response.data;
    }

    // ============ Enum Metadata ============
    static async getEnum(enumId: number): Promise<any> {
        return this.getObject('Enum', enumId);
    }

    static async getEnums(): Promise<any[]> {
        return this.getObjectsByType('Enum');
    }

    static async createEnum(metadata: any): Promise<any> {
        return this.saveObject({ ...metadata, objectType: 'Enum' });
    }

    // ============ Extension ============
    static async getExtensions(): Promise<any[]> {
        const response = await this.api.get('/extensions');
        return response.data;
    }

    static async installExtension(extensionId: string): Promise<any> {
        const response = await this.api.post(`/extensions/${extensionId}/install`);
        return response.data;
    }

    static async uninstallExtension(extensionId: string): Promise<void> {
        await this.api.post(`/extensions/${extensionId}/uninstall`);
    }

    // ============ Validation ============
    static async validateMetadata(metadata: any): Promise<any> {
        const response = await this.api.post('/validate', metadata);
        return response.data;
    }

    static async checkDependencies(objectId: string): Promise<any[]> {
        const response = await this.api.get(`/dependencies/${objectId}`);
        return response.data;
    }

    static async getDependents(objectId: string): Promise<any[]> {
        const response = await this.api.get(`/dependents/${objectId}`);
        return response.data;
    }

    // ============ Cache Management ============
    static async clearCache(): Promise<void> {
        await this.api.delete('/cache');
    }

    static async reloadMetadata(): Promise<void> {
        await this.api.post('/reload');
    }

    // ============ Export/Import ============
    static async exportMetadata(objectIds: string[]): Promise<Blob> {
        const response = await this.api.post('/export', { objectIds }, {
            responseType: 'blob'
        });
        return response.data;
    }

    static async importMetadata(file: File): Promise<any[]> {
        const formData = new FormData();
        formData.append('file', file);
        
        const response = await this.api.post('/import', formData, {
            headers: {
                'Content-Type': 'multipart/form-data'
            }
        });
        return response.data;
    }
}