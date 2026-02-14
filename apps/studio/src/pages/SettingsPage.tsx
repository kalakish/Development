import React, { useState, useEffect } from 'react';
import {
    Box,
    Typography,
    Paper,
    Grid,
    Card,
    CardContent,
    CardHeader,
    Button,
    IconButton,
    TextField,
    Switch,
    FormControlLabel,
    FormGroup,
    FormControl,
    InputLabel,
    Select,
    MenuItem,
    Divider,
    List,
    ListItem,
    ListItemIcon,
    ListItemText,
    ListItemSecondaryAction,
    Avatar,
    Alert,
    AlertTitle,
    Tab,
    Tabs,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Chip,
    Tooltip,
    Breadcrumbs,
    Link,
    Radio,
    RadioGroup,
    FormLabel,
    InputAdornment,
    Slider
} from '@mui/material';
import {
    Settings as SettingsIcon,
    Storage as StorageIcon,
    Security as SecurityIcon,
    Notifications as NotificationsIcon,
    Palette as PaletteIcon,
    Language as LanguageIcon,
    Code as CodeIcon,
    Build as BuildIcon,
    CloudUpload as CloudUploadIcon,
    CloudDownload as CloudDownloadIcon,
    AccountCircle as AccountCircleIcon,
    VpnKey as VpnKeyIcon,
    Email as EmailIcon,
    Web as WebIcon,
    Api as ApiIcon,
    Database as DatabaseIcon,
    Save as SaveIcon,
    Refresh as RefreshIcon,
    Delete as DeleteIcon,
    Edit as EditIcon,
    Visibility as VisibilityIcon,
    VisibilityOff as VisibilityOffIcon,
    CheckCircle as CheckCircleIcon,
    Warning as WarningIcon,
    Error as ErrorIcon
} from '@mui/icons-material';
import { useStudio } from '../hooks/useStudio';
import { useNotification } from '../hooks/useNotification';
import { useTheme } from '@mui/material/styles';

interface TabPanelProps {
    children?: React.ReactNode;
    index: number;
    value: number;
}

const TabPanel: React.FC<TabPanelProps> = ({ children, value, index }) => (
    <div
        role="tabpanel"
        hidden={value !== index}
        id={`settings-tabpanel-${index}`}
        aria-labelledby={`settings-tab-${index}`}
    >
        {value === index && <Box sx={{ py: 3 }}>{children}</Box>}
    </div>
);

export const SettingsPage: React.FC = () => {
    const theme = useTheme();
    const { showNotification } = useNotification();
    const { 
        getSettings, 
        saveSettings, 
        resetSettings,
        testConnection,
        getProfiles 
    } = useStudio();

    const [tabValue, setTabValue] = useState(0);
    const [settings, setSettings] = useState<any>(null);
    const [profiles, setProfiles] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [testDialog, setTestDialog] = useState(false);
    const [resetDialog, setResetDialog] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [selectedProfile, setSelectedProfile] = useState<any>(null);
    const [profileDialog, setProfileDialog] = useState(false);
    const [apiKeyDialog, setApiKeyDialog] = useState(false);

    const [formData, setFormData] = useState({
        // General
        studioName: 'NOVA Studio',
        defaultProjectLocation: '~/nova-projects',
        autoSave: true,
        autoSaveInterval: 5,
        telemetry: true,
        
        // Editor
        fontSize: 14,
        fontFamily: 'JetBrains Mono',
        theme: 'vs-dark',
        wordWrap: true,
        minimap: true,
        lineNumbers: true,
        autoComplete: true,
        formatOnSave: true,
        
        // Compiler
        targetFramework: 'net6.0',
        optimizationLevel: 'balanced',
        generateSql: true,
        generateTypescript: true,
        strictMode: true,
        treatWarningsAsErrors: false,
        
        // Deployment
        defaultEnvironment: 'development',
        autoBackup: true,
        retentionDays: 30,
        validateBeforeDeploy: true,
        notifyOnDeploy: true,
        
        // Database
        databaseType: 'sqlserver',
        databaseServer: 'localhost',
        databasePort: 1433,
        databaseName: 'NOVA_DB',
        databaseUser: '',
        databasePassword: '',
        databaseEncrypt: true,
        databaseTrustServerCertificate: false,
        
        // Security
        authenticationProvider: 'jwt',
        jwtSecret: '',
        tokenExpiry: '24h',
        bcryptRounds: 10,
        sessionTimeout: 3600,
        enableMfa: false,
        enableAudit: true,
        auditRetentionDays: 90,
        
        // Notifications
        enableEmail: false,
        emailServer: '',
        emailPort: 587,
        emailUsername: '',
        emailPassword: '',
        emailFrom: 'noreply@nova.local',
        enableSlack: false,
        slackWebhook: '',
        enableTeams: false,
        teamsWebhook: '',
        
        // API
        apiEnabled: true,
        apiPort: 3000,
        apiCorsOrigins: 'http://localhost:3001',
        apiRateLimit: 1000,
        apiRateWindow: 3600,
        enableSwagger: true,
        enableGraphQL: false
    });

    useEffect(() => {
        loadSettings();
    }, []);

    const loadSettings = async () => {
        setLoading(true);
        try {
            const [loadedSettings, loadedProfiles] = await Promise.all([
                getSettings(),
                getProfiles()
            ]);
            
            setSettings(loadedSettings);
            setFormData({ ...formData, ...loadedSettings });
            setProfiles(loadedProfiles);
        } catch (error) {
            showNotification('Failed to load settings', 'error');
        } finally {
            setLoading(false);
        }
    };

    const handleSaveSettings = async () => {
        setSaving(true);
        try {
            await saveSettings(formData);
            showNotification('Settings saved successfully', 'success');
        } catch (error) {
            showNotification('Failed to save settings', 'error');
        } finally {
            setSaving(false);
        }
    };

    const handleResetSettings = async () => {
        try {
            await resetSettings();
            await loadSettings();
            setResetDialog(false);
            showNotification('Settings reset to defaults', 'success');
        } catch (error) {
            showNotification('Failed to reset settings', 'error');
        }
    };

    const handleTestConnection = async (type: string) => {
        try {
            const result = await testConnection(type, formData);
            showNotification(
                result.success ? `${type} connection successful` : `Connection failed: ${result.error}`,
                result.success ? 'success' : 'error'
            );
            setTestDialog(false);
        } catch (error) {
            showNotification('Connection test failed', 'error');
        }
    };

    const handleInputChange = (field: string, value: any) => {
        setFormData(prev => ({ ...prev, [field]: value }));
    };

    const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
        setTabValue(newValue);
    };

    return (
        <Box sx={{ p: 3 }}>
            {/* Breadcrumbs */}
            <Breadcrumbs sx={{ mb: 2 }}>
                <Link color="inherit" href="/dashboard">
                    Dashboard
                </Link>
                <Typography color="text.primary">Settings</Typography>
            </Breadcrumbs>

            {/* Header */}
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
                <Typography variant="h4" component="h1" fontWeight="500">
                    Settings
                </Typography>
                <Box>
                    <Button
                        variant="outlined"
                        startIcon={<RefreshIcon />}
                        onClick={loadSettings}
                        sx={{ mr: 1 }}
                    >
                        Refresh
                    </Button>
                    <Button
                        variant="contained"
                        startIcon={<SaveIcon />}
                        onClick={handleSaveSettings}
                        disabled={saving}
                    >
                        {saving ? 'Saving...' : 'Save Changes'}
                    </Button>
                </Box>
            </Box>

            <Grid container spacing={3}>
                {/* Settings Navigation */}
                <Grid item xs={12} md={3}>
                    <Card elevation={1}>
                        <CardContent sx={{ p: 0 }}>
                            <Tabs
                                orientation="vertical"
                                variant="scrollable"
                                value={tabValue}
                                onChange={handleTabChange}
                                sx={{ borderRight: 1, borderColor: 'divider', minHeight: 600 }}
                            >
                                <Tab 
                                    icon={<SettingsIcon />} 
                                    label="General" 
                                    iconPosition="start"
                                    sx={{ justifyContent: 'flex-start', minHeight: 48 }}
                                />
                                <Tab 
                                    icon={<CodeIcon />} 
                                    label="Editor" 
                                    iconPosition="start"
                                    sx={{ justifyContent: 'flex-start', minHeight: 48 }}
                                />
                                <Tab 
                                    icon={<BuildIcon />} 
                                    label="Compiler" 
                                    iconPosition="start"
                                    sx={{ justifyContent: 'flex-start', minHeight: 48 }}
                                />
                                <Tab 
                                    icon={<CloudUploadIcon />} 
                                    label="Deployment" 
                                    iconPosition="start"
                                    sx={{ justifyContent: 'flex-start', minHeight: 48 }}
                                />
                                <Tab 
                                    icon={<DatabaseIcon />} 
                                    label="Database" 
                                    iconPosition="start"
                                    sx={{ justifyContent: 'flex-start', minHeight: 48 }}
                                />
                                <Tab 
                                    icon={<SecurityIcon />} 
                                    label="Security" 
                                    iconPosition="start"
                                    sx={{ justifyContent: 'flex-start', minHeight: 48 }}
                                />
                                <Tab 
                                    icon={<NotificationsIcon />} 
                                    label="Notifications" 
                                    iconPosition="start"
                                    sx={{ justifyContent: 'flex-start', minHeight: 48 }}
                                />
                                <Tab 
                                    icon={<ApiIcon />} 
                                    label="API" 
                                    iconPosition="start"
                                    sx={{ justifyContent: 'flex-start', minHeight: 48 }}
                                />
                            </Tabs>
                        </CardContent>
                    </Card>
                </Grid>

                {/* Settings Content */}
                <Grid item xs={12} md={9}>
                    <Card elevation={1}>
                        <CardContent>
                            {/* General Settings */}
                            <TabPanel value={tabValue} index={0}>
                                <Typography variant="h6" gutterBottom>
                                    General Settings
                                </Typography>
                                <Divider sx={{ mb: 3 }} />
                                
                                <Grid container spacing={3}>
                                    <Grid item xs={12}>
                                        <TextField
                                            fullWidth
                                            label="Studio Name"
                                            value={formData.studioName}
                                            onChange={(e) => handleInputChange('studioName', e.target.value)}
                                        />
                                    </Grid>
                                    <Grid item xs={12}>
                                        <TextField
                                            fullWidth
                                            label="Default Project Location"
                                            value={formData.defaultProjectLocation}
                                            onChange={(e) => handleInputChange('defaultProjectLocation', e.target.value)}
                                        />
                                    </Grid>
                                    <Grid item xs={12}>
                                        <FormGroup>
                                            <FormControlLabel
                                                control={
                                                    <Switch
                                                        checked={formData.autoSave}
                                                        onChange={(e) => handleInputChange('autoSave', e.target.checked)}
                                                    />
                                                }
                                                label="Auto Save"
                                            />
                                            {formData.autoSave && (
                                                <Box sx={{ ml: 4, mt: 1 }}>
                                                    <TextField
                                                        type="number"
                                                        label="Auto Save Interval (minutes)"
                                                        value={formData.autoSaveInterval}
                                                        onChange={(e) => handleInputChange('autoSaveInterval', e.target.value)}
                                                        size="small"
                                                    />
                                                </Box>
                                            )}
                                        </FormGroup>
                                    </Grid>
                                    <Grid item xs={12}>
                                        <FormControlLabel
                                            control={
                                                <Switch
                                                    checked={formData.telemetry}
                                                    onChange={(e) => handleInputChange('telemetry', e.target.checked)}
                                                />
                                            }
                                            label="Enable Telemetry"
                                        />
                                    </Grid>
                                </Grid>
                            </TabPanel>

                            {/* Editor Settings */}
                            <TabPanel value={tabValue} index={1}>
                                <Typography variant="h6" gutterBottom>
                                    Editor Settings
                                </Typography>
                                <Divider sx={{ mb: 3 }} />
                                
                                <Grid container spacing={3}>
                                    <Grid item xs={12} md={6}>
                                        <TextField
                                            fullWidth
                                            type="number"
                                            label="Font Size"
                                            value={formData.fontSize}
                                            onChange={(e) => handleInputChange('fontSize', parseInt(e.target.value))}
                                            InputProps={{
                                                endAdornment: <InputAdornment position="end">px</InputAdornment>
                                            }}
                                        />
                                    </Grid>
                                    <Grid item xs={12} md={6}>
                                        <FormControl fullWidth>
                                            <InputLabel>Font Family</InputLabel>
                                            <Select
                                                value={formData.fontFamily}
                                                label="Font Family"
                                                onChange={(e) => handleInputChange('fontFamily', e.target.value)}
                                            >
                                                <MenuItem value="JetBrains Mono">JetBrains Mono</MenuItem>
                                                <MenuItem value="Fira Code">Fira Code</MenuItem>
                                                <MenuItem value="Consolas">Consolas</MenuItem>
                                                <MenuItem value="Menlo">Menlo</MenuItem>
                                                <MenuItem value="Monaco">Monaco</MenuItem>
                                            </Select>
                                        </FormControl>
                                    </Grid>
                                    <Grid item xs={12} md={6}>
                                        <FormControl fullWidth>
                                            <InputLabel>Theme</InputLabel>
                                            <Select
                                                value={formData.theme}
                                                label="Theme"
                                                onChange={(e) => handleInputChange('theme', e.target.value)}
                                            >
                                                <MenuItem value="vs-dark">Dark (Visual Studio)</MenuItem>
                                                <MenuItem value="vs-light">Light (Visual Studio)</MenuItem>
                                                <MenuItem value="hc-black">High Contrast</MenuItem>
                                            </Select>
                                        </FormControl>
                                    </Grid>
                                    <Grid item xs={12}>
                                        <FormGroup>
                                            <FormControlLabel
                                                control={
                                                    <Switch
                                                        checked={formData.wordWrap}
                                                        onChange={(e) => handleInputChange('wordWrap', e.target.checked)}
                                                    />
                                                }
                                                label="Word Wrap"
                                            />
                                            <FormControlLabel
                                                control={
                                                    <Switch
                                                        checked={formData.minimap}
                                                        onChange={(e) => handleInputChange('minimap', e.target.checked)}
                                                    />
                                                }
                                                label="Show Minimap"
                                            />
                                            <FormControlLabel
                                                control={
                                                    <Switch
                                                        checked={formData.lineNumbers}
                                                        onChange={(e) => handleInputChange('lineNumbers', e.target.checked)}
                                                    />
                                                }
                                                label="Show Line Numbers"
                                            />
                                            <FormControlLabel
                                                control={
                                                    <Switch
                                                        checked={formData.autoComplete}
                                                        onChange={(e) => handleInputChange('autoComplete', e.target.checked)}
                                                    />
                                                }
                                                label="Auto Complete"
                                            />
                                            <FormControlLabel
                                                control={
                                                    <Switch
                                                        checked={formData.formatOnSave}
                                                        onChange={(e) => handleInputChange('formatOnSave', e.target.checked)}
                                                    />
                                                }
                                                label="Format on Save"
                                            />
                                        </FormGroup>
                                    </Grid>
                                </Grid>
                            </TabPanel>

                            {/* Compiler Settings */}
                            <TabPanel value={tabValue} index={2}>
                                <Typography variant="h6" gutterBottom>
                                    Compiler Settings
                                </Typography>
                                <Divider sx={{ mb: 3 }} />
                                
                                <Grid container spacing={3}>
                                    <Grid item xs={12} md={6}>
                                        <FormControl fullWidth>
                                            <InputLabel>Target Framework</InputLabel>
                                            <Select
                                                value={formData.targetFramework}
                                                label="Target Framework"
                                                onChange={(e) => handleInputChange('targetFramework', e.target.value)}
                                            >
                                                <MenuItem value="net6.0">.NET 6.0</MenuItem>
                                                <MenuItem value="net7.0">.NET 7.0</MenuItem>
                                                <MenuItem value="net8.0">.NET 8.0</MenuItem>
                                            </Select>
                                        </FormControl>
                                    </Grid>
                                    <Grid item xs={12} md={6}>
                                        <FormControl fullWidth>
                                            <InputLabel>Optimization Level</InputLabel>
                                            <Select
                                                value={formData.optimizationLevel}
                                                label="Optimization Level"
                                                onChange={(e) => handleInputChange('optimizationLevel', e.target.value)}
                                            >
                                                <MenuItem value="none">None</MenuItem>
                                                <MenuItem value="basic">Basic</MenuItem>
                                                <MenuItem value="balanced">Balanced</MenuItem>
                                                <MenuItem value="aggressive">Aggressive</MenuItem>
                                            </Select>
                                        </FormControl>
                                    </Grid>
                                    <Grid item xs={12}>
                                        <FormGroup>
                                            <FormControlLabel
                                                control={
                                                    <Switch
                                                        checked={formData.generateSql}
                                                        onChange={(e) => handleInputChange('generateSql', e.target.checked)}
                                                    />
                                                }
                                                label="Generate SQL Schema"
                                            />
                                            <FormControlLabel
                                                control={
                                                    <Switch
                                                        checked={formData.generateTypescript}
                                                        onChange={(e) => handleInputChange('generateTypescript', e.target.checked)}
                                                    />
                                                }
                                                label="Generate TypeScript Code"
                                            />
                                            <FormControlLabel
                                                control={
                                                    <Switch
                                                        checked={formData.strictMode}
                                                        onChange={(e) => handleInputChange('strictMode', e.target.checked)}
                                                    />
                                                }
                                                label="Strict Mode"
                                            />
                                            <FormControlLabel
                                                control={
                                                    <Switch
                                                        checked={formData.treatWarningsAsErrors}
                                                        onChange={(e) => handleInputChange('treatWarningsAsErrors', e.target.checked)}
                                                    />
                                                }
                                                label="Treat Warnings as Errors"
                                            />
                                        </FormGroup>
                                    </Grid>
                                </Grid>
                            </TabPanel>

                            {/* Database Settings */}
                            <TabPanel value={tabValue} index={3}>
                                <Typography variant="h6" gutterBottom>
                                    Database Settings
                                </Typography>
                                <Divider sx={{ mb: 3 }} />
                                
                                <Grid container spacing={3}>
                                    <Grid item xs={12}>
                                        <FormControl fullWidth>
                                            <InputLabel>Database Type</InputLabel>
                                            <Select
                                                value={formData.databaseType}
                                                label="Database Type"
                                                onChange={(e) => handleInputChange('databaseType', e.target.value)}
                                            >
                                                <MenuItem value="sqlserver">SQL Server</MenuItem>
                                                <MenuItem value="postgresql">PostgreSQL</MenuItem>
                                                <MenuItem value="mysql">MySQL</MenuItem>
                                                <MenuItem value="oracle">Oracle</MenuItem>
                                            </Select>
                                        </FormControl>
                                    </Grid>
                                    <Grid item xs={12} md={8}>
                                        <TextField
                                            fullWidth
                                            label="Server"
                                            value={formData.databaseServer}
                                            onChange={(e) => handleInputChange('databaseServer', e.target.value)}
                                        />
                                    </Grid>
                                    <Grid item xs={12} md={4}>
                                        <TextField
                                            fullWidth
                                            type="number"
                                            label="Port"
                                            value={formData.databasePort}
                                            onChange={(e) => handleInputChange('databasePort', parseInt(e.target.value))}
                                        />
                                    </Grid>
                                    <Grid item xs={12}>
                                        <TextField
                                            fullWidth
                                            label="Database Name"
                                            value={formData.databaseName}
                                            onChange={(e) => handleInputChange('databaseName', e.target.value)}
                                        />
                                    </Grid>
                                    <Grid item xs={12} md={6}>
                                        <TextField
                                            fullWidth
                                            label="Username"
                                            value={formData.databaseUser}
                                            onChange={(e) => handleInputChange('databaseUser', e.target.value)}
                                        />
                                    </Grid>
                                    <Grid item xs={12} md={6}>
                                        <TextField
                                            fullWidth
                                            type={showPassword ? 'text' : 'password'}
                                            label="Password"
                                            value={formData.databasePassword}
                                            onChange={(e) => handleInputChange('databasePassword', e.target.value)}
                                            InputProps={{
                                                endAdornment: (
                                                    <InputAdornment position="end">
                                                        <IconButton
                                                            onClick={() => setShowPassword(!showPassword)}
                                                            edge="end"
                                                        >
                                                            {showPassword ? <VisibilityOffIcon /> : <VisibilityIcon />}
                                                        </IconButton>
                                                    </InputAdornment>
                                                )
                                            }}
                                        />
                                    </Grid>
                                    <Grid item xs={12}>
                                        <FormGroup>
                                            <FormControlLabel
                                                control={
                                                    <Switch
                                                        checked={formData.databaseEncrypt}
                                                        onChange={(e) => handleInputChange('databaseEncrypt', e.target.checked)}
                                                    />
                                                }
                                                label="Encrypt Connection"
                                            />
                                            <FormControlLabel
                                                control={
                                                    <Switch
                                                        checked={formData.databaseTrustServerCertificate}
                                                        onChange={(e) => handleInputChange('databaseTrustServerCertificate', e.target.checked)}
                                                    />
                                                }
                                                label="Trust Server Certificate"
                                            />
                                        </FormGroup>
                                    </Grid>
                                    <Grid item xs={12}>
                                        <Button
                                            variant="outlined"
                                            startIcon={<StorageIcon />}
                                            onClick={() => setTestDialog(true)}
                                        >
                                            Test Connection
                                        </Button>
                                    </Grid>
                                </Grid>
                            </TabPanel>
                        </CardContent>
                    </Card>
                </Grid>
            </Grid>

            {/* Test Connection Dialog */}
            <Dialog open={testDialog} onClose={() => setTestDialog(false)}>
                <DialogTitle>Test Database Connection</DialogTitle>
                <DialogContent>
                    <Alert severity="info" sx={{ mt: 2 }}>
                        <AlertTitle>Connection Details</AlertTitle>
                        <Typography variant="body2">
                            Server: {formData.databaseServer}:{formData.databasePort}<br />
                            Database: {formData.databaseName}<br />
                            User: {formData.databaseUser}
                        </Typography>
                    </Alert>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setTestDialog(false)}>Cancel</Button>
                    <Button 
                        onClick={() => handleTestConnection('database')} 
                        variant="contained"
                    >
                        Test Connection
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Reset Settings Dialog */}
            <Dialog open={resetDialog} onClose={() => setResetDialog(false)}>
                <DialogTitle>Reset Settings</DialogTitle>
                <DialogContent>
                    <Alert severity="warning">
                        Are you sure you want to reset all settings to their default values? This action cannot be undone.
                    </Alert>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setResetDialog(false)}>Cancel</Button>
                    <Button onClick={handleResetSettings} color="error" variant="contained">
                        Reset
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
};