import React, { useState, useEffect } from 'react';
import {
    Box,
    Paper,
    Grid,
    TextField,
    Button,
    IconButton,
    Typography,
    Divider,
    List,
    ListItem,
    ListItemText,
    ListItemIcon,
    ListItemSecondaryAction,
    Chip,
    Select,
    MenuItem,
    FormControl,
    InputLabel,
    Alert,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Tab,
    Tabs,
    Toolbar,
    AppBar
} from '@mui/material';
import {
    Save as SaveIcon,
    PlayArrow as RunIcon,
    Code as CodeIcon,
    Functions as ProcedureIcon,
    Event as EventIcon,
    Add as AddIcon,
    Delete as DeleteIcon,
    Edit as EditIcon,
    Settings as SettingsIcon,
    Build as BuildIcon,
    BugReport as DebugIcon
} from '@mui/icons-material';
import MonacoEditor from '@monaco-editor/react';
import { useParams, useNavigate } from 'react-router-dom';

export const CodeunitDesignerPage: React.FC = () => {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();

    const [codeunitId, setCodeunitId] = useState<number>(parseInt(id || '0') || 50100);
    const [codeunitName, setCodeunitName] = useState<string>('');
    const [codeunitDescription, setCodeunitDescription] = useState<string>('');
    const [procedures, setProcedures] = useState<any[]>([]);
    const [eventSubscribers, setEventSubscribers] = useState<any[]>([]);
    const [variables, setVariables] = useState<any[]>([]);
    const [activeTab, setActiveTab] = useState(0);
    const [procedureDialogOpen, setProcedureDialogOpen] = useState(false);
    const [subscriberDialogOpen, setSubscriberDialogOpen] = useState(false);
    const [variableDialogOpen, setVariableDialogOpen] = useState(false);
    const [selectedProcedure, setSelectedProcedure] = useState<any>(null);
    const [selectedSubscriber, setSelectedSubscriber] = useState<any>(null);
    const [selectedVariable, setSelectedVariable] = useState<any>(null);
    const [debugMode, setDebugMode] = useState(false);

    useEffect(() => {
        if (id) {
            loadCodeunit();
        }
    }, [id]);

    const loadCodeunit = async () => {
        try {
            const metadata = await window.api.getObject('Codeunit', parseInt(id!));
            setCodeunitId(metadata.id);
            setCodeunitName(metadata.name);
            setCodeunitDescription(metadata.description || '');
            setProcedures(metadata.procedures || []);
            setEventSubscribers(metadata.eventSubscribers || []);
            setVariables(metadata.variables || []);
        } catch (error) {
            console.error('Failed to load codeunit:', error);
        }
    };

    // Procedure Management
    const handleAddProcedure = () => {
        setSelectedProcedure({
            name: '',
            parameters: [],
            returnType: '',
            body: '// TODO: Add procedure logic',
            isEvent: false,
            isIntegration: false
        });
        setProcedureDialogOpen(true);
    };

    const handleEditProcedure = (procedure: any) => {
        setSelectedProcedure({ ...procedure });
        setProcedureDialogOpen(true);
    };

    const handleDeleteProcedure = (procedureName: string) => {
        setProcedures(procedures.filter(p => p.name !== procedureName));
    };

    const handleSaveProcedure = () => {
        if (!selectedProcedure) return;

        if (!selectedProcedure.name) {
            alert('Procedure name is required');
            return;
        }

        const existingIndex = procedures.findIndex(p => p.name === selectedProcedure.name);
        if (existingIndex >= 0) {
            setProcedures(procedures.map((p, i) => i === existingIndex ? selectedProcedure : p));
        } else {
            setProcedures([...procedures, selectedProcedure]);
        }

        setProcedureDialogOpen(false);
        setSelectedProcedure(null);
    };

    // Event Subscriber Management
    const handleAddSubscriber = () => {
        setSelectedSubscriber({
            eventName: '',
            procedureName: '',
            priority: 0,
            synchronous: false
        });
        setSubscriberDialogOpen(true);
    };

    const handleEditSubscriber = (subscriber: any) => {
        setSelectedSubscriber({ ...subscriber });
        setSubscriberDialogOpen(true);
    };

    const handleDeleteSubscriber = (eventName: string) => {
        setEventSubscribers(eventSubscribers.filter(s => s.eventName !== eventName));
    };

    const handleSaveSubscriber = () => {
        if (!selectedSubscriber) return;

        if (!selectedSubscriber.eventName || !selectedSubscriber.procedureName) {
            alert('Event name and procedure name are required');
            return;
        }

        const existingIndex = eventSubscribers.findIndex(s => s.eventName === selectedSubscriber.eventName);
        if (existingIndex >= 0) {
            setEventSubscribers(eventSubscribers.map((s, i) => i === existingIndex ? selectedSubscriber : s));
        } else {
            setEventSubscribers([...eventSubscribers, selectedSubscriber]);
        }

        setSubscriberDialogOpen(false);
        setSelectedSubscriber(null);
    };

    // Variable Management
    const handleAddVariable = () => {
        setSelectedVariable({
            name: '',
            dataType: 'Text',
            scope: 'local',
            defaultValue: ''
        });
        setVariableDialogOpen(true);
    };

    const handleEditVariable = (variable: any) => {
        setSelectedVariable({ ...variable });
        setVariableDialogOpen(true);
    };

    const handleDeleteVariable = (variableName: string) => {
        setVariables(variables.filter(v => v.name !== variableName));
    };

    const handleSaveVariable = () => {
        if (!selectedVariable) return;

        if (!selectedVariable.name) {
            alert('Variable name is required');
            return;
        }

        const existingIndex = variables.findIndex(v => v.name === selectedVariable.name);
        if (existingIndex >= 0) {
            setVariables(variables.map((v, i) => i === existingIndex ? selectedVariable : v));
        } else {
            setVariables([...variables, selectedVariable]);
        }

        setVariableDialogOpen(false);
        setSelectedVariable(null);
    };

    // Generate AL code
    const generateALCode = (): string => {
        let code = `codeunit ${codeunitId} ${codeunitName}\n{\n`;

        // Global variables
        if (variables.length > 0) {
            code += '    // Global variables\n';
            variables.filter(v => v.scope === 'global').forEach(variable => {
                code += `    var\n`;
                code += `        ${variable.name}: ${variable.dataType};\n`;
            });
            code += '\n';
        }

        // Procedures
        procedures.forEach(proc => {
            if (proc.isIntegration) {
                code += '    [IntegrationEvent(false, false)]\n';
            } else if (proc.isEvent) {
                code += '    [BusinessEvent(false)]\n';
            }
            
            code += `    procedure ${proc.name}(`;
            
            // Parameters
            if (proc.parameters) {
                const params = proc.parameters.map((p: any) => 
                    `${p.isVar ? 'var ' : ''}${p.name}: ${p.type}`
                ).join('; ');
                code += params;
            }
            
            code += ')';
            
            if (proc.returnType) {
                code += `: ${proc.returnType}`;
            }
            
            code += '\n    begin\n';
            code += `        ${proc.body}\n`;
            code += '    end;\n\n';
        });

        // Event subscribers
        eventSubscribers.forEach(sub => {
            code += `    [EventSubscriber(${sub.eventName}, '', ${sub.priority}, ${sub.synchronous})]\n`;
            code += `    local procedure ${sub.procedureName}(var Rec: Record)\n`;
            code += '    begin\n';
            code += '        // Event handling logic\n';
            code += '    end;\n\n';
        });

        code += '}\n';
        return code;
    };

    // Data types for AL
    const dataTypes = [
        'Text', 'Code', 'Integer', 'BigInteger', 'Decimal', 'Boolean',
        'Date', 'DateTime', 'Time', 'Guid', 'Record', 'RecordRef',
        'JsonObject', 'JsonArray', 'HttpClient', 'XmlDocument',
        'List', 'Dictionary', 'Variant'
    ];

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
            {/* Header */}
            <AppBar position="static" color="default" elevation={1}>
                <Toolbar>
                    <CodeIcon sx={{ mr: 2 }} color="primary" />
                    <Typography variant="h6" sx={{ flexGrow: 1 }}>
                        Codeunit Designer - {codeunitName} (ID: {codeunitId})
                    </Typography>
                    
                    <Button
                        color={debugMode ? 'primary' : 'inherit'}
                        startIcon={<DebugIcon />}
                        onClick={() => setDebugMode(!debugMode)}
                        sx={{ mr: 1 }}
                    >
                        {debugMode ? 'Debugging' : 'Debug'}
                    </Button>
                    
                    <Button
                        color="primary"
                        startIcon={<BuildIcon />}
                        sx={{ mr: 1 }}
                    >
                        Compile
                    </Button>
                    
                    <Button
                        color="secondary"
                        startIcon={<SaveIcon />}
                        sx={{ mr: 1 }}
                    >
                        Save
                    </Button>
                    
                    <Button
                        color="primary"
                        startIcon={<RunIcon />}
                        sx={{ mr: 1 }}
                    >
                        Run
                    </Button>
                    
                    <IconButton color="inherit">
                        <SettingsIcon />
                    </IconButton>
                </Toolbar>
                
                <Tabs value={activeTab} onChange={(_, v) => setActiveTab(v)}>
                    <Tab label="Design" />
                    <Tab label="Procedures" />
                    <Tab label="Events" />
                    <Tab label="Variables" />
                    <Tab label="Code" />
                    <Tab label="Test" />
                </Tabs>
            </AppBar>

            {/* Main Content */}
            <Box sx={{ flexGrow: 1, overflow: 'auto' }}>
                <TabPanel value={activeTab} index={0}>
                    <Grid container spacing={3} sx={{ p: 3 }}>
                        <Grid item xs={12} md={6}>
                            <Paper sx={{ p: 3 }}>
                                <Typography variant="h6" gutterBottom>
                                    Codeunit Properties
                                </Typography>
                                
                                <TextField
                                    fullWidth
                                    label="Codeunit ID"
                                    value={codeunitId}
                                    onChange={(e) => setCodeunitId(parseInt(e.target.value) || 0)}
                                    type="number"
                                    sx={{ mb: 2 }}
                                />
                                
                                <TextField
                                    fullWidth
                                    label="Codeunit Name"
                                    value={codeunitName}
                                    onChange={(e) => setCodeunitName(e.target.value)}
                                    sx={{ mb: 2 }}
                                />
                                
                                <TextField
                                    fullWidth
                                    label="Description"
                                    value={codeunitDescription}
                                    onChange={(e) => setCodeunitDescription(e.target.value)}
                                    multiline
                                    rows={2}
                                    sx={{ mb: 2 }}
                                />
                                
                                <FormControl fullWidth>
                                    <InputLabel>Subtype</InputLabel>
                                    <Select value="Normal" label="Subtype">
                                        <MenuItem value="Normal">Normal</MenuItem>
                                        <MenuItem value="Test">Test</MenuItem>
                                        <MenuItem value="Upgrade">Upgrade</MenuItem>
                                        <MenuItem value="Install">Install</MenuItem>
                                    </Select>
                                </FormControl>
                            </Paper>
                        </Grid>
                        
                        <Grid item xs={12} md={6}>
                            <Paper sx={{ p: 3 }}>
                                <Typography variant="h6" gutterBottom>
                                    Codeunit Statistics
                                </Typography>
                                
                                <List>
                                    <ListItem>
                                        <ListItemText 
                                            primary="Procedures"
                                            secondary={`${procedures.length} procedures`}
                                        />
                                    </ListItem>
                                    <ListItem>
                                        <ListItemText 
                                            primary="Event Subscribers"
                                            secondary={`${eventSubscribers.length} subscribers`}
                                        />
                                    </ListItem>
                                    <ListItem>
                                        <ListItemText 
                                            primary="Variables"
                                            secondary={`${variables.length} variables`}
                                        />
                                    </ListItem>
                                    <ListItem>
                                        <ListItemText 
                                            primary="Integration Events"
                                            secondary={`${procedures.filter(p => p.isIntegration).length} events`}
                                        />
                                    </ListItem>
                                </List>
                                
                                <Divider sx={{ my: 2 }} />
                                
                                <Typography variant="subtitle2" gutterBottom>
                                    Dependencies
                                </Typography>
                                
                                <Chip label="No dependencies" size="small" />
                            </Paper>
                        </Grid>
                    </Grid>
                </TabPanel>

                {/* Procedures Tab */}
                <TabPanel value={activeTab} index={1}>
                    <Box sx={{ p: 3 }}>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
                            <Typography variant="h6">Procedures</Typography>
                            <Button
                                variant="contained"
                                startIcon={<AddIcon />}
                                onClick={handleAddProcedure}
                            >
                                Add Procedure
                            </Button>
                        </Box>
                        
                        <Paper>
                            {procedures.map((procedure) => (
                                <ListItem key={procedure.name} divider>
                                    <ListItemIcon>
                                        <ProcedureIcon color="primary" />
                                    </ListItemIcon>
                                    <ListItemText
                                        primary={
                                            <Box sx={{ display: 'flex', alignItems: 'center' }}>
                                                <Typography variant="subtitle1" sx={{ fontWeight: 'bold' }}>
                                                    {procedure.name}
                                                </Typography>
                                                {procedure.isIntegration && (
                                                    <Chip
                                                        label="IntegrationEvent"
                                                        size="small"
                                                        color="secondary"
                                                        sx={{ ml: 1 }}
                                                    />
                                                )}
                                                {procedure.isEvent && !procedure.isIntegration && (
                                                    <Chip
                                                        label="BusinessEvent"
                                                        size="small"
                                                        color="info"
                                                        sx={{ ml: 1 }}
                                                    />
                                                )}
                                                {procedure.returnType && (
                                                    <Chip
                                                        label={`→ ${procedure.returnType}`}
                                                        size="small"
                                                        variant="outlined"
                                                        sx={{ ml: 1 }}
                                                    />
                                                )}
                                            </Box>
                                        }
                                        secondary={
                                            <>
                                                {procedure.parameters?.map((p: any) => 
                                                    `${p.isVar ? 'var ' : ''}${p.name}: ${p.type}`
                                                ).join(', ') || 'No parameters'}
                                            </>
                                        }
                                    />
                                    <ListItemSecondaryAction>
                                        <IconButton edge="end" onClick={() => handleEditProcedure(procedure)}>
                                            <EditIcon />
                                        </IconButton>
                                        <IconButton edge="end" onClick={() => handleDeleteProcedure(procedure.name)}>
                                            <DeleteIcon />
                                        </IconButton>
                                    </ListItemSecondaryAction>
                                </ListItem>
                            ))}
                            
                            {procedures.length === 0 && (
                                <ListItem>
                                    <ListItemText
                                        primary="No procedures defined"
                                        secondary="Click 'Add Procedure' to create your first procedure"
                                    />
                                </ListItem>
                            )}
                        </Paper>
                    </Box>
                </TabPanel>

                {/* Events Tab */}
                <TabPanel value={activeTab} index={2}>
                    <Box sx={{ p: 3 }}>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
                            <Typography variant="h6">Event Subscribers</Typography>
                            <Button
                                variant="contained"
                                startIcon={<AddIcon />}
                                onClick={handleAddSubscriber}
                            >
                                Subscribe to Event
                            </Button>
                        </Box>
                        
                        <Paper>
                            {eventSubscribers.map((subscriber) => (
                                <ListItem key={subscriber.eventName} divider>
                                    <ListItemIcon>
                                        <EventIcon color="action" />
                                    </ListItemIcon>
                                    <ListItemText
                                        primary={
                                            <Box sx={{ display: 'flex', alignItems:'center' }}>
                                                <Typography variant="subtitle1">
                                                    {subscriber.eventName}
                                                </Typography>
                                                <Chip
                                                    label={`Priority: ${subscriber.priority}`}
                                                    size="small"
                                                    sx={{ ml: 1 }}
                                                />
                                                {subscriber.synchronous && (
                                                    <Chip
                                                        label="Sync"
                                                        size="small"
                                                        color="warning"
                                                        sx={{ ml: 1 }}
                                                    />
                                                )}
                                            </Box>
                                        }
                                        secondary={`→ ${subscriber.procedureName}`}
                                    />
                                    <ListItemSecondaryAction>
                                        <IconButton edge="end" onClick={() => handleEditSubscriber(subscriber)}>
                                            <EditIcon />
                                        </IconButton>
                                        <IconButton edge="end" onClick={() => handleDeleteSubscriber(subscriber.eventName)}>
                                            <DeleteIcon />
                                        </IconButton>
                                    </ListItemSecondaryAction>
                                </ListItem>
                            ))}
                            
                            {eventSubscribers.length === 0 && (
                                <ListItem>
                                    <ListItemText
                                        primary="No event subscribers"
                                        secondary="Subscribe to table or codeunit events"
                                    />
                                </ListItem>
                            )}
                        </Paper>
                    </Box>
                </TabPanel>

                {/* Variables Tab */}
                <TabPanel value={activeTab} index={3}>
                    <Box sx={{ p: 3 }}>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
                            <Typography variant="h6">Variables</Typography>
                            <Button
                                variant="contained"
                                startIcon={<AddIcon />}
                                onClick={handleAddVariable}
                            >
                                Add Variable
                            </Button>
                        </Box>
                        
                        <Paper>
                            {variables.map((variable) => (
                                <ListItem key={variable.name} divider>
                                    <ListItemText
                                        primary={
                                            <Box sx={{ display: 'flex', alignItems: 'center' }}>
                                                <Typography variant="subtitle1">
                                                    {variable.name}
                                                </Typography>
                                                <Chip
                                                    label={variable.dataType}
                                                    size="small"
                                                    sx={{ ml: 1 }}
                                                />
                                                <Chip
                                                    label={variable.scope}
                                                    size="small"
                                                    variant="outlined"
                                                    sx={{ ml: 1 }}
                                                />
                                            </Box>
                                        }
                                        secondary={variable.defaultValue ? `Default: ${variable.defaultValue}` : ''}
                                    />
                                    <ListItemSecondaryAction>
                                        <IconButton edge="end" onClick={() => handleEditVariable(variable)}>
                                            <EditIcon />
                                        </IconButton>
                                        <IconButton edge="end" onClick={() => handleDeleteVariable(variable.name)}>
                                            <DeleteIcon />
                                        </IconButton>
                                    </ListItemSecondaryAction>
                                </ListItem>
                            ))}
                            
                            {variables.length === 0 && (
                                <ListItem>
                                    <ListItemText
                                        primary="No variables defined"
                                        secondary="Add global or local variables"
                                    />
                                </ListItem>
                            )}
                        </Paper>
                    </Box>
                </TabPanel>

                {/* Code Tab */}
                <TabPanel value={activeTab} index={4}>
                    <Box sx={{ p: 3, height: 'calc(100vh - 300px)' }}>
                        <Typography variant="h6" gutterBottom>
                            AL Source Code
                        </Typography>
                        
                        <Paper sx={{ height: '100%' }}>
                            <MonacoEditor
                                height="100%"
                                defaultLanguage="al"
                                theme="vs-dark"
                                value={generateALCode()}
                                options={{
                                    minimap: { enabled: true },
                                    fontSize: 14,
                                    fontFamily: '"JetBrains Mono", monospace',
                                    automaticLayout: true
                                }}
                            />
                        </Paper>
                    </Box>
                </TabPanel>

                {/* Test Tab */}
                <TabPanel value={activeTab} index={5}>
                    <Box sx={{ p: 3 }}>
                        <Typography variant="h6" gutterBottom>
                            Unit Tests
                        </Typography>
                        
                        <Grid container spacing={3}>
                            <Grid item xs={12} md={6}>
                                <Paper sx={{ p: 3 }}>
                                    <Typography variant="subtitle1" gutterBottom>
                                        Test Runner
                                    </Typography>
                                    
                                    <Button
                                        variant="contained"
                                        startIcon={<RunIcon />}
                                        fullWidth
                                        sx={{ mb: 2 }}
                                    >
                                        Run All Tests
                                    </Button>
                                    
                                    <Button
                                        variant="outlined"
                                        startIcon={<DebugIcon />}
                                        fullWidth
                                    >
                                        Debug Tests
                                    </Button>
                                </Paper>
                            </Grid>
                            
                            <Grid item xs={12} md={6}>
                                <Paper sx={{ p: 3 }}>
                                    <Typography variant="subtitle1" gutterBottom>
                                        Test Results
                                    </Typography>
                                    
                                    <Alert severity="info">
                                        No tests have been run yet
                                    </Alert>
                                </Paper>
                            </Grid>
                        </Grid>
                    </Box>
                </TabPanel>
            </Box>

            {/* Procedure Dialog */}
            <Dialog open={procedureDialogOpen} onClose={() => setProcedureDialogOpen(false)} maxWidth="md" fullWidth>
                <DialogTitle>
                    {selectedProcedure?.name ? 'Edit Procedure' : 'Add Procedure'}
                </DialogTitle>
                <DialogContent>
                    <Grid container spacing={2} sx={{ pt: 2 }}>
                        <Grid item xs={6}>
                            <TextField
                                fullWidth
                                label="Procedure Name"
                                value={selectedProcedure?.name || ''}
                                onChange={(e) => setSelectedProcedure(prev => ({ ...prev!, name: e.target.value }))}
                            />
                        </Grid>
                        <Grid item xs={6}>
                            <FormControl fullWidth>
                                <InputLabel>Return Type</InputLabel>
                                <Select
                                    value={selectedProcedure?.returnType || ''}
                                    label="Return Type"
                                    onChange={(e) => setSelectedProcedure(prev => ({ ...prev!, returnType: e.target.value }))}
                                >
                                    <MenuItem value="">None (procedure)</MenuItem>
                                    {dataTypes.map(type => (
                                        <MenuItem key={type} value={type}>{type}</MenuItem>
                                    ))}
                                </Select>
                            </FormControl>
                        </Grid>
                        
                        <Grid item xs={12}>
                            <Typography variant="subtitle2" gutterBottom>
                                Parameters
                            </Typography>
                            <Paper variant="outlined" sx={{ p: 2, bgcolor: '#f5f5f5' }}>
                                <Typography color="textSecondary">
                                    Parameter editor would go here
                                </Typography>
                            </Paper>
                        </Grid>
                        
                        <Grid item xs={12}>
                            <Typography variant="subtitle2" gutterBottom>
                                Attributes
                            </Typography>
                            <FormControlLabel
                                control={
                                    <Switch
                                        checked={selectedProcedure?.isIntegration || false}
                                        onChange={(e) => setSelectedProcedure(prev => ({ 
                                            ...prev!, 
                                            isIntegration: e.target.checked,
                                            isEvent: e.target.checked ? true : prev?.isEvent 
                                        }))}
                                    />
                                }
                                label="Integration Event"
                            />
                            <FormControlLabel
                                control={
                                    <Switch
                                        checked={selectedProcedure?.isEvent || false}
                                        onChange={(e) => setSelectedProcedure(prev => ({ 
                                            ...prev!, 
                                            isEvent: e.target.checked 
                                        }))}
                                        disabled={selectedProcedure?.isIntegration}
                                    />
                                }
                                label="Business Event"
                            />
                        </Grid>
                        
                        <Grid item xs={12}>
                            <Typography variant="subtitle2" gutterBottom>
                                Procedure Body
                            </Typography>
                            <MonacoEditor
                                height="200px"
                                defaultLanguage="al"
                                value={selectedProcedure?.body || ''}
                                onChange={(value) => setSelectedProcedure(prev => ({ ...prev!, body: value }))}
                                options={{
                                    minimap: { enabled: false },
                                    fontSize: 14
                                }}
                            />
                        </Grid>
                    </Grid>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setProcedureDialogOpen(false)}>Cancel</Button>
                    <Button onClick={handleSaveProcedure} variant="contained" color="primary">
                        Save Procedure
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
};

const TabPanel: React.FC<{ children: React.ReactNode; value: number; index: number }> = ({ children, value, index }) => (
    <div role="tabpanel" hidden={value !== index}>
        {value === index && children}
    </div>
);