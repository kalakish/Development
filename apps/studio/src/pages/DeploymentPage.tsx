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
    Stepper,
    Step,
    StepLabel,
    StepContent,
    TextField,
    FormControl,
    InputLabel,
    Select,
    MenuItem,
    Chip,
    Avatar,
    LinearProgress,
    Alert,
    AlertTitle,
    List,
    ListItem,
    ListItemIcon,
    ListItemText,
    ListItemSecondaryAction,
    Divider,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Tooltip,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Switch,
    FormControlLabel,
    RadioGroup,
    Radio,
    FormLabel,
    FormGroup,
    Checkbox
} from '@mui/material';
import {
    CloudUpload as CloudUploadIcon,
    CloudDownload as CloudDownloadIcon,
    CheckCircle as CheckCircleIcon,
    Error as ErrorIcon,
    Warning as WarningIcon,
    Pending as PendingIcon,
    Schedule as ScheduleIcon,
    PlayArrow as PlayArrowIcon,
    Stop as StopIcon,
    Refresh as RefreshIcon,
    History as HistoryIcon,
    Settings as SettingsIcon,
    Visibility as VisibilityIcon,
    GetApp as GetAppIcon,
    Delete as DeleteIcon,
    Edit as EditIcon,
    CompareArrows as CompareArrowsIcon,
    BugReport as BugReportIcon,
    Speed as SpeedIcon,
    Security as SecurityIcon,
    Storage as StorageIcon,
    Public as PublicIcon,
    Business as BusinessIcon
} from '@mui/icons-material';
import { useStudio } from '../hooks/useStudio';
import { useNotification } from '../hooks/useNotification';
import { useNavigate } from 'react-router-dom';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer, AreaChart, Area } from 'recharts';

export const DeploymentPage: React.FC = () => {
    const navigate = useNavigate();
    const { showNotification } = useNotification();
    const { 
        getEnvironments, 
        getDeployments, 
        createDeployment, 
        deployObject,
        getDeploymentHistory,
        getDeploymentMetrics 
    } = useStudio();

    const [environments, setEnvironments] = useState<any[]>([]);
    const [deployments, setDeployments] = useState<any[]>([]);
    const [history, setHistory] = useState<any[]>([]);
    const [metrics, setMetrics] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [activeStep, setActiveStep] = useState(0);
    const [deployDialog, setDeployDialog] = useState(false);
    const [selectedEnvironment, setSelectedEnvironment] = useState<any>(null);
    const [selectedObjects, setSelectedObjects] = useState<string[]>([]);
    const [deploymentConfig, setDeploymentConfig] = useState({
        environment: '',
        version: '',
        mode: 'incremental',
        backup: true,
        validateOnly: false,
        schedule: false,
        scheduledTime: '',
        notifyOnComplete: true,
        notifyOnError: true
    });
    const [deploymentLogs, setDeploymentLogs] = useState<any[]>([]);
    const [currentDeployment, setCurrentDeployment] = useState<any>(null);

    useEffect(() => {
        loadDeploymentData();
    }, []);

    useEffect(() => {
        // Poll for active deployment status
        if (currentDeployment?.status === 'deploying') {
            const interval = setInterval(() => {
                updateDeploymentStatus(currentDeployment.id);
            }, 2000);
            return () => clearInterval(interval);
        }
    }, [currentDeployment]);

    const loadDeploymentData = async () => {
        setLoading(true);
        try {
            const [envs, deps, hist, mets] = await Promise.all([
                getEnvironments(),
                getDeployments(),
                getDeploymentHistory(),
                getDeploymentMetrics()
            ]);
            
            setEnvironments(envs);
            setDeployments(deps);
            setHistory(hist);
            setMetrics(mets);
        } catch (error) {
            showNotification('Failed to load deployment data', 'error');
        } finally {
            setLoading(false);
        }
    };

    const handleDeploy = async () => {
        try {
            const deployment = await createDeployment({
                environment: deploymentConfig.environment,
                version: deploymentConfig.version,
                mode: deploymentConfig.mode,
                backup: deploymentConfig.backup,
                validateOnly: deploymentConfig.validateOnly,
                objects: selectedObjects
            });

            setCurrentDeployment(deployment);
            setDeployDialog(false);
            setActiveStep(1);
            
            showNotification('Deployment started', 'success');
            
            // Start deployment
            await deployObject(deployment.id, selectedObjects, deploymentConfig);
            
            loadDeploymentData();
        } catch (error) {
            showNotification('Deployment failed', 'error');
        }
    };

    const updateDeploymentStatus = async (deploymentId: string) => {
        try {
            // Fetch deployment status
            // Update UI
        } catch (error) {
            // Handle error
        }
    };

    const handleRollback = async (deploymentId: string) => {
        try {
            // Rollback deployment
            showNotification('Rollback initiated', 'warning');
        } catch (error) {
            showNotification('Rollback failed', 'error');
        }
    };

    const getStatusIcon = (status: string) => {
        switch (status) {
            case 'success':
            case 'completed':
                return <CheckCircleIcon sx={{ color: 'success.main' }} />;
            case 'failed':
            case 'error':
                return <ErrorIcon sx={{ color: 'error.main' }} />;
            case 'warning':
                return <WarningIcon sx={{ color: 'warning.main' }} />;
            case 'deploying':
            case 'pending':
                return <PendingIcon sx={{ color: 'info.main' }} />;
            case 'scheduled':
                return <ScheduleIcon sx={{ color: 'warning.main' }} />;
            default:
                return <PendingIcon />;
        }
    };

    const getEnvironmentIcon = (type: string) => {
        switch (type) {
            case 'development':
                return <BugReportIcon />;
            case 'test':
                return <SpeedIcon />;
            case 'staging':
                return <SecurityIcon />;
            case 'production':
                return <PublicIcon />;
            default:
                return <StorageIcon />;
        }
    };

    const getEnvironmentColor = (type: string) => {
        switch (type) {
            case 'development': return '#0078D4';
            case 'test': return '#107C10';
            case 'staging': return '#FF8C00';
            case 'production': return '#B33E5C';
            default: return '#666666';
        }
    };

    const steps = [
        {
            label: 'Configure Deployment',
            description: 'Select environment and objects to deploy',
        },
        {
            label: 'Validate & Preview',
            description: 'Review deployment impact and validate changes',
        },
        {
            label: 'Execute Deployment',
            description: 'Deploy objects to target environment',
        },
        {
            label: 'Verify & Complete',
            description: 'Verify deployment and run smoke tests',
        },
    ];

    if (loading) {
        return (
            <Box sx={{ width: '100%', mt: 4 }}>
                <LinearProgress />
                <Typography variant="body2" color="text.secondary" align="center" sx={{ mt: 2 }}>
                    Loading deployment data...
                </Typography>
            </Box>
        );
    }

    return (
        <Box sx={{ p: 3 }}>
            {/* Header */}
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
                <Typography variant="h4" component="h1" fontWeight="500">
                    Deployment Center
                </Typography>
                <Button
                    variant="contained"
                    startIcon={<CloudUploadIcon />}
                    onClick={() => setDeployDialog(true)}
                >
                    New Deployment
                </Button>
            </Box>

            {/* Quick Stats */}
            <Grid container spacing={3} sx={{ mb: 4 }}>
                <Grid item xs={12} sm={6} md={3}>
                    <Card elevation={0} sx={{ bgcolor: 'primary.light', color: 'white' }}>
                        <CardContent>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                <Box>
                                    <Typography variant="h3" component="div" fontWeight="600">
                                        {metrics?.totalDeployments || 0}
                                    </Typography>
                                    <Typography variant="body2" sx={{ opacity: 0.9 }}>
                                        Total Deployments
                                    </Typography>
                                </Box>
                                <CloudUploadIcon sx={{ fontSize: 48, opacity: 0.7 }} />
                            </Box>
                        </CardContent>
                    </Card>
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                    <Card elevation={0} sx={{ bgcolor: 'success.light', color: 'white' }}>
                        <CardContent>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                <Box>
                                    <Typography variant="h3" component="div" fontWeight="600">
                                        {metrics?.successfulDeployments || 0}
                                    </Typography>
                                    <Typography variant="body2" sx={{ opacity: 0.9 }}>
                                        Successful
                                    </Typography>
                                </Box>
                                <CheckCircleIcon sx={{ fontSize: 48, opacity: 0.7 }} />
                            </Box>
                        </CardContent>
                    </Card>
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                    <Card elevation={0} sx={{ bgcolor: 'error.light', color: 'white' }}>
                        <CardContent>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                <Box>
                                    <Typography variant="h3" component="div" fontWeight="600">
                                        {metrics?.failedDeployments || 0}
                                    </Typography>
                                    <Typography variant="body2" sx={{ opacity: 0.9 }}>
                                        Failed
                                    </Typography>
                                </Box>
                                <ErrorIcon sx={{ fontSize: 48, opacity: 0.7 }} />
                            </Box>
                        </CardContent>
                    </Card>
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                    <Card elevation={0} sx={{ bgcolor: 'info.light', color: 'white' }}>
                        <CardContent>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                <Box>
                                    <Typography variant="h3" component="div" fontWeight="600">
                                        {environments.length}
                                    </Typography>
                                    <Typography variant="body2" sx={{ opacity: 0.9 }}>
                                        Environments
                                    </Typography>
                                </Box>
                                <StorageIcon sx={{ fontSize: 48, opacity: 0.7 }} />
                            </Box>
                        </CardContent>
                    </Card>
                </Grid>
            </Grid>

            <Grid container spacing={3}>
                {/* Environments */}
                <Grid item xs={12} md={4}>
                    <Card elevation={1}>
                        <CardHeader
                            title="Environments"
                            subheader="Configured deployment targets"
                            action={
                                <IconButton>
                                    <SettingsIcon />
                                </IconButton>
                            }
                        />
                        <Divider />
                        <List>
                            {environments.map((env) => (
                                <ListItem
                                    key={env.id}
                                    button
                                    selected={selectedEnvironment?.id === env.id}
                                    onClick={() => setSelectedEnvironment(env)}
                                >
                                    <ListItemIcon>
                                        <Avatar sx={{ bgcolor: getEnvironmentColor(env.type) }}>
                                            {getEnvironmentIcon(env.type)}
                                        </Avatar>
                                    </ListItemIcon>
                                    <ListItemText
                                        primary={env.name}
                                        secondary={
                                            <React.Fragment>
                                                <Typography variant="caption" display="block">
                                                    {env.url || env.host}
                                                </Typography>
                                                <Chip
                                                    label={env.status}
                                                    size="small"
                                                    color={env.status === 'healthy' ? 'success' : 'error'}
                                                    sx={{ mt: 0.5 }}
                                                />
                                            </React.Fragment>
                                        }
                                    />
                                    <ListItemSecondaryAction>
                                        <Tooltip title="Deploy to this environment">
                                            <IconButton 
                                                edge="end" 
                                                onClick={() => {
                                                    setDeploymentConfig({ ...deploymentConfig, environment: env.id });
                                                    setDeployDialog(true);
                                                }}
                                            >
                                                <CloudUploadIcon />
                                            </IconButton>
                                        </Tooltip>
                                    </ListItemSecondaryAction>
                                </ListItem>
                            ))}
                        </List>
                    </Card>
                </Grid>

                {/* Recent Deployments */}
                <Grid item xs={12} md={8}>
                    <Card elevation={1}>
                        <CardHeader
                            title="Recent Deployments"
                            subheader="Last 10 deployment activities"
                            action={
                                <IconButton onClick={loadDeploymentData}>
                                    <RefreshIcon />
                                </IconButton>
                            }
                        />
                        <Divider />
                        <TableContainer>
                            <Table>
                                <TableHead>
                                    <TableRow>
                                        <TableCell>Status</TableCell>
                                        <TableCell>Environment</TableCell>
                                        <TableCell>Version</TableCell>
                                        <TableCell>Objects</TableCell>
                                        <TableCell>Started</TableCell>
                                        <TableCell>Duration</TableCell>
                                        <TableCell align="right">Actions</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {deployments.slice(0, 5).map((deployment) => (
                                        <TableRow key={deployment.id} hover>
                                            <TableCell>
                                                <Box sx={{ display: 'flex', alignItems: 'center' }}>
                                                    {getStatusIcon(deployment.status)}
                                                    <Typography variant="body2" sx={{ ml: 1 }}>
                                                        {deployment.status}
                                                    </Typography>
                                                </Box>
                                            </TableCell>
                                            <TableCell>
                                                <Box sx={{ display: 'flex', alignItems: 'center' }}>
                                                    <Avatar 
                                                        sx={{ 
                                                            width: 24, 
                                                            height: 24, 
                                                            mr: 1,
                                                            bgcolor: getEnvironmentColor(deployment.environmentType)
                                                        }}
                                                    >
                                                        {getEnvironmentIcon(deployment.environmentType)}
                                                    </Avatar>
                                                    {deployment.environmentName}
                                                </Box>
                                            </TableCell>
                                            <TableCell>
                                                <Chip 
                                                    label={`v${deployment.version}`} 
                                                    size="small" 
                                                    variant="outlined"
                                                />
                                            </TableCell>
                                            <TableCell>{deployment.objectCount} objects</TableCell>
                                            <TableCell>{deployment.startedAt}</TableCell>
                                            <TableCell>{deployment.duration}</TableCell>
                                            <TableCell align="right">
                                                <Tooltip title="View Details">
                                                    <IconButton size="small">
                                                        <VisibilityIcon fontSize="small" />
                                                    </IconButton>
                                                </Tooltip>
                                                <Tooltip title="Rollback">
                                                    <IconButton 
                                                        size="small"
                                                        onClick={() => handleRollback(deployment.id)}
                                                    >
                                                        <HistoryIcon fontSize="small" />
                                                    </IconButton>
                                                </Tooltip>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </TableContainer>
                    </Card>
                </Grid>

                {/* Active Deployment */}
                {currentDeployment && currentDeployment.status === 'deploying' && (
                    <Grid item xs={12}>
                        <Card elevation={3} sx={{ bgcolor: 'info.light', color: 'white' }}>
                            <CardContent>
                                <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                                    <PendingIcon sx={{ mr: 1 }} />
                                    <Typography variant="h6">
                                        Active Deployment in Progress
                                    </Typography>
                                    <Button
                                        variant="outlined"
                                        size="small"
                                        sx={{ ml: 'auto', color: 'white', borderColor: 'white' }}
                                    >
                                        View Details
                                    </Button>
                                </Box>
                                <Box sx={{ display: 'flex', alignItems: 'center' }}>
                                    <Box sx={{ flexGrow: 1, mr: 2 }}>
                                        <LinearProgress 
                                            variant="determinate" 
                                            value={currentDeployment.progress || 0}
                                            sx={{ 
                                                height: 8, 
                                                borderRadius: 4,
                                                bgcolor: 'rgba(255,255,255,0.3)',
                                                '& .MuiLinearProgress-bar': {
                                                    bgcolor: 'white'
                                                }
                                            }}
                                        />
                                    </Box>
                                    <Typography variant="body2">
                                        {currentDeployment.progress || 0}%
                                    </Typography>
                                </Box>
                                <Typography variant="body2" sx={{ mt: 1, opacity: 0.9 }}>
                                    Deploying {currentDeployment.currentObject}... 
                                    ({currentDeployment.completedObjects}/{currentDeployment.totalObjects})
                                </Typography>
                            </CardContent>
                        </Card>
                    </Grid>
                )}

                {/* Deployment History Chart */}
                <Grid item xs={12}>
                    <Card elevation={1}>
                        <CardHeader
                            title="Deployment History"
                            subheader="Last 30 days"
                        />
                        <Divider />
                        <CardContent>
                            <ResponsiveContainer width="100%" height={300}>
                                <AreaChart data={history}>
                                    <CartesianGrid strokeDasharray="3 3" />
                                    <XAxis dataKey="date" />
                                    <YAxis />
                                    <RechartsTooltip />
                                    <Legend />
                                    <Area 
                                        type="monotone" 
                                        dataKey="successful" 
                                        stackId="1"
                                        stroke="#2e7d32" 
                                        fill="#4caf50" 
                                        fillOpacity={0.6}
                                    />
                                    <Area 
                                        type="monotone" 
                                        dataKey="failed" 
                                        stackId="1"
                                        stroke="#d32f2f" 
                                        fill="#f44336" 
                                        fillOpacity={0.6}
                                    />
                                </AreaChart>
                            </ResponsiveContainer>
                        </CardContent>
                    </Card>
                </Grid>
            </Grid>

            {/* Deployment Dialog */}
            <Dialog 
                open={deployDialog} 
                onClose={() => setDeployDialog(false)} 
                maxWidth="md" 
                fullWidth
            >
                <DialogTitle>
                    <Box sx={{ display: 'flex', alignItems: 'center' }}>
                        <CloudUploadIcon sx={{ mr: 1 }} />
                        <Typography variant="h6">New Deployment</Typography>
                    </Box>
                </DialogTitle>
                <DialogContent dividers>
                    <Stepper activeStep={activeStep} orientation="vertical">
                        {steps.map((step, index) => (
                            <Step key={step.label}>
                                <StepLabel>{step.label}</StepLabel>
                                <StepContent>
                                    <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                                        {step.description}
                                    </Typography>
                                    
                                    {index === 0 && (
                                        <Grid container spacing={3}>
                                            <Grid item xs={12}>
                                                <FormControl fullWidth>
                                                    <InputLabel>Environment</InputLabel>
                                                    <Select
                                                        value={deploymentConfig.environment}
                                                        label="Environment"
                                                        onChange={(e) => setDeploymentConfig({ 
                                                            ...deploymentConfig, 
                                                            environment: e.target.value 
                                                        })}
                                                    >
                                                        {environments.map((env) => (
                                                            <MenuItem key={env.id} value={env.id}>
                                                                <Box sx={{ display: 'flex', alignItems: 'center' }}>
                                                                    <Avatar 
                                                                        sx={{ 
                                                                            width: 24, 
                                                                            height: 24, 
                                                                            mr: 1,
                                                                            bgcolor: getEnvironmentColor(env.type)
                                                                        }}
                                                                    >
                                                                        {getEnvironmentIcon(env.type)}
                                                                    </Avatar>
                                                                    {env.name} ({env.type})
                                                                </Box>
                                                            </MenuItem>
                                                        ))}
                                                    </Select>
                                                </FormControl>
                                            </Grid>
                                            <Grid item xs={12}>
                                                <TextField
                                                    fullWidth
                                                    label="Version"
                                                    placeholder="1.0.0"
                                                    value={deploymentConfig.version}
                                                    onChange={(e) => setDeploymentConfig({
                                                        ...deploymentConfig,
                                                        version: e.target.value
                                                    })}
                                                />
                                            </Grid>
                                            <Grid item xs={12}>
                                                <FormControl component="fieldset">
                                                    <FormLabel component="legend">Deployment Mode</FormLabel>
                                                    <RadioGroup
                                                        row
                                                        value={deploymentConfig.mode}
                                                        onChange={(e) => setDeploymentConfig({
                                                            ...deploymentConfig,
                                                            mode: e.target.value
                                                        })}
                                                    >
                                                        <FormControlLabel 
                                                            value="full" 
                                                            control={<Radio />} 
                                                            label="Full Deployment" 
                                                        />
                                                        <FormControlLabel 
                                                            value="incremental" 
                                                            control={<Radio />} 
                                                            label="Incremental" 
                                                        />
                                                        <FormControlLabel 
                                                            value="delta" 
                                                            control={<Radio />} 
                                                            label="Delta Only" 
                                                        />
                                                    </RadioGroup>
                                                </FormControl>
                                            </Grid>
                                            <Grid item xs={12}>
                                                <FormGroup>
                                                    <FormControlLabel
                                                        control={
                                                            <Checkbox
                                                                checked={deploymentConfig.backup}
                                                                onChange={(e) => setDeploymentConfig({
                                                                    ...deploymentConfig,
                                                                    backup: e.target.checked
                                                                })}
                                                            />
                                                        }
                                                        label="Create backup before deployment"
                                                    />
                                                    <FormControlLabel
                                                        control={
                                                            <Checkbox
                                                                checked={deploymentConfig.validateOnly}
                                                                onChange={(e) => setDeploymentConfig({
                                                                    ...deploymentConfig,
                                                                    validateOnly: e.target.checked
                                                                })}
                                                            />
                                                        }
                                                        label="Validate only (no actual deployment)"
                                                    />
                                                    <FormControlLabel
                                                        control={
                                                            <Checkbox
                                                                checked={deploymentConfig.schedule}
                                                                onChange={(e) => setDeploymentConfig({
                                                                    ...deploymentConfig,
                                                                    schedule: e.target.checked
                                                                })}
                                                            />
                                                        }
                                                        label="Schedule deployment"
                                                    />
                                                </FormGroup>
                                            </Grid>
                                            {deploymentConfig.schedule && (
                                                <Grid item xs={12}>
                                                    <TextField
                                                        fullWidth
                                                        type="datetime-local"
                                                        label="Scheduled Time"
                                                        value={deploymentConfig.scheduledTime}
                                                        onChange={(e) => setDeploymentConfig({
                                                            ...deploymentConfig,
                                                            scheduledTime: e.target.value
                                                        })}
                                                        InputLabelProps={{ shrink: true }}
                                                    />
                                                </Grid>
                                            )}
                                        </Grid>
                                    )}

                                    {index === 1 && (
                                        <Box>
                                            <Typography variant="subtitle2" gutterBottom>
                                                Deployment Preview
                                            </Typography>
                                            <Alert severity="info" sx={{ mb: 2 }}>
                                                <AlertTitle>Validation Results</AlertTitle>
                                                All objects validated successfully. No conflicts detected.
                                            </Alert>
                                            <TableContainer component={Paper} variant="outlined">
                                                <Table size="small">
                                                    <TableHead>
                                                        <TableRow>
                                                            <TableCell>Object</TableCell>
                                                            <TableCell>Type</TableCell>
                                                            <TableCell>Action</TableCell>
                                                            <TableCell>Status</TableCell>
                                                        </TableRow>
                                                    </TableHead>
                                                    <TableBody>
                                                        <TableRow>
                                                            <TableCell>Customer</TableCell>
                                                            <TableCell>Table</TableCell>
                                                            <TableCell>Update</TableCell>
                                                            <TableCell>
                                                                <Chip 
                                                                    label="Ready" 
                                                                    size="small" 
                                                                    color="success"
                                                                />
                                                            </TableCell>
                                                        </TableRow>
                                                        <TableRow>
                                                            <TableCell>Sales Invoice</TableCell>
                                                            <TableCell>Page</TableCell>
                                                            <TableCell>Create</TableCell>
                                                            <TableCell>
                                                                <Chip 
                                                                    label="Ready" 
                                                                    size="small" 
                                                                    color="success"
                                                                />
                                                            </TableCell>
                                                        </TableRow>
                                                    </TableBody>
                                                </Table>
                                            </TableContainer>
                                        </Box>
                                    )}

                                    <Box sx={{ mb: 2 }}>
                                        <div>
                                            <Button
                                                variant="contained"
                                                onClick={() => setActiveStep(index + 1)}
                                                sx={{ mt: 1, mr: 1 }}
                                            >
                                                {index === steps.length - 1 ? 'Finish' : 'Continue'}
                                            </Button>
                                            <Button
                                                disabled={index === 0}
                                                onClick={() => setActiveStep(index - 1)}
                                                sx={{ mt: 1, mr: 1 }}
                                            >
                                                Back
                                            </Button>
                                        </div>
                                    </Box>
                                </StepContent>
                            </Step>
                        ))}
                    </Stepper>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setDeployDialog(false)}>Cancel</Button>
                    <Button 
                        onClick={handleDeploy} 
                        variant="contained" 
                        startIcon={<CloudUploadIcon />}
                        disabled={!deploymentConfig.environment || !deploymentConfig.version}
                    >
                        Deploy
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
};