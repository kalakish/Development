import React, { useState, useEffect } from 'react';
import {
    Box,
    Typography,
    Paper,
    Grid,
    Card,
    CardContent,
    CardActions,
    Button,
    IconButton,
    TextField,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    List,
    ListItem,
    ListItemIcon,
    ListItemText,
    ListItemSecondaryAction,
    Divider,
    Chip,
    Avatar,
    LinearProgress,
    Tab,
    Tabs,
    Alert,
    Snackbar,
    Tooltip,
    Menu,
    MenuItem,
    Breadcrumbs,
    Link
} from '@mui/material';
import {
    Folder as FolderIcon,
    FolderOpen as FolderOpenIcon,
    CreateNewFolder as CreateNewFolderIcon,
    Code as CodeIcon,
    TableChart as TableIcon,
    Description as PageIcon,
    Build as CodeunitIcon,
    Assessment as ReportIcon,
    CompareArrows as XmlIcon,
    Search as QueryIcon,
    Label as EnumIcon,
    MoreVert as MoreVertIcon,
    Delete as DeleteIcon,
    Edit as EditIcon,
    Share as ShareIcon,
    Download as DownloadIcon,
    Upload as UploadIcon,
    History as HistoryIcon,
    Settings as SettingsIcon,
    PlayArrow as RunIcon,
    BugReport as BugReportIcon,
    GitHub as GitHubIcon,
    CloudUpload as CloudUploadIcon,
    CloudDownload as CloudDownloadIcon,
    Add as AddIcon,
    Close as CloseIcon
} from '@mui/icons-material';
import { useStudio } from '../hooks/useStudio';
import { useNotification } from '../hooks/useNotification';
import { useNavigate } from 'react-router-dom';

interface TabPanelProps {
    children?: React.ReactNode;
    index: number;
    value: number;
}

const TabPanel: React.FC<TabPanelProps> = ({ children, value, index }) => (
    <div
        role="tabpanel"
        hidden={value !== index}
        id={`project-tabpanel-${index}`}
        aria-labelledby={`project-tab-${index}`}
    >
        {value === index && <Box sx={{ py: 3 }}>{children}</Box>}
    </div>
);

export const ProjectPage: React.FC = () => {
    const navigate = useNavigate();
    const { showNotification } = useNotification();
    const { 
        getCurrentProject, 
        getProjectObjects, 
        createProject, 
        openProject, 
        saveProject, 
        exportProject, 
        importProject,
        getProjectHistory 
    } = useStudio();

    const [project, setProject] = useState<any>(null);
    const [objects, setObjects] = useState<any[]>([]);
    const [history, setHistory] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [tabValue, setTabValue] = useState(0);
    const [newProjectDialog, setNewProjectDialog] = useState(false);
    const [importDialog, setImportDialog] = useState(false);
    const [exportDialog, setExportDialog] = useState(false);
    const [settingsDialog, setSettingsDialog] = useState(false);
    const [selectedObject, setSelectedObject] = useState<any>(null);
    const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
    const [projectMenuAnchor, setProjectMenuAnchor] = useState<null | HTMLElement>(null);
    const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });

    const [newProjectData, setNewProjectData] = useState({
        name: '',
        description: '',
        location: '',
        template: 'blank'
    });

    useEffect(() => {
        loadProjectData();
    }, []);

    const loadProjectData = async () => {
        setLoading(true);
        try {
            const currentProject = await getCurrentProject();
            setProject(currentProject);
            
            if (currentProject) {
                const projectObjects = await getProjectObjects(currentProject.id);
                setObjects(projectObjects);
                
                const projectHistory = await getProjectHistory(currentProject.id);
                setHistory(projectHistory);
            }
        } catch (error) {
            showNotification('Failed to load project data', 'error');
        } finally {
            setLoading(false);
        }
    };

    const handleCreateProject = async () => {
        try {
            const newProject = await createProject(newProjectData);
            setProject(newProject);
            setNewProjectDialog(false);
            showNotification('Project created successfully', 'success');
            loadProjectData();
        } catch (error) {
            showNotification('Failed to create project', 'error');
        }
    };

    const handleOpenProject = async () => {
        try {
            const opened = await openProject();
            if (opened) {
                showNotification('Project opened successfully', 'success');
                loadProjectData();
            }
        } catch (error) {
            showNotification('Failed to open project', 'error');
        }
    };

    const handleExportProject = async (format: string) => {
        try {
            await exportProject(project.id, format);
            setExportDialog(false);
            showNotification(`Project exported as ${format.toUpperCase()}`, 'success');
        } catch (error) {
            showNotification('Failed to export project', 'error');
        }
    };

    const handleImportProject = async (event: React.ChangeEvent<HTMLInputElement>) => {
        try {
            const file = event.target.files?.[0];
            if (file) {
                await importProject(file);
                setImportDialog(false);
                showNotification('Project imported successfully', 'success');
                loadProjectData();
            }
        } catch (error) {
            showNotification('Failed to import project', 'error');
        }
    };

    const handleDeleteObject = async (objectId: string) => {
        try {
            // Delete object logic
            showNotification('Object deleted', 'success');
            loadProjectData();
        } catch (error) {
            showNotification('Failed to delete object', 'error');
        }
    };

    const handleOpenObject = (object: any) => {
        navigate(`/designer/${object.type.toLowerCase()}/${object.id}`);
    };

    const getObjectIcon = (type: string) => {
        switch (type) {
            case 'Table': return <TableIcon />;
            case 'Page': return <PageIcon />;
            case 'Codeunit': return <CodeunitIcon />;
            case 'Report': return <ReportIcon />;
            case 'XMLPort': return <XmlIcon />;
            case 'Query': return <QueryIcon />;
            case 'Enum': return <EnumIcon />;
            default: return <CodeIcon />;
        }
    };

    const getObjectColor = (type: string) => {
        switch (type) {
            case 'Table': return '#0078D4';
            case 'Page': return '#107C10';
            case 'Codeunit': return '#B33E5C';
            case 'Report': return '#FF8C00';
            case 'XMLPort': return '#8661C5';
            case 'Query': return '#00B7C3';
            case 'Enum': return '#F7630C';
            default: return '#666666';
        }
    };

    if (loading) {
        return (
            <Box sx={{ width: '100%', mt: 4 }}>
                <LinearProgress />
                <Typography variant="body2" color="text.secondary" align="center" sx={{ mt: 2 }}>
                    Loading project...
                </Typography>
            </Box>
        );
    }

    if (!project) {
        return (
            <Box sx={{ p: 3, maxWidth: 800, mx: 'auto', mt: 8 }}>
                <Paper elevation={3} sx={{ p: 4, textAlign: 'center' }}>
                    <FolderOpenIcon sx={{ fontSize: 80, color: 'text.secondary', mb: 2 }} />
                    <Typography variant="h5" gutterBottom>
                        No Project Open
                    </Typography>
                    <Typography variant="body2" color="text.secondary" paragraph>
                        Start by creating a new project or opening an existing one.
                    </Typography>
                    <Box sx={{ mt: 3 }}>
                        <Button
                            variant="contained"
                            startIcon={<CreateNewFolderIcon />}
                            onClick={() => setNewProjectDialog(true)}
                            sx={{ mr: 2 }}
                        >
                            New Project
                        </Button>
                        <Button
                            variant="outlined"
                            startIcon={<FolderOpenIcon />}
                            onClick={handleOpenProject}
                        >
                            Open Project
                        </Button>
                    </Box>
                </Paper>

                {/* New Project Dialog */}
                <Dialog open={newProjectDialog} onClose={() => setNewProjectDialog(false)} maxWidth="sm" fullWidth>
                    <DialogTitle>Create New Project</DialogTitle>
                    <DialogContent>
                        <Box sx={{ pt: 2 }}>
                            <TextField
                                fullWidth
                                label="Project Name"
                                value={newProjectData.name}
                                onChange={(e) => setNewProjectData({ ...newProjectData, name: e.target.value })}
                                sx={{ mb: 2 }}
                            />
                            <TextField
                                fullWidth
                                label="Description"
                                multiline
                                rows={3}
                                value={newProjectData.description}
                                onChange={(e) => setNewProjectData({ ...newProjectData, description: e.target.value })}
                                sx={{ mb: 2 }}
                            />
                            <TextField
                                fullWidth
                                label="Location"
                                value={newProjectData.location}
                                onChange={(e) => setNewProjectData({ ...newProjectData, location: e.target.value })}
                                sx={{ mb: 2 }}
                            />
                            <Typography variant="subtitle2" gutterBottom>
                                Template
                            </Typography>
                            <Grid container spacing={2}>
                                {['blank', 'sales', 'inventory', 'accounting'].map((template) => (
                                    <Grid item xs={6} key={template}>
                                        <Card 
                                            variant="outlined"
                                            sx={{ 
                                                cursor: 'pointer',
                                                bgcolor: newProjectData.template === template ? 'primary.light' : 'background.paper',
                                                color: newProjectData.template === template ? 'white' : 'inherit',
                                                '&:hover': { bgcolor: 'action.hover' }
                                            }}
                                            onClick={() => setNewProjectData({ ...newProjectData, template })}
                                        >
                                            <CardContent>
                                                <Typography variant="body2" align="center">
                                                    {template.charAt(0).toUpperCase() + template.slice(1)}
                                                </Typography>
                                            </CardContent>
                                        </Card>
                                    </Grid>
                                ))}
                            </Grid>
                        </Box>
                    </DialogContent>
                    <DialogActions>
                        <Button onClick={() => setNewProjectDialog(false)}>Cancel</Button>
                        <Button 
                            onClick={handleCreateProject} 
                            variant="contained"
                            disabled={!newProjectData.name}
                        >
                            Create
                        </Button>
                    </DialogActions>
                </Dialog>
            </Box>
        );
    }

    return (
        <Box sx={{ p: 3 }}>
            {/* Breadcrumbs */}
            <Breadcrumbs sx={{ mb: 2 }}>
                <Link color="inherit" href="/dashboard">
                    Dashboard
                </Link>
                <Typography color="text.primary">Project</Typography>
            </Breadcrumbs>

            {/* Project Header */}
            <Paper elevation={1} sx={{ p: 3, mb: 3 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center' }}>
                        <Avatar 
                            sx={{ 
                                width: 56, 
                                height: 56, 
                                bgcolor: 'primary.main',
                                mr: 2
                            }}
                        >
                            <FolderIcon />
                        </Avatar>
                        <Box>
                            <Typography variant="h5" component="h1" gutterBottom>
                                {project.name}
                            </Typography>
                            <Typography variant="body2" color="text.secondary" gutterBottom>
                                {project.description || 'No description provided'}
                            </Typography>
                            <Box sx={{ display: 'flex', alignItems: 'center', mt: 1 }}>
                                <Chip 
                                    label={`v${project.version || '1.0.0'}`} 
                                    size="small" 
                                    sx={{ mr: 1 }}
                                />
                                <Chip 
                                    label={project.status || 'Active'} 
                                    size="small" 
                                    color="success"
                                    sx={{ mr: 1 }}
                                />
                                <Typography variant="caption" color="text.secondary">
                                    Last modified: {project.lastModified}
                                </Typography>
                            </Box>
                        </Box>
                    </Box>
                    <Box>
                        <Button
                            variant="outlined"
                            startIcon={<SaveIcon />}
                            onClick={() => saveProject(project.id)}
                            sx={{ mr: 1 }}
                        >
                            Save
                        </Button>
                        <Button
                            variant="contained"
                            startIcon={<RunIcon />}
                            onClick={() => navigate('/deployment')}
                            sx={{ mr: 1 }}
                        >
                            Deploy
                        </Button>
                        <IconButton onClick={(e) => setProjectMenuAnchor(e.currentTarget)}>
                            <MoreVertIcon />
                        </IconButton>
                        <Menu
                            anchorEl={projectMenuAnchor}
                            open={Boolean(projectMenuAnchor)}
                            onClose={() => setProjectMenuAnchor(null)}
                        >
                            <MenuItem onClick={() => setSettingsDialog(true)}>
                                <ListItemIcon><SettingsIcon fontSize="small" /></ListItemIcon>
                                <ListItemText>Project Settings</ListItemText>
                            </MenuItem>
                            <MenuItem onClick={() => setExportDialog(true)}>
                                <ListItemIcon><DownloadIcon fontSize="small" /></ListItemIcon>
                                <ListItemText>Export Project</ListItemText>
                            </MenuItem>
                            <MenuItem onClick={() => setImportDialog(true)}>
                                <ListItemIcon><UploadIcon fontSize="small" /></ListItemIcon>
                                <ListItemText>Import Objects</ListItemText>
                            </MenuItem>
                            <Divider />
                            <MenuItem onClick={() => navigate('/settings')}>
                                <ListItemIcon><SettingsIcon fontSize="small" /></ListItemIcon>
                                <ListItemText>Settings</ListItemText>
                            </MenuItem>
                        </Menu>
                    </Box>
                </Box>
            </Paper>

            {/* Tabs */}
            <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
                <Tabs value={tabValue} onChange={(_, v) => setTabValue(v)}>
                    <Tab label="Objects" />
                    <Tab label="History" />
                    <Tab label="Dependencies" />
                    <Tab label="Settings" />
                </Tabs>
            </Box>

            {/* Objects Tab */}
            <TabPanel value={tabValue} index={0}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                    <Typography variant="h6">
                        Project Objects ({objects.length})
                    </Typography>
                    <Button
                        variant="contained"
                        startIcon={<AddIcon />}
                        onClick={() => navigate('/designer/new')}
                    >
                        New Object
                    </Button>
                </Box>

                <Grid container spacing={2}>
                    {objects.map((obj) => (
                        <Grid item xs={12} sm={6} md={4} key={obj.id}>
                            <Card 
                                variant="outlined"
                                sx={{ 
                                    cursor: 'pointer',
                                    '&:hover': { boxShadow: 2, borderColor: 'primary.main' }
                                }}
                                onClick={() => handleOpenObject(obj)}
                            >
                                <CardContent>
                                    <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                                        <Avatar 
                                            sx={{ 
                                                bgcolor: getObjectColor(obj.type),
                                                width: 32,
                                                height: 32,
                                                mr: 1
                                            }}
                                        >
                                            {getObjectIcon(obj.type)}
                                        </Avatar>
                                        <Box sx={{ flexGrow: 1 }}>
                                            <Typography variant="subtitle1" component="div">
                                                {obj.name}
                                            </Typography>
                                            <Typography variant="caption" color="text.secondary">
                                                ID: {obj.id} • {obj.type}
                                            </Typography>
                                        </Box>
                                        <IconButton 
                                            size="small"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setSelectedObject(obj);
                                                setAnchorEl(e.currentTarget);
                                            }}
                                        >
                                            <MoreVertIcon />
                                        </IconButton>
                                    </Box>
                                    <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                                        {obj.description || 'No description'}
                                    </Typography>
                                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 2 }}>
                                        <Chip 
                                            label={`v${obj.version || '1.0.0'}`} 
                                            size="small" 
                                            variant="outlined"
                                        />
                                        <Typography variant="caption" color="text.secondary">
                                            {obj.lastModified}
                                        </Typography>
                                    </Box>
                                </CardContent>
                            </Card>
                        </Grid>
                    ))}
                </Grid>

                <Menu
                    anchorEl={anchorEl}
                    open={Boolean(anchorEl)}
                    onClose={() => setAnchorEl(null)}
                >
                    <MenuItem onClick={() => {
                        handleOpenObject(selectedObject);
                        setAnchorEl(null);
                    }}>
                        <ListItemIcon><EditIcon fontSize="small" /></ListItemIcon>
                        <ListItemText>Open</ListItemText>
                    </MenuItem>
                    <MenuItem>
                        <ListItemIcon><ShareIcon fontSize="small" /></ListItemIcon>
                        <ListItemText>Share</ListItemText>
                    </MenuItem>
                    <MenuItem>
                        <ListItemIcon><DownloadIcon fontSize="small" /></ListItemIcon>
                        <ListItemText>Export</ListItemText>
                    </MenuItem>
                    <Divider />
                    <MenuItem 
                        onClick={() => {
                            handleDeleteObject(selectedObject?.id);
                            setAnchorEl(null);
                        }}
                        sx={{ color: 'error.main' }}
                    >
                        <ListItemIcon><DeleteIcon fontSize="small" color="error" /></ListItemIcon>
                        <ListItemText>Delete</ListItemText>
                    </MenuItem>
                </Menu>
            </TabPanel>

            {/* History Tab */}
            <TabPanel value={tabValue} index={1}>
                <Typography variant="h6" gutterBottom>
                    Project History
                </Typography>
                <List>
                    {history.map((item, index) => (
                        <React.Fragment key={item.id}>
                            <ListItem alignItems="flex-start">
                                <ListItemAvatar>
                                    <Avatar>
                                        <HistoryIcon />
                                    </Avatar>
                                </ListItemAvatar>
                                <ListItemText
                                    primary={item.action}
                                    secondary={
                                        <React.Fragment>
                                            <Typography
                                                component="span"
                                                variant="body2"
                                                color="text.primary"
                                            >
                                                {item.user}
                                            </Typography>
                                            {` — ${item.description}`}
                                            <Typography
                                                component="div"
                                                variant="caption"
                                                color="text.secondary"
                                                sx={{ mt: 0.5 }}
                                            >
                                                {item.timestamp}
                                            </Typography>
                                        </React.Fragment>
                                    }
                                />
                                {item.version && (
                                    <Chip label={`v${item.version}`} size="small" />
                                )}
                            </ListItem>
                            {index < history.length - 1 && <Divider variant="inset" component="li" />}
                        </React.Fragment>
                    ))}
                </List>
            </TabPanel>

            {/* Dependencies Tab */}
            <TabPanel value={tabValue} index={2}>
                <Typography variant="h6" gutterBottom>
                    Project Dependencies
                </Typography>
                <Alert severity="info" sx={{ mb: 3 }}>
                    Manage external dependencies and references for your project.
                </Alert>
                <Grid container spacing={2}>
                    <Grid item xs={12} md={6}>
                        <Card variant="outlined">
                            <CardContent>
                                <Typography variant="subtitle1" gutterBottom>
                                    Extensions
                                </Typography>
                                <List dense>
                                    <ListItem>
                                        <ListItemIcon>
                                            <ExtensionIcon />
                                        </ListItemIcon>
                                        <ListItemText 
                                            primary="NOVA Base Library" 
                                            secondary="Version 2.0.0"
                                        />
                                        <Chip label="Installed" size="small" color="success" />
                                    </ListItem>
                                    <ListItem>
                                        <ListItemIcon>
                                            <ExtensionIcon />
                                        </ListItemIcon>
                                        <ListItemText 
                                            primary="NOVA UI Components" 
                                            secondary="Version 1.5.0"
                                        />
                                        <Chip label="Installed" size="small" color="success" />
                                    </ListItem>
                                </List>
                            </CardContent>
                            <CardActions>
                                <Button size="small">Manage Extensions</Button>
                            </CardActions>
                        </Card>
                    </Grid>
                    <Grid item xs={12} md={6}>
                        <Card variant="outlined">
                            <CardContent>
                                <Typography variant="subtitle1" gutterBottom>
                                    References
                                </Typography>
                                <List dense>
                                    <ListItem>
                                        <ListItemIcon>
                                            <GitHubIcon />
                                        </ListItemIcon>
                                        <ListItemText 
                                            primary="nova-framework/core" 
                                            secondary="GitHub"
                                        />
                                    </ListItem>
                                    <ListItem>
                                        <ListItemIcon>
                                            <CodeIcon />
                                        </ListItemIcon>
                                        <ListItemText 
                                            primary="Microsoft.Dynamics.NAV" 
                                            secondary="System Reference"
                                        />
                                    </ListItem>
                                </List>
                            </CardContent>
                            <CardActions>
                                <Button size="small">Add Reference</Button>
                            </CardActions>
                        </Card>
                    </Grid>
                </Grid>
            </TabPanel>

            {/* Settings Tab */}
            <TabPanel value={tabValue} index={3}>
                <Typography variant="h6" gutterBottom>
                    Project Settings
                </Typography>
                <Grid container spacing={3}>
                    <Grid item xs={12} md={6}>
                        <Card variant="outlined">
                            <CardContent>
                                <Typography variant="subtitle1" gutterBottom>
                                    General Settings
                                </Typography>
                                <TextField
                                    fullWidth
                                    label="Project Name"
                                    value={project.name}
                                    sx={{ mb: 2 }}
                                />
                                <TextField
                                    fullWidth
                                    label="Description"
                                    multiline
                                    rows={3}
                                    value={project.description}
                                    sx={{ mb: 2 }}
                                />
                                <TextField
                                    fullWidth
                                    label="Version"
                                    value={project.version}
                                    sx={{ mb: 2 }}
                                />
                            </CardContent>
                            <CardActions>
                                <Button size="small">Save Changes</Button>
                            </CardActions>
                        </Card>
                    </Grid>
                    <Grid item xs={12} md={6}>
                        <Card variant="outlined">
                            <CardContent>
                                <Typography variant="subtitle1" gutterBottom>
                                    Build Settings
                                </Typography>
                                <FormControl fullWidth sx={{ mb: 2 }}>
                                    <InputLabel>Target Framework</InputLabel>
                                    <Select
                                        value="net6.0"
                                        label="Target Framework"
                                    >
                                        <MenuItem value="net6.0">.NET 6.0</MenuItem>
                                        <MenuItem value="net7.0">.NET 7.0</MenuItem>
                                        <MenuItem value="net8.0">.NET 8.0</MenuItem>
                                    </Select>
                                </FormControl>
                                <FormControl fullWidth sx={{ mb: 2 }}>
                                    <InputLabel>Optimization Level</InputLabel>
                                    <Select
                                        value="balanced"
                                        label="Optimization Level"
                                    >
                                        <MenuItem value="none">None</MenuItem>
                                        <MenuItem value="basic">Basic</MenuItem>
                                        <MenuItem value="balanced">Balanced</MenuItem>
                                        <MenuItem value="aggressive">Aggressive</MenuItem>
                                    </Select>
                                </FormControl>
                                <FormControlLabel
                                    control={<Checkbox checked />}
                                    label="Generate SQL Schema"
                                />
                                <FormControlLabel
                                    control={<Checkbox checked />}
                                    label="Generate TypeScript"
                                />
                            </CardContent>
                            <CardActions>
                                <Button size="small">Save Changes</Button>
                            </CardActions>
                        </Card>
                    </Grid>
                </Grid>
            </TabPanel>

            {/* Export Dialog */}
            <Dialog open={exportDialog} onClose={() => setExportDialog(false)}>
                <DialogTitle>Export Project</DialogTitle>
                <DialogContent>
                    <List>
                        <ListItem button onClick={() => handleExportProject('zip')}>
                            <ListItemIcon><FolderIcon /></ListItemIcon>
                            <ListItemText 
                                primary="NOVA Project (.zip)" 
                                secondary="Complete project with all objects and metadata"
                            />
                        </ListItem>
                        <ListItem button onClick={() => handleExportProject('app')}>
                            <ListItemIcon><CodeIcon /></ListItemIcon>
                            <ListItemText 
                                primary="Application Package (.app)" 
                                secondary="Deployable application package"
                            />
                        </ListItem>
                        <ListItem button onClick={() => handleExportProject('json')}>
                            <ListItemIcon><CodeIcon /></ListItemIcon>
                            <ListItemText 
                                primary="JSON Metadata" 
                                secondary="Export as JSON metadata files"
                            />
                        </ListItem>
                    </List>
                </DialogContent>
            </Dialog>

            {/* Import Dialog */}
            <Dialog open={importDialog} onClose={() => setImportDialog(false)}>
                <DialogTitle>Import Objects</DialogTitle>
                <DialogContent>
                    <Box sx={{ p: 2, textAlign: 'center' }}>
                        <input
                            accept=".al,.json,.zip"
                            style={{ display: 'none' }}
                            id="import-file"
                            type="file"
                            onChange={handleImportProject}
                        />
                        <label htmlFor="import-file">
                            <Button variant="contained" component="span">
                                Select File
                            </Button>
                        </label>
                        <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
                            Supported formats: .al, .json, .zip
                        </Typography>
                    </Box>
                </DialogContent>
            </Dialog>

            {/* Snackbar */}
            <Snackbar
                open={snackbar.open}
                autoHideDuration={6000}
                onClose={() => setSnackbar({ ...snackbar, open: false })}
            >
                <Alert 
                    onClose={() => setSnackbar({ ...snackbar, open: false })} 
                    severity={snackbar.severity as any}
                    sx={{ width: '100%' }}
                >
                    {snackbar.message}
                </Alert>
            </Snackbar>
        </Box>
    );
};