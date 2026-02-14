import React, { createContext, useContext, useState, useCallback } from 'react';
import { StudioService } from '../services/StudioService';
import { CompilerService } from '../services/CompilerService';
import { MetadataService } from '../services/MetadataService';

interface StudioContextType {
    // Project
    currentProject: any;
    projects: any[];
    loadProjects: () => Promise<void>;
    createProject: (data: any) => Promise<any>;
    openProject: (projectId: string) => Promise<void>;
    saveProject: (projectId: string) => Promise<void>;
    
    // Objects
    objects: any[];
    loadObjects: () => Promise<void>;
    createObject: (type: string, data: any) => Promise<any>;
    updateObject: (id: string, data: any) => Promise<any>;
    deleteObject: (id: string) => Promise<void>;
    
    // Compiler
    compileObject: (code: string) => Promise<any>;
    compileProject: () => Promise<any>;
    
    // Deployment
    environments: any[];
    deployments: any[];
    loadEnvironments: () => Promise<void>;
    deployObject: (objectId: string, environment: string) => Promise<any>;
    
    // Settings
    settings: any;
    loadSettings: () => Promise<void>;
    saveSettings: (settings: any) => Promise<void>;
    
    // UI State
    sidebarOpen: boolean;
    setSidebarOpen: (open: boolean) => void;
    activeTab: string;
    setActiveTab: (tab: string) => void;
}

const StudioContext = createContext<StudioContextType | undefined>(undefined);

export const useStudio = () => {
    const context = useContext(StudioContext);
    if (!context) {
        throw new Error('useStudio must be used within StudioProvider');
    }
    return context;
};

export const StudioProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [currentProject, setCurrentProject] = useState<any>(null);
    const [projects, setProjects] = useState<any[]>([]);
    const [objects, setObjects] = useState<any[]>([]);
    const [environments, setEnvironments] = useState<any[]>([]);
    const [deployments, setDeployments] = useState<any[]>([]);
    const [settings, setSettings] = useState<any>(null);
    const [sidebarOpen, setSidebarOpen] = useState(true);
    const [activeTab, setActiveTab] = useState('dashboard');

    // Project Methods
    const loadProjects = useCallback(async () => {
        try {
            const projectsData = await StudioService.getProjects();
            setProjects(projectsData);
        } catch (error) {
            console.error('Failed to load projects:', error);
            throw error;
        }
    }, []);

    const createProject = useCallback(async (data: any) => {
        try {
            const project = await StudioService.createProject(data);
            setProjects(prev => [...prev, project]);
            setCurrentProject(project);
            return project;
        } catch (error) {
            console.error('Failed to create project:', error);
            throw error;
        }
    }, []);

    const openProject = useCallback(async (projectId: string) => {
        try {
            const project = await StudioService.getProject(projectId);
            setCurrentProject(project);
            await loadObjects();
        } catch (error) {
            console.error('Failed to open project:', error);
            throw error;
        }
    }, [loadObjects]);

    const saveProject = useCallback(async (projectId: string) => {
        try {
            await StudioService.saveProject(projectId, currentProject);
        } catch (error) {
            console.error('Failed to save project:', error);
            throw error;
        }
    }, [currentProject]);

    // Object Methods
    const loadObjects = useCallback(async () => {
        if (!currentProject) return;
        try {
            const objectsData = await StudioService.getObjects(currentProject.id);
            setObjects(objectsData);
        } catch (error) {
            console.error('Failed to load objects:', error);
            throw error;
        }
    }, [currentProject]);

    const createObject = useCallback(async (type: string, data: any) => {
        try {
            const object = await StudioService.createObject(currentProject.id, type, data);
            setObjects(prev => [...prev, object]);
            return object;
        } catch (error) {
            console.error('Failed to create object:', error);
            throw error;
        }
    }, [currentProject]);

    const updateObject = useCallback(async (id: string, data: any) => {
        try {
            const updated = await StudioService.updateObject(id, data);
            setObjects(prev => prev.map(obj => obj.id === id ? updated : obj));
            return updated;
        } catch (error) {
            console.error('Failed to update object:', error);
            throw error;
        }
    }, []);

    const deleteObject = useCallback(async (id: string) => {
        try {
            await StudioService.deleteObject(id);
            setObjects(prev => prev.filter(obj => obj.id !== id));
        } catch (error) {
            console.error('Failed to delete object:', error);
            throw error;
        }
    }, []);

    // Compiler Methods
    const compileObject = useCallback(async (code: string) => {
        try {
            return await CompilerService.compile(code);
        } catch (error) {
            console.error('Failed to compile object:', error);
            throw error;
        }
    }, []);

    const compileProject = useCallback(async () => {
        if (!currentProject) return;
        try {
            return await CompilerService.compileProject(currentProject.id);
        } catch (error) {
            console.error('Failed to compile project:', error);
            throw error;
        }
    }, [currentProject]);

    // Deployment Methods
    const loadEnvironments = useCallback(async () => {
        try {
            const envs = await StudioService.getEnvironments();
            setEnvironments(envs);
        } catch (error) {
            console.error('Failed to load environments:', error);
            throw error;
        }
    }, []);

    const deployObject = useCallback(async (objectId: string, environment: string) => {
        try {
            const deployment = await StudioService.deployObject(objectId, environment);
            setDeployments(prev => [deployment, ...prev]);
            return deployment;
        } catch (error) {
            console.error('Failed to deploy object:', error);
            throw error;
        }
    }, []);

    // Settings Methods
    const loadSettings = useCallback(async () => {
        try {
            const settingsData = await StudioService.getSettings();
            setSettings(settingsData);
            return settingsData;
        } catch (error) {
            console.error('Failed to load settings:', error);
            throw error;
        }
    }, []);

    const saveSettings = useCallback(async (newSettings: any) => {
        try {
            await StudioService.saveSettings(newSettings);
            setSettings(newSettings);
        } catch (error) {
            console.error('Failed to save settings:', error);
            throw error;
        }
    }, []);

    const value = {
        // Project
        currentProject,
        projects,
        loadProjects,
        createProject,
        openProject,
        saveProject,
        
        // Objects
        objects,
        loadObjects,
        createObject,
        updateObject,
        deleteObject,
        
        // Compiler
        compileObject,
        compileProject,
        
        // Deployment
        environments,
        deployments,
        loadEnvironments,
        deployObject,
        
        // Settings
        settings,
        loadSettings,
        saveSettings,
        
        // UI State
        sidebarOpen,
        setSidebarOpen,
        activeTab,
        setActiveTab
    };

    return (
        <StudioContext.Provider value={value}>
            {children}
        </StudioContext.Provider>
    );
};