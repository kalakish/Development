import React, { useState, useEffect } from 'react';
import {
    Box,
    Drawer,
    AppBar,
    Toolbar,
    Typography,
    IconButton,
    Tabs,
    Tab,
    Button,
    Menu,
    MenuItem,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    TextField,
    Alert,
    Paper,
    Grid,
    Chip,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    TablePagination,
    Select,
    FormControl,
    InputLabel,
    Switch,
    FormControlLabel,
    Divider,
    RadioGroup,
    Radio,
    FormLabel,
    List,
    ListItem,
    ListItemText,
    ListItemSecondaryAction,
    ListItemIcon,
    Badge,
    Tooltip,
    Card,
    CardContent,
    CardActions,
    Avatar,
    Stack,
    InputAdornment,
    Collapse
} from '@mui/material';
import {
    Menu as MenuIcon,
    Save as SaveIcon,
    PlayArrow as RunIcon,
    Build as BuildIcon,
    Download as DownloadIcon,
    Share as ShareIcon,
    History as HistoryIcon,
    Settings as SettingsIcon,
    Add as AddIcon,
    Delete as DeleteIcon,
    Edit as EditIcon,
    ArrowUpward as ArrowUpIcon,
    ArrowDownward as ArrowDownIcon,
    ColorLens as ColorIcon,
    Translate as TranslateIcon,
    CheckCircle as CheckIcon,
    Warning as WarningIcon,
    Info as InfoIcon,
    Code as CodeIcon,
    ViewQuilt as ViewIcon,
    Description as DescriptionIcon,
    Lock as LockIcon,
    LockOpen as LockOpenIcon,
    Visibility as VisibilityIcon,
    VisibilityOff as VisibilityOffIcon,
    Star as StarIcon,
    StarBorder as StarBorderIcon,
    FileCopy as CloneIcon,
    ImportExport as ImportExportIcon,
    Refresh as RefreshIcon,
    Close as CloseIcon,
    MoreVert as MoreVertIcon,
    DragIndicator as DragIcon
} from '@mui/icons-material';
import { useParams, useNavigate } from 'react-router-dom';
import { useNotification } from '../hooks/useNotification';
import { CompilerService } from '../services/CompilerService';
import { MetadataService } from '../services/MetadataService';
import MonacoEditor from '@monaco-editor/react';

interface TabPanelProps {
    children?: React.ReactNode;
    index: number;
    value: number;
}

const TabPanel: React.FC<TabPanelProps> = ({ children, value, index }) => (
    <div
        role="tabpanel"
        hidden={value !== index}
        style={{ height: 'calc(100% - 48px)', overflow: 'auto' }}
    >
        {value === index && (
            <Box sx={{ height: '100%' }}>
                {children}
            </Box>
        )}
    </div>
);

interface EnumValue {
    id: number;
    ordinal: number;
    name: string;
    caption?: string;
    captions?: Record<string, string>;
    color?: string;
    isDefault?: boolean;
    isSystem?: boolean;
    description?: string;
    icon?: string;
    metadata?: Record<string, any>;
}

interface EnumDefinition {
    id: number;
    name: string;
    description?: string;
    baseType: 'Integer' | 'String';
    extensible: boolean;
    values: EnumValue[];
    properties: Record<string, any>;
    createdAt?: Date;
    modifiedAt?: Date;
}

export const EnumDesignerPage: React.FC = () => {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const { showNotification } = useNotification();

    // State
    const [enumDef, setEnumDef] = useState<EnumDefinition>({
        id: parseInt(id || '0') || 50000,
        name: '',
        baseType: 'Integer',
        extensible: false,
        values: [],
        properties: {}
    });
    
    const [activeTab, setActiveTab] = useState(0);
    const [code, setCode] = useState('');
    const [compiling, setCompiling] = useState(false);
    const [saving, setSaving] = useState(false);
    const [errors, setErrors] = useState<any[]>([]);
    const [menuAnchorEl, setMenuAnchorEl] = useState<null | HTMLElement>(null);
    const [saveDialogOpen, setSaveDialogOpen] = useState(false);
    const [valueDialogOpen, setValueDialogOpen] = useState(false);
    const [editingValue, setEditingValue] = useState<EnumValue | null>(null);
    const [selectedLanguage, setSelectedLanguage] = useState('en-US');
    const [showSystemValues, setShowSystemValues] = useState(false);
    const [previewMode, setPreviewMode] = useState<'list' | 'table' | 'cards'>('table');
    const [page, setPage] = useState(0);
    const [rowsPerPage, setRowsPerPage] = useState(10);
    const [searchTerm, setSearchTerm] = useState('');
    const [showAdvanced, setShowAdvanced] = useState(false);

    // Load enum on mount
    useEffect(() => {
        if (id) {
            loadEnum(parseInt(id));
        } else {
            generateTemplate();
        }
    }, [id]);

    // Generate code when enum definition changes
    useEffect(() => {
        generateCodeFromDefinition();
    }, [enumDef]);

    const loadEnum = async (enumId: number) => {
        try {
            const metadata = await MetadataService.getObject('Enum', enumId);
            if (metadata) {
                setEnumDef({
                    id: metadata.id,
                    name: metadata.name,
                    baseType: metadata.properties.baseType || 'Integer',
                    extensible: metadata.properties.extensible || false,
                    values: metadata.properties.values || [],
                    properties: metadata.properties || {},
                    description: metadata.description,
                    createdAt: metadata.createdAt,
                    modifiedAt: metadata.modifiedAt
                });
                showNotification('Enum loaded successfully', 'success');
            } else {
                generateTemplate();
            }
        } catch (error) {
            showNotification(`Failed to load enum: ${error.message}`, 'error');
            generateTemplate();
        }
    };

    const generateTemplate = () => {
        const template: EnumDefinition = {
            id: 50000,
            name: 'MyEnum',
            baseType: 'Integer',
            extensible: false,
            values: [
                {
                    id: 1,
                    ordinal: 0,
                    name: 'Option1',
                    caption: 'Option 1',
                    color: '#0078D4',
                    isDefault: true
                },
                {
                    id: 2,
                    ordinal: 1,
                    name: 'Option2',
                    caption: 'Option 2',
                    color: '#107C10'
                },
                {
                    id: 3,
                    ordinal: 2,
                    name: 'Option3',
                    caption: 'Option 3',
                    color: '#D83B01'
                }
            ]
        };
        setEnumDef(template);
        setCode(generateALCode(template));
    };

    const generateALCode = (def: EnumDefinition): string => {
        let code = `enum ${def.id} ${def.name}\n`;
        code += `{\n`;
        code += `    Extensible = ${def.extensible};\n\n`;
        
        def.values.forEach(value => {
            code += `    value(${value.ordinal}; "${value.name}")\n`;
            code += `    {\n`;
            
            if (value.caption) {
                code += `        Caption = '${value.caption}';\n`;
            }
            
            if (value.color) {
                code += `        Color = '${value.color}';\n`;
            }
            
            if (value.isDefault) {
                code += `        Default = true;\n`;
            }
            
            if (value.captions) {
                Object.entries(value.captions).forEach(([lang, caption]) => {
                    code += `        Caption[${lang}] = '${caption}';\n`;
                });
            }
            
            if (value.description) {
                code += `        Description = '${value.description}';\n`;
            }
            
            if (value.icon) {
                code += `        Icon = '${value.icon}';\n`;
            }
            
            code += `    }\n\n`;
        });
        
        code += `}`;
        return code;
    };

    const generateCodeFromDefinition = () => {
        setCode(generateALCode(enumDef));
    };

    const handleCompile = async () => {
        setCompiling(true);
        setErrors([]);
        
        try {
            const result = await CompilerService.compile(code);
            
            if (result.success) {
                showNotification('Compilation successful!', 'success');
                setErrors([]);
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

    const handleSave = async () => {
        setSaving(true);
        
        try {
            await MetadataService.saveObject({
                id: enumDef.id,
                name: enumDef.name,
                type: 'Enum',
                definition: code,
                metadata: {
                    baseType: enumDef.baseType,
                    extensible: enumDef.extensible,
                    values: enumDef.values,
                    ...enumDef.properties
                }
            });
            
            showNotification('Enum saved successfully', 'success');
            setSaveDialogOpen(false);
        } catch (error) {
            showNotification(`Save failed: ${error.message}`, 'error');
        } finally {
            setSaving(false);
        }
    };

    // Value Management
    const handleAddValue = () => {
        const nextOrdinal = enumDef.values.length > 0 
            ? Math.max(...enumDef.values.map(v => v.ordinal)) + 1 
            : 0;
        
        const newValue: EnumValue = {
            id: Date.now(),
            ordinal: nextOrdinal,
            name: `NewOption${nextOrdinal}`,
            caption: `New Option ${nextOrdinal}`,
            color: '#666666'
        };
        
        setEditingValue(newValue);
        setValueDialogOpen(true);
    };

    const handleEditValue = (value: EnumValue) => {
        setEditingValue({ ...value });
        setValueDialogOpen(true);
    };

    const handleDeleteValue = (valueId: number) => {
        setEnumDef({
            ...enumDef,
            values: enumDef.values.filter(v => v.id !== valueId)
        });
        showNotification('Value deleted', 'info');
    };

    const handleCloneValue = (value: EnumValue) => {
        const newValue: EnumValue = {
            ...value,
            id: Date.now(),
            ordinal: Math.max(...enumDef.values.map(v => v.ordinal)) + 1,
            name: `${value.name}_Copy`,
            caption: `${value.caption} (Copy)`,
            isDefault: false
        };
        
        setEnumDef({
            ...enumDef,
            values: [...enumDef.values, newValue]
        });
        showNotification('Value cloned', 'success');
    };

    const handleSaveValue = () => {
        if (!editingValue) return;

        // Validate
        if (!editingValue.name.trim()) {
            showNotification('Value name is required', 'error');
            return;
        }

        // Check for duplicate ordinal
        const existingWithOrdinal = enumDef.values.find(
            v => v.ordinal === editingValue.ordinal && v.id !== editingValue.id
        );
        
        if (existingWithOrdinal) {
            showNotification('Ordinal value must be unique', 'error');
            return;
        }

        // Update or add
        if (enumDef.values.some(v => v.id === editingValue.id)) {
            // Update existing
            setEnumDef({
                ...enumDef,
                values: enumDef.values.map(v => 
                    v.id === editingValue.id ? editingValue : v
                )
            });
            showNotification('Value updated', 'success');
        } else {
            // Add new
            setEnumDef({
                ...enumDef,
                values: [...enumDef.values, editingValue]
            });
            showNotification('Value added', 'success');
        }

        setValueDialogOpen(false);
        setEditingValue(null);
    };

    const handleMoveUp = (index: number) => {
        if (index > 0) {
            const newValues = [...enumDef.values];
            [newValues[index - 1], newValues[index]] = [newValues[index], newValues[index - 1]];
            
            // Update ordinals
            newValues.forEach((v, i) => {
                v.ordinal = i;
            });
            
            setEnumDef({
                ...enumDef,
                values: newValues
            });
        }
    };

    const handleMoveDown = (index: number) => {
        if (index < enumDef.values.length - 1) {
            const newValues = [...enumDef.values];
            [newValues[index], newValues[index + 1]] = [newValues[index + 1], newValues[index]];
            
            // Update ordinals
            newValues.forEach((v, i) => {
                v.ordinal = i;
            });
            
            setEnumDef({
                ...enumDef,
                values: newValues
            });
        }
    };

    const handleSetDefault = (valueId: number) => {
        setEnumDef({
            ...enumDef,
            values: enumDef.values.map(v => ({
                ...v,
                isDefault: v.id === valueId
            }))
        });
        showNotification('Default value updated', 'success');
    };

    // Caption Management
    const handleAddCaption = (lang: string, caption: string) => {
        if (!editingValue) return;
        
        const captions = editingValue.captions || {};
        captions[lang] = caption;
        
        setEditingValue({
            ...editingValue,
            captions
        });
    };

    const handleRemoveCaption = (lang: string) => {
        if (!editingValue || !editingValue.captions) return;
        
        const captions = { ...editingValue.captions };
        delete captions[lang];
        
        setEditingValue({
            ...editingValue,
            captions
        });
    };

    // Filtering
    const filteredValues = enumDef.values.filter(value => {
        if (!showSystemValues && value.isSystem) return false;
        
        if (searchTerm) {
            const term = searchTerm.toLowerCase();
            return (
                value.name.toLowerCase().includes(term) ||
                value.caption?.toLowerCase().includes(term) ||
                value.ordinal.toString().includes(term) ||
                value.color?.toLowerCase().includes(term)
            );
        }
        
        return true;
    });

    const paginatedValues = filteredValues.slice(
        page * rowsPerPage,
        page * rowsPerPage + rowsPerPage
    );

    // Export/Import
    const handleExport = () => {
        const exportData = {
            ...enumDef,
            generated: new Date().toISOString(),
            alCode: code
        };
        
        const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${enumDef.name || 'enum'}.enum.json`;
        a.click();
        URL.revokeObjectURL(url);
        
        showNotification('Enum exported successfully', 'success');
    };

    const handleImport = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const imported = JSON.parse(e.target?.result as string);
                setEnumDef({
                    ...imported,
                    id: enumDef.id, // Keep current ID
                    values: imported.values.map((v: any) => ({
                        ...v,
                        id: Date.now() + Math.random()
                    }))
                });
                showNotification('Enum imported successfully', 'success');
            } catch (error) {
                showNotification('Failed to import enum', 'error');
            }
        };
        reader.readAsText(file);
    };

    return (
        <Box sx={{ display: 'flex', height: '100vh' }}>
            {/* Left Sidebar - Values Explorer */}
            <Drawer
                variant="permanent"
                sx={{
                    width: 350,
                    flexShrink: 0,
                    '& .MuiDrawer-paper': {
                        width: 350,
                        boxSizing: 'border-box',
                        bgcolor: '#f8f9fa',
                        borderRight: '1px solid #e0e0e0'
                    }
                }}
            >
                <Toolbar>
                    <Typography variant="h6" sx={{ flexGrow: 1 }}>
                        Enum Values
                    </Typography>
                    <Badge badgeContent={enumDef.values.length} color="primary">
                        <CodeIcon />
                    </Badge>
                </Toolbar>
                
                <Divider />
                
                <Box sx={{ p: 2 }}>
                    <Grid container spacing={2}>
                        <Grid item xs={12}>
                            <TextField
                                fullWidth
                                size="small"
                                placeholder="Search values..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                InputProps={{
                                    startAdornment: (
                                        <InputAdornment position="start">
                                            <ViewIcon />
                                        </InputAdornment>
                                    ),
                                    endAdornment: searchTerm && (
                                        <InputAdornment position="end">
                                            <IconButton size="small" onClick={() => setSearchTerm('')}>
                                                <CloseIcon />
                                            </IconButton>
                                        </InputAdornment>
                                    )
                                }}
                            />
                        </Grid>
                        
                        <Grid item xs={6}>
                            <Button
                                fullWidth
                                variant="contained"
                                startIcon={<AddIcon />}
                                onClick={handleAddValue}
                                sx={{ bgcolor: '#0078D4' }}
                            >
                                Add Value
                            </Button>
                        </Grid>
                        
                        <Grid item xs={6}>
                            <Button
                                fullWidth
                                variant="outlined"
                                startIcon={<ImportExportIcon />}
                                onClick={() => document.getElementById('import-enum-input')?.click()}
                            >
                                Import
                            </Button>
                            <input
                                type="file"
                                id="import-enum-input"
                                accept=".json"
                                style={{ display: 'none' }}
                                onChange={handleImport}
                            />
                        </Grid>
                        
                        <Grid item xs={12}>
                            <FormControlLabel
                                control={
                                    <Switch
                                        size="small"
                                        checked={showSystemValues}
                                        onChange={(e) => setShowSystemValues(e.target.checked)}
                                    />
                                }
                                label="Show system values"
                            />
                        </Grid>
                    </Grid>
                </Box>
                
                <Divider />
                
                {/* Values List */}
                <List sx={{ flex: 1, overflow: 'auto', p: 1 }}>
                    {paginatedValues.map((value, index) => (
                        <ListItem
                            key={value.id}
                            sx={{
                                mb: 1,
                                borderRadius: 1,
                                border: '1px solid #e0e0e0',
                                bgcolor: 'white',
                                '&:hover': {
                                    bgcolor: '#f5f5f5'
                                }
                            }}
                        >
                            <ListItemIcon>
                                <DragIcon sx={{ color: '#999', cursor: 'move' }} />
                            </ListItemIcon>
                            
                            <ListItemIcon>
                                <Avatar
                                    sx={{
                                        width: 32,
                                        height: 32,
                                        bgcolor: value.color || '#666',
                                        color: 'white'
                                    }}
                                >
                                    {value.ordinal}
                                </Avatar>
                            </ListItemIcon>
                            
                            <ListItemText
                                primary={
                                    <Box sx={{ display: 'flex', alignItems: 'center' }}>
                                        <Typography variant="body2" sx={{ fontWeight: 600 }}>
                                            {value.name}
                                        </Typography>
                                        {value.isDefault && (
                                            <Chip
                                                label="Default"
                                                size="small"
                                                sx={{ ml: 1, height: 20, fontSize: '0.7rem' }}
                                                color="primary"
                                            />
                                        )}
                                        {value.isSystem && (
                                            <Chip
                                                label="System"
                                                size="small"
                                                sx={{ ml: 1, height: 20, fontSize: '0.7rem' }}
                                                color="secondary"
                                            />
                                        )}
                                    </Box>
                                }
                                secondary={
                                    <>
                                        <Typography variant="caption" component="div" color="textSecondary">
                                            Ordinal: {value.ordinal} | Caption: {value.caption}
                                        </Typography>
                                        {value.captions && Object.keys(value.captions).length > 0 && (
                                            <Box sx={{ mt: 0.5 }}>
                                                {Object.entries(value.captions).map(([lang, cap]) => (
                                                    <Chip
                                                        key={lang}
                                                        label={`${lang}: ${cap}`}
                                                        size="small"
                                                        variant="outlined"
                                                        sx={{ mr: 0.5, mb: 0.5, height: 20, fontSize: '0.65rem' }}
                                                    />
                                                ))}
                                            </Box>
                                        )}
                                    </>
                                }
                            />
                            
                            <ListItemSecondaryAction>
                                <IconButton size="small" onClick={() => handleMoveUp(index)}>
                                    <ArrowUpIcon fontSize="small" />
                                </IconButton>
                                <IconButton size="small" onClick={() => handleMoveDown(index)}>
                                    <ArrowDownIcon fontSize="small" />
                                </IconButton>
                                <IconButton size="small" onClick={() => handleEditValue(value)}>
                                    <EditIcon fontSize="small" />
                                </IconButton>
                                <IconButton size="small" onClick={() => handleCloneValue(value)}>
                                    <CloneIcon fontSize="small" />
                                </IconButton>
                                {!value.isDefault && !value.isSystem && (
                                    <IconButton 
                                        size="small" 
                                        onClick={() => handleSetDefault(value.id)}
                                    >
                                        <StarBorderIcon fontSize="small" />
                                    </IconButton>
                                )}
                                {!value.isSystem && (
                                    <IconButton 
                                        size="small" 
                                        onClick={() => handleDeleteValue(value.id)}
                                    >
                                        <DeleteIcon fontSize="small" />
                                    </IconButton>
                                )}
                            </ListItemSecondaryAction>
                        </ListItem>
                    ))}
                </List>
                
                {/* Pagination */}
                <Box sx={{ p: 2, borderTop: '1px solid #e0e0e0' }}>
                    <TablePagination
                        component="div"
                        count={filteredValues.length}
                        page={page}
                        onPageChange={(_, newPage) => setPage(newPage)}
                        rowsPerPage={rowsPerPage}
                        onRowsPerPageChange={(e) => {
                            setRowsPerPage(parseInt(e.target.value, 10));
                            setPage(0);
                        }}
                        rowsPerPageOptions={[5, 10, 25, 50]}
                    />
                </Box>
            </Drawer>

            {/* Main Editor Area */}
            <Box sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
                <AppBar position="static" color="default" elevation={1}>
                    <Toolbar>
                        <IconButton edge="start" color="inherit">
                            <MenuIcon />
                        </IconButton>
                        
                        <Typography variant="h6" sx={{ flexGrow: 1, ml: 2 }}>
                            Enum Designer: {enumDef.name || 'Untitled'} 
                            {enumDef.id && <span style={{ fontSize: 14, color: '#666', ml: 1 }}> (ID: {enumDef.id})</span>}
                        </Typography>

                        <Button
                            color="primary"
                            startIcon={<RunIcon />}
                            onClick={handleCompile}
                            disabled={compiling}
                            sx={{ mr: 1 }}
                        >
                            {compiling ? 'Compiling...' : 'Compile'}
                        </Button>

                        <Button
                            color="primary"
                            startIcon={<SaveIcon />}
                            onClick={() => setSaveDialogOpen(true)}
                            disabled={saving}
                            sx={{ mr: 1 }}
                        >
                            Save
                        </Button>

                        <Button
                            color="secondary"
                            startIcon={<BuildIcon />}
                            onClick={() => {}}
                            sx={{ mr: 1 }}
                        >
                            Deploy
                        </Button>

                        <IconButton color="primary" onClick={handleExport}>
                            <DownloadIcon />
                        </IconButton>

                        <IconButton color="primary">
                            <HistoryIcon />
                        </IconButton>

                        <IconButton color="primary" onClick={(e) => setMenuAnchorEl(e.currentTarget)}>
                            <SettingsIcon />
                        </IconButton>

                        <Menu
                            anchorEl={menuAnchorEl}
                            open={Boolean(menuAnchorEl)}
                            onClose={() => setMenuAnchorEl(null)}
                        >
                            <MenuItem>Base Type: {enumDef.baseType}</MenuItem>
                            <MenuItem>
                                <FormControlLabel
                                    control={
                                        <Switch
                                            checked={enumDef.extensible}
                                            onChange={(e) => setEnumDef({
                                                ...enumDef,
                                                extensible: e.target.checked
                                            })}
                                        />
                                    }
                                    label="Extensible"
                                />
                            </MenuItem>
                            <Divider />
                            <MenuItem>Generate Documentation</MenuItem>
                            <MenuItem>Validate Enum</MenuItem>
                            <MenuItem>View References</MenuItem>
                        </Menu>
                    </Toolbar>

                    <Tabs 
                        value={activeTab} 
                        onChange={(_, v) => setActiveTab(v)}
                        sx={{ bgcolor: '#fafafa' }}
                    >
                        <Tab label="Designer" />
                        <Tab label="Code Editor" />
                        <Tab label="Preview" />
                        <Tab label="Usage" />
                        <Tab label="Documentation" />
                    </Tabs>
                </AppBar>

                {/* Tab Content */}
                <Box sx={{ flexGrow: 1, position: 'relative' }}>
                    {/* Designer Tab */}
                    <TabPanel value={activeTab} index={0}>
                        <Box sx={{ p: 3 }}>
                            {/* Basic Properties */}
                            <Paper sx={{ p: 3, mb: 3 }}>
                                <Typography variant="h6" gutterBottom>
                                    Basic Properties
                                </Typography>
                                
                                <Grid container spacing={3}>
                                    <Grid item xs={12} md={4}>
                                        <TextField
                                            fullWidth
                                            label="Enum ID"
                                            type="number"
                                            value={enumDef.id}
                                            onChange={(e) => setEnumDef({
                                                ...enumDef,
                                                id: parseInt(e.target.value) || 50000
                                            })}
                                            helperText="Range: 50000-99999 for custom enums"
                                        />
                                    </Grid>
                                    
                                    <Grid item xs={12} md={4}>
                                        <TextField
                                            fullWidth
                                            label="Enum Name"
                                            value={enumDef.name}
                                            onChange={(e) => setEnumDef({
                                                ...enumDef,
                                                name: e.target.value
                                            })}
                                            helperText="PascalCase naming convention"
                                        />
                                    </Grid>
                                    
                                    <Grid item xs={12} md={4}>
                                        <FormControl fullWidth>
                                            <InputLabel>Base Type</InputLabel>
                                            <Select
                                                value={enumDef.baseType}
                                                label="Base Type"
                                                onChange={(e) => setEnumDef({
                                                    ...enumDef,
                                                    baseType: e.target.value as 'Integer' | 'String'
                                                })}
                                            >
                                                <MenuItem value="Integer">Integer</MenuItem>
                                                <MenuItem value="String">String</MenuItem>
                                            </Select>
                                        </FormControl>
                                    </Grid>
                                    
                                    <Grid item xs={12}>
                                        <TextField
                                            fullWidth
                                            label="Description"
                                            multiline
                                            rows={2}
                                            value={enumDef.description || ''}
                                            onChange={(e) => setEnumDef({
                                                ...enumDef,
                                                description: e.target.value
                                            })}
                                            helperText="Optional description of the enum purpose"
                                        />
                                    </Grid>
                                </Grid>
                            </Paper>

                            {/* Values Table */}
                            <Paper sx={{ p: 3 }}>
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 3 }}>
                                    <Typography variant="h6">
                                        Enum Values
                                    </Typography>
                                    <Button
                                        variant="contained"
                                        startIcon={<AddIcon />}
                                        onClick={handleAddValue}
                                    >
                                        Add Value
                                    </Button>
                                </Box>

                                <TableContainer>
                                    <Table>
                                        <TableHead>
                                            <TableRow>
                                                <TableCell>Ordinal</TableCell>
                                                <TableCell>Name</TableCell>
                                                <TableCell>Caption</TableCell>
                                                <TableCell>Color</TableCell>
                                                <TableCell>Default</TableCell>
                                                <TableCell>System</TableCell>
                                                <TableCell>Actions</TableCell>
                                            </TableRow>
                                        </TableHead>
                                        <TableBody>
                                            {enumDef.values.map((value) => (
                                                <TableRow key={value.id}>
                                                    <TableCell>{value.ordinal}</TableCell>
                                                    <TableCell>
                                                        <strong>{value.name}</strong>
                                                    </TableCell>
                                                    <TableCell>{value.caption}</TableCell>
                                                    <TableCell>
                                                        <Box sx={{ display: 'flex', alignItems: 'center' }}>
                                                            <Box
                                                                sx={{
                                                                    width: 20,
                                                                    height: 20,
                                                                    borderRadius: 1,
                                                                    bgcolor: value.color || '#666',
                                                                    mr: 1
                                                                }}
                                                            />
                                                            {value.color}
                                                        </Box>
                                                    </TableCell>
                                                    <TableCell>
                                                        {value.isDefault && <CheckIcon color="primary" />}
                                                    </TableCell>
                                                    <TableCell>
                                                        {value.isSystem && <LockIcon color="disabled" />}
                                                    </TableCell>
                                                    <TableCell>
                                                        <IconButton size="small" onClick={() => handleEditValue(value)}>
                                                            <EditIcon />
                                                        </IconButton>
                                                        <IconButton size="small" onClick={() => handleCloneValue(value)}>
                                                            <CloneIcon />
                                                        </IconButton>
                                                        {!value.isSystem && (
                                                            <IconButton size="small" onClick={() => handleDeleteValue(value.id)}>
                                                                <DeleteIcon />
                                                            </IconButton>
                                                        )}
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                            {enumDef.values.length === 0 && (
                                                <TableRow>
                                                    <TableCell colSpan={7} align="center">
                                                        <Typography variant="body2" color="textSecondary" sx={{ py: 4 }}>
                                                            No values defined. Click "Add Value" to create enum options.
                                                        </Typography>
                                                    </TableCell>
                                                </TableRow>
                                            )}
                                        </TableBody>
                                    </Table>
                                </TableContainer>
                            </Paper>
                        </Box>
                    </TabPanel>

                    {/* Code Editor Tab */}
                    <TabPanel value={activeTab} index={1}>
                        <Box sx={{ height: '100%' }}>
                            <MonacoEditor
                                height="100%"
                                defaultLanguage="al"
                                theme="vs-dark"
                                value={code}
                                onChange={(value) => setCode(value || '')}
                                options={{
                                    minimap: { enabled: true },
                                    fontSize: 14,
                                    fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                                    lineNumbers: 'on',
                                    wordWrap: 'on',
                                    automaticLayout: true,
                                    formatOnPaste: true,
                                    formatOnType: true,
                                    suggestOnTriggerCharacters: true,
                                    quickSuggestions: true,
                                    parameterHints: { enabled: true },
                                    renderWhitespace: 'selection',
                                    scrollBeyondLastLine: false
                                }}
                            />
                        </Box>
                    </TabPanel>

                    {/* Preview Tab */}
                    <TabPanel value={activeTab} index={2}>
                        <Box sx={{ p: 3 }}>
                            {/* Preview Controls */}
                            <Paper sx={{ p: 2, mb: 3 }}>
                                <Grid container spacing={2} alignItems="center">
                                    <Grid item>
                                        <Typography variant="subtitle2">Preview Mode:</Typography>
                                    </Grid>
                                    <Grid item>
                                        <RadioGroup
                                            row
                                            value={previewMode}
                                            onChange={(e) => setPreviewMode(e.target.value as any)}
                                        >
                                            <FormControlLabel value="table" control={<Radio />} label="Table" />
                                            <FormControlLabel value="cards" control={<Radio />} label="Cards" />
                                            <FormControlLabel value="list" control={<Radio />} label="List" />
                                        </RadioGroup>
                                    </Grid>
                                    <Grid item xs />
                                    <Grid item>
                                        <Typography variant="body2" color="textSecondary">
                                            {enumDef.values.length} values • {enumDef.extensible ? 'Extensible' : 'Fixed'}
                                        </Typography>
                                    </Grid>
                                </Grid>
                            </Paper>

                            {/* Preview Content */}
                            {previewMode === 'table' && (
                                <TableContainer component={Paper}>
                                    <Table>
                                        <TableHead>
                                            <TableRow>
                                                <TableCell>Ordinal</TableCell>
                                                <TableCell>Name</TableCell>
                                                <TableCell>Caption</TableCell>
                                                <TableCell>Value</TableCell>
                                                <TableCell>Color</TableCell>
                                            </TableRow>
                                        </TableHead>
                                        <TableBody>
                                            {enumDef.values.map((value) => (
                                                <TableRow key={value.id}>
                                                    <TableCell>{value.ordinal}</TableCell>
                                                    <TableCell>
                                                        <strong>{value.name}</strong>
                                                    </TableCell>
                                                    <TableCell>{value.caption}</TableCell>
                                                    <TableCell>
                                                        {enumDef.baseType === 'Integer' ? value.ordinal : value.name}
                                                    </TableCell>
                                                    <TableCell>
                                                        <Chip
                                                            size="small"
                                                            label={value.color}
                                                            sx={{ bgcolor: value.color, color: 'white' }}
                                                        />
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </TableContainer>
                            )}

                            {previewMode === 'cards' && (
                                <Grid container spacing={2}>
                                    {enumDef.values.map((value) => (
                                        <Grid item xs={12} sm={6} md={4} key={value.id}>
                                            <Card sx={{ borderLeft: `6px solid ${value.color || '#666'}` }}>
                                                <CardContent>
                                                    <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                                                        <Avatar sx={{ bgcolor: value.color || '#666', width: 32, height: 32, mr: 1 }}>
                                                            {value.ordinal}
                                                        </Avatar>
                                                        <Typography variant="h6">
                                                            {value.name}
                                                        </Typography>
                                                    </Box>
                                                    <Typography variant="body2" color="textSecondary">
                                                        {value.caption}
                                                    </Typography>
                                                    <Typography variant="caption" display="block" sx={{ mt: 1 }}>
                                                        Ordinal: {value.ordinal}
                                                        {value.isDefault && ' • Default'}
                                                    </Typography>
                                                </CardContent>
                                            </Card>
                                        </Grid>
                                    ))}
                                </Grid>
                            )}

                            {previewMode === 'list' && (
                                <List>
                                    {enumDef.values.map((value) => (
                                        <ListItem
                                            key={value.id}
                                            sx={{
                                                borderBottom: '1px solid #e0e0e0',
                                                '&:last-child': { borderBottom: 'none' }
                                            }}
                                        >
                                            <ListItemIcon>
                                                <Badge
                                                    badgeContent={value.ordinal}
                                                    color="primary"
                                                    sx={{ '& .MuiBadge-badge': { right: -10, top: 5 } }}
                                                >
                                                    <Avatar sx={{ bgcolor: value.color || '#666' }}>
                                                        {value.name[0]}
                                                    </Avatar>
                                                </Badge>
                                            </ListItemIcon>
                                            <ListItemText
                                                primary={value.name}
                                                secondary={value.caption}
                                            />
                                            {value.isDefault && (
                                                <Chip label="Default" size="small" color="primary" />
                                            )}
                                        </ListItem>
                                    ))}
                                </List>
                            )}
                        </Box>
                    </TabPanel>

                    {/* Usage Tab */}
                    <TabPanel value={activeTab} index={3}>
                        <Box sx={{ p: 3 }}>
                            <Paper sx={{ p: 3 }}>
                                <Typography variant="h6" gutterBottom>
                                    Usage References
                                </Typography>
                                
                                <Typography variant="body1" paragraph>
                                    This enum is used in the following objects:
                                </Typography>

                                <List>
                                    <ListItem>
                                        <ListItemIcon>
                                            <ViewIcon />
                                        </ListItemIcon>
                                        <ListItemText
                                            primary="Customer Card Page"
                                            secondary="Field 'Status' uses this enum"
                                        />
                                        <Button size="small">Navigate</Button>
                                    </ListItem>
                                    <ListItem>
                                        <ListItemIcon>
                                            <CodeIcon />
                                        </ListItemIcon>
                                        <ListItemText
                                            primary="Customer Table"
                                            secondary="Field 'Status' of type Option"
                                        />
                                        <Button size="small">Navigate</Button>
                                    </ListItem>
                                    <ListItem>
                                        <ListItemIcon>
                                            <DescriptionIcon />
                                        </ListItemIcon>
                                        <ListItemText
                                            primary="Customer Report"
                                            secondary="Filter parameter for status"
                                        />
                                        <Button size="small">Navigate</Button>
                                    </ListItem>
                                </List>
                            </Paper>
                        </Box>
                    </TabPanel>

                    {/* Documentation Tab */}
                    <TabPanel value={activeTab} index={4}>
                        <Box sx={{ p: 3 }}>
                            <Paper sx={{ p: 3 }}>
                                <Typography variant="h5" gutterBottom>
                                    {enumDef.name} Enum
                                </Typography>
                                
                                <Typography variant="body1" paragraph color="textSecondary">
                                    {enumDef.description || 'No description provided.'}
                                </Typography>

                                <Divider sx={{ my: 3 }} />

                                <Typography variant="h6" gutterBottom>
                                    Values
                                </Typography>

                                <TableContainer>
                                    <Table>
                                        <TableHead>
                                            <TableRow>
                                                <TableCell>Ordinal</TableCell>
                                                <TableCell>Name</TableCell>
                                                <TableCell>Caption (en-US)</TableCell>
                                                <TableCell>Description</TableCell>
                                            </TableRow>
                                        </TableHead>
                                        <TableBody>
                                            {enumDef.values.map((value) => (
                                                <TableRow key={value.id}>
                                                    <TableCell>{value.ordinal}</TableCell>
                                                    <TableCell>
                                                        <strong>{value.name}</strong>
                                                    </TableCell>
                                                    <TableCell>{value.caption}</TableCell>
                                                    <TableCell>{value.description || '-'}</TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </TableContainer>

                                <Divider sx={{ my: 3 }} />

                                <Typography variant="h6" gutterBottom>
                                    Code Example
                                </Typography>

                                <Paper sx={{ p: 2, bgcolor: '#1e1e1e' }}>
                                    <pre style={{ color: '#d4d4d4', margin: 0 }}>
                                        <code>
{`// Usage in AL
procedure CheckCustomerStatus(Status: Enum ${enumDef.name})
begin
    case Status of
        Status::${enumDef.values[0]?.name}:
            // Handle ${enumDef.values[0]?.caption}
            ;
        Status::${enumDef.values[1]?.name}:
            // Handle ${enumDef.values[1]?.caption}
            ;
        ${enumDef.values[2] ? `Status::${enumDef.values[2].name}:` : '// Add more cases'}
            // Handle ${enumDef.values[2]?.caption}
            ;
    end;
end;`}
                                                        </code>
                                                    </pre>
                                                </Paper>
                                            </Paper>
                                        </Box>
                                    </TabPanel>
                                </Box>
                            </Box>

            {/* Value Edit Dialog */}
            <Dialog 
                open={valueDialogOpen} 
                onClose={() => setValueDialogOpen(false)}
                maxWidth="md"
                fullWidth
            >
                <DialogTitle>
                    {editingValue?.id ? 'Edit Enum Value' : 'Add Enum Value'}
                </DialogTitle>
                <DialogContent>
                    <Box sx={{ pt: 2 }}>
                        <Grid container spacing={3}>
                            <Grid item xs={12} md={6}>
                                <TextField
                                    fullWidth
                                    label="Ordinal"
                                    type="number"
                                    value={editingValue?.ordinal || 0}
                                    onChange={(e) => setEditingValue(prev => ({
                                        ...prev!,
                                        ordinal: parseInt(e.target.value) || 0
                                    }))}
                                    helperText="Unique numeric identifier"
                                />
                            </Grid>
                            
                            <Grid item xs={12} md={6}>
                                <TextField
                                    fullWidth
                                    label="Name"
                                    value={editingValue?.name || ''}
                                    onChange={(e) => setEditingValue(prev => ({
                                        ...prev!,
                                        name: e.target.value
                                    }))}
                                    helperText="PascalCase naming convention"
                                />
                            </Grid>
                            
                            <Grid item xs={12} md={6}>
                                <TextField
                                    fullWidth
                                    label="Caption"
                                    value={editingValue?.caption || ''}
                                    onChange={(e) => setEditingValue(prev => ({
                                        ...prev!,
                                        caption: e.target.value
                                    }))}
                                    helperText="Display name"
                                />
                            </Grid>
                            
                            <Grid item xs={12} md={6}>
                                <TextField
                                    fullWidth
                                    label="Color"
                                    value={editingValue?.color || '#666666'}
                                    onChange={(e) => setEditingValue(prev => ({
                                        ...prev!,
                                        color: e.target.value
                                    }))}
                                    InputProps={{
                                        startAdornment: (
                                            <InputAdornment position="start">
                                                <Box
                                                    sx={{
                                                        width: 20,
                                                        height: 20,
                                                        borderRadius: 1,
                                                        bgcolor: editingValue?.color || '#666'
                                                    }}
                                                />
                                            </InputAdornment>
                                        )
                                    }}
                                />
                            </Grid>
                            
                            <Grid item xs={12}>
                                <TextField
                                    fullWidth
                                    label="Description"
                                    multiline
                                    rows={2}
                                    value={editingValue?.description || ''}
                                    onChange={(e) => setEditingValue(prev => ({
                                        ...prev!,
                                        description: e.target.value
                                    }))}
                                />
                            </Grid>
                            
                            <Grid item xs={12}>
                                <Box sx={{ display: 'flex', alignItems: 'center' }}>
                                    <FormControlLabel
                                        control={
                                            <Switch
                                                checked={editingValue?.isDefault || false}
                                                onChange={(e) => setEditingValue(prev => ({
                                                    ...prev!,
                                                    isDefault: e.target.checked
                                                }))}
                                            />
                                        }
                                        label="Set as Default Value"
                                    />
                                    
                                    {editingValue?.isDefault && (
                                        <Chip
                                            label="Default"
                                            size="small"
                                            color="primary"
                                            sx={{ ml: 2 }}
                                        />
                                    )}
                                </Box>
                            </Grid>

                            <Grid item xs={12}>
                                <Divider sx={{ my: 2 }} />
                                <Typography variant="subtitle2" gutterBottom>
                                    Localized Captions
                                </Typography>
                                
                                <Button
                                    size="small"
                                    startIcon={<TranslateIcon />}
                                    onClick={() => {
                                        const lang = prompt('Enter language code (e.g., es-ES, fr-FR):');
                                        if (lang) {
                                            handleAddCaption(lang, editingValue?.name || '');
                                        }
                                    }}
                                >
                                    Add Localization
                                </Button>
                                
                                <Box sx={{ mt: 2 }}>
                                    {Object.entries(editingValue?.captions || {}).map(([lang, caption]) => (
                                        <Chip
                                            key={lang}
                                            label={`${lang}: ${caption}`}
                                            onDelete={() => handleRemoveCaption(lang)}
                                            sx={{ mr: 1, mb: 1 }}
                                        />
                                    ))}
                                </Box>
                            </Grid>
                        </Grid>
                    </Box>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setValueDialogOpen(false)}>Cancel</Button>
                    <Button onClick={handleSaveValue} variant="contained">
                        Save Value
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Save Dialog */}
            <Dialog open={saveDialogOpen} onClose={() => setSaveDialogOpen(false)} maxWidth="sm" fullWidth>
                <DialogTitle>Save Enum</DialogTitle>
                <DialogContent>
                    <Box sx={{ pt: 2 }}>
                        <TextField
                            fullWidth
                            label="Enum ID"
                            type="number"
                            value={enumDef.id}
                            onChange={(e) => setEnumDef({
                                ...enumDef,
                                id: parseInt(e.target.value) || 50000
                            })}
                            sx={{ mb: 2 }}
                        />
                        <TextField
                            fullWidth
                            label="Enum Name"
                            value={enumDef.name}
                            onChange={(e) => setEnumDef({
                                ...enumDef,
                                name: e.target.value
                            })}
                            sx={{ mb: 2 }}
                        />
                        <FormControl fullWidth>
                            <InputLabel>Base Type</InputLabel>
                            <Select
                                value={enumDef.baseType}
                                label="Base Type"
                                onChange={(e) => setEnumDef({
                                    ...enumDef,
                                    baseType: e.target.value as 'Integer' | 'String'
                                })}
                            >
                                <MenuItem value="Integer">Integer</MenuItem>
                                <MenuItem value="String">String</MenuItem>
                            </Select>
                        </FormControl>
                    </Box>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setSaveDialogOpen(false)}>Cancel</Button>
                    <Button onClick={handleSave} variant="contained" disabled={saving}>
                        {saving ? 'Saving...' : 'Save'}
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Compilation Errors */}
            {errors.length > 0 && (
                <Box sx={{ position: 'fixed', bottom: 20, right: 20, width: 400 }}>
                    <Paper sx={{ p: 2, bgcolor: '#f44336', color: 'white' }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                            <WarningIcon sx={{ mr: 1 }} />
                            <Typography variant="subtitle2">
                                Compilation Errors
                            </Typography>
                            <IconButton 
                                size="small" 
                                sx={{ ml: 'auto', color: 'white' }}
                                onClick={() => setErrors([])}
                            >
                                <CloseIcon />
                            </IconButton>
                        </Box>
                        {errors.map((error, index) => (
                            <Typography key={index} variant="caption" display="block" sx={{ mb: 0.5 }}>
                                • {error.message}
                                {error.position && ` (Line ${error.position.line})`}
                            </Typography>
                        ))}
                    </Paper>
                </Box>
            )}
        </Box>
    );
};

export default EnumDesignerPage;