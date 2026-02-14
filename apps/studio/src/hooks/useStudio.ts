import { useContext } from 'react';
import { StudioContext } from '../context/StudioContext';

export const useStudio = () => {
    const context = useContext(StudioContext);
    
    if (!context) {
        throw new Error('useStudio must be used within StudioProvider');
    }
    
    return {
        // Project
        currentProject: context.currentProject,
        projects: context.projects,
        loadProjects: context.loadProjects,
        createProject: context.createProject,
        openProject: context.openProject,
        saveProject: context.saveProject,
        
        // Objects
        objects: context.objects,
        loadObjects: context.loadObjects,
        createObject: context.createObject,
        updateObject: context.updateObject,
        deleteObject: context.deleteObject,
        
        // Compiler
        compileObject: context.compileObject,
        compileProject: context.compileProject,
        
        // Deployment
        environments: context.environments,
        deployments: context.deployments,
        loadEnvironments: context.loadEnvironments,
        deployObject: context.deployObject,
        
        // Settings
        settings: context.settings,
        loadSettings: context.loadSettings,
        saveSettings: context.saveSettings,
        
        // UI State
        sidebarOpen: context.sidebarOpen,
        setSidebarOpen: context.setSidebarOpen,
        activeTab: context.activeTab,
        setActiveTab: context.setActiveTab,
        
        // Additional utilities
        getProjectStats: context.getProjectStats,
        getRecentActivities: context.getRecentActivities,
        getSystemHealth: context.getSystemHealth,
        getDeploymentHistory: context.getDeploymentHistory,
        getDeploymentMetrics: context.getDeploymentMetrics,
        testConnection: context.testConnection,
        getProfiles: context.getProfiles,
        resetSettings: context.resetSettings,
        getEnvironments: context.getEnvironments,
        getDeployments: context.getDeployments,
        createDeployment: context.createDeployment,
        getProjectObjects: context.getProjectObjects,
        getProjectHistory: context.getProjectHistory,
        exportProject: context.exportProject,
        importProject: context.importProject
    };
};