import axios from 'axios';
import { CompilerService } from './CompilerService';
import { MetadataService } from './MetadataService';

const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:3000/api';

export class StudioService {
    private static api = axios.create({
        baseURL: API_BASE,
        headers: {
            'Content-Type': 'application/json'
        }
    });

    static async initialize(): Promise<void> {
        // Initialize API interceptors
        this.api.interceptors.request.use((config) => {
            const token = localStorage.getItem('nova_token') || sessionStorage.getItem('nova_token');
            if (token) {
                config.headers.Authorization = `Bearer ${token}`;
            }
            return config;
        });

        this.api.interceptors.response.use(
            (response) => response,
            async (error) => {
                if (error.response?.status === 401) {
                    // Try to refresh token
                    try {
                        const newToken = await this.refreshToken();
                        error.config.headers.Authorization = `Bearer ${newToken}`;
                        return this.api.request(error.config);
                    } catch {
                        // Redirect to login
                        window.location.href = '/login';
                    }
                }
                return Promise.reject(error);
            }
        );
    }

    // ============ Authentication ============
    static async login(username: string, password: string): Promise<any> {
        const response = await this.api.post('/auth/login', { username, password });
        return response.data;
    }

    static async logout(): Promise<void> {
        await this.api.post('/auth/logout');
    }

    static async validateToken(token: string): Promise<any> {
        const response = await this.api.post('/auth/validate', { token });
        return response.data;
    }

    static async refreshToken(): Promise<string> {
        const response = await this.api.post('/auth/refresh');
        return response.data.token;
    }

    // ============ Projects ============
    static async getProjects(): Promise<any[]> {
        const response = await this.api.get('/projects');
        return response.data;
    }

    static async getProject(projectId: string): Promise<any> {
        const response = await this.api.get(`/projects/${projectId}`);
        return response.data;
    }

    static async createProject(data: any): Promise<any> {
        const response = await this.api.post('/projects', data);
        return response.data;
    }

    static async updateProject(projectId: string, data: any): Promise<any> {
        const response = await this.api.put(`/projects/${projectId}`, data);
        return response.data;
    }

    static async deleteProject(projectId: string): Promise<void> {
        await this.api.delete(`/projects/${projectId}`);
    }

    static async saveProject(projectId: string, data: any): Promise<void> {
        await this.api.put(`/projects/${projectId}/save`, data);
    }

    static async exportProject(projectId: string, format: string): Promise<Blob> {
        const response = await this.api.get(`/projects/${projectId}/export`, {
            params: { format },
            responseType: 'blob'
        });
        return response.data;
    }

    static async importProject(file: File): Promise<any> {
        const formData = new FormData();
        formData.append('file', file);
        const response = await this.api.post('/projects/import', formData, {
            headers: {
                'Content-Type': 'multipart/form-data'
            }
        });
        return response.data;
    }

    // ============ Objects ============
    static async getObjects(projectId: string): Promise<any[]> {
        const response = await this.api.get(`/projects/${projectId}/objects`);
        return response.data;
    }

    static async getObject(objectId: string): Promise<any> {
        const response = await this.api.get(`/objects/${objectId}`);
        return response.data;
    }

    static async createObject(projectId: string, type: string, data: any): Promise<any> {
        const response = await this.api.post(`/projects/${projectId}/objects`, {
            type,
            ...data
        });
        return response.data;
    }

    static async updateObject(objectId: string, data: any): Promise<any> {
        const response = await this.api.put(`/objects/${objectId}`, data);
        return response.data;
    }

    static async deleteObject(objectId: string): Promise<void> {
        await this.api.delete(`/objects/${objectId}`);
    }

    // ============ Compiler ============
    static async compile(code: string, options?: any): Promise<any> {
        const response = await this.api.post('/compiler/compile', { code, options });
        return response.data;
    }

    static async compileProject(projectId: string): Promise<any> {
        const response = await this.api.post(`/projects/${projectId}/compile`);
        return response.data;
    }

    // ============ Deployment ============
    static async getEnvironments(): Promise<any[]> {
        const response = await this.api.get('/deployment/environments');
        return response.data;
    }

    static async getDeployments(): Promise<any[]> {
        const response = await this.api.get('/deployment');
        return response.data;
    }

    static async deployObject(objectId: string, environment: string): Promise<any> {
        const response = await this.api.post('/deployment', {
            objectId,
            environment
        });
        return response.data;
    }

    static async createDeployment(config: any): Promise<any> {
        const response = await this.api.post('/deployment/create', config);
        return response.data;
    }

    static async getDeploymentHistory(): Promise<any[]> {
        const response = await this.api.get('/deployment/history');
        return response.data;
    }

    static async getDeploymentMetrics(): Promise<any> {
        const response = await this.api.get('/deployment/metrics');
        return response.data;
    }

    // ============ Settings ============
    static async getSettings(): Promise<any> {
        const response = await this.api.get('/settings');
        return response.data;
    }

    static async saveSettings(settings: any): Promise<void> {
        await this.api.put('/settings', settings);
    }

    static async resetSettings(): Promise<void> {
        await this.api.post('/settings/reset');
    }

    static async testConnection(type: string, config: any): Promise<any> {
        const response = await this.api.post(`/settings/test-connection/${type}`, config);
        return response.data;
    }

    // ============ Profiles ============
    static async getProfiles(): Promise<any[]> {
        const response = await this.api.get('/profiles');
        return response.data;
    }

    static async createProfile(data: any): Promise<any> {
        const response = await this.api.post('/profiles', data);
        return response.data;
    }

    static async updateProfile(profileId: string, data: any): Promise<any> {
        const response = await this.api.put(`/profiles/${profileId}`, data);
        return response.data;
    }

    static async deleteProfile(profileId: string): Promise<void> {
        await this.api.delete(`/profiles/${profileId}`);
    }

    // ============ Dashboard ============
    static async getProjectStats(): Promise<any> {
        const response = await this.api.get('/dashboard/stats');
        return response.data;
    }

    static async getRecentActivities(limit: number = 10): Promise<any[]> {
        const response = await this.api.get('/dashboard/activities', {
            params: { limit }
        });
        return response.data;
    }

    static async getSystemHealth(): Promise<any> {
        const response = await this.api.get('/health');
        return response.data;
    }

    static async getProjectHistory(projectId: string): Promise<any[]> {
        const response = await this.api.get(`/projects/${projectId}/history`);
        return response.data;
    }

    static async getProjectObjects(projectId: string): Promise<any[]> {
        return this.getObjects(projectId);
    }
}