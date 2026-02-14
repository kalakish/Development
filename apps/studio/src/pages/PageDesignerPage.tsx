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
    Switch,
    FormControlLabel,
    Alert,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Tab,
    Tabs,
    Toolbar,
    AppBar,
    Card,
    CardContent,
    Draggable,
    Droppable
} from '@mui/material';
import {
    Save as SaveIcon,
    PlayArrow as RunIcon,
    Web as PageIcon,
    ViewColumn as FieldIcon,
    TouchApp as ActionIcon,
    Add as AddIcon,
    Delete as DeleteIcon,
    Edit as EditIcon,
    DragIndicator as DragIcon,
    Code as CodeIcon,
    Settings as SettingsIcon,
    Preview as PreviewIcon,
    Build as BuildIcon,
    Dashboard as LayoutIcon,
    Brush as ThemeIcon
} from '@mui/icons-material';
import MonacoEditor from '@monaco-editor/react';
import { useParams, useNavigate } from 'react-router-dom';
import { DragDropContext, Droppable, Draggable } from 'react-beautiful-dnd';

export const PageDesignerPage: React.FC = () => {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    
    const [pageId, setPageId] = useState<number>(parseInt(id || '0') || 50100);
    const [pageName, setPageName] = useState<string>('');
    const [pageType, setPageType] = useState<string>('Card');
    const [sourceTable, setSourceTable] = useState<string>('');
    const [layout, setLayout] = useState<any>({
        areas: [
            {
                type: 'Content',
                groups: [
                    {
                        name: 'General',
                        fields: []
                    }
                ]
            }
        ]
    });
    const [actions, setActions] = useState<any[]>([]);
    const [triggers, setTriggers] = useState<any[]>([]);
    const [availableTables, setAvailableTables] = useState<string[]>([]);
    const [availableFields, setAvailableFields] = useState<any[]>([]);
    const [activeTab, setActiveTab] = useState(0);
    const [actionDialogOpen, setActionDialogOpen] = useState(false);
    const [fieldDialogOpen, setFieldDialogOpen] = useState(false);
    const [groupDialogOpen, setGroupDialogOpen] = useState(false);
    const [selectedGroup, setSelectedGroup] = useState<any>(null);
    const [selectedAction, setSelectedAction] = useState<any>(null);
    const [selectedField, setSelectedField] = useState<any>(null);
    const [previewMode, setPreviewMode] = useState(false);

    // Page types for Business Central AL
    const pageTypes = [
        'Card', 'List', 'Document', 'RoleCenter', 'ListPlus',
        'Worksheet', 'StandardDialog', 'ConfirmationDialog', 'NavigatePage',
        'CardPart', 'ListPart', 'HeadlinePart', 'PromptDialog',
        'UserControlHost', 'ConfigurationDialog'
    ];

    useEffect(() => {
        loadAvailableTables();
        if (id) {
            loadPage();
        }
    }, [id]);

    const loadAvailableTables = async () => {
        try {
            const tables = await window.api.getTables();
            setAvailableTables(tables.map((t: any) => t.name));
        } catch (error) {
            console.error('Failed to load tables:', error);
        }
    };

    const loadPage = async () => {
        try {
            const metadata = await window.api.getObject('Page', parseInt(id!));
            setPageId(metadata.id);
            setPageName(metadata.name);
            setPageType(metadata.pageType || 'Card');
            setSourceTable(metadata.sourceTable || '');
            setLayout(metadata.layout || layout);
            setActions(metadata.actions || []);
            setTriggers(metadata.triggers || []);
            
            if (metadata.sourceTable) {
                loadTableFields(metadata.sourceTable);
            }
        } catch (error) {
            console.error('Failed to load page:', error);
        }
    };

    const loadTableFields = async (tableName: string) => {
        try {
            const fields = await window.api.getTableFields(tableName);
            setAvailableFields(fields);
        } catch (error) {
            console.error('Failed to load fields:', error);
        }
    };

    // Layout Management
    const handleAddGroup = () => {
        setSelectedGroup({
            name: '',
            fields: []
        });
        setGroupDialogOpen(true);
    };

    const handleEditGroup = (group: any) => {
        setSelectedGroup({ ...group });
        setGroupDialogOpen(true);
    };

    const handleDeleteGroup = (areaIndex: number, groupIndex: number) => {
        setLayout(prev => {
            const newLayout = { ...prev };
            newLayout.areas[areaIndex].groups.splice(groupIndex, 1);
            return newLayout;
        });
    };

    const handleSaveGroup = () => {
        if (!selectedGroup) return;

        if (!selectedGroup.name) {
            alert('Group name is required');
            return;
        }

        setLayout(prev => {
            const newLayout = { ...prev };
            if (!newLayout.areas[0].groups) {
                newLayout.areas[0].groups = [];
            }
            newLayout.areas[0].groups.push(selectedGroup);
            return newLayout;
        });

        setGroupDialogOpen(false);
        setSelectedGroup(null);
    };

    // Field Management
    const handleAddField = (groupName: string) => {
        setSelectedField({
            name: '',
            source: '',
            caption: '',
            enabled: true,
            visible: true,
            editable: true,
            groupName
        });
        setFieldDialogOpen(true);
    };

    const handleEditField = (field: any) => {
        setSelectedField({ ...field });
        setFieldDialogOpen(true);
    };

    const handleDeleteField = (groupName: string, fieldName: string) => {
        setLayout(prev => {
            const newLayout = { ...prev };
            const group = newLayout.areas[0].groups.find((g: any) => g.name === groupName);
            if (group) {
                group.fields = group.fields.filter((f: any) => f.name !== fieldName);
            }
            return newLayout;
        });
    };

    const handleSaveField = () => {
        if (!selectedField) return;

        if (!selectedField.name || !selectedField.source) {
            alert('Field name and source are required');
            return;
        }

        setLayout(prev => {
            const newLayout = { ...prev };
            const group = newLayout.areas[0].groups.find((g: any) => g.name === selectedField.groupName);
            if (group) {
                const existingIndex = group.fields.findIndex((f: any) => f.name === selectedField.name);
                if (existingIndex >= 0) {
                    group.fields[existingIndex] = selectedField;
                } else {
                    group.fields.push(selectedField);
                }
            }
            return newLayout;
        });

        setFieldDialogOpen(false);
        setSelectedField(null);
    };

    // Action Management
    const handleAddAction = () => {
        setSelectedAction({
            name: '',
            type: 'Action',
            image: '',
            shortcut: '',
            trigger: {
                name: 'OnAction',
                body: '// Add your action logic here'
            }
        });
        setActionDialogOpen(true);
    };

    const handleEditAction = (action: any) => {
        setSelectedAction({ ...action });
        setActionDialogOpen(true);
    };

    const handleDeleteAction = (actionName: string) => {
        setActions(actions.filter(a => a.name !== actionName));
    };

    const handleSaveAction = () => {
        if (!selectedAction) return;

        if (!selectedAction.name) {
            alert('Action name is required');
            return;
        }

        const existingIndex = actions.findIndex(a => a.name === selectedAction.name);
        if (existingIndex >= 0) {
            setActions(actions.map((a, i) => i === existingIndex ? selectedAction : a));
        } else {
            setActions([...actions, selectedAction]);
        }

        setActionDialogOpen(false);
        setSelectedAction(null);
    };

    // Drag and Drop
    const onDragEnd = (result: any) => {
        if (!result.destination) return;

        const { source, destination } = result;

        if (source.droppableId === destination.droppableId) {
            // Reorder within same group
            setLayout(prev => {
                const newLayout = { ...prev };
                const group = newLayout.areas[0].groups.find((g: any) => g.name === source.droppableId);
                if (group) {
                    const [removed] = group.fields.splice(source.index, 1);
                    group.fields.splice(destination.index, 0, removed);
                }
                return newLayout;
            });
        } else {
            // Move to different group
            setLayout(prev => {
                const newLayout = { ...prev };
                const sourceGroup = newLayout.areas[0].groups.find((g: any) => g.name === source.droppableId);
                const destGroup = newLayout.areas[0].groups.find((g: any) => g.name === destination.droppableId);
                
                if (sourceGroup && destGroup) {
                    const [removed] = sourceGroup.fields.splice(source.index, 1);
                    destGroup.fields.splice(destination.index, 0, removed);
                }
                return newLayout;
            });
        }
    };

    // Generate AL code
    const generateALCode = (): string => {
        let code = `page ${pageId} ${pageName}\n{\n`;
        code += `    PageType = ${pageType};\n`;
        
        if (sourceTable) {
            code += `    SourceTable = ${sourceTable};\n`;
        }
        
        // Layout
        code += '\n    layout\n    {\n';
        layout.areas.forEach((area: any) => {
            code += `        area(${area.type})\n`;
            code += '        {\n';
            area.groups.forEach((group: any) => {
                code += `            group(${group.name})\n`;
                code += '            {\n';
                group.fields.forEach((field: any) => {
                    code += `                field("${field.caption || field.name}"; Rec.${field.source}) { }\n`;
                });
                code += '            }\n';
            });
            code += '        }\n';
        });
        code += '    }\n\n';
        
        // Actions
        if (actions.length > 0) {
            code += '    actions\n    {\n';
            actions.forEach(action => {
                code += `        action(${action.name})\n`;
                code += '        {\n';
                if (action.image) code += `            Image = ${action.image};\n`;
                if (action.shortcut) code += `            ShortcutKey = ${action.shortcut};\n`;
                code += '            trigger OnAction()\n';
                code += '            begin\n';
                code += `                ${action.trigger.body}\n`;
                code += '            end;\n';
                code += '        }\n';
            });
            code += '    }\n';
        }
        
        // Triggers
        if (triggers.length > 0) {
            code += '\n    triggers\n    {\n';
            triggers.forEach(trigger => {
                code += `        trigger ${trigger.name}()\n`;
                code += '        begin\n';
                code += `            ${trigger.body}\n`;
                code += '        end;\n';
            });
            code += '    }\n';
        }
        
        code += '}\n';
        return code;
    };

    // Preview renderer
    const renderPreview = () => {
        switch (pageType) {
            case 'Card':
                return (
                    <Card sx={{ maxWidth: 800, margin: '0 auto' }}>
                        <CardContent>
                            <Typography variant="h5" gutterBottom>
                                {pageName}
                            </Typography>
                            <Grid container spacing={2}>
                                {layout.areas[0]?.groups.map((group: any) => (
                                    group.fields.map((field: any) => (
                                        <Grid item xs={12} md={6} key={field.name}>
                                            <TextField
                                                fullWidth
                                                label={field.caption || field.name}
                                                variant="outlined"
                                                size="small"
                                                disabled={!field.editable}
                                            />
                                        </Grid>
                                    ))
                                ))}
                            </Grid>
                        </CardContent>
                    </Card>
                );
                
            case 'List':
                return (
                    <Paper sx={{ width: '100%', overflow: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr>
                                    {layout.areas[0]?.groups[0]?.fields.map((field: any) => (
                                        <th key={field.name} style={{ padding: 12, textAlign: 'left', background: '#f5f5f5' }}>
                                            {field.caption || field.name}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {[1, 2, 3].map((row) => (
                                    <tr key={row}>
                                        {layout.areas[0]?.groups[0]?.fields.map((field: any) => (
                                            <td key={field.name} style={{ padding: 8, borderBottom: '1px solid #eee' }}>
                                                Sample Data
                                            </td>
                                        ))}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </Paper>
                );
                
            default:
                return (
                    <Paper sx={{ p: 3, textAlign: 'center' }}>
                        <Typography color="textSecondary">
                            Preview not available for {pageType} page type
                        </Typography>
                    </Paper>
                );
        }
    };

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
            {/* Header */}
            <AppBar position="static" color="default" elevation={1}>
                <Toolbar>
                    <PageIcon sx={{ mr: 2 }} color="primary" />
                    <Typography variant="h6" sx={{ flexGrow: 1 }}>
                        Page Designer - {pageName} (ID: {pageId})
                    </Typography>
                    
                    <Button
                        color={previewMode ? 'primary' : 'inherit'}
                        startIcon={<PreviewIcon />}
                        onClick={() => setPreviewMode(!previewMode)}
                        sx={{ mr: 1 }}
                    >
                        {previewMode ? 'Edit' : 'Preview'}
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
                    
                    <IconButton color="inherit">
                        <SettingsIcon />
                    </IconButton>
                </Toolbar>
                
                <Tabs value={activeTab} onChange={(_, v) => setActiveTab(v)}>
                    <Tab label="Design" />
                    <Tab label="Layout" />
                    <Tab label="Actions" />
                    <Tab label="Properties" />
                    <Tab label="Code" />
                </Tabs>
            </AppBar>

            {/* Main Content */}
            <Box sx={{ flexGrow: 1, overflow: 'auto' }}>
                <TabPanel value={activeTab} index={0}>
                    {previewMode ? (
                        <Box sx={{ p: 3 }}>
                            {renderPreview()}
                        </Box>
                    ) : (
                        <Grid container spacing={3} sx={{ p: 3 }}>
                            {/* Page Properties */}
                            <Grid item xs={12} md={4}>
                                <Paper sx={{ p: 3 }}>
                                    <Typography variant="h6" gutterBottom>
                                        Page Properties
                                    </Typography>
                                    
                                    <TextField
                                        fullWidth
                                        label="Page ID"
                                        value={pageId}
                                        onChange={(e) => setPageId(parseInt(e.target.value) || 0)}
                                        type="number"
                                        sx={{ mb: 2 }}
                                    />
                                    
                                    <TextField
                                        fullWidth
                                        label="Page Name"
                                        value={pageName}
                                        onChange={(e) => setPageName(e.target.value)}
                                        sx={{ mb: 2 }}
                                    />
                                    
                                    <FormControl fullWidth sx={{ mb: 2 }}>
                                        <InputLabel>Page Type</InputLabel>
                                        <Select
                                            value={pageType}
                                            label="Page Type"
                                            onChange={(e) => setPageType(e.target.value)}
                                        >
                                            {pageTypes.map(type => (
                                                <MenuItem key={type} value={type}>{type}</MenuItem>
                                            ))}
                                        </Select>
                                    </FormControl>
                                    
                                    <FormControl fullWidth sx={{ mb: 2 }}>
                                        <InputLabel>Source Table</InputLabel>
                                        <Select
                                            value={sourceTable}
                                            label="Source Table"
                                            onChange={(e) => {
                                                setSourceTable(e.target.value);
                                                loadTableFields(e.target.value);
                                            }}
                                        >
                                            <MenuItem value="">None</MenuItem>
                                            {availableTables.map(table => (
                                                <MenuItem key={table} value={table}>{table}</MenuItem>
                                            ))}
                                        </Select>
                                    </FormControl>
                                </Paper>
                            </Grid>
                            
                            {/* Available Fields */}
                            <Grid item xs={12} md={4}>
                                <Paper sx={{ p: 3 }}>
                                    <Typography variant="h6" gutterBottom>
                                        Available Fields
                                    </Typography>
                                    
                                    {sourceTable ? (
                                        <List>
                                            {availableFields.map(field => (
                                                <ListItem key={field.name} button>
                                                    <ListItemIcon>
                                                        <FieldIcon />
                                                    </ListItemIcon>
                                                    <ListItemText 
                                                        primary={field.name}
                                                        secondary={field.dataType}
                                                    />
                                                    <Button
                                                        size="small"
                                                        onClick={() => handleAddField(layout.areas[0]?.groups[0]?.name)}
                                                    >
                                                        Add
                                                    </Button>
                                                </ListItem>
                                            ))}
                                        </List>
                                    ) : (
                                        <Typography color="textSecondary" align="center" sx={{ py: 4 }}>
                                            Select a source table to view fields
                                        </Typography>
                                    )}
                                </Paper>
                            </Grid>
                            
                            {/* Page Stats */}
                            <Grid item xs={12} md={4}>
                                <Paper sx={{ p: 3 }}>
                                    <Typography variant="h6" gutterBottom>
                                        Page Statistics
                                    </Typography>
                                    
                                    <List>
                                        <ListItem>
                                            <ListItemText 
                                                primary="Groups"
                                                secondary={`${layout.areas[0]?.groups?.length || 0} groups`}
                                            />
                                        </ListItem>
                                        <ListItem>
                                            <ListItemText 
                                                primary="Fields"
                                                secondary={layout.areas[0]?.groups?.reduce((acc: number, g: any) => 
                                                    acc + (g.fields?.length || 0), 0
                                                ) || 0}
                                            />
                                        </ListItem>
                                        <ListItem>
                                            <ListItemText 
                                                primary="Actions"
                                                secondary={`${actions.length} actions`}
                                            />
                                        </ListItem>
                                        <ListItem>
                                            <ListItemText 
                                                primary="Triggers"
                                                secondary={`${triggers.length} triggers`}
                                            />
                                        </ListItem>
                                    </List>
                                </Paper>
                            </Grid>
                        </Grid>
                    )}
                </TabPanel>

                {/* Layout Tab */}
                <TabPanel value={activeTab} index={1}>
                    <DragDropContext onDragEnd={onDragEnd}>
                        <Grid container spacing={3}>
                            <Grid item xs={12} md={8}>
                                <Paper sx={{ p: 3 }}>
                                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
                                        <Typography variant="h6">Page Layout</Typography>
                                        <Button
                                            variant="contained"
                                            startIcon={<AddIcon />}
                                            onClick={handleAddGroup}
                                        >
                                            Add Group
                                        </Button>
                                    </Box>
                                    
                                    {layout.areas[0]?.groups.map((group: any, groupIndex: number) => (
                                        <Paper key={group.name} variant="outlined" sx={{ mb: 2, p: 2 }}>
                                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                                                <Typography variant="subtitle1" sx={{ fontWeight: 'bold' }}>
                                                    {group.name}
                                                </Typography>
                                                <Box>
                                                    <IconButton size="small" onClick={() => handleEditGroup(group)}>
                                                        <EditIcon />
                                                    </IconButton>
                                                    <IconButton size="small" onClick={() => handleDeleteGroup(0, groupIndex)}>
                                                        <DeleteIcon />
                                                    </IconButton>
                                                </Box>
                                            </Box>
                                            
                                            <Droppable droppableId={group.name}>
                                                {(provided) => (
                                                    <List
                                                        {...provided.droppableProps}
                                                        ref={provided.innerRef}
                                                        sx={{ minHeight: 100 }}
                                                    >
                                                        {group.fields?.map((field: any, fieldIndex: number) => (
                                                            <Draggable
                                                                key={field.name}
                                                                draggableId={field.name}
                                                                index={fieldIndex}
                                                            >
                                                                {(provided) => (
                                                                    <ListItem
                                                                        ref={provided.innerRef}
                                                                        {...provided.draggableProps}
                                                                        {...provided.dragHandleProps}
                                                                        sx={{
                                                                            border: '1px solid #e0e0e0',
                                                                            borderRadius: 1,
                                                                            mb: 1,
                                                                            bgcolor: 'background.paper'
                                                                        }}
                                                                    >
                                                                        <ListItemIcon>
                                                                            <DragIcon />
                                                                        </ListItemIcon>
                                                                        <ListItemText
                                                                            primary={field.caption || field.name}
                                                                            secondary={field.source}
                                                                        />
                                                                        <ListItemSecondaryAction>
                                                                            <IconButton edge="end" size="small" onClick={() => handleEditField(field)}>
                                                                                <EditIcon />
                                                                            </IconButton>
                                                                            <IconButton edge="end" size="small" onClick={() => handleDeleteField(group.name, field.name)}>
                                                                                <DeleteIcon />
                                                                            </IconButton>
                                                                        </ListItemSecondaryAction>
                                                                    </ListItem>
                                                                )}
                                                            </Draggable>
                                                        ))}
                                                        {provided.placeholder}
                                                    </List>
                                                )}
                                            </Droppable>
                                            
                                            <Button
                                                startIcon={<AddIcon />}
                                                onClick={() => handleAddField(group.name)}
                                                sx={{ mt: 1 }}
                                            >
                                                Add Field
                                            </Button>
                                        </Paper>
                                    ))}
                                </Paper>
                            </Grid>
                            
                            <Grid item xs={12} md={4}>
                                <Paper sx={{ p: 3 }}>
                                    <Typography variant="h6" gutterBottom>
                                        Layout Properties
                                    </Typography>
                                    
                                    <FormControlLabel
                                        control={<Switch defaultChecked />}
                                        label="Show Captions"
                                        sx={{ mb: 2 }}
                                    />
                                    
                                    <FormControlLabel
                                        control={<Switch defaultChecked />}
                                        label="Allow Group Collapse"
                                        sx={{ mb: 2 }}
                                    />
                                    
                                    <FormControlLabel
                                        control={<Switch />}
                                        label="Show Group Headers"
                                        sx={{ mb: 2 }}
                                    />
                                    
                                    <FormControl fullWidth sx={{ mt: 2 }}>
                                        <InputLabel>Field Spacing</InputLabel>
                                        <Select value="medium" label="Field Spacing">
                                            <MenuItem value="small">Small</MenuItem>
                                            <MenuItem value="medium">Medium</MenuItem>
                                            <MenuItem value="large">Large</MenuItem>
                                        </Select>
                                    </FormControl>
                                </Paper>
                            </Grid>
                        </Grid>
                    </DragDropContext>
                </TabPanel>

                {/* Actions Tab */}
                <TabPanel value={activeTab} index={2}>
                    <Box sx={{ mb: 2, display: 'flex', justifyContent: 'space-between' }}>
                        <Typography variant="h6">Page Actions</Typography>
                        <Button
                            variant="contained"
                            startIcon={<AddIcon />}
                            onClick={handleAddAction}
                        >
                            Add Action
                        </Button>
                    </Box>
                    
                    <Grid container spacing={3}>
                        {actions.map((action) => (
                            <Grid item xs={12} md={6} key={action.name}>
                                <Paper sx={{ p: 2 }}>
                                    <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                                        <ActionIcon color="primary" sx={{ mr: 1 }} />
                                        <Typography variant="subtitle1" sx={{ fontWeight: 'bold', flexGrow: 1 }}>
                                            {action.name}
                                        </Typography>
                                        <IconButton size="small" onClick={() => handleEditAction(action)}>
                                            <EditIcon />
                                        </IconButton>
                                        <IconButton size="small" onClick={() => handleDeleteAction(action.name)}>
                                            <DeleteIcon />
                                        </IconButton>
                                    </Box>
                                    
                                    <Divider sx={{ mb: 2 }} />
                                    
                                    <Grid container spacing={2}>
                                        <Grid item xs={6}>
                                            <Typography variant="caption" color="textSecondary">
                                                Type
                                            </Typography>
                                            <Typography variant="body2">{action.type}</Typography>
                                        </Grid>
                                        <Grid item xs={6}>
                                            <Typography variant="caption" color="textSecondary">
                                                Shortcut
                                            </Typography>
                                            <Typography variant="body2">{action.shortcut || 'None'}</Typography>
                                        </Grid>
                                    </Grid>
                                    
                                    <Box sx={{ mt: 2 }}>
                                        <Typography variant="caption" color="textSecondary">
                                            Trigger
                                        </Typography>
                                        <Paper variant="outlined" sx={{ p: 1, mt: 0.5, bgcolor: '#f5f5f5' }}>
                                            <code style={{ fontSize: 12 }}>
                                                {action.trigger?.body}
                                            </code>
                                        </Paper>
                                    </Box>
                                </Paper>
                            </Grid>
                        ))}
                        
                        {actions.length === 0 && (
                            <Grid item xs={12}>
                                <Paper sx={{ p: 4, textAlign: 'center' }}>
                                    <ActionIcon sx={{ fontSize: 48, color: '#ccc', mb: 2 }} />
                                    <Typography color="textSecondary" gutterBottom>
                                        No actions defined
                                    </Typography>
                                    <Button
                                        variant="contained"
                                        startIcon={<AddIcon />}
                                        onClick={handleAddAction}
                                        sx={{ mt: 2 }}
                                    >
                                        Create First Action
                                    </Button>
                                </Paper>
                            </Grid>
                        )}
                    </Grid>
                </TabPanel>

                {/* Properties Tab */}
                <TabPanel value={activeTab} index={3}>
                    <Paper sx={{ p: 3, maxWidth: 600 }}>
                        <Typography variant="h6" gutterBottom>
                            Page Properties
                        </Typography>
                        
                        <FormControlLabel
                            control={<Switch defaultChecked />}
                            label="Editable"
                            sx={{ mb: 2, display: 'block' }}
                        />
                        
                        <FormControlLabel
                            control={<Switch defaultChecked />}
                            label="Insert Allowed"
                            sx={{ mb: 2, display: 'block' }}
                        />
                        
                        <FormControlLabel
                            control={<Switch defaultChecked />}
                            label="Modify Allowed"
                            sx={{ mb: 2, display: 'block' }}
                        />
                        
                        <FormControlLabel
                            control={<Switch defaultChecked />}
                            label="Delete Allowed"
                            sx={{ mb: 2, display: 'block' }}
                        />
                        
                        <FormControlLabel
                            control={<Switch />}
                            label="Save Confirmation"
                            sx={{ mb: 2, display: 'block' }}
                        />
                        
                        <TextField
                            fullWidth
                            label="Caption"
                            value={pageName}
                            onChange={(e) => setPageName(e.target.value)}
                            sx={{ mb: 2 }}
                        />
                        
                        <TextField
                            fullWidth
                            label="Tooltip"
                            placeholder="Enter tooltip text"
                            sx={{ mb: 2 }}
                        />
                        
                        <TextField
                            fullWidth
                            label="Instructional Text"
                            multiline
                            rows={2}
                            placeholder="Enter instructional text"
                        />
                    </Paper>
                </TabPanel>

                {/* Code Tab */}
                <TabPanel value={activeTab} index={4}>
                    <Typography variant="h6" gutterBottom>
                        AL Source Code
                    </Typography>
                    
                    <Paper sx={{ height: 'calc(100vh - 300px)' }}>
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
                </TabPanel>
            </Box>

            {/* Field Dialog */}
            <Dialog open={fieldDialogOpen} onClose={() => setFieldDialogOpen(false)} maxWidth="sm" fullWidth>
                <DialogTitle>Add Field</DialogTitle>
                <DialogContent>
                    <Grid container spacing={2} sx={{ pt: 2 }}>
                        <Grid item xs={12}>
                            <TextField
                                fullWidth
                                label="Field Name"
                                value={selectedField?.name || ''}
                                onChange={(e) => setSelectedField(prev => ({ ...prev!, name: e.target.value }))}
                            />
                        </Grid>
                        <Grid item xs={12}>
                            <FormControl fullWidth>
                                <InputLabel>Source Field</InputLabel>
                                <Select
                                    value={selectedField?.source || ''}
                                    label="Source Field"
                                    onChange={(e) => setSelectedField(prev => ({ ...prev!, source: e.target.value }))}
                                >
                                    {availableFields.map(field => (
                                        <MenuItem key={field.name} value={field.name}>
                                            {field.name} ({field.dataType})
                                        </MenuItem>
                                    ))}
                                </Select>
                            </FormControl>
                        </Grid>
                        <Grid item xs={12}>
                            <TextField
                                fullWidth
                                label="Caption"
                                value={selectedField?.caption || ''}
                                onChange={(e) => setSelectedField(prev => ({ ...prev!, caption: e.target.value }))}
                            />
                        </Grid>
                        <Grid item xs={12}>
                            <FormControlLabel
                                control={<Switch checked={selectedField?.enabled !== false} />}
                                onChange={(e, checked) => setSelectedField(prev => ({ ...prev!, enabled: checked }))}
                                label="Enabled"
                            />
                        </Grid>
                        <Grid item xs={12}>
                            <FormControlLabel
                                control={<Switch checked={selectedField?.visible !== false} />}
                                onChange={(e, checked) => setSelectedField(prev => ({ ...prev!, visible: checked }))}
                                label="Visible"
                            />
                        </Grid>
                        <Grid item xs={12}>
                            <FormControlLabel
                                control={<Switch checked={selectedField?.editable !== false} />}
                                onChange={(e, checked) => setSelectedField(prev => ({ ...prev!, editable: checked }))}
                                label="Editable"
                            />
                        </Grid>
                    </Grid>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setFieldDialogOpen(false)}>Cancel</Button>
                    <Button onClick={handleSaveField} variant="contained" color="primary">
                        Add Field
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Action Dialog */}
            <Dialog open={actionDialogOpen} onClose={() => setActionDialogOpen(false)} maxWidth="md" fullWidth>
                <DialogTitle>Add Action</DialogTitle>
                <DialogContent>
                    <Grid container spacing={2} sx={{ pt: 2 }}>
                        <Grid item xs={6}>
                            <TextField
                                fullWidth
                                label="Action Name"
                                value={selectedAction?.name || ''}
                                onChange={(e) => setSelectedAction(prev => ({ ...prev!, name: e.target.value }))}
                            />
                        </Grid>
                        <Grid item xs={6}>
                            <FormControl fullWidth>
                                <InputLabel>Action Type</InputLabel>
                                <Select
                                    value={selectedAction?.type || 'Action'}
                                    label="Action Type"
                                    onChange={(e) => setSelectedAction(prev => ({ ...prev!, type: e.target.value }))}
                                >
                                    <MenuItem value="Action">Action</MenuItem>
                                    <MenuItem value="Navigate">Navigate</MenuItem>
                                    <MenuItem value="Create">Create</MenuItem>
                                    <MenuItem value="Edit">Edit</MenuItem>
                                    <MenuItem value="Delete">Delete</MenuItem>
                                    <MenuItem value="Save">Save</MenuItem>
                                    <MenuItem value="Cancel">Cancel</MenuItem>
                                    <MenuItem value="Refresh">Refresh</MenuItem>
                                    <MenuItem value="Export">Export</MenuItem>
                                    <MenuItem value="Import">Import</MenuItem>
                                    <MenuItem value="Print">Print</MenuItem>
                                </Select>
                            </FormControl>
                        </Grid>
                        <Grid item xs={6}>
                            <TextField
                                fullWidth
                                label="Image"
                                placeholder="e.g., Add, Edit, Delete"
                                value={selectedAction?.image || ''}
                                onChange={(e) => setSelectedAction(prev => ({ ...prev!, image: e.target.value }))}
                            />
                        </Grid>
                        <Grid item xs={6}>
                            <TextField
                                fullWidth
                                label="Shortcut Key"
                                placeholder="e.g., Ctrl+S"
                                value={selectedAction?.shortcut || ''}
                                onChange={(e) => setSelectedAction(prev => ({ ...prev!, shortcut: e.target.value }))}
                            />
                        </Grid>
                        <Grid item xs={12}>
                            <Typography variant="subtitle2" gutterBottom>
                                OnAction Trigger
                            </Typography>
                            <MonacoEditor
                                height="200px"
                                defaultLanguage="al"
                                value={selectedAction?.trigger?.body || ''}
                                onChange={(value) => setSelectedAction(prev => ({ 
                                    ...prev!, 
                                    trigger: { ...prev!.trigger, body: value } 
                                }))}
                                options={{
                                    minimap: { enabled: false },
                                    fontSize: 14,
                                    fontFamily: '"JetBrains Mono", monospace'
                                }}
                            />
                        </Grid>
                    </Grid>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setActionDialogOpen(false)}>Cancel</Button>
                    <Button onClick={handleSaveAction} variant="contained" color="primary">
                        Save Action
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
};

const TabPanel: React.FC<{ children: React.ReactNode; value: number; index: number }> = ({ children, value, index }) => (
    <div role="tabpanel" hidden={value !== index} style={{ height: '100%' }}>
        {value === index && children}
    </div>
);