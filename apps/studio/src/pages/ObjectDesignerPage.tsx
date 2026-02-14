import React, { useState, useEffect, useCallback } from 'react';
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
    Chip,
    Paper,
    List,
    ListItem,
    ListItemIcon,
    ListItemText,
    Collapse,
    Divider,
    CircularProgress,
    Backdrop,
    SpeedDial,
    SpeedDialAction,
    SpeedDialIcon,
    Tooltip,
    Badge,
    Avatar,
    useTheme
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
    Code as CodeIcon,
    ViewQuilt as ViewIcon,
    Description as DescriptionIcon,
    TableChart as TableIcon,
    Web as PageIcon,
    Code as CodeunitIcon,
    Assessment as ReportIcon,
    ImportExport as XmlIcon,
    Storage as QueryIcon,
    ListAlt as EnumIcon,
    ExpandLess,
    ExpandMore,
    Add as AddIcon,
    Delete as DeleteIcon,
    Edit as EditIcon,
    FileCopy as CloneIcon,
    CheckCircle as CheckIcon,
    Warning as WarningIcon,
    Error as ErrorIcon,
    Info as InfoIcon,
    Close as CloseIcon,
    MoreVert as MoreVertIcon,
    ChevronLeft as ChevronLeftIcon,
    ChevronRight as ChevronRightIcon,
    Folder as FolderIcon,
    FolderOpen as FolderOpenIcon,
    InsertDriveFile as FileIcon,
    BugReport as BugIcon,
    Terminal as TerminalIcon,
    Preview as PreviewIcon,
    BubbleChart as SchemaIcon,
    Api as ApiIcon,
    CloudUpload as DeployIcon,
    CloudDownload as PullIcon,
    Lock as LockIcon,
    LockOpen as LockOpenIcon,
    Star as StarIcon,
    StarBorder as StarBorderIcon
} from '@mui/icons-material';
import MonacoEditor from '@monaco-editor/react';
import { useParams, useNavigate } from 'react-router-dom';
import { CompilerService } from '../services/CompilerService';
import { MetadataService } from '../services/MetadataService';
import { useNotification } from '../hooks/useNotification';

// ============ Type Definitions ============

interface TabPanelProps {
    children?: React.ReactNode;
    index: number;
    value: number;
}

interface ObjectMetadata {
    id: number;
    name: string;
    type: string;
    definition: string;
    description?: string;
    createdAt?: Date;
    modifiedAt?: Date;
    version?: number;
    properties?: Record<string, any>;
}

interface NavigationItem {
    id: string;
    type: string;
    name: string;
    icon: React.ReactNode;
    children?: NavigationItem[];
    metadata?: any;
}

interface CompilationDiagnostic {
    severity: 'error' | 'warning' | 'info';
    message: string;
    code?: string;
    position?: {
        line: number;
        column: number;
    };
}

// ============ TabPanel Component ============

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

// ============ Object Templates ============

const OBJECT_TEMPLATES = {
    table: `table 50000 MyTable
{
    fields
    {
        field(1; "No."; Code[20]) { PrimaryKey = true; }
        field(2; "Name"; Text[100]) { NotBlank = true; }
        field(3; "Description"; Text[250]) { }
        field(4; "Enabled"; Boolean) { DefaultValue = true; }
    }

    keys
    {
        key(PK; "No.") { Clustered = true; }
    }

    triggers
    {
        trigger OnInsert()
        begin
            // Business logic
        end;
    }
}`,

    page: `page 50000 MyPage
{
    PageType = Card;
    SourceTable = MyTable;
    
    layout
    {
        area(Content)
        {
            group(General)
            {
                field("No."; Rec."No.") { }
                field("Name"; Rec."Name") { }
                field("Enabled"; Rec.Enabled) { }
            }
        }
    }
    
    actions
    {
        action(MyAction)
        {
            trigger OnAction()
            begin
                // Action logic
            end;
        }
    }
}`,

    codeunit: `codeunit 50000 MyCodeunit
{
    procedure MyProcedure(MyParam: Text)
    begin
        // Procedure logic
    end;
    
    [IntegrationEvent(false, false)]
    procedure OnMyEvent()
    begin
    end;
    
    [EventSubscriber(ObjectType::Table, Database::MyTable, 'OnAfterInsertEvent', '', false, false)]
    local procedure OnMyTableInserted(var Rec: Record MyTable)
    begin
        // Event handling
    end;
}`,

    report: `report 50000 MyReport
{
    dataset
    {
        dataitem(Customer; Customer)
        {
            column(Name; Name) { }
            column(Balance; Balance) { }
        }
    }

    requestpage
    {
        layout { }
    }

    trigger OnPreReport()
    begin
    end;
}`,

    xmlport: `xmlport 50000 MyXMLPort
{
    schema
    {
        textelement(Root)
        {
            tableelement(Customer; Customer)
            {
                fieldelement(No; Customer."No.") { }
                fieldelement(Name; Customer."Name") { }
            }
        }
    }
}`,

    query: `query 50000 MyQuery
{
    QueryType = Normal;
    
    elements
    {
        dataitem(Customer; Customer)
            : Link(Customer."No." = "Sales Header"."Customer No.");
        column(CustomerNo; Customer."No.") { }
        column(CustomerName; Customer.Name) { }
        column(TotalAmount; "Sales Header".Amount) { }
    }
    
    filters
    {
        filter(Customer."No."; FILTER(Customer."No." = 'C001')) { }
    }
}`,

    enum: `enum 50000 MyEnum
{
    Extensible = false;
    
    value(0; "Option1")
    {
        Caption = 'Option 1';
        Color = '#0078D4';
    }
    
    value(1; "Option2")
    {
        Caption = 'Option 2';
        Color = '#107C10';
    }
    
    value(2; "Option3")
    {
        Caption = 'Option 3';
        Color = '#D83B01';
        Default = true;
    }
}`
};

// ============ Main Component ============

export const ObjectDesignerPage: React.FC = () => {
    const theme = useTheme();
    const { id, type } = useParams<{ id: string; type: string }>();
    const navigate = useNavigate();
    const { showNotification } = useNotification();

    // ============ State ============
    
    // Editor state
    const [code, setCode] = useState('');
    const [objectType, setObjectType] = useState(type || 'table');
    const [objectId, setObjectId] = useState(id || '');
    const [objectName, setObjectName] = useState('');
    const [objectDescription, setObjectDescription] = useState('');
    const [activeTab, setActiveTab] = useState(0);
    
    // Compilation state
    const [compiling, setCompiling] = useState(false);
    const [saving, setSaving] = useState(false);
    const [deploying, setDeploying] = useState(false);
    const [errors, setErrors] = useState<CompilationDiagnostic[]>([]);
    const [warnings, setWarnings] = useState<CompilationDiagnostic[]>([]);
    const [outputs, setOutputs] = useState<any[]>([]);
    
    // UI state
    const [menuAnchorEl, setMenuAnchorEl] = useState<null | HTMLElement>(null);
    const [saveDialogOpen, setSaveDialogOpen] = useState(false);
    const [deployDialogOpen, setDeployDialogOpen] = useState(false);
    const [explorerOpen, setExplorerOpen] = useState(true);
    const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set(['recent']));
    const [navigationItems, setNavigationItems] = useState<NavigationItem[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [metadata, setMetadata] = useState<ObjectMetadata | null>(null);
    
    // Speed dial
    const [speedDialOpen, setSpeedDialOpen] = useState(false);
    
    // ============ Effects ============

    // Load object if ID is provided
    useEffect(() => {
        if (id) {
            loadObject(parseInt(id), type || 'table');
        } else {
            generateTemplate();
        }
    }, [id, type]);

    // Load navigation items
    useEffect(() => {
        loadNavigationItems();
    }, []);

    // Generate code when template changes
    useEffect(() => {
        if (!code && !id) {
            setCode(OBJECT_TEMPLATES[objectType as keyof typeof OBJECT_TEMPLATES] || OBJECT_TEMPLATES.table);
        }
    }, [objectType, code, id]);

    // ============ Data Loading ============

    const loadObject = async (objectId: number, objectType: string) => {
        setIsLoading(true);
        try {
            const metadata = await MetadataService.getObject(objectType, objectId);
            
            if (metadata) {
                setMetadata(metadata);
                setObjectId(metadata.id.toString());
                setObjectName(metadata.name);
                setObjectType(metadata.type.toLowerCase());
                setObjectDescription(metadata.description || '');
                setCode(metadata.definition || generateCodeFromMetadata(metadata));
                
                showNotification(`${metadata.type} loaded successfully`, 'success');
            } else {
                showNotification('Object not found', 'warning');
                generateTemplate();
            }
        } catch (error) {
            showNotification(`Failed to load object: ${error.message}`, 'error');
            generateTemplate();
        } finally {
            setIsLoading(false);
        }
    };

    const loadNavigationItems = async () => {
        try {
            const objects = await MetadataService.getAllObjects();
            
            const items: NavigationItem[] = [
                {
                    id: 'recent',
                    type: 'folder',
                    name: 'Recent Objects',
                    icon: <HistoryIcon />,
                    children: objects.slice(0, 5).map(obj => ({
                        id: `${obj.type}-${obj.id}`,
                        type: obj.type.toLowerCase(),
                        name: obj.name,
                        icon: getObjectIcon(obj.type),
                        metadata: obj
                    }))
                },
                {
                    id: 'tables',
                    type: 'folder',
                    name: 'Tables',
                    icon: <TableIcon />,
                    children: objects.filter(obj => obj.type === 'Table').map(obj => ({
                        id: `table-${obj.id}`,
                        type: 'table',
                        name: obj.name,
                        icon: <TableIcon />,
                        metadata: obj
                    }))
                },
                {
                    id: 'pages',
                    type: 'folder',
                    name: 'Pages',
                    icon: <PageIcon />,
                    children: objects.filter(obj => obj.type === 'Page').map(obj => ({
                        id: `page-${obj.id}`,
                        type: 'page',
                        name: obj.name,
                        icon: <PageIcon />,
                        metadata: obj
                    }))
                },
                {
                    id: 'codeunits',
                    type: 'folder',
                    name: 'Codeunits',
                    icon: <CodeunitIcon />,
                    children: objects.filter(obj => obj.type === 'Codeunit').map(obj => ({
                        id: `codeunit-${obj.id}`,
                        type: 'codeunit',
                        name: obj.name,
                        icon: <CodeunitIcon />,
                        metadata: obj
                    }))
                },
                {
                    id: 'reports',
                    type: 'folder',
                    name: 'Reports',
                    icon: <ReportIcon />,
                    children: objects.filter(obj => obj.type === 'Report').map(obj => ({
                        id: `report-${obj.id}`,
                        type: 'report',
                        name: obj.name,
                        icon: <ReportIcon />,
                        metadata: obj
                    }))
                },
                {
                    id: 'xmlports',
                    type: 'folder',
                    name: 'XMLPorts',
                    icon: <XmlIcon />,
                    children: objects.filter(obj => obj.type === 'XMLPort').map(obj => ({
                        id: `xmlport-${obj.id}`,
                        type: 'xmlport',
                        name: obj.name,
                        icon: <XmlIcon />,
                        metadata: obj
                    }))
                },
                {
                    id: 'queries',
                    type: 'folder',
                    name: 'Queries',
                    icon: <QueryIcon />,
                    children: objects.filter(obj => obj.type === 'Query').map(obj => ({
                        id: `query-${obj.id}`,
                        type: 'query',
                        name: obj.name,
                        icon: <QueryIcon />,
                        metadata: obj
                    }))
                },
                {
                    id: 'enums',
                    type: 'folder',
                    name: 'Enums',
                    icon: <EnumIcon />,
                    children: objects.filter(obj => obj.type === 'Enum').map(obj => ({
                        id: `enum-${obj.id}`,
                        type: 'enum',
                        name: obj.name,
                        icon: <EnumIcon />,
                        metadata: obj
                    }))
                }
            ];
            
            setNavigationItems(items);
        } catch (error) {
            console.error('Failed to load navigation items:', error);
        }
    };

    // ============ Code Generation ============

    const generateTemplate = () => {
        const template = OBJECT_TEMPLATES[objectType as keyof typeof OBJECT_TEMPLATES] || OBJECT_TEMPLATES.table;
        setCode(template);
        
        // Extract default ID and name from template
        const idMatch = template.match(/^(table|page|codeunit|report|xmlport|query|enum)\s+(\d+)/m);
        if (idMatch) {
            setObjectId(idMatch[2]);
        }
        
        const nameMatch = template.match(/^(?:table|page|codeunit|report|xmlport|query|enum)\s+(?:\d+\s+)?(\w+)/m);
        if (nameMatch) {
            setObjectName(nameMatch[1]);
        }
    };

    const generateCodeFromMetadata = (metadata: any): string => {
        // Generate AL code from metadata
        // This would reconstruct the AL code from the metadata object
        return metadata.definition || OBJECT_TEMPLATES[metadata.type.toLowerCase()] || '';
    };

    const getObjectIcon = (type: string): React.ReactNode => {
        switch (type.toLowerCase()) {
            case 'table': return <TableIcon />;
            case 'page': return <PageIcon />;
            case 'codeunit': return <CodeunitIcon />;
            case 'report': return <ReportIcon />;
            case 'xmlport': return <XmlIcon />;
            case 'query': return <QueryIcon />;
            case 'enum': return <EnumIcon />;
            default: return <FileIcon />;
        }
    };

    // ============ Compilation ============

    const handleCompile = async () => {
        setCompiling(true);
        setErrors([]);
        setWarnings([]);
        setOutputs([]);
        
        try {
            const result = await CompilerService.compile(code);
            
            if (result.success) {
                showNotification('Compilation successful!', 'success');
                setOutputs(result.outputs || []);
                
                // Extract object info from compilation result
                if (result.metadata && result.metadata[0]) {
                    const obj = result.metadata[0];
                    setObjectId(obj.id.toString());
                    setObjectName(obj.name);
                    setObjectType(obj.objectType.toLowerCase());
                }
                
                // Set warnings
                if (result.diagnostics) {
                    const warnings = result.diagnostics.filter((d: any) => d.severity === 'warning');
                    setWarnings(warnings);
                    
                    if (warnings.length > 0) {
                        showNotification(`Compiled with ${warnings.length} warnings`, 'warning');
                    }
                }
            } else {
                const errors = result.diagnostics?.filter((d: any) => d.severity === 'error') || [];
                const warnings = result.diagnostics?.filter((d: any) => d.severity === 'warning') || [];
                
                setErrors(errors);
                setWarnings(warnings);
                
                if (errors.length > 0) {
                    showNotification(`Compilation failed: ${errors[0].message}`, 'error');
                    
                    // Jump to error position
                    if (errors[0].position) {
                        // Implement editor position jump
                    }
                }
            }
        } catch (error) {
            showNotification(`Compilation error: ${error.message}`, 'error');
        } finally {
            setCompiling(false);
        }
    };

    // ============ Save Operations ============

    const handleSave = async () => {
        if (!objectId || !objectName) {
            showNotification('Object ID and Name are required', 'error');
            return;
        }

        setSaving(true);
        
        try {
            const metadata = {
                id: parseInt(objectId),
                name: objectName,
                type: objectType.toUpperCase(),
                description: objectDescription,
                definition: code,
                properties: {}
            };
            
            const savedObject = await MetadataService.saveObject(metadata);
            
            setMetadata(savedObject);
            showNotification('Object saved successfully', 'success');
            setSaveDialogOpen(false);
            
            // Refresh navigation
            loadNavigationItems();
        } catch (error) {
            showNotification(`Save failed: ${error.message}`, 'error');
        } finally {
            setSaving(false);
        }
    };

    // ============ Deploy Operations ============

    const handleDeploy = async (environment: string) => {
        setDeploying(true);
        
        try {
            await CompilerService.deploy({
                environment,
                objects: [{
                    id: objectId,
                    name: objectName,
                    type: objectType,
                    code
                }]
            });
            
            showNotification(`Deployed to ${environment} successfully!`, 'success');
            setDeployDialogOpen(false);
        } catch (error) {
            showNotification(`Deployment failed: ${error.message}`, 'error');
        } finally {
            setDeploying(false);
        }
    };

    // ============ Export/Import ============

    const handleExport = async () => {
        try {
            const exportData = {
                id: objectId,
                name: objectName,
                type: objectType,
                description: objectDescription,
                definition: code,
                metadata: metadata,
                exportedAt: new Date().toISOString()
            };
            
            const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${objectName || 'object'}.${objectType}.json`;
            a.click();
            URL.revokeObjectURL(url);
            
            showNotification('Object exported successfully', 'success');
        } catch (error) {
            showNotification(`Export failed: ${error.message}`, 'error');
        }
    };

    const handleImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const imported = JSON.parse(e.target?.result as string);
                
                setObjectId(imported.id.toString());
                setObjectName(imported.name);
                setObjectType(imported.type);
                setObjectDescription(imported.description || '');
                setCode(imported.definition);
                
                showNotification('Object imported successfully', 'success');
            } catch (error) {
                showNotification('Failed to import object', 'error');
            }
        };
        reader.readAsText(file);
    };

    // ============ Object Type Management ============

    const handleObjectTypeChange = (type: string) => {
        setObjectType(type);
        setCode(OBJECT_TEMPLATES[type as keyof typeof OBJECT_TEMPLATES] || OBJECT_TEMPLATES.table);
        setErrors([]);
        setWarnings([]);
        setOutputs([]);
        
        // Navigate to new object
        navigate(`/designer/new?type=${type}`);
    };

    const handleNavigationItemClick = (item: NavigationItem) => {
        if (item.type === 'folder') {
            toggleFolder(item.id);
        } else {
            navigate(`/designer/${item.type}/${item.metadata.id}`);
        }
    };

    const toggleFolder = (folderId: string) => {
        const newExpanded = new Set(expandedFolders);
        if (newExpanded.has(folderId)) {
            newExpanded.delete(folderId);
        } else {
            newExpanded.add(folderId);
        }
        setExpandedFolders(newExpanded);
    };

    // ============ UI Helpers ============

    const getErrorCount = () => errors.length;
    const getWarningCount = () => warnings.length;
    
    const getStatusColor = () => {
        if (errors.length > 0) return 'error';
        if (warnings.length > 0) return 'warning';
        return 'success';
    };

    // ============ Render ============

    return (
        <Box sx={{ display: 'flex', height: '100vh', bgcolor: '#fafafa' }}>
            {/* Loading Backdrop */}
            <Backdrop
                sx={{ color: '#fff', zIndex: (theme) => theme.zIndex.drawer + 1 }}
                open={isLoading}
            >
                <CircularProgress color="inherit" />
                <Typography sx={{ ml: 2 }}>Loading object...</Typography>
            </Backdrop>

            {/* Object Explorer Drawer */}
            <Drawer
                variant="persistent"
                anchor="left"
                open={explorerOpen}
                sx={{
                    width: 300,
                    flexShrink: 0,
                    '& .MuiDrawer-paper': {
                        width: 300,
                        boxSizing: 'border-box',
                        bgcolor: '#ffffff',
                        borderRight: '1px solid #e0e0e0'
                    }
                }}
            >
                <Toolbar>
                    <Typography variant="h6" sx={{ flexGrow: 1, fontWeight: 600 }}>
                        NOVA Explorer
                    </Typography>
                    <IconButton onClick={() => setExplorerOpen(false)}>
                        <ChevronLeftIcon />
                    </IconButton>
                </Toolbar>
                
                <Divider />
                
                <Box sx={{ p: 2 }}>
                    <Button
                        fullWidth
                        variant="contained"
                        startIcon={<AddIcon />}
                        onClick={() => handleObjectTypeChange('table')}
                        sx={{ mb: 2 }}
                    >
                        New Object
                    </Button>
                    
                    <Button
                        fullWidth
                        variant="outlined"
                        component="label"
                        startIcon={<DownloadIcon />}
                    >
                        Import
                        <input
                            type="file"
                            hidden
                            accept=".json"
                            onChange={handleImport}
                        />
                    </Button>
                </Box>
                
                <Divider />
                
                {/* Navigation Tree */}
                <Box sx={{ flex: 1, overflow: 'auto', p: 1 }}>
                    <List component="nav">
                        {navigationItems.map((item) => (
                            <React.Fragment key={item.id}>
                                <ListItem
                                    button
                                    onClick={() => handleNavigationItemClick(item)}
                                    sx={{
                                        borderRadius: 1,
                                        mb: 0.5,
                                        '&:hover': { bgcolor: '#f5f5f5' }
                                    }}
                                >
                                    <ListItemIcon sx={{ minWidth: 36 }}>
                                        {item.icon}
                                    </ListItemIcon>
                                    <ListItemText 
                                        primary={item.name} 
                                        primaryTypographyProps={{ 
                                            variant: 'body2',
                                            fontWeight: 500
                                        }}
                                    />
                                    {item.children && item.children.length > 0 && (
                                        <IconButton size="small" edge="end">
                                            {expandedFolders.has(item.id) ? 
                                                <ExpandLess /> : <ExpandMore />}
                                        </IconButton>
                                    )}
                                </ListItem>
                                
                                {item.children && expandedFolders.has(item.id) && (
                                    <Collapse in={expandedFolders.has(item.id)} timeout="auto" unmountOnExit>
                                        <List component="div" disablePadding sx={{ pl: 2 }}>
                                            {item.children.map((child) => (
                                                <ListItem
                                                    key={child.id}
                                                    button
                                                    onClick={() => handleNavigationItemClick(child)}
                                                    selected={objectId === child.metadata?.id?.toString() && 
                                                             objectType === child.type}
                                                    sx={{
                                                        borderRadius: 1,
                                                        pl: 3,
                                                        '&.Mui-selected': {
                                                            bgcolor: '#e3f2fd',
                                                            '&:hover': {
                                                                bgcolor: '#bbdefb'
                                                            }
                                                        }
                                                    }}
                                                >
                                                    <ListItemIcon sx={{ minWidth: 32 }}>
                                                        {child.icon}
                                                    </ListItemIcon>
                                                    <ListItemText 
                                                        primary={child.name}
                                                        primaryTypographyProps={{ 
                                                            variant: 'body2'
                                                        }}
                                                    />
                                                    {child.metadata?.version && (
                                                        <Chip 
                                                            label={`v${child.metadata.version}`}
                                                            size="small"
                                                            variant="outlined"
                                                            sx={{ height: 20, fontSize: '0.65rem' }}
                                                        />
                                                    )}
                                                </ListItem>
                                            ))}
                                        </List>
                                    </Collapse>
                                )}
                            </React.Fragment>
                        ))}
                    </List>
                </Box>
                
                <Divider />
                
                <Box sx={{ p: 2 }}>
                    <Typography variant="caption" color="textSecondary" display="block">
                        Connected to: {process.env.REACT_APP_METADATA_URL || 'http://localhost:3000'}
                    </Typography>
                    <Typography variant="caption" color="textSecondary" display="block">
                        Status: <Chip 
                            size="small" 
                            label="Online" 
                            color="success" 
                            sx={{ height: 20, fontSize: '0.65rem' }}
                        />
                    </Typography>
                </Box>
            </Drawer>

            {/* Main Editor Area */}
            <Box sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
                {/* App Bar */}
                <AppBar position="static" color="default" elevation={1}>
                    <Toolbar variant="dense">
                        <IconButton 
                            edge="start" 
                            color="inherit" 
                            onClick={() => setExplorerOpen(true)}
                            sx={{ mr: 1, ...(explorerOpen && { display: 'none' }) }}
                        >
                            <ChevronRightIcon />
                        </IconButton>
                        
                        <Box sx={{ display: 'flex', alignItems: 'center', flexGrow: 1 }}>
                            <Avatar 
                                sx={{ 
                                    width: 32, 
                                    height: 32, 
                                    mr: 1,
                                    bgcolor: getObjectIconColor(objectType),
                                    color: 'white'
                                }}
                            >
                                {getObjectIcon(objectType)}
                            </Avatar>
                            <Box>
                                <Typography variant="subtitle1" sx={{ fontWeight: 600, lineHeight: 1.2 }}>
                                    {objectName || 'Untitled'}
                                </Typography>
                                <Typography variant="caption" color="textSecondary">
                                    {objectType.toUpperCase()} • ID: {objectId || 'New'}
                                    {metadata?.version && ` • v${metadata.version}`}
                                </Typography>
                            </Box>
                        </Box>

                        <Box sx={{ display: 'flex', alignItems: 'center' }}>
                            {/* Status Indicators */}
                            <Tooltip title={`${errors.length} errors`}>
                                <Badge 
                                    badgeContent={errors.length} 
                                    color="error"
                                    sx={{ mr: 1 }}
                                >
                                    <ErrorIcon color={errors.length > 0 ? 'error' : 'disabled'} />
                                </Badge>
                            </Tooltip>
                            
                            <Tooltip title={`${warnings.length} warnings`}>
                                <Badge 
                                    badgeContent={warnings.length} 
                                    color="warning"
                                    sx={{ mr: 2 }}
                                >
                                    <WarningIcon color={warnings.length > 0 ? 'warning' : 'disabled'} />
                                </Badge>
                            </Tooltip>

                            <Divider orientation="vertical" flexItem sx={{ mr: 2 }} />

                            {/* Actions */}
                            <Button
                                color="primary"
                                variant="contained"
                                startIcon={<RunIcon />}
                                onClick={handleCompile}
                                disabled={compiling}
                                sx={{ mr: 1 }}
                                size="small"
                            >
                                {compiling ? 'Compiling...' : 'Compile'}
                            </Button>

                            <Button
                                color="primary"
                                variant="outlined"
                                startIcon={<SaveIcon />}
                                onClick={() => setSaveDialogOpen(true)}
                                disabled={saving}
                                sx={{ mr: 1 }}
                                size="small"
                            >
                                Save
                            </Button>

                            <Button
                                color="secondary"
                                variant="outlined"
                                startIcon={<DeployIcon />}
                                onClick={() => setDeployDialogOpen(true)}
                                sx={{ mr: 1 }}
                                size="small"
                            >
                                Deploy
                            </Button>

                            <IconButton color="primary" onClick={handleExport} size="small">
                                <DownloadIcon />
                            </IconButton>

                            <IconButton color="primary" size="small">
                                <HistoryIcon />
                            </IconButton>

                            <IconButton 
                                color="primary" 
                                onClick={(e) => setMenuAnchorEl(e.currentTarget)}
                                size="small"
                            >
                                <SettingsIcon />
                            </IconButton>

                            <Menu
                                anchorEl={menuAnchorEl}
                                open={Boolean(menuAnchorEl)}
                                onClose={() => setMenuAnchorEl(null)}
                            >
                                <MenuItem onClick={() => {
                                    // Format document
                                    setMenuAnchorEl(null);
                                }}>
                                    <CodeIcon sx={{ mr: 1 }} /> Format Document
                                </MenuItem>
                                <MenuItem>
                                    <TerminalIcon sx={{ mr: 1 }} /> Toggle Word Wrap
                                </MenuItem>
                                <MenuItem>
                                    <SchemaIcon sx={{ mr: 1 }} /> Show Minmap
                                </MenuItem>
                                <Divider />
                                <MenuItem>
                                    <BugIcon sx={{ mr: 1 }} /> Enable Debug Mode
                                </MenuItem>
                                <MenuItem>
                                    <ApiIcon sx={{ mr: 1 }} /> Compiler Options
                                </MenuItem>
                                <Divider />
                                <MenuItem>
                                    <LockIcon sx={{ mr: 1 }} /> Object Permissions
                                </MenuItem>
                            </Menu>
                        </Box>
                    </Toolbar>

                    <Tabs 
                        value={activeTab} 
                        onChange={(_, v) => setActiveTab(v)}
                        sx={{ 
                            bgcolor: '#ffffff',
                            borderBottom: '1px solid #e0e0e0'
                        }}
                    >
                        <Tab label="Code Editor" icon={<CodeIcon />} iconPosition="start" />
                        <Tab label="Designer" icon={<ViewIcon />} iconPosition="start" />
                        <Tab label="Preview" icon={<PreviewIcon />} iconPosition="start" />
                        <Tab 
                            label={
                                <Badge badgeContent={errors.length + warnings.length} color="error">
                                    Output
                                </Badge>
                            } 
                            icon={<TerminalIcon />} 
                            iconPosition="start" 
                        />
                        <Tab label="Properties" icon={<SettingsIcon />} iconPosition="start" />
                    </Tabs>
                </AppBar>

                {/* Tab Content */}
                <Box sx={{ flexGrow: 1, position: 'relative', bgcolor: '#1e1e1e' }}>
                    {/* Code Editor Tab */}
                    <TabPanel value={activeTab} index={0}>
                        <MonacoEditor
                            height="100%"
                            defaultLanguage="al"
                            theme="vs-dark"
                            value={code}
                            onChange={(value) => setCode(value || '')}
                            options={{
                                minimap: { enabled: true },
                                fontSize: 14,
                                fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
                                lineNumbers: 'on',
                                wordWrap: 'on',
                                automaticLayout: true,
                                formatOnPaste: true,
                                formatOnType: true,
                                suggestOnTriggerCharacters: true,
                                quickSuggestions: true,
                                parameterHints: { enabled: true },
                                renderWhitespace: 'selection',
                                scrollBeyondLastLine: false,
                                smoothScrolling: true,
                                cursorBlinking: 'smooth',
                                cursorSmoothCaretAnimation: 'on',
                                renderLineHighlight: 'all',
                                hideCursorInOverviewRuler: false,
                                overviewRulerBorder: false,
                                glyphMargin: true,
                                folding: true,
                                links: true,
                                contextmenu: true
                            }}
                        />
                    </TabPanel>

                    {/* Designer Tab */}
                    <TabPanel value={activeTab} index={1}>
                        <Box sx={{ p: 3, bgcolor: '#ffffff', height: '100%' }}>
                            <Typography variant="h5" gutterBottom>
                                Visual Designer for {objectType}
                            </Typography>
                            <Typography variant="body2" color="textSecondary" paragraph>
                                Design your {objectType} using visual tools. This feature is under development.
                            </Typography>
                            
                            <Paper sx={{ p: 4, textAlign: 'center' }}>
                                <CodeIcon sx={{ fontSize: 48, color: '#ccc', mb: 2 }} />
                                <Typography variant="body1" color="textSecondary">
                                    Visual designer for {objectType} objects is coming soon.
                                </Typography>
                                <Typography variant="body2" color="textSecondary" sx={{ mt: 1 }}>
                                    You can still edit the AL code in the Code Editor tab.
                                </Typography>
                            </Paper>
                        </Box>
                    </TabPanel>

                    {/* Preview Tab */}
                    <TabPanel value={activeTab} index={2}>
                        <Box sx={{ p: 3, bgcolor: '#ffffff', height: '100%' }}>
                            <Typography variant="h5" gutterBottom>
                                Live Preview
                            </Typography>
                            <Typography variant="body2" color="textSecondary" paragraph>
                                Preview how your object will look and behave.
                            </Typography>
                            
                            <Paper sx={{ p: 4, textAlign: 'center' }}>
                                <PreviewIcon sx={{ fontSize: 48, color: '#ccc', mb: 2 }} />
                                <Typography variant="body1" color="textSecondary">
                                    Live preview is not available for {objectType} objects.
                                </Typography>
                            </Paper>
                        </Box>
                    </TabPanel>

                    {/* Output Tab */}
                    <TabPanel value={activeTab} index={3}>
                        <Box sx={{ 
                            p: 3, 
                            height: '100%', 
                            overflow: 'auto',
                            bgcolor: '#1e1e1e',
                            color: '#d4d4d4',
                            fontFamily: "'JetBrains Mono', monospace"
                        }}>
                            <Typography variant="h6" gutterBottom sx={{ color: '#ffffff' }}>
                                Compiler Output
                            </Typography>
                            
                            {compiling && (
                                <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                                    <CircularProgress size={20} sx={{ mr: 1 }} />
                                    <Typography>Compiling...</Typography>
                                </Box>
                            )}
                            
                            {/* Errors */}
                            {errors.length > 0 && (
                                <Box sx={{ mb: 3 }}>
                                    <Typography variant="subtitle1" sx={{ color: '#f44336', mb: 1 }}>
                                        ❌ Errors ({errors.length})
                                    </Typography>
                                    {errors.map((error, index) => (
                                        <Paper 
                                            key={index} 
                                            sx={{ 
                                                p: 2, 
                                                mb: 1, 
                                                bgcolor: 'rgba(244, 67, 54, 0.1)',
                                                border: '1px solid #f44336',
                                                borderRadius: 1
                                            }}
                                        >
                                            <Typography variant="body2" sx={{ color: '#f44336', fontWeight: 600 }}>
                                                {error.code || 'Error'}: {error.message}
                                            </Typography>
                                            {error.position && (
                                                <Typography variant="caption" sx={{ color: '#999' }}>
                                                    Line {error.position.line}, Column {error.position.column}
                                                </Typography>
                                            )}
                                        </Paper>
                                    ))}
                                </Box>
                            )}
                            
                            {/* Warnings */}
                            {warnings.length > 0 && (
                                <Box sx={{ mb: 3 }}>
                                    <Typography variant="subtitle1" sx={{ color: '#ff9800', mb: 1 }}>
                                        ⚠️ Warnings ({warnings.length})
                                    </Typography>
                                    {warnings.map((warning, index) => (
                                        <Paper 
                                            key={index} 
                                            sx={{ 
                                                p: 2, 
                                                mb: 1, 
                                                bgcolor: 'rgba(255, 152, 0, 0.1)',
                                                border: '1px solid #ff9800',
                                                borderRadius: 1
                                            }}
                                        >
                                            <Typography variant="body2" sx={{ color: '#ff9800' }}>
                                                {warning.message}
                                            </Typography>
                                        </Paper>
                                    ))}
                                </Box>
                            )}
                            
                            {/* Generated Files */}
                            {outputs.length > 0 && (
                                <Box>
                                    <Typography variant="subtitle1" sx={{ color: '#4caf50', mb: 2 }}>
                                        ✅ Generated Files
                                    </Typography>
                                    {outputs.map((output, index) => (
                                        <Paper 
                                            key={index} 
                                            sx={{ 
                                                p: 2, 
                                                mb: 2, 
                                                bgcolor: '#2d2d2d',
                                                border: '1px solid #404040',
                                                borderRadius: 1
                                            }}
                                        >
                                            <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                                                <FileIcon sx={{ color: '#4caf50', mr: 1, fontSize: 20 }} />
                                                <Typography variant="body2" sx={{ color: '#ffffff', fontWeight: 600 }}>
                                                    {output.filename}
                                                </Typography>
                                                <Chip 
                                                    label={output.type}
                                                    size="small"
                                                    sx={{ ml: 1, height: 20, fontSize: '0.65rem' }}
                                                />
                                            </Box>
                                            <pre style={{ 
                                                margin: '8px 0 0',
                                                padding: 12,
                                                background: '#1e1e1e',
                                                borderRadius: 4,
                                                overflow: 'auto',
                                                color: '#d4d4d4',
                                                fontSize: 12,
                                                lineHeight: 1.5
                                            }}>
                                                {output.content}
                                            </pre>
                                        </Paper>
                                    ))}
                                </Box>
                            )}
                            
                            {!compiling && errors.length === 0 && warnings.length === 0 && outputs.length === 0 && (
                                <Box sx={{ textAlign: 'center', py: 4 }}>
                                    <CheckIcon sx={{ fontSize: 48, color: '#4caf50', mb: 2 }} />
                                    <Typography variant="body1" sx={{ color: '#ffffff' }}>
                                        No compilation output
                                    </Typography>
                                    <Typography variant="body2" sx={{ color: '#999' }}>
                                        Click the Compile button to build your object
                                    </Typography>
                                </Box>
                            )}
                        </Box>
                    </TabPanel>

                    {/* Properties Tab */}
                    <TabPanel value={activeTab} index={4}>
                        <Box sx={{ p: 3, bgcolor: '#ffffff', height: '100%' }}>
                            <Typography variant="h6" gutterBottom>
                                Object Properties
                            </Typography>
                            
                            <Paper sx={{ p: 3 }}>
                                <TextField
                                    fullWidth
                                    label="Object Name"
                                    value={objectName}
                                    onChange={(e) => setObjectName(e.target.value)}
                                    sx={{ mb: 3 }}
                                    size="small"
                                />
                                
                                <TextField
                                    fullWidth
                                    label="Object ID"
                                    type="number"
                                    value={objectId}
                                    onChange={(e) => setObjectId(e.target.value)}
                                    sx={{ mb: 3 }}
                                    size="small"
                                    helperText="Range: 50000-99999 for custom objects"
                                />
                                
                                <TextField
                                    fullWidth
                                    label="Object Type"
                                    value={objectType}
                                    disabled
                                    sx={{ mb: 3 }}
                                    size="small"
                                />
                                
                                <TextField
                                    fullWidth
                                    label="Description"
                                    multiline
                                    rows={3}
                                    value={objectDescription}
                                    onChange={(e) => setObjectDescription(e.target.value)}
                                    sx={{ mb: 3 }}
                                    size="small"
                                />
                                
                                {metadata && (
                                    <Box sx={{ mt: 3 }}>
                                        <Divider sx={{ mb: 3 }} />
                                        <Typography variant="subtitle2" gutterBottom>
                                            System Information
                                        </Typography>
                                        <Typography variant="body2" color="textSecondary">
                                            Created: {metadata.createdAt ? new Date(metadata.createdAt).toLocaleString() : 'N/A'}
                                        </Typography>
                                        <Typography variant="body2" color="textSecondary">
                                            Modified: {metadata.modifiedAt ? new Date(metadata.modifiedAt).toLocaleString() : 'N/A'}
                                        </Typography>
                                        <Typography variant="body2" color="textSecondary">
                                            Version: {metadata.version || 1}
                                        </Typography>
                                    </Box>
                                )}
                            </Paper>
                        </Box>
                    </TabPanel>
                </Box>
            </Box>

            {/* Speed Dial for Quick Actions */}
            <SpeedDial
                ariaLabel="Quick Actions"
                sx={{ position: 'absolute', bottom: 16, right: 16 }}
                icon={<SpeedDialIcon />}
                onClose={() => setSpeedDialOpen(false)}
                onOpen={() => setSpeedDialOpen(true)}
                open={speedDialOpen}
            >
                <SpeedDialAction
                    icon={<SaveIcon />}
                    tooltipTitle="Save"
                    onClick={() => setSaveDialogOpen(true)}
                />
                <SpeedDialAction
                    icon={<RunIcon />}
                    tooltipTitle="Compile"
                    onClick={handleCompile}
                />
                <SpeedDialAction
                    icon={<DeployIcon />}
                    tooltipTitle="Deploy"
                    onClick={() => setDeployDialogOpen(true)}
                />
                <SpeedDialAction
                    icon={<DownloadIcon />}
                    tooltipTitle="Export"
                    onClick={handleExport}
                />
            </SpeedDial>

            {/* Save Dialog */}
            <Dialog open={saveDialogOpen} onClose={() => setSaveDialogOpen(false)} maxWidth="sm" fullWidth>
                <DialogTitle>
                    <Box sx={{ display: 'flex', alignItems: 'center' }}>
                        <SaveIcon sx={{ mr: 1 }} />
                        Save Object
                    </Box>
                </DialogTitle>
                <DialogContent>
                    <Box sx={{ pt: 2 }}>
                        <TextField
                            fullWidth
                            label="Object ID"
                            type="number"
                            value={objectId}
                            onChange={(e) => setObjectId(e.target.value)}
                            sx={{ mb: 2 }}
                            size="small"
                            error={!objectId}
                            helperText={!objectId ? 'Object ID is required' : 'Range: 50000-99999'}
                        />
                        <TextField
                            fullWidth
                            label="Object Name"
                            value={objectName}
                            onChange={(e) => setObjectName(e.target.value)}
                            sx={{ mb: 2 }}
                            size="small"
                            error={!objectName}
                            helperText={!objectName ? 'Object name is required' : 'PascalCase naming convention'}
                        />
                        <TextField
                            fullWidth
                            label="Object Type"
                            value={objectType}
                            disabled
                            sx={{ mb: 2 }}
                            size="small"
                        />
                        <TextField
                            fullWidth
                            label="Description"
                            multiline
                            rows={2}
                            value={objectDescription}
                            onChange={(e) => setObjectDescription(e.target.value)}
                            size="small"
                            placeholder="Optional description of this object"
                        />
                    </Box>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setSaveDialogOpen(false)}>Cancel</Button>
                    <Button 
                        onClick={handleSave} 
                        variant="contained" 
                        disabled={saving || !objectId || !objectName}
                    >
                        {saving ? <CircularProgress size={24} /> : 'Save'}
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Deploy Dialog */}
            <Dialog open={deployDialogOpen} onClose={() => setDeployDialogOpen(false)} maxWidth="sm" fullWidth>
                <DialogTitle>
                    <Box sx={{ display: 'flex', alignItems: 'center' }}>
                        <DeployIcon sx={{ mr: 1 }} />
                        Deploy Object
                    </Box>
                </DialogTitle>
                <DialogContent>
                    <Typography variant="body1" gutterBottom sx={{ pt: 2 }}>
                        Deploy "{objectName}" to:
                    </Typography>
                    
                    <Button
                        variant="contained"
                        fullWidth
                        onClick={() => handleDeploy('development')}
                        disabled={deploying}
                        sx={{ 
                            mb: 2, 
                            justifyContent: 'flex-start',
                            bgcolor: '#4caf50',
                            '&:hover': { bgcolor: '#388e3c' }
                        }}
                    >
                        <Box sx={{ display: 'flex', alignItems: 'center' }}>
                            <BugIcon sx={{ mr: 1 }} />
                            <Box sx={{ textAlign: 'left' }}>
                                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                                    Development Environment
                                </Typography>
                                <Typography variant="caption" sx={{ opacity: 0.9 }}>
                                    For testing and debugging
                                </Typography>
                            </Box>
                        </Box>
                    </Button>
                    
                    <Button
                        variant="contained"
                        fullWidth
                        onClick={() => handleDeploy('test')}
                        disabled={deploying}
                        sx={{ 
                            mb: 2, 
                            justifyContent: 'flex-start',
                            bgcolor: '#ff9800',
                            '&:hover': { bgcolor: '#f57c00' }
                        }}
                    >
                        <Box sx={{ display: 'flex', alignItems: 'center' }}>
                            <BuildIcon sx={{ mr: 1 }} />
                            <Box sx={{ textAlign: 'left' }}>
                                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                                    Test Environment
                                </Typography>
                                <Typography variant="caption" sx={{ opacity: 0.9 }}>
                                    QA and validation
                                </Typography>
                            </Box>
                        </Box>
                    </Button>
                    
                    <Button
                        variant="contained"
                        fullWidth
                        onClick={() => handleDeploy('production')}
                        disabled={deploying}
                        sx={{ 
                            mb: 1, 
                            justifyContent: 'flex-start',
                            bgcolor: '#f44336',
                            '&:hover': { bgcolor: '#d32f2f' }
                        }}
                    >
                        <Box sx={{ display: 'flex', alignItems: 'center' }}>
                            <DeployIcon sx={{ mr: 1 }} />
                            <Box sx={{ textAlign: 'left' }}>
                                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                                    Production Environment
                                </Typography>
                                <Typography variant="caption" sx={{ opacity: 0.9 }}>
                                    Live deployment
                                </Typography>
                            </Box>
                        </Box>
                    </Button>
                    
                    {deploying && (
                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', mt: 2 }}>
                            <CircularProgress size={20} sx={{ mr: 1 }} />
                            <Typography variant="body2">Deploying...</Typography>
                        </Box>
                    )}
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setDeployDialogOpen(false)}>Cancel</Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
};

// ============ Helper Functions ============

const getObjectIconColor = (type: string): string => {
    switch (type.toLowerCase()) {
        case 'table': return '#0078D4';
        case 'page': return '#107C10';
        case 'codeunit': return '#8661C5';
        case 'report': return '#D83B01';
        case 'xmlport': return '#FF8C00';
        case 'query': return '#B7472A';
        case 'enum': return '#5C2D91';
        default: return '#666666';
    }
};

export default ObjectDesignerPage;