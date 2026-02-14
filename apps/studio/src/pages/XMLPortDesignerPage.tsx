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
    TextField,
    Paper,
    Grid,
    Card,
    CardContent,
    CardHeader,
    Divider,
    List,
    ListItem,
    ListItemText,
    ListItemIcon,
    ListItemSecondaryAction,
    Chip,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    FormControl,
    InputLabel,
    Select,
    MenuItem,
    Switch,
    FormControlLabel,
    Alert,
    AlertTitle,
    Stepper,
    Step,
    StepLabel,
    StepContent,
    Accordion,
    AccordionSummary,
    AccordionDetails,
    Tooltip,
    Badge,
    Avatar,
    LinearProgress,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow
} from '@mui/material';
import {
    Menu as MenuIcon,
    Save as SaveIcon,
    PlayArrow as RunIcon,
    Upload as UploadIcon,
    Download as DownloadIcon,
    Settings as SettingsIcon,
    Code as CodeIcon,
    TableChart as TableIcon,
    ViewModule as SchemaIcon,
    CompareArrows as MappingIcon,
    BugReport as TestIcon,
    Description as FileIcon,
    Add as AddIcon,
    Delete as DeleteIcon,
    Edit as EditIcon,
    ArrowUpward as ArrowUpIcon,
    ArrowDownward as ArrowDownIcon,
    ChevronRight as ChevronRightIcon,
    ExpandMore as ExpandMoreIcon,
    Folder as FolderIcon,
    InsertDriveFile as FileItemIcon,
    Link as LinkIcon,
    Sync as SyncIcon,
    Warning as WarningIcon,
    CheckCircle as CheckCircleIcon,
    Error as ErrorIcon
} from '@mui/icons-material';
import MonacoEditor from '@monaco-editor/react';
import { useParams, useNavigate } from 'react-router-dom';
import { useNotification } from '../../hooks/useNotification';
import { CompilerService } from '../../services/CompilerService';
import { MetadataService } from '../../services/MetadataService';

interface TabPanelProps {
    children?: React.ReactNode;
    index: number;
    value: number;
}

const TabPanel: React.FC<TabPanelProps> = ({ children, value, index }) => (
    <div
        role="tabpanel"
        hidden={value !== index}
        style={{ height: '100%', overflow: 'auto' }}
    >
        {value === index && (
            <Box sx={{ height: '100%' }}>
                {children}
            </Box>
        )}
    </div>
);

interface XMLNode {
    id: string;
    name: string;
    type: 'text' | 'table' | 'field' | 'attribute';
    path: string;
    children?: XMLNode[];
    source?: string;
    properties?: Record<string, any>;
}

interface TableMapping {
    id: string;
    tableName: string;
    elementName: string;
    keyFields: string[];
    fieldMappings: FieldMapping[];
}

interface FieldMapping {
    id: string;
    xmlPath: string;
    fieldName: string;
    dataType: string;
    required: boolean;
    defaultValue?: any;
    converter?: string;
}

export const XMLPortDesignerPage: React.FC = () => {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const { showNotification } = useNotification();

    // State
    const [activeTab, setActiveTab] = useState(0);
    const [xmlportId, setXmlportId] = useState(id || '');
    const [xmlportName, setXmlportName] = useState('');
    const [xmlportCode, setXmlportCode] = useState('');
    const [xmlSchema, setXmlSchema] = useState<XMLNode | null>(null);
    const [tableMappings, setTableMappings] = useState<TableMapping[]>([]);
    const [selectedNode, setSelectedNode] = useState<XMLNode | null>(null);
    const [selectedMapping, setSelectedMapping] = useState<string | null>(null);
    const [xmlInput, setXmlInput] = useState('');
    const [xmlOutput, setXmlOutput] = useState('');
    const [validationResults, setValidationResults] = useState<any[]>([]);
    const [importResults, setImportResults] = useState<any>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [isCompiling, setIsCompiling] = useState(false);
    const [isImporting, setIsImporting] = useState(false);
    const [mappingDialogOpen, setMappingDialogOpen] = useState(false);
    const [fieldDialogOpen, setFieldDialogOpen] = useState(false);
    const [editingMapping, setEditingMapping] = useState<TableMapping | null>(null);
    const [editingField, setEditingField] = useState<FieldMapping | null>(null);
    const [availableTables, setAvailableTables] = useState<any[]>([]);
    const [expandedNodes, setExpandedNodes] = useState<string[]>([]);
    const [sampleXml, setSampleXml] = useState(`<?xml version="1.0" encoding="UTF-8"?>
<Root>
    <Customer>
        <No>C001</No>
        <Name>ABC Corporation</Name>
        <Balance>12500.50</Balance>
        <CreditLimit>50000</CreditLimit>
        <Status>Active</Status>
    </Customer>
    <Customer>
        <No>C002</No>
        <Name>XYZ Industries</Name>
        <Balance>8500.75</Balance>
        <CreditLimit>25000</CreditLimit>
        <Status>Active</Status>
    </Customer>
</Root>`);

    // Templates
    const templates = {
        xmlport: `xmlport 50100 CustomerImport
{
    Schema
    {
        textelement(Root)
        {
            tableelement(Customer; Customer)
            {
                fieldelement(No; Customer."No.") { }
                fieldelement(Name; Customer.Name) { }
                fieldelement(Balance; Customer.Balance) { }
                fieldelement(CreditLimit; Customer."Credit Limit") { }
                fieldelement(Status; Customer.Status) { }
            }
        }
    }
    
    tablemapping(Customer; Root/Customer) { }
}`,
        schema: `<?xml version="1.0" encoding="UTF-8"?>
<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
    <xs:element name="Root">
        <xs:complexType>
            <xs:sequence>
                <xs:element name="Customer" maxOccurs="unbounded">
                    <xs:complexType>
                        <xs:sequence>
                            <xs:element name="No" type="xs:string"/>
                            <xs:element name="Name" type="xs:string"/>
                            <xs:element name="Balance" type="xs:decimal"/>
                            <xs:element name="CreditLimit" type="xs:decimal"/>
                            <xs:element name="Status" type="xs:string"/>
                        </xs:sequence>
                    </xs:complexType>
                </xs:element>
            </xs:sequence>
        </xs:complexType>
    </xs:element>
</xs:schema>`
    };

    useEffect(() => {
        loadAvailableTables();
        if (id) {
            loadXMLPort(id);
        } else {
            setXmlportCode(templates.xmlport);
            parseXMLSchema(templates.xmlport);
        }
    }, [id]);

    const loadAvailableTables = async () => {
        try {
            const tables = await MetadataService.getObjects('Table');
            setAvailableTables(tables);
        } catch (error) {
            showNotification('Failed to load tables', 'error');
        }
    };

    const loadXMLPort = async (xmlportId: string) => {
        try {
            const metadata = await MetadataService.getObject('XMLPort', parseInt(xmlportId));
            setXmlportName(metadata.name);
            setXmlportCode(metadata.definition);
            parseXMLSchema(metadata.definition);
            
            if (metadata.properties?.tableMappings) {
                setTableMappings(metadata.properties.tableMappings);
            }
        } catch (error) {
            showNotification('Failed to load XMLPort', 'error');
        }
    };

    const parseXMLSchema = (code: string) => {
        // Parse AL XMLPort definition to build schema tree
        const schema: XMLNode = {
            id: 'root',
            name: 'Root',
            type: 'text',
            path: '',
            children: []
        };

        // Extract schema structure from code
        const rootMatch = code.match(/textelement\((\w+)\)/);
        if (rootMatch) {
            schema.name = rootMatch[1];
        }

        // Extract table elements
        const tableRegex = /tableelement\((\w+);\s*(\w+)\)/g;
        let tableMatch;
        while ((tableMatch = tableRegex.exec(code)) !== null) {
            const tableNode: XMLNode = {
                id: `table_${tableMatch[1]}`,
                name: tableMatch[1],
                type: 'table',
                path: `${schema.name}/${tableMatch[1]}`,
                source: tableMatch[2],
                children: []
            };

            // Extract field elements for this table
            const fieldRegex = new RegExp(`fieldelement\\((\\w+);\\s*${tableMatch[2]}\\.(\\w+)\\)`, 'g');
            let fieldMatch;
            while ((fieldMatch = fieldRegex.exec(code)) !== null) {
                tableNode.children!.push({
                    id: `field_${tableMatch[1]}_${fieldMatch[1]}`,
                    name: fieldMatch[1],
                    type: 'field',
                    path: `${tableNode.path}/${fieldMatch[1]}`,
                    source: fieldMatch[2],
                    properties: {}
                });
            }

            schema.children!.push(tableNode);
        }

        setXmlSchema(schema);
    };

    const handleCompile = async () => {
        setIsCompiling(true);
        try {
            const result = await CompilerService.compile(xmlportCode);
            
            if (result.success) {
                showNotification('Compilation successful!', 'success');
                
                if (result.metadata && result.metadata[0]) {
                    setXmlportId(result.metadata[0].id.toString());
                    setXmlportName(result.metadata[0].name);
                }
                
                // Update schema from compiled metadata
                parseXMLSchema(xmlportCode);
            } else {
                showNotification('Compilation failed', 'error');
                setValidationResults(result.diagnostics || []);
            }
        } catch (error) {
            showNotification(`Compilation error: ${error.message}`, 'error');
        } finally {
            setIsCompiling(false);
        }
    };

    const handleSave = async () => {
        try {
            await MetadataService.saveObject({
                id: parseInt(xmlportId),
                name: xmlportName,
                type: 'XMLPORT',
                definition: xmlportCode,
                metadata: {
                    schema: xmlSchema,
                    tableMappings
                }
            });
            showNotification('XMLPort saved successfully', 'success');
        } catch (error) {
            showNotification(`Save failed: ${error.message}`, 'error');
        }
    };

    const handleImport = async () => {
        setIsImporting(true);
        try {
            const result = await CompilerService.importXML({
                xmlportId: parseInt(xmlportId),
                xmlData: xmlInput,
                options: {
                    dryRun: false,
                    stopOnError: false
                }
            });
            
            setImportResults(result);
            showNotification(`Import completed: ${result.inserted} inserted, ${result.updated} updated`, 'success');
        } catch (error) {
            showNotification(`Import failed: ${error.message}`, 'error');
        } finally {
            setIsImporting(false);
        }
    };

    const handleExport = async () => {
        try {
            const xml = await CompilerService.exportXML({
                xmlportId: parseInt(xmlportId),
                parameters: {
                    filters: [],
                    limit: 100
                }
            });
            
            setXmlOutput(xml);
            showNotification('Export completed', 'success');
        } catch (error) {
            showNotification(`Export failed: ${error.message}`, 'error');
        }
    };

    const handleValidate = async () => {
        try {
            const result = await CompilerService.validateXML({
                xmlportId: parseInt(xmlportId),
                xmlData: xmlInput
            });
            
            setValidationResults(result.errors || []);
            
            if (result.valid) {
                showNotification('XML is valid', 'success');
            } else {
                showNotification('XML validation failed', 'error');
            }
        } catch (error) {
            showNotification(`Validation failed: ${error.message}`, 'error');
        }
    };

    const handleAddMapping = () => {
        setEditingMapping({
            id: `map_${Date.now()}`,
            tableName: '',
            elementName: '',
            keyFields: [],
            fieldMappings: []
        });
        setMappingDialogOpen(true);
    };

    const handleSaveMapping = () => {
        if (editingMapping) {
            if (selectedMapping) {
                setTableMappings(mappings => 
                    mappings.map(m => m.id === selectedMapping ? editingMapping : m)
                );
            } else {
                setTableMappings([...tableMappings, editingMapping]);
            }
        }
        setMappingDialogOpen(false);
        setEditingMapping(null);
        setSelectedMapping(null);
    };

    const handleAddFieldMapping = (mappingId: string) => {
        setEditingField({
            id: `field_${Date.now()}`,
            xmlPath: '',
            fieldName: '',
            dataType: 'Text',
            required: false
        });
        setSelectedMapping(mappingId);
        setFieldDialogOpen(true);
    };

    const handleSaveFieldMapping = () => {
        if (editingField && selectedMapping) {
            setTableMappings(mappings => 
                mappings.map(m => {
                    if (m.id === selectedMapping) {
                        if (editingField.id) {
                            // Update existing
                            return {
                                ...m,
                                fieldMappings: m.fieldMappings.map(f => 
                                    f.id === editingField.id ? editingField : f
                                )
                            };
                        } else {
                            // Add new
                            return {
                                ...m,
                                fieldMappings: [...m.fieldMappings, editingField]
                            };
                        }
                    }
                    return m;
                })
            );
        }
        setFieldDialogOpen(false);
        setEditingField(null);
    };

    const handleTestConnection = async () => {
        try {
            // Test XMLPort configuration
            const testResult = await CompilerService.testXMLPort(parseInt(xmlportId), {
                sampleData: sampleXml
            });
            
            showNotification('Test completed successfully', 'success');
        } catch (error) {
            showNotification(`Test failed: ${error.message}`, 'error');
        }
    };

    const renderSchemaTree = (node: XMLNode, level: number = 0) => {
        const isExpanded = expandedNodes.includes(node.id);
        
        return (
            <Box key={node.id} sx={{ ml: level * 2 }}>
                <ListItem
                    button
                    onClick={() => {
                        setSelectedNode(node);
                        if (node.children?.length) {
                            if (isExpanded) {
                                setExpandedNodes(expandedNodes.filter(id => id !== node.id));
                            } else {
                                setExpandedNodes([...expandedNodes, node.id]);
                            }
                        }
                    }}
                    sx={{
                        borderRadius: 1,
                        mb: 0.5,
                        bgcolor: selectedNode?.id === node.id ? 'action.selected' : 'transparent'
                    }}
                >
                    <ListItemIcon>
                        {node.type === 'text' && <FolderIcon color="primary" />}
                        {node.type === 'table' && <TableIcon color="secondary" />}
                        {node.type === 'field' && <FileItemIcon />}
                        {node.children?.length ? (
                            isExpanded ? <ExpandMoreIcon /> : <ChevronRightIcon />
                        ) : null}
                    </ListItemIcon>
                    <ListItemText 
                        primary={node.name}
                        secondary={node.source ? `→ ${node.source}` : node.path}
                    />
                    {node.type === 'field' && (
                        <Chip 
                            size="small" 
                            label="Mapped" 
                            color="success"
                            variant="outlined"
                        />
                    )}
                </ListItem>
                {isExpanded && node.children?.map(child => renderSchemaTree(child, level + 1))}
            </Box>
        );
    };

    return (
        <Box sx={{ display: 'flex', height: '100vh' }}>
            {/* Left Sidebar - Schema Explorer */}
            <Drawer
                variant="permanent"
                sx={{
                    width: 350,
                    flexShrink: 0,
                    '& .MuiDrawer-paper': {
                        width: 350,
                        boxSizing: 'border-box',
                        bgcolor: '#fafafa'
                    }
                }}
            >
                <Toolbar />
                <Box sx={{ p: 2 }}>
                    <Typography variant="h6" gutterBottom>
                        XML Schema
                    </Typography>
                    
                    {xmlSchema ? (
                        <Paper variant="outlined" sx={{ p: 1, bgcolor: 'white' }}>
                            <List dense>
                                {renderSchemaTree(xmlSchema)}
                            </List>
                        </Paper>
                    ) : (
                        <Alert severity="info">
                            No schema defined. Add XML elements to your XMLPort.
                        </Alert>
                    )}

                    <Divider sx={{ my: 3 }} />

                    <Typography variant="subtitle1" gutterBottom>
                        Table Mappings
                    </Typography>
                    
                    <Button
                        fullWidth
                        variant="outlined"
                        startIcon={<AddIcon />}
                        onClick={handleAddMapping}
                        sx={{ mb: 2 }}
                    >
                        Add Table Mapping
                    </Button>

                    {tableMappings.map(mapping => (
                        <Accordion key={mapping.id} sx={{ mb: 1 }}>
                            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                                <Box sx={{ display: 'flex', alignItems: 'center', width: '100%' }}>
                                    <TableIcon sx={{ mr: 1, color: 'primary.main' }} />
                                    <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
                                        {mapping.tableName || 'New Table'}
                                    </Typography>
                                    <Chip 
                                        size="small" 
                                        label={mapping.elementName}
                                        sx={{ ml: 1 }}
                                    />
                                </Box>
                            </AccordionSummary>
                            <AccordionDetails>
                                <Box sx={{ mb: 2 }}>
                                    <TextField
                                        size="small"
                                        label="Table Name"
                                        value={mapping.tableName}
                                        onChange={(e) => {
                                            setTableMappings(mappings =>
                                                mappings.map(m =>
                                                    m.id === mapping.id
                                                        ? { ...m, tableName: e.target.value }
                                                        : m
                                                )
                                            );
                                        }}
                                        fullWidth
                                        sx={{ mb: 1 }}
                                    />
                                    <TextField
                                        size="small"
                                        label="XML Element"
                                        value={mapping.elementName}
                                        onChange={(e) => {
                                            setTableMappings(mappings =>
                                                mappings.map(m =>
                                                    m.id === mapping.id
                                                        ? { ...m, elementName: e.target.value }
                                                        : m
                                                )
                                            );
                                        }}
                                        fullWidth
                                        sx={{ mb: 1 }}
                                    />
                                    <TextField
                                        size="small"
                                        label="Key Fields"
                                        value={mapping.keyFields.join(', ')}
                                        onChange={(e) => {
                                            setTableMappings(mappings =>
                                                mappings.map(m =>
                                                    m.id === mapping.id
                                                        ? { ...m, keyFields: e.target.value.split(',').map(f => f.trim()) }
                                                        : m
                                                )
                                            );
                                        }}
                                        fullWidth
                                        helperText="Comma-separated field names for record matching"
                                    />
                                </Box>

                                <Typography variant="caption" sx={{ fontWeight: 'bold' }}>
                                    Field Mappings
                                </Typography>
                                
                                <List dense>
                                    {mapping.fieldMappings.map(field => (
                                        <ListItem key={field.id}>
                                            <ListItemIcon>
                                                <LinkIcon fontSize="small" />
                                            </ListItemIcon>
                                            <ListItemText 
                                                primary={field.xmlPath}
                                                secondary={`→ ${field.fieldName} (${field.dataType})`}
                                            />
                                            <ListItemSecondaryAction>
                                                <IconButton 
                                                    size="small"
                                                    onClick={() => {
                                                        setEditingField(field);
                                                        setSelectedMapping(mapping.id);
                                                        setFieldDialogOpen(true);
                                                    }}
                                                >
                                                    <EditIcon fontSize="small" />
                                                </IconButton>
                                                <IconButton size="small">
                                                    <DeleteIcon fontSize="small" />
                                                </IconButton>
                                            </ListItemSecondaryAction>
                                        </ListItem>
                                    ))}
                                </List>

                                <Button
                                    size="small"
                                    startIcon={<AddIcon />}
                                    onClick={() => handleAddFieldMapping(mapping.id)}
                                    sx={{ mt: 1 }}
                                >
                                    Add Field Mapping
                                </Button>
                            </AccordionDetails>
                        </Accordion>
                    ))}
                </Box>
            </Drawer>

            {/* Main Content Area */}
            <Box sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
                <AppBar position="static" color="default" elevation={1}>
                    <Toolbar>
                        <IconButton edge="start" color="inherit">
                            <MenuIcon />
                        </IconButton>
                        
                        <Typography variant="h6" sx={{ flexGrow: 1, ml: 2 }}>
                            XMLPort Designer - {xmlportName || 'Untitled'}
                            {xmlportId && <span style={{ fontSize: 14, color: '#666', ml: 1 }}> (ID: {xmlportId})</span>}
                        </Typography>

                        <Button
                            color="primary"
                            startIcon={<RunIcon />}
                            onClick={handleCompile}
                            disabled={isCompiling}
                            sx={{ mr: 1 }}
                        >
                            {isCompiling ? 'Compiling...' : 'Compile'}
                        </Button>

                        <Button
                            color="primary"
                            startIcon={<SaveIcon />}
                            onClick={handleSave}
                            sx={{ mr: 1 }}
                        >
                            Save
                        </Button>

                        <Button
                            color="secondary"
                            startIcon={<TestIcon />}
                            onClick={handleTestConnection}
                            sx={{ mr: 1 }}
                        >
                            Test
                        </Button>

                        <IconButton color="primary">
                            <SettingsIcon />
                        </IconButton>
                    </Toolbar>

                    <Tabs 
                        value={activeTab} 
                        onChange={(_, v) => setActiveTab(v)}
                        sx={{ bgcolor: '#f5f5f5' }}
                    >
                        <Tab icon={<CodeIcon />} label="Editor" />
                        <Tab icon={<SchemaIcon />} label="Schema" />
                        <Tab icon={<MappingIcon />} label="Mappings" />
                        <Tab icon={<UploadIcon />} label="Import" />
                        <Tab icon={<DownloadIcon />} label="Export" />
                        <Tab icon={<TestIcon />} label="Test" />
                    </Tabs>
                </AppBar>

                {/* Tab Content */}
                <Box sx={{ flexGrow: 1, position: 'relative', overflow: 'auto' }}>
                    {/* Editor Tab */}
                    <TabPanel value={activeTab} index={0}>
                        <MonacoEditor
                            height="100%"
                            defaultLanguage="al"
                            theme="vs-dark"
                            value={xmlportCode}
                            onChange={(value) => setXmlportCode(value || '')}
                            options={{
                                minimap: { enabled: true },
                                fontSize: 14,
                                fontFamily: "'JetBrains Mono', monospace",
                                lineNumbers: 'on',
                                wordWrap: 'on',
                                automaticLayout: true,
                                formatOnPaste: true,
                                formatOnType: true
                            }}
                        />
                    </TabPanel>

                    {/* Schema Tab */}
                    <TabPanel value={activeTab} index={1}>
                        <Grid container spacing={3} sx={{ p: 3 }}>
                            <Grid item xs={6}>
                                <Typography variant="h6" gutterBottom>
                                    XSD Schema
                                </Typography>
                                <Paper elevation={0} variant="outlined" sx={{ height: 500 }}>
                                    <MonacoEditor
                                        height="100%"
                                        defaultLanguage="xml"
                                        theme="vs"
                                        value={templates.schema}
                                        options={{
                                            minimap: { enabled: false },
                                            fontSize: 13,
                                            lineNumbers: 'on',
                                            wordWrap: 'on'
                                        }}
                                    />
                                </Paper>
                            </Grid>
                            <Grid item xs={6}>
                                <Typography variant="h6" gutterBottom>
                                    XML Preview
                                </Typography>
                                <Paper elevation={0} variant="outlined" sx={{ height: 500 }}>
                                    <MonacoEditor
                                        height="100%"
                                        defaultLanguage="xml"
                                        theme="vs"
                                        value={sampleXml}
                                        onChange={(value) => setSampleXml(value || '')}
                                        options={{
                                            minimap: { enabled: false },
                                            fontSize: 13,
                                            lineNumbers: 'on',
                                            wordWrap: 'on'
                                        }}
                                    />
                                </Paper>
                            </Grid>
                        </Grid>
                    </TabPanel>

                    {/* Mappings Tab */}
                    <TabPanel value={activeTab} index={2}>
                        <Box sx={{ p: 3 }}>
                            <Grid container spacing={3}>
                                <Grid item xs={12}>
                                    <Typography variant="h6" gutterBottom>
                                        Field Mappings
                                    </Typography>
                                </Grid>
                                
                                {tableMappings.map(mapping => (
                                    <Grid item xs={12} key={mapping.id}>
                                        <Card variant="outlined">
                                            <CardHeader
                                                avatar={
                                                    <Avatar sx={{ bgcolor: 'primary.main' }}>
                                                        <TableIcon />
                                                    </Avatar>
                                                }
                                                title={mapping.tableName || 'Unnamed Table'}
                                                subheader={`XML Element: ${mapping.elementName}`}
                                                action={
                                                    <IconButton>
                                                        <DeleteIcon />
                                                    </IconButton>
                                                }
                                            />
                                            <CardContent>
                                                <TableContainer>
                                                    <Table size="small">
                                                        <TableHead>
                                                            <TableRow>
                                                                <TableCell>XML Path</TableCell>
                                                                <TableCell>Field Name</TableCell>
                                                                <TableCell>Data Type</TableCell>
                                                                <TableCell>Required</TableCell>
                                                                <TableCell>Default</TableCell>
                                                                <TableCell></TableCell>
                                                            </TableRow>
                                                        </TableHead>
                                                        <TableBody>
                                                            {mapping.fieldMappings.map(field => (
                                                                <TableRow key={field.id}>
                                                                    <TableCell>{field.xmlPath}</TableCell>
                                                                    <TableCell>{field.fieldName}</TableCell>
                                                                    <TableCell>{field.dataType}</TableCell>
                                                                    <TableCell>
                                                                        {field.required ? 'Yes' : 'No'}
                                                                    </TableCell>
                                                                    <TableCell>{field.defaultValue}</TableCell>
                                                                    <TableCell>
                                                                        <IconButton size="small">
                                                                            <EditIcon fontSize="small" />
                                                                        </IconButton>
                                                                        <IconButton size="small">
                                                                            <DeleteIcon fontSize="small" />
                                                                        </IconButton>
                                                                    </TableCell>
                                                                </TableRow>
                                                            ))}
                                                        </TableBody>
                                                    </Table>
                                                </TableContainer>
                                            </CardContent>
                                        </Card>
                                    </Grid>
                                ))}
                            </Grid>
                        </Box>
                    </TabPanel>

                    {/* Import Tab */}
                    <TabPanel value={activeTab} index={3}>
                        <Grid container spacing={3} sx={{ p: 3 }}>
                            <Grid item xs={12}>
                                <Alert severity="info" sx={{ mb: 3 }}>
                                    <AlertTitle>XML Import</AlertTitle>
                                    Paste your XML data below to import into the system.
                                </Alert>
                            </Grid>
                            
                            <Grid item xs={8}>
                                <Typography variant="subtitle2" gutterBottom>
                                    XML Input
                                </Typography>
                                <Paper elevation={0} variant="outlined" sx={{ height: 400 }}>
                                    <MonacoEditor
                                        height="100%"
                                        defaultLanguage="xml"
                                        theme="vs"
                                        value={xmlInput}
                                        onChange={(value) => setXmlInput(value || '')}
                                    />
                                </Paper>
                            </Grid>
                            
                            <Grid item xs={4}>
                                <Typography variant="subtitle2" gutterBottom>
                                    Import Options
                                </Typography>
                                <Paper elevation={0} variant="outlined" sx={{ p: 2 }}>
                                    <FormControlLabel
                                        control={<Switch defaultChecked />}
                                        label="Dry Run (Test only)"
                                    />
                                    <FormControlLabel
                                        control={<Switch />}
                                        label="Stop on Error"
                                    />
                                    <FormControl fullWidth sx={{ mt: 2 }}>
                                        <InputLabel>Batch Size</InputLabel>
                                        <Select
                                            size="small"
                                            value={100}
                                            label="Batch Size"
                                        >
                                            <MenuItem value={50}>50 records</MenuItem>
                                            <MenuItem value={100}>100 records</MenuItem>
                                            <MenuItem value={500}>500 records</MenuItem>
                                            <MenuItem value={1000}>1000 records</MenuItem>
                                        </Select>
                                    </FormControl>

                                    <Button
                                        fullWidth
                                        variant="contained"
                                        startIcon={<UploadIcon />}
                                        onClick={handleImport}
                                        disabled={isImporting || !xmlInput}
                                        sx={{ mt: 2 }}
                                    >
                                        {isImporting ? 'Importing...' : 'Import XML'}
                                    </Button>

                                    <Button
                                        fullWidth
                                        variant="outlined"
                                        startIcon={<CheckCircleIcon />}
                                        onClick={handleValidate}
                                        sx={{ mt: 1 }}
                                    >
                                        Validate XML
                                    </Button>
                                </Paper>

                                {importResults && (
                                    <Paper elevation={0} variant="outlined" sx={{ mt: 2, p: 2 }}>
                                        <Typography variant="subtitle2" gutterBottom>
                                            Import Results
                                        </Typography>
                                        <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 1 }}>
                                            <Typography variant="body2">Inserted:</Typography>
                                            <Chip 
                                                size="small" 
                                                label={importResults.inserted} 
                                                color="success"
                                            />
                                        </Box>
                                        <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 1 }}>
                                            <Typography variant="body2">Updated:</Typography>
                                            <Chip 
                                                size="small" 
                                                label={importResults.updated} 
                                                color="info"
                                            />
                                        </Box>
                                        <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 1 }}>
                                            <Typography variant="body2">Errors:</Typography>
                                            <Chip 
                                                size="small" 
                                                label={importResults.errors?.length || 0} 
                                                color="error"
                                            />
                                        </Box>
                                    </Paper>
                                )}
                            </Grid>
                        </Grid>
                    </TabPanel>

                    {/* Export Tab */}
                    <TabPanel value={activeTab} index={4}>
                        <Grid container spacing={3} sx={{ p: 3 }}>
                            <Grid item xs={12}>
                                <Alert severity="info" sx={{ mb: 3 }}>
                                    <AlertTitle>XML Export</AlertTitle>
                                    Generate XML from your data based on the XMLPort definition.
                                </Alert>
                            </Grid>
                            
                            <Grid item xs={4}>
                                <Paper elevation={0} variant="outlined" sx={{ p: 2 }}>
                                    <Typography variant="subtitle2" gutterBottom>
                                        Export Options
                                    </Typography>
                                    
                                    <FormControl fullWidth sx={{ mt: 2 }}>
                                        <InputLabel>Encoding</InputLabel>
                                        <Select
                                            size="small"
                                            value="UTF-8"
                                            label="Encoding"
                                        >
                                            <MenuItem value="UTF-8">UTF-8</MenuItem>
                                            <MenuItem value="UTF-16">UTF-16</MenuItem>
                                            <MenuItem value="ISO-8859-1">ISO-8859-1</MenuItem>
                                        </Select>
                                    </FormControl>

                                    <FormControlLabel
                                        control={<Switch defaultChecked />}
                                        label="Pretty Print"
                                        sx={{ mt: 2 }}
                                    />

                                    <FormControlLabel
                                        control={<Switch />}
                                        label="Include Schema"
                                        sx={{ mt: 1 }}
                                    />

                                    <TextField
                                        fullWidth
                                        size="small"
                                        label="Record Limit"
                                        type="number"
                                        defaultValue={100}
                                        sx={{ mt: 2 }}
                                    />

                                    <Button
                                        fullWidth
                                        variant="contained"
                                        startIcon={<DownloadIcon />}
                                        onClick={handleExport}
                                        sx={{ mt: 2 }}
                                    >
                                        Generate XML
                                    </Button>
                                </Paper>
                            </Grid>
                            
                            <Grid item xs={8}>
                                <Typography variant="subtitle2" gutterBottom>
                                    Generated XML
                                </Typography>
                                <Paper elevation={0} variant="outlined" sx={{ height: 500 }}>
                                    <MonacoEditor
                                        height="100%"
                                        defaultLanguage="xml"
                                        theme="vs"
                                        value={xmlOutput}
                                        options={{
                                            readOnly: true,
                                            minimap: { enabled: false }
                                        }}
                                    />
                                </Paper>
                            </Grid>
                        </Grid>
                    </TabPanel>

                    {/* Test Tab */}
                    <TabPanel value={activeTab} index={5}>
                        <Box sx={{ p: 3 }}>
                            <Stepper orientation="vertical">
                                <Step active>
                                    <StepLabel>Validate XML Schema</StepLabel>
                                    <StepContent>
                                        <Typography>
                                            Check if your XML structure matches the defined schema.
                                        </Typography>
                                        <Box sx={{ mb: 2 }}>
                                            <Button
                                                variant="contained"
                                                onClick={handleValidate}
                                                sx={{ mt: 1, mr: 1 }}
                                            >
                                                Validate Now
                                            </Button>
                                        </Box>
                                    </StepContent>
                                </Step>
                                
                                <Step active>
                                    <StepLabel>Test Data Import</StepLabel>
                                    <StepContent>
                                        <Typography>
                                            Test importing sample data to verify field mappings.
                                        </Typography>
                                        <Box sx={{ mb: 2 }}>
                                            <Button
                                                variant="contained"
                                                onClick={() => {
                                                    setXmlInput(sampleXml);
                                                    handleImport();
                                                }}
                                                sx={{ mt: 1, mr: 1 }}
                                            >
                                                Run Test Import
                                            </Button>
                                        </Box>
                                    </StepContent>
                                </Step>
                                
                                <Step active>
                                    <StepLabel>Performance Test</StepLabel>
                                    <StepContent>
                                        <Typography>
                                            Test XMLPort performance with large datasets.
                                        </Typography>
                                        <Box sx={{ mb: 2 }}>
                                            <Button
                                                variant="contained"
                                                sx={{ mt: 1, mr: 1 }}
                                            >
                                                Start Performance Test
                                            </Button>
                                        </Box>
                                    </StepContent>
                                </Step>
                            </Stepper>
                        </Box>
                    </TabPanel>
                </Box>
            </Box>

            {/* Field Mapping Dialog */}
            <Dialog open={fieldDialogOpen} onClose={() => setFieldDialogOpen(false)} maxWidth="md" fullWidth>
                <DialogTitle>
                    {editingField?.id ? 'Edit Field Mapping' : 'Add Field Mapping'}
                </DialogTitle>
                <DialogContent>
                    <Grid container spacing={2} sx={{ pt: 2 }}>
                        <Grid item xs={6}>
                            <TextField
                                fullWidth
                                size="small"
                                label="XML Path"
                                value={editingField?.xmlPath || ''}
                                onChange={(e) => setEditingField({
                                    ...editingField!,
                                    xmlPath: e.target.value
                                })}
                                helperText="e.g., Customer/Name or @Attribute"
                            />
                        </Grid>
                        <Grid item xs={6}>
                            <FormControl fullWidth size="small">
                                <InputLabel>Target Field</InputLabel>
                                <Select
                                    value={editingField?.fieldName || ''}
                                    label="Target Field"
                                    onChange={(e) => setEditingField({
                                        ...editingField!,
                                        fieldName: e.target.value
                                    })}
                                >
                                    {availableTables
                                        .find(t => t.id === tableMappings.find(m => m.id === selectedMapping)?.tableName)
                                        ?.fields?.map((field: any) => (
                                            <MenuItem key={field.name} value={field.name}>
                                                {field.name} ({field.dataType})
                                            </MenuItem>
                                        ))}
                                </Select>
                            </FormControl>
                        </Grid>
                        <Grid item xs={4}>
                            <FormControl fullWidth size="small">
                                <InputLabel>Data Type</InputLabel>
                                <Select
                                    value={editingField?.dataType || 'Text'}
                                    label="Data Type"
                                    onChange={(e) => setEditingField({
                                        ...editingField!,
                                        dataType: e.target.value
                                    })}
                                >
                                    <MenuItem value="Text">Text</MenuItem>
                                    <MenuItem value="Code">Code</MenuItem>
                                    <MenuItem value="Integer">Integer</MenuItem>
                                    <MenuItem value="Decimal">Decimal</MenuItem>
                                    <MenuItem value="Boolean">Boolean</MenuItem>
                                    <MenuItem value="Date">Date</MenuItem>
                                    <MenuItem value="DateTime">DateTime</MenuItem>
                                </Select>
                            </FormControl>
                        </Grid>
                        <Grid item xs={4}>
                            <TextField
                                fullWidth
                                size="small"
                                label="Default Value"
                                value={editingField?.defaultValue || ''}
                                onChange={(e) => setEditingField({
                                    ...editingField!,
                                    defaultValue: e.target.value
                                })}
                            />
                        </Grid>
                        <Grid item xs={4}>
                            <FormControlLabel
                                control={
                                    <Switch
                                        checked={editingField?.required || false}
                                        onChange={(e) => setEditingField({
                                            ...editingField!,
                                            required: e.target.checked
                                        })}
                                    />
                                }
                                label="Required"
                            />
                        </Grid>
                    </Grid>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setFieldDialogOpen(false)}>Cancel</Button>
                    <Button onClick={handleSaveFieldMapping} variant="contained">
                        Save Mapping
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
};