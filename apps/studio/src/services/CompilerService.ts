import axios from 'axios';

const COMPILER_API = process.env.REACT_APP_COMPILER_URL || 'http://localhost:3000/compiler';

export class CompilerService {
    private static api = axios.create({
        baseURL: COMPILER_API,
        headers: {
            'Content-Type': 'application/json'
        }
    });

    static async compile(code: string, options?: any): Promise<any> {
        const response = await this.api.post('/compile', { code, options });
        return response.data;
    }

    static async compileProject(projectId: string): Promise<any> {
        const response = await this.api.post(`/projects/${projectId}/compile`);
        return response.data;
    }

    static async compileFile(file: File): Promise<any> {
        const formData = new FormData();
        formData.append('file', file);
        
        const response = await this.api.post('/compile/file', formData, {
            headers: {
                'Content-Type': 'multipart/form-data'
            }
        });
        return response.data;
    }

    static async compileFiles(files: File[]): Promise<any> {
        const formData = new FormData();
        files.forEach(file => {
            formData.append('files', file);
        });
        
        const response = await this.api.post('/compile/files', formData, {
            headers: {
                'Content-Type': 'multipart/form-data'
            }
        });
        return response.data;
    }

    static async getDiagnostics(code: string): Promise<any[]> {
        const response = await this.api.post('/diagnostics', { code });
        return response.data.diagnostics || [];
    }

    static async formatCode(code: string): Promise<string> {
        const response = await this.api.post('/format', { code });
        return response.data.formatted;
    }

    static async getSuggestions(code: string, position: { line: number; column: number }): Promise<any[]> {
        const response = await this.api.post('/suggestions', { code, position });
        return response.data.suggestions || [];
    }

    static async getSyntaxTree(code: string): Promise<any> {
        const response = await this.api.post('/ast', { code });
        return response.data.ast;
    }

    static async getSymbols(code: string): Promise<any[]> {
        const response = await this.api.post('/symbols', { code });
        return response.data.symbols || [];
    }

    static async getReferences(code: string, symbol: string): Promise<any[]> {
        const response = await this.api.post('/references', { code, symbol });
        return response.data.references || [];
    }

    static async getHoverInfo(code: string, position: { line: number; column: number }): Promise<any> {
        const response = await this.api.post('/hover', { code, position });
        return response.data.hover;
    }

    static async getSignatureHelp(code: string, position: { line: number; column: number }): Promise<any> {
        const response = await this.api.post('/signature', { code, position });
        return response.data.signature;
    }

    static async deploy(deploymentConfig: any): Promise<any> {
        const response = await this.api.post('/deploy', deploymentConfig);
        return response.data;
    }

    static async validate(code: string): Promise<any> {
        const response = await this.api.post('/validate', { code });
        return response.data;
    }

    static async getCompilerInfo(): Promise<any> {
        const response = await this.api.get('/info');
        return response.data;
    }
}