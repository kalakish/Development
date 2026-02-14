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
    Drawer,
    List,
    ListItem,
    ListItemText,
    ListItemIcon,
    ListItemSecondaryAction,
    Chip,
    Menu,
    MenuItem,
    Select,
    FormControl,
    InputLabel,
    Switch,
    FormControlLabel,
    Alert,
    Snackbar,
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
    TableChart as TableIcon,
    ViewColumn as FieldIcon,
    VpnKey as KeyIcon,
    Bolt as TriggerIcon,
    Add as AddIcon,
    Delete as DeleteIcon,
    Edit as EditIcon,
    Code as CodeIcon,
    Settings as SettingsIcon,
    Preview as PreviewIcon,
    Build as BuildIcon,
    Download as DownloadIcon,
    ContentCopy as CopyIcon,
    Undo as UndoIcon,
    Redo as RedoIcon
} from '@mui/icons-material';
import MonacoEditor from '@monaco-editor/react';
import { useParams, useNavigate } from 'react-router-dom';
import { CompilerService } from '../services/CompilerService';
import { MetadataService } from '../services/MetadataService';
import { SQLServerService } from '../services/SQLServerService';
import { useNotification } from '../hooks/useNotification';

interface TabPanelProps {
    children?: React.ReactNode;
    index: number;
    value: number;
}

const TabPanel: React.FC<TabPanelProps> = ({ children, value, index }) => (
    <div role="tabpanel" hidden={value !== index} style={{ height: 'calc(100vh - 160px)', overflow: 'auto' }}>
        {value === index && <Box sx={{ p: 3 }}>{children}</Box>}
    </div>
);

interface Field {
    id: number;
    name: string;
    dataType: string;
    length?: number;
    precision?: number;
    scale?: number;
    isPrimaryKey: boolean;
    isNullable: boolean;
    defaultValue?: any;
    description?: string;
}

interface Key {
    name: string;
    fields: string[];
    clustered: boolean;
    unique: boolean;
}

interface Trigger {
    name: string;
    event: string;
    body: string;
}

export const TableDesignerPage: React.FC = () => {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const { showNotification } = useNotification();

    // State
    const [tableId, setTableId] = useState<number>(parseInt(id || '0') || 50100);
    const [tableName, setTableName] = useState<string>('');
    const [tableDescription, setTableDescription] = useState<string>('');
    const [fields, setFields] = useState<Field[]>([]);
    const [keys, setKeys] = useState<Key[]>([]);
    const [triggers, setTriggers] = useState<Trigger[]>([]);
    const [activeTab, setActiveTab] = useState(0);
    const [selectedField, setSelectedField] = useState<Field | null>(null);
    const [fieldDialogOpen, setFieldDialogOpen] = useState(false);
    const [keyDialogOpen, setKeyDialogOpen] = useState(false);
    const [triggerDialogOpen, setTriggerDialogOpen] = useState(false);
    const [previewData, setPreviewData] = useState<any[]>([]);
    const [generatedSQL, setGeneratedSQL] = useState<string>('');
    const [compiling, setCompiling] = useState(false);
    const [saving, setSaving] = useState(false);
    const [errors, setErrors] = useState<any[]>([]);
    const [history, setHistory] = useState<any[]>([]);
    const [historyIndex, setHistoryIndex] = useState(-1);

    // Data types for SQL Server
    const dataTypes = [
        { value: 'Integer', label: 'INT', description: '4-byte integer' },
        { value: 'BigInteger', label: 'BIGINT', description: '8-byte integer' },
        { value: 'Decimal', label: 'DECIMAL', description: 'Fixed precision number' },
        { value: 'Boolean', label: 'BIT', description: 'True/False' },
        { value: 'Text', label: 'NVARCHAR', description: 'Variable length text' },
        { value: 'Code', label: 'NCHAR', description: 'Fixed length code' },
        { value: 'Date', label: 'DATE', description: 'Date only' },
        { value: 'DateTime', label: 'DATETIME2', description: 'Date and time' },
        { value: 'Time', label: 'TIME', description: 'Time only' },
        { value: 'Guid', label: 'UNIQUEIDENTIFIER', description: 'Globally unique identifier' },
        { value: 'Blob', label: 'VARBINARY(MAX)', description: 'Binary large object' },
        { value: 'Media', label: 'VARBINARY(MAX)', description: 'Media content' }
    ];

    useEffect(() => {
        if (id) {
            loadTable();
        } else {
            // New table - set defaults
            setTableName('NewTable');
            setFields([
                {
                    id: 1,
                    name: 'No.',
                    dataType: 'Code',
                    length: 20,
                    isPrimaryKey: true,
                    isNullable: false
                },
                {
                    id: 2,
                    name: 'Name',
                    dataType: 'Text',
                    length: 100,
                    isPrimaryKey: false,
                    isNullable: false
                }
            ]);
            setKeys([
                {
                    name: 'PK',
                    fields: ['No.'],
                    clustered: true,
                    unique: true
                }
            ]);

            // Save to history
            pushToHistory();
        }
    }, [id]);

    const loadTable = async () => {
        try {
            const metadata = await MetadataService.getObject('Table', parseInt(id!));
            setTableId(metadata.id);
            setTableName(metadata.name);
            setTableDescription(metadata.description || '');
            setFields(metadata.fields || []);
            setKeys(metadata.keys || []);
            setTriggers(metadata.triggers || []);
            
            // Generate preview SQL
            generateSQLPreview(metadata);
            
            // Save to history
            pushToHistory();
        } catch (error) {
            showNotification(`Failed to load table: ${error.message}`, 'error');
        }
    };

    const generateSQLPreview = async (metadata?: any) => {
        try {
            const sql = await SQLServerService.generateTableScript(metadata || {
                id: tableId,
                name: tableName,
                fields,
                keys
            });
            setGeneratedSQL(sql);
        } catch (error) {
            setGeneratedSQL(`-- Error generating SQL: ${error.message}`);
        }
    };

    // Field Management
    const handleAddField = () => {
        setSelectedField({
            id: fields.length + 1,
            name: '',
            dataType: 'Text',
            length: 100,
            isPrimaryKey: false,
            isNullable: true
        });
        setFieldDialogOpen(true);
    };

    const handleEditField = (field: Field) => {
        setSelectedField({ ...field });
        setFieldDialogOpen(true);
    };

    const handleDeleteField = (fieldId: number) => {
        setFields(fields.filter(f => f.id !== fieldId));
        
        // Remove from keys
        setKeys(keys.map(key => ({
            ...key,
            fields: key.fields.filter(f => {
                const field = fields.find(fld => fld.name === f);
                return field?.id !== fieldId;
            })
        })).filter(key => key.fields.length > 0));
        
        showNotification('Field deleted', 'info');
        pushToHistory();
    };

    const handleSaveField = () => {
        if (!selectedField) return;

        // Validate
        if (!selectedField.name.trim()) {
            showNotification('Field name is required', 'error');
            return;
        }

        if (selectedField.dataType === 'Text' && !selectedField.length) {
            showNotification('Length is required for Text fields', 'error');
            return;
        }

        const exists = fields.some(f => 
            f.id !== selectedField.id && f.name === selectedField.name
        );

        if (exists) {
            showNotification('Field name already exists', 'error');
            return;
        }

        if (selectedField.id === 0) {
            // New field
            selectedField.id = fields.length + 1;
            setFields([...fields, selectedField]);
            showNotification('Field added successfully', 'success');
        } else {
            // Update field
            setFields(fields.map(f => f.id === selectedField.id ? selectedField : f));
            showNotification('Field updated successfully', 'success');
        }

        setFieldDialogOpen(false);
        setSelectedField(null);
        pushToHistory();
        generateSQLPreview();
    };

    // Key Management
    const handleAddKey = () => {
        setSelectedKey({
            name: '',
            fields: [],
            clustered: false,
            unique: false
        });
        setKeyDialogOpen(true);
    };

    const handleEditKey = (key: Key) => {
        setSelectedKey({ ...key });
        setKeyDialogOpen(true);
    };

    const handleDeleteKey = (keyName: string) => {
        setKeys(keys.filter(k => k.name !== keyName));
        showNotification('Key deleted', 'info');
        pushToHistory();
    };

    const handleSaveKey = () => {
        if (!selectedKey) return;

        if (!selectedKey.name.trim()) {
            showNotification('Key name is required', 'error');
            return;
        }

        if (selectedKey.fields.length === 0) {
            showNotification('At least one field is required', 'error');
            return;
        }

        const exists = keys.some(k => 
            k.name !== selectedKey.name && k.name === selectedKey.name
        );

        if (exists) {
            showNotification('Key name already exists', 'error');
            return;
        }

        // Only one clustered key allowed
        if (selectedKey.clustered) {
            const existingClustered = keys.find(k => k.clustered && k.name !== selectedKey.name);
            if (existingClustered) {
                showNotification('Only one clustered key is allowed. Remove existing clustered key first.', 'warning');
                return;
            }
        }

        if (selectedKey.id === 0) {
            setKeys([...keys, selectedKey]);
            showNotification('Key added successfully', 'success');
        } else {
            setKeys(keys.map(k => k.name === selectedKey.name ? selectedKey : k));
            showNotification('Key updated successfully', 'success');
        }

        setKeyDialogOpen(false);
        setSelectedKey(null);
        pushToHistory();
        generateSQLPreview();
    };

    // Trigger Management
    const handleAddTrigger = () => {
        setSelectedTrigger({
            name: 'OnInsert',
            event: 'INSERT',
            body: '-- Add your trigger logic here'
        });
        setTriggerDialogOpen(true);
    };

    const handleEditTrigger = (trigger: Trigger) => {
        setSelectedTrigger({ ...trigger });
        setTriggerDialogOpen(true);
    };

    const handleDeleteTrigger = (triggerName: string) => {
        setTriggers(triggers.filter(t => t.name !== triggerName));
        showNotification('Trigger deleted', 'info');
        pushToHistory();
    };

    const handleSaveTrigger = () => {
        if (!selectedTrigger) return;

        if (!selectedTrigger.name.trim()) {
            showNotification('Trigger name is required', 'error');
            return;
        }

        if (selectedTrigger.id === 0) {
            setTriggers([...triggers, selectedTrigger]);
            showNotification('Trigger added successfully', 'success');
        } else {
            setTriggers(triggers.map(t => t.name === selectedTrigger.name ? selectedTrigger : t));
            showNotification('Trigger updated successfully', 'success');
        }

        setTriggerDialogOpen(false);
        setSelectedTrigger(null);
        pushToHistory();
    };

    // Compile and Deploy
    const handleCompile = async () => {
        setCompiling(true);
        setErrors([]);

        try {
            // Generate AL code
            const alCode = generateALCode();
            
            // Compile
            const result = await CompilerService.compile(alCode);
            
            if (result.success) {
                showNotification('Compilation successful!', 'success');
                setGeneratedSQL(result.outputs?.[0]?.content || '');
                
                // Preview data from SQL Server
                await previewTableData();
            } else {
                setErrors(result.diagnostics || []);
                showNotification('Compilation failed', 'error');
            }
        } catch (error) {
            showNotification(`Compilation error: ${error.message}`, 'error');
        } finally {
            setCompiling(false);
        }
    };

    const handleDeploy = async () => {
        try {
            await SQLServerService.deployTable({
                id: tableId,
                name: tableName,
                fields,
                keys,
                triggers
            });

            showNotification('Table deployed to SQL Server successfully!', 'success');
            
            // Preview data
            await previewTableData();
        } catch (error) {
            showNotification(`Deployment failed: ${error.message}`, 'error');
        }
    };

    const previewTableData = async () => {
        try {
            const data = await SQLServerService.queryTable(tableName, 10);
            setPreviewData(data);
        } catch (error) {
            console.error('Failed to load preview data:', error);
        }
    };

    // Generate AL code from designer
    const generateALCode = (): string => {
        let code = `table ${tableId} ${tableName}\n{\n`;

        // Fields
        code += '    fields\n    {\n';
        fields.forEach(field => {
            code += `        field(${field.id}; "${field.name}"; ${field.dataType}`;
            
            if (field.length) {
                code += `[${field.length}]`;
            }
            if (field.precision) {
                code += `[${field.precision}${field.scale ? `,${field.scale}` : ''}]`;
            }
            
            code += ') { ';
            
            const properties = [];
            if (field.isPrimaryKey) properties.push('PrimaryKey = true');
            if (!field.isNullable) properties.push('NotBlank = true');
            if (field.defaultValue !== undefined) properties.push(`DefaultValue = ${formatDefaultValue(field.defaultValue)}`);
            
            code += properties.join('; ');
            code += '; }\n';
        });
        code += '    }\n\n';

        // Keys
        if (keys.length > 0) {
            code += '    keys\n    {\n';
            keys.forEach(key => {
                code += `        key(${key.name}; ${key.fields.map(f => `"${f}"`).join(', ')}) { `;
                
                const props = [];
                if (key.clustered) props.push('Clustered = true');
                if (key.unique) props.push('Unique = true');
                
                code += props.join('; ');
                code += '; }\n';
            });
            code += '    }\n\n';
        }

        // Triggers
        if (triggers.length > 0) {
            code += '    triggers\n    {\n';
            triggers.forEach(trigger => {
                code += `        trigger ${trigger.name}()\n        {\n`;
                code += `            ${trigger.body}\n`;
                code += '        }\n';
            });
            code += '    }\n';
        }

        code += '}\n';
        return code;
    };

    const formatDefaultValue = (value: any): string => {
        if (typeof value === 'string') return `'${value}'`;
        if (typeof value === 'boolean') return value ? 'true' : 'false';
        return String(value);
    };

    // History management
    const pushToHistory = () => {
        const snapshot = {
            tableId,
            tableName,
            fields: [...fields],
            keys: [...keys],
            triggers: [...triggers]
        };

        setHistory(prev => {
            const newHistory = prev.slice(0, historyIndex + 1);
            newHistory.push(snapshot);
            return newHistory;
        });
        setHistoryIndex(prev => prev + 1);
    };

    const handleUndo = () => {
        if (historyIndex > 0) {
            const snapshot = history[historyIndex - 1];
            restoreSnapshot(snapshot);
            setHistoryIndex(prev => prev - 1);
        }
    };

    const handleRedo = () => {
        if (historyIndex < history.length - 1) {
            const snapshot = history[historyIndex + 1];
            restoreSnapshot(snapshot);
            setHistoryIndex(prev => prev + 1);
        }
    };

    const restoreSnapshot = (snapshot: any) => {
        setTableId(snapshot.tableId);
        setTableName(snapshot.tableName);
        setFields(snapshot.fields);
        setKeys(snapshot.keys);
        setTriggers(snapshot.triggers);
    };

    // Save table
    const handleSave = async () => {
        setSaving(true);
        
        try {
            await MetadataService.saveObject({
                id: tableId,
                name: tableName,
                type: 'Table',
                description: tableDescription,
                definition: generateALCode(),
                metadata: {
                    fields,
                    keys,
                    triggers
                }
            });

            showNotification('Table saved successfully', 'success');
            
            if (!id) {
                navigate(`/designer/table/${tableId}`);
            }
        } catch (error) {
            showNotification(`Save failed: ${error.message}`, 'error');
        } finally {
            setSaving(false);
        }
    };

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
            {/* Header */}
            <AppBar position="static" color="default" elevation={1}>
                <Toolbar>
                    <TableIcon sx={{ mr: 2 }} color="primary" />
                    <Typography variant="h6" sx={{ flexGrow: 1 }}>
                        Table Designer - {tableName} (ID: {tableId})
                    </Typography>
                    
                    <IconButton color="inherit" onClick={handleUndo} disabled={historyIndex <= 0}>
                        <UndoIcon />
                    </IconButton>
                    <IconButton color="inherit" onClick={handleRedo} disabled={historyIndex >= history.length - 1}>
                        <RedoIcon />
                    </IconButton>
                    
                    <Divider orientation="vertical" flexItem sx={{ mx: 1 }} />
                    
                    <Button
                        color="primary"
                        startIcon={<BuildIcon />}
                        onClick={handleCompile}
                        disabled={compiling}
                        sx={{ mr: 1 }}
                    >
                        {compiling ? 'Compiling...' : 'Compile'}
                    </Button>
                    
                    <Button
                        color="secondary"
                        startIcon={<SaveIcon />}
                        onClick={handleSave}
                        disabled={saving}
                        sx={{ mr: 1 }}
                    >
                        {saving ? 'Saving...' : 'Save'}
                    </Button>
                    
                    <Button
                        variant="contained"
                        color="primary"
                        startIcon={<PlayArrowIcon />}
                        onClick={handleDeploy}
                        sx={{ mr: 1 }}
                    >
                        Deploy to SQL Server
                    </Button>
                    
                    <IconButton color="inherit">
                        <SettingsIcon />
                    </IconButton>
                </Toolbar>
                
                <Tabs value={activeTab} onChange={(_, v) => setActiveTab(v)}>
                    <Tab label="Design" />
                    <Tab label="Fields" />
                    <Tab label="Keys" />
                    <Tab label="Triggers" />
                    <Tab label="SQL Preview" />
                    <Tab label="Data Preview" />
                    <Tab label="Code" />
                </Tabs>
            </AppBar>

            {/* Main Content */}
            <Box sx={{ flexGrow: 1 }}>
                {/* Design Tab */}
                <TabPanel value={activeTab} index={0}>
                    <Grid container spacing={3}>
                        <Grid item xs={12} md={6}>
                            <Paper sx={{ p: 3 }}>
                                <Typography variant="h6" gutterBottom>
                                    Table Properties
                                </Typography>
                                
                                <TextField
                                    fullWidth
                                    label="Table ID"
                                    value={tableId}
                                    onChange={(e) => setTableId(parseInt(e.target.value) || 0)}
                                    type="number"
                                    sx={{ mb: 2 }}
                                    helperText="Use 50000-99999 for custom tables"
                                />
                                
                                <TextField
                                    fullWidth
                                    label="Table Name"
                                    value={tableName}
                                    onChange={(e) => setTableName(e.target.value)}
                                    sx={{ mb: 2 }}
                                />
                                
                                <TextField
                                    fullWidth
                                    label="Description"
                                    value={tableDescription}
                                    onChange={(e) => setTableDescription(e.target.value)}
                                    multiline
                                    rows={2}
                                    sx={{ mb: 2 }}
                                />
                                
                                <FormControlLabel
                                    control={<Switch />}
                                    label="Enable Soft Delete"
                                    sx={{ mb: 2 }}
                                />
                                
                                <FormControlLabel
                                    control={<Switch defaultChecked />}
                                    label="Enable Audit Logging"
                                />
                            </Paper>
                        </Grid>
                        
                        <Grid item xs={12} md={6}>
                            <Paper sx={{ p: 3 }}>
                                <Typography variant="h6" gutterBottom>
                                    Table Statistics
                                </Typography>
                                
                                <List>
                                    <ListItem>
                                        <ListItemIcon>
                                            <FieldIcon />
                                        </ListItemIcon>
                                        <ListItemText 
                                            primary="Fields"
                                            secondary={`${fields.length} fields defined`}
                                        />
                                    </ListItem>
                                    
                                    <ListItem>
                                        <ListItemIcon>
                                            <KeyIcon />
                                        </ListItemIcon>
                                        <ListItemText 
                                            primary="Keys"
                                            secondary={`${keys.length} keys (${keys.filter(k => k.clustered).length} clustered)`}
                                        />
                                    </ListItem>
                                    
                                    <ListItem>
                                        <ListItemIcon>
                                            <TriggerIcon />
                                        </ListItemIcon>
                                        <ListItemText 
                                            primary="Triggers"
                                            secondary={`${triggers.length} triggers defined`}
                                        />
                                    </ListItem>
                                </List>
                                
                                <Divider sx={{ my: 2 }} />
                                
                                <Typography variant="subtitle2" gutterBottom>
                                    SQL Server Information
                                </Typography>
                                
                                <Alert severity="info" sx={{ mt: 2 }}>
                                    <strong>Target Database:</strong> SQL Server 2022<br />
                                    <strong>Estimated Size:</strong> ~{fields.length * 50} KB<br />
                                    <strong>Identity Column:</strong> {fields.find(f => f.isPrimaryKey && f.dataType === 'Integer')?.name || 'None'}
                                </Alert>
                            </Paper>
                        </Grid>
                    </Grid>
                </TabPanel>

                {/* Fields Tab */}
                <TabPanel value={activeTab} index={1}>
                    <Box sx={{ mb: 2, display: 'flex', justifyContent: 'space-between' }}>
                        <Typography variant="h6">Field Definitions</Typography>
                        <Button
                            variant="contained"
                            startIcon={<AddIcon />}
                            onClick={handleAddField}
                        >
                            Add Field
                        </Button>
                    </Box>
                    
                    <Paper>
                        <List>
                            {fields.map((field) => (
                                <ListItem key={field.id} divider>
                                    <ListItemIcon>
                                        <FieldIcon color={field.isPrimaryKey ? 'primary' : 'action'} />
                                    </ListItemIcon>
                                    <ListItemText
                                        primary={
                                            <Box sx={{ display: 'flex', alignItems: 'center' }}>
                                                <Typography variant="subtitle1" sx={{ fontWeight: 'bold' }}>
                                                    {field.name}
                                                </Typography>
                                                <Chip
                                                    label={field.dataType}
                                                    size="small"
                                                    sx={{ ml: 2 }}
                                                />
                                                {field.length && (
                                                    <Chip
                                                        label={`${field.length}`}
                                                        size="small"
                                                        variant="outlined"
                                                        sx={{ ml: 1 }}
                                                    />
                                                )}
                                                {field.isPrimaryKey && (
                                                    <Chip
                                                        label="PK"
                                                        size="small"
                                                        color="primary"
                                                        sx={{ ml: 1 }}
                                                    />
                                                )}
                                            </Box>
                                        }
                                        secondary={`ID: ${field.id} • ${field.isNullable ? 'Nullable' : 'Required'} ${field.defaultValue ? `• Default: ${field.defaultValue}` : ''}`}
                                    />
                                    <ListItemSecondaryAction>
                                        <IconButton edge="end" onClick={() => handleEditField(field)}>
                                            <EditIcon />
                                        </IconButton>
                                        <IconButton edge="end" onClick={() => handleDeleteField(field.id)}>
                                            <DeleteIcon />
                                        </IconButton>
                                    </ListItemSecondaryAction>
                                </ListItem>
                            ))}
                            
                            {fields.length === 0 && (
                                <ListItem>
                                    <ListItemText
                                        primary="No fields defined"
                                        secondary="Click 'Add Field' to create your first field"
                                    />
                                </ListItem>
                            )}
                        </List>
                    </Paper>
                </TabPanel>

                {/* Keys Tab */}
                <TabPanel value={activeTab} index={2}>
                    <Box sx={{ mb: 2, display: 'flex', justifyContent: 'space-between' }}>
                        <Typography variant="h6">Key Definitions</Typography>
                        <Button
                            variant="contained"
                            startIcon={<AddIcon />}
                            onClick={handleAddKey}
                        >
                            Add Key
                        </Button>
                    </Box>
                    
                    <Paper>
                        <List>
                            {keys.map((key) => (
                                <ListItem key={key.name} divider>
                                    <ListItemIcon>
                                        <KeyIcon color={key.clustered ? 'primary' : 'action'} />
                                    </ListItemIcon>
                                    <ListItemText
                                        primary={
                                            <Box sx={{ display: 'flex', alignItems: 'center' }}>
                                                <Typography variant="subtitle1" sx={{ fontWeight: 'bold' }}>
                                                    {key.name}
                                                </Typography>
                                                <Chip
                                                    label={key.fields.join(', ')}
                                                    size="small"
                                                    sx={{ ml: 2 }}
                                                />
                                                {key.clustered && (
                                                    <Chip
                                                        label="Clustered"
                                                        size="small"
                                                        color="primary"
                                                        sx={{ ml: 1 }}
                                                    />
                                                )}
                                                {key.unique && (
                                                    <Chip
                                                        label="Unique"
                                                        size="small"
                                                        color="secondary"
                                                        sx={{ ml: 1 }}
                                                    />
                                                )}
                                            </Box>
                                        }
                                    />
                                    <ListItemSecondaryAction>
                                        <IconButton edge="end" onClick={() => handleEditKey(key)}>
                                            <EditIcon />
                                        </IconButton>
                                        <IconButton edge="end" onClick={() => handleDeleteKey(key.name)}>
                                            <DeleteIcon />
                                        </IconButton>
                                    </ListItemSecondaryAction>
                                </ListItem>
                            ))}
                            
                            {keys.length === 0 && (
                                <ListItem>
                                    <ListItemText
                                        primary="No keys defined"
                                        secondary="Add at least one clustered primary key"
                                    />
                                </ListItem>
                            )}
                        </List>
                    </Paper>
                </TabPanel>

                {/* Triggers Tab */}
                <TabPanel value={activeTab} index={3}>
                    <Box sx={{ mb: 2, display: 'flex', justifyContent: 'space-between' }}>
                        <Typography variant="h6">Trigger Definitions</Typography>
                        <Button
                            variant="contained"
                            startIcon={<AddIcon />}
                            onClick={handleAddTrigger}
                        >
                            Add Trigger
                        </Button>
                    </Box>
                    
                    <Paper>
                        <List>
                            {triggers.map((trigger) => (
                                <ListItem key={trigger.name} divider>
                                    <ListItemIcon>
                                        <TriggerIcon color="action" />
                                    </ListItemIcon>
                                    <ListItemText
                                        primary={
                                            <Box sx={{ display: 'flex', alignItems: 'center' }}>
                                                <Typography variant="subtitle1" sx={{ fontWeight: 'bold' }}>
                                                    {trigger.name}
                                                </Typography>
                                                <Chip
                                                    label={trigger.event}
                                                    size="small"
                                                    sx={{ ml: 2 }}
                                                />
                                            </Box>
                                        }
                                        secondary={
                                            <code style={{ 
                                                background: '#f5f5f5', 
                                                padding: '4px 8px', 
                                                borderRadius: 4,
                                                display: 'block',
                                                marginTop: 8
                                            }}>
                                                {trigger.body}
                                            </code>
                                        }
                                    />
                                    <ListItemSecondaryAction>
                                        <IconButton edge="end" onClick={() => handleEditTrigger(trigger)}>
                                            <EditIcon />
                                        </IconButton>
                                        <IconButton edge="end" onClick={() => handleDeleteTrigger(trigger.name)}>
                                            <DeleteIcon />
                                        </IconButton>
                                    </ListItemSecondaryAction>
                                </ListItem>
                            ))}
                            
                            {triggers.length === 0 && (
                                <ListItem>
                                    <ListItemText
                                        primary="No triggers defined"
                                        secondary="Add triggers for business logic validation"
                                    />
                                </ListItem>
                            )}
                        </List>
                    </Paper>
                </TabPanel>

                {/* SQL Preview Tab */}
                <TabPanel value={activeTab} index={4}>
                    <Typography variant="h6" gutterBottom>
                        SQL Server Schema
                    </Typography>
                    
                    <Paper sx={{ p: 2, bgcolor: '#1e1e1e' }}>
                        <pre style={{ 
                            margin: 0, 
                            color: '#d4d4d4',
                            fontFamily: '"JetBrains Mono", monospace',
                            fontSize: 14,
                            overflow: 'auto'
                        }}>
                            {generatedSQL || '-- No SQL generated yet. Click Compile to generate schema.'}
                        </pre>
                    </Paper>
                    
                    <Box sx={{ mt: 2, display: 'flex', justifyContent: 'flex-end' }}>
                        <Button
                            startIcon={<DownloadIcon />}
                            onClick={() => {
                                const blob = new Blob([generatedSQL], { type: 'text/plain' });
                                const url = URL.createObjectURL(blob);
                                const a = document.createElement('a');
                                a.href = url;
                                a.download = `${tableName}.sql`;
                                a.click();
                            }}
                        >
                            Download SQL Script
                        </Button>
                    </Box>
                </TabPanel>

                {/* Data Preview Tab */}
                <TabPanel value={activeTab} index={5}>
                    <Typography variant="h6" gutterBottom>
                        Table Data Preview (Top 10 rows)
                    </Typography>
                    
                    <Paper sx={{ p: 2, overflow: 'auto' }}>
                        {previewData.length > 0 ? (
                            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                <thead>
                                    <tr>
                                        {Object.keys(previewData[0]).map(key => (
                                            <th key={key} style={{ 
                                                textAlign: 'left', 
                                                padding: 12, 
                                                background: '#f5f5f5',
                                                borderBottom: '2px solid #ddd'
                                            }}>
                                                {key}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {previewData.map((row, i) => (
                                        <tr key={i}>
                                            {Object.values(row).map((value: any, j) => (
                                                <td key={j} style={{ 
                                                    padding: 8, 
                                                    borderBottom: '1px solid #eee'
                                                }}>
                                                    {value?.toString() || 'NULL'}
                                                </td>
                                            ))}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        ) : (
                            <Typography color="textSecondary" sx={{ py: 4, textAlign: 'center' }}>
                                No data available. Deploy the table to SQL Server to preview data.
                            </Typography>
                        )}
                    </Paper>
                </TabPanel>

                {/* Code Tab */}
                <TabPanel value={activeTab} index={6}>
                    <Typography variant="h6" gutterBottom>
                        AL Source Code
                    </Typography>
                    
                    <Paper sx={{ height: 'calc(100vh - 300px)' }}>
                        <MonacoEditor
                            height="100%"
                            defaultLanguage="al"
                            theme="vs-dark"
                            value={generateALCode()}
                            onChange={(value) => {
                                // Handle direct code editing
                            }}
                            options={{
                                minimap: { enabled: true },
                                fontSize: 14,
                                fontFamily: '"JetBrains Mono", monospace',
                                automaticLayout: true
                            }}
                        />
                    </Paper>
                </TabPanel>
            </Box>

            {/* Field Dialog */}
            <Dialog open={fieldDialogOpen} onClose={() => setFieldDialogOpen(false)} maxWidth="md" fullWidth>
                <DialogTitle>
                    {selectedField?.id === 0 ? 'Add New Field' : 'Edit Field'}
                </DialogTitle>
                <DialogContent>
                    <Grid container spacing={2} sx={{ pt: 2 }}>
                        <Grid item xs={6}>
                            <TextField
                                fullWidth
                                label="Field ID"
                                value={selectedField?.id || 0}
                                onChange={(e) => setSelectedField(prev => ({ 
                                    ...prev!, 
                                    id: parseInt(e.target.value) || 0 
                                }))}
                                type="number"
                            />
                        </Grid>
                        <Grid item xs={6}>
                            <TextField
                                fullWidth
                                label="Field Name"
                                value={selectedField?.name || ''}
                                onChange={(e) => setSelectedField(prev => ({ 
                                    ...prev!, 
                                    name: e.target.value 
                                }))}
                            />
                        </Grid>
                        <Grid item xs={6}>
                            <FormControl fullWidth>
                                <InputLabel>Data Type</InputLabel>
                                <Select
                                    value={selectedField?.dataType || 'Text'}
                                    label="Data Type"
                                    onChange={(e) => setSelectedField(prev => ({ 
                                        ...prev!, 
                                        dataType: e.target.value 
                                    }))}
                                >
                                    {dataTypes.map(type => (
                                        <MenuItem key={type.value} value={type.value}>
                                            {type.value} ({type.label})
                                        </MenuItem>
                                    ))}
                                </Select>
                            </FormControl>
                        </Grid>
                        
                        {(selectedField?.dataType === 'Text' || selectedField?.dataType === 'Code') && (
                            <Grid item xs={6}>
                                <TextField
                                    fullWidth
                                    label="Length"
                                    value={selectedField?.length || ''}
                                    onChange={(e) => setSelectedField(prev => ({ 
                                        ...prev!, 
                                        length: parseInt(e.target.value) || undefined 
                                    }))}
                                    type="number"
                                />
                            </Grid>
                        )}
                        
                        {selectedField?.dataType === 'Decimal' && (
                            <>
                                <Grid item xs={6}>
                                    <TextField
                                        fullWidth
                                        label="Precision"
                                        value={selectedField?.precision || 18}
                                        onChange={(e) => setSelectedField(prev => ({ 
                                            ...prev!, 
                                            precision: parseInt(e.target.value) || 18 
                                        }))}
                                        type="number"
                                    />
                                </Grid>
                                <Grid item xs={6}>
                                    <TextField
                                        fullWidth
                                        label="Scale"
                                        value={selectedField?.scale || 2}
                                        onChange={(e) => setSelectedField(prev => ({ 
                                            ...prev!, 
                                            scale: parseInt(e.target.value) || 2 
                                        }))}
                                        type="number"
                                    />
                                </Grid>
                            </>
                        )}
                        
                        <Grid item xs={12}>
                            <FormControlLabel
                                control={
                                    <Switch
                                        checked={selectedField?.isPrimaryKey || false}
                                        onChange={(e) => setSelectedField(prev => ({ 
                                            ...prev!, 
                                            isPrimaryKey: e.target.checked 
                                        }))}
                                    />
                                }
                                label="Primary Key"
                            />
                        </Grid>
                        
                        <Grid item xs={12}>
                            <FormControlLabel
                                control={
                                    <Switch
                                        checked={!selectedField?.isNullable}
                                        onChange={(e) => setSelectedField(prev => ({ 
                                            ...prev!, 
                                            isNullable: !e.target.checked 
                                        }))}
                                    />
                                }
                                label="Required (Not Blank)"
                            />
                        </Grid>
                        
                        <Grid item xs={12}>
                            <TextField
                                fullWidth
                                label="Default Value"
                                value={selectedField?.defaultValue || ''}
                                onChange={(e) => setSelectedField(prev => ({ 
                                    ...prev!, 
                                    defaultValue: e.target.value 
                                }))}
                            />
                        </Grid>
                    </Grid>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setFieldDialogOpen(false)}>Cancel</Button>
                    <Button onClick={handleSaveField} variant="contained" color="primary">
                        Save Field
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Errors Snackbar */}
            <Snackbar
                open={errors.length > 0}
                autoHideDuration={6000}
                onClose={() => setErrors([])}
            >
                <Alert severity="error" onClose={() => setErrors([])}>
                    <Typography variant="body2">Compilation failed with {errors.length} errors</Typography>
                    <ul style={{ margin: '4px 0', paddingLeft: 20 }}>
                        {errors.slice(0, 3).map((err, i) => (
                            <li key={i}>{err.message}</li>
                        ))}
                    </ul>
                </Alert>
            </Snackbar>
        </Box>
    );
};