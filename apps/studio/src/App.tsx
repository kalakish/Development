import React, { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { QueryClient, QueryClientProvider } from 'react-query';
import { LocalizationProvider } from '@mui/x-date-pickers';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';

// Layout
import { MainLayout } from './layouts/MainLayout';

// Pages
import { DashboardPage } from './pages/DashboardPage';
import { ObjectDesignerPage } from './pages/ObjectDesignerPage';
import { TableDesignerPage } from './pages/TableDesignerPage';
import { PageDesignerPage } from './pages/PageDesignerPage';
import { CodeunitDesignerPage } from './pages/CodeunitDesignerPage';
import { ReportDesignerPage } from './pages/ReportDesignerPage';
import { XMLPortDesignerPage } from './pages/XMLPortDesignerPage';
import { QueryDesignerPage } from './pages/QueryDesignerPage';
import { EnumDesignerPage } from './pages/EnumDesignerPage';
import { ProjectPage } from './pages/ProjectPage';
import { DeploymentPage } from './pages/DeploymentPage';
import { SettingsPage } from './pages/SettingsPage';
import { LoginPage } from './pages/LoginPage';

// Context
import { StudioProvider } from './context/StudioContext';
import { AuthProvider } from './context/AuthContext';
import { NotificationProvider } from './context/NotificationContext';

// Services
import { StudioService } from './services/StudioService';
import { CompilerService } from './services/CompilerService';
import { MetadataService } from './services/MetadataService';

const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            refetchOnWindowFocus: false,
            retry: 1
        }
    }
});

const theme = createTheme({
    palette: {
        mode: 'light',
        primary: {
            main: '#0078D4'
        },
        secondary: {
            main: '#107C10'
        }
    },
    typography: {
        fontFamily: '"Segoe UI", "Roboto", "Helvetica Neue", sans-serif'
    }
});

const App: React.FC = () => {
    const [initialized, setInitialized] = useState(false);

    useEffect(() => {
        const initialize = async () => {
            try {
                await StudioService.initialize();
                setInitialized(true);
            } catch (error) {
                console.error('Failed to initialize Studio:', error);
            }
        };

        initialize();
    }, []);

    if (!initialized) {
        return <div>Initializing NOVA Studio...</div>;
    }

    return (
        <QueryClientProvider client={queryClient}>
            <ThemeProvider theme={theme}>
                <LocalizationProvider dateAdapter={AdapterDateFns}>
                    <CssBaseline />
                    <BrowserRouter>
                        <AuthProvider>
                            <NotificationProvider>
                                <StudioProvider>
                                    <Routes>
                                        <Route path="/login" element={<LoginPage />} />
                                        <Route path="/" element={<MainLayout />}>
                                            <Route index element={<Navigate to="/dashboard" />} />
                                            <Route path="dashboard" element={<DashboardPage />} />
                                            <Route path="project" element={<ProjectPage />} />
                                            <Route path="designer">
                                                <Route path="table/:id" element={<TableDesignerPage />} />
                                                <Route path="page/:id" element={<PageDesignerPage />} />
                                                <Route path="codeunit/:id" element={<CodeunitDesignerPage />} />
                                                <Route path="report/:id" element={<ReportDesignerPage />} />
                                                <Route path="xmlport/:id" element={<XMLPortDesignerPage />} />
                                                <Route path="query/:id" element={<QueryDesignerPage />} />
                                                <Route path="enum/:id" element={<EnumDesignerPage />} />
                                                <Route path="new" element={<ObjectDesignerPage />} />
                                            </Route>
                                            <Route path="deployment" element={<DeploymentPage />} />
                                            <Route path="settings" element={<SettingsPage />} />
                                        </Route>
                                    </Routes>
                                </StudioProvider>
                            </NotificationProvider>
                        </AuthProvider>
                    </BrowserRouter>
                </LocalizationProvider>
            </ThemeProvider>
        </QueryClientProvider>
    );
};

export default App;