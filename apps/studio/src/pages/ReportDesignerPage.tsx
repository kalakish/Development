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
    CardContent
} from '@mui/material';
import {
    Save as SaveIcon,
    PlayArrow as RunIcon,
    Assessment as ReportIcon,
    TableChart as DatasetIcon,
    ViewColumn as ColumnIcon,
    FilterAlt as FilterIcon,
    Sort as SortIcon,
    Add as AddIcon,
    Delete as DeleteIcon,
    Edit as EditIcon,
    Settings as SettingsIcon,
    Build as BuildIcon,
    Download as DownloadIcon,
    PictureAsPdf as PdfIcon,
    TableChart as ExcelIcon,
    Description as CsvIcon,
    BarChart as ChartIcon
} from '@mui/icons-material';
import MonacoEditor from '@monaco-editor/react';
import { useParams, useNavigate } from 'react-router-dom';

export const ReportDesignerPage: React.FC = () => {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();

    const [reportId, setReportId] = useState<number>(parseInt(id || '0') || 50100);
    const [reportName, setReportName] = useState<string>('');
    const [reportDescription, setReportDescription] = useState<string>('');
    const [datasets, setDatasets] = useState<any[]>([]);
    const [parameters, setParameters] = useState<any[]>([]);
    const [layouts, setLayouts] = useState<any[]>([]);
    const [triggers, setTriggers] = useState<any[]>([]);
    const [activeTab, setActiveTab] = useState(0);
    const [datasetDialogOpen, setDatasetDialogOpen] = useState(false);
    const [parameterDialogOpen, setParameterDialogOpen] = useState(false);
    const [layoutDialogOpen, setLayoutDialogOpen] = useState(false);
    const [selectedDataset, setSelectedDataset] = useState<any>(null);
    const [selectedParameter, setSelectedParameter] = useState<any>(null);
    const [selectedLayout, setSelectedLayout] = useState<any>(null);
    const [previewData, setPreviewData] = useState<any[]>([]);
    const [exportFormat, setExportFormat] = useState<string>('pdf');

    useEffect(() => {
        if (id) {
            loadReport();
        }
    }, [id]);

    const loadReport = async () => {
        try {
            const metadata = await window.api.getObject('Report', parseInt(id!));
            setReportId(metadata.id);
            setReportName(metadata.name);
            setReportDescription(metadata.description || '');
            setDatasets(metadata.datasets || []);
            setParameters(metadata.parameters || []);
            setLayouts(metadata.layouts || []);
            setTriggers(metadata.triggers || []);
        } catch (error) {
            console.error('Failed to load report:', error);
        }
    };

    // Dataset Management
    const handleAddDataset = () => {
        setSelectedDataset({
            name: '',
            tableName: '',
            columns: [],
            filters: [],
            sortBy: []
        });
        setDatasetDialogOpen(true);
    };

    const handleEditDataset = (dataset: any) => {
        setSelectedDataset({ ...dataset });
        setDatasetDialogOpen(true);
    };

    const handleDeleteDataset = (datasetName: string) => {
        setDatasets(datasets.filter(d => d.name !== datasetName));
    };

    const handleSaveDataset = () => {
        if (!selectedDataset) return;

        if (!selectedDataset.name || !selectedDataset.tableName) {
            alert('Dataset name and table name are required');
            return;
        }

        const existingIndex = datasets.findIndex(d => d.name === selectedDataset.name);
        if (existingIndex >= 0) {
            setDatasets(datasets.map((d, i) => i === existingIndex ? selectedDataset : d));
        } else {
            setDatasets([...datasets, selectedDataset]);
        }

        setDatasetDialogOpen(false);
        setSelectedDataset(null);
    };

    // Parameter Management
    const handleAddParameter = () => {
        setSelectedParameter({
            name: '',
            type: 'String',
            required: false,
            defaultValue: ''
        });
        setParameterDialogOpen(true);
    };

    const handleEditParameter = (parameter: any) => {
        setSelectedParameter({ ...parameter });
        setParameterDialogOpen(true);
    };

    const handleDeleteParameter = (parameterName: string) => {
        setParameters(parameters.filter(p => p.name !== parameterName));
    };

    const handleSaveParameter = () => {
        if (!selectedParameter) return;

        if (!selectedParameter.name) {
            alert('Parameter name is required');
            return;
        }

        const existingIndex = parameters.findIndex(p => p.name === selectedParameter.name);
        if (existingIndex >= 0) {
            setParameters(parameters.map((p, i) => i === existingIndex ? selectedParameter : p));
        } else {
            setParameters([...parameters, selectedParameter]);
        }

        setParameterDialogOpen(false);
        setSelectedParameter(null);
    };

    // Layout Management
    const handleAddLayout = () => {
        setSelectedLayout({
            name: 'Default',
            type: 'tabular',
            columns: [],
            grouping: [],
            sorting: [],
            formatting: {}
        });
        setLayoutDialogOpen(true);
    };

    const handleEditLayout = (layout: any) => {
        setSelectedLayout({ ...layout });
        setLayoutDialogOpen(true);
    };

    const handleDeleteLayout = (layoutName: string) => {
        setLayouts(layouts.filter(l => l.name !== layoutName));
    };

    const handleSaveLayout = () => {
        if (!selectedLayout) return;

        if (!selectedLayout.name) {
            alert('Layout name is required');
            return;
        }

        const existingIndex = layouts.findIndex(l => l.name === selectedLayout.name);
        if (existingIndex >= 0) {
            setLayouts(layouts.map((l, i) => i === existingIndex ? selectedLayout : l));
        } else {
            setLayouts([...layouts, selectedLayout]);
        }

        setLayoutDialogOpen(false);
        setSelectedLayout(null);
    };

    // Preview Report
    const handlePreview = async () => {
        try {
            // Simulate report preview
            const mockData = [
                { id: 1, name: 'Sample Data 1', value: 100 },
                { id: 2, name: 'Sample Data 2', value: 200 },
                { id: 3, name: 'Sample Data 3', value: 300 },
                { id: 4, name: 'Sample Data 4', value: 400 },
                { id: 5, name: 'Sample Data 5', value: 500 }
            ];
            setPreviewData(mockData);
        } catch (error) {
            console.error('Preview failed:', error);
        }
    };

    // Export Report
    const handleExport = async () => {
        try {
            // Simulate export
            const blob = new Blob(['Sample report content'], { type: 'application/pdf' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${reportName}.${exportFormat}`;
            a.click();
            URL.revokeObjectURL(url);
        } catch (error) {
            console.error('Export failed:', error);
        }
    };

    // Generate AL code
    const generateALCode = (): string => {
        let code = `report ${reportId} ${reportName}\n{\n`;

        if (reportDescription) {
            code += `    Description = '${reportDescription}';\n`;
        }

        // Parameters
        if (parameters.length > 0) {
            code += '\n    parameters\n    {\n';
            parameters.forEach(param => {
                code += `        parameter(${param.name}; ${param.type}) { }\n`;
            });
            code += '    }\n';
        }

        // Dataset
        code += '\n    dataset\n    {\n';
        datasets.forEach(dataset => {
            code += `        dataitem(${dataset.name}; ${dataset.tableName})\n`;
            code += '        {\n';
            
            dataset.columns.forEach((column: any) => {
                code += `            column(${column.name}; ${column.source}) { }\n`;
            });
            
            code += '        }\n';
        });
        code += '    }\n';

        // Layout
        code += '\n    layout\n    {\n';
        layouts.forEach(layout => {
            code += `        layout(${layout.name})\n`;
            code += '        {\n';
            code += '            // Layout definition\n';
            code += '        }\n';
        });
        code += '    }\n';

        // Triggers
        if (triggers.length > 0) {
            code += '\n    triggers\n    {\n';
            triggers.forEach(trigger => {
                code += `        trigger ${trigger.name}()\n`;
                code += '        begin\n';
                code += '            // Trigger logic\n';
                code += '        end;\n';
            });
            code += '    }\n';
        }

        code += '}\n';
        return code;
    };

    // Parameter types
    const parameterTypes = [
        'String', 'Integer', 'Decimal', 'Boolean', 'Date', 'DateTime', 'Time'
    ];

    // Export formats
    const exportFormats = [
        { value: 'pdf', label: 'PDF', icon: <PdfIcon /> },
        { value: 'excel', label: 'Excel', icon: <ExcelIcon /> },
        { value: 'csv', label: 'CSV', icon: <CsvIcon /> }
    ];

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
            {/* Header */}
            <AppBar position="static" color="default" elevation={1}>
                <Toolbar>
                    <ReportIcon sx={{ mr: 2 }} color="primary" />
                    <Typography variant="h6" sx={{ flexGrow: 1 }}>
                        Report Designer - {reportName} (ID: {reportId})
                    </Typography>
                    
                    <FormControl sx={{ minWidth: 120, mr: 1 }} size="small">
                        <Select
                            value={exportFormat}
                            onChange={(e) => setExportFormat(e.target.value)}
                        >
                            {exportFormats.map(format => (
                                <MenuItem key={format.value} value={format.value}>
                                    {format.label}
                                </MenuItem>
                            ))}
                        </Select>
                    </FormControl>
                    
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
                        onClick={handlePreview}
                        sx={{ mr: 1 }}
                    >
                        Preview
                    </Button>
                    
                    <Button
                        color="primary"
                        startIcon={<DownloadIcon />}
                        onClick={handleExport}
                    >
                        Export
                    </Button>
                    
                    <IconButton color="inherit" sx={{ ml: 1 }}>
                        <SettingsIcon />
                    </IconButton>
                </Toolbar>
                
                <Tabs value={activeTab} onChange={(_, v) => setActiveTab(v)}>
                    <Tab label="Design" />
                    <Tab label="Datasets" />
                    <Tab label="Parameters" />
                    <Tab label="Layout" />
                    <Tab label="Preview" />
                    <Tab label="Code" />
                </Tabs>
            </AppBar>

            {/* Main Content */}
            <Box sx={{ flexGrow: 1, overflow: 'auto' }}>
                {/* Design Tab */}
                <TabPanel value={activeTab} index={0}>
                    <Grid container spacing={3} sx={{ p: 3 }}>
                        <Grid item xs={12} md={6}>
                            <Paper sx={{ p: 3 }}>
                                <Typography variant="h6" gutterBottom>
                                    Report Properties
                                </Typography>
                                
                                <TextField
                                    fullWidth
                                    label="Report ID"
                                    value={reportId}
                                    onChange={(e) => setReportId(parseInt(e.target.value) || 0)}
                                    type="number"
                                    sx={{ mb: 2 }}
                                />
                                
                                <TextField
                                    fullWidth
                                    label="Report Name"
                                    value={reportName}
                                    onChange={(e) => setReportName(e.target.value)}
                                    sx={{ mb: 2 }}
                                />
                                
                                <TextField
                                    fullWidth
                                    label="Description"
                                    value={reportDescription}
                                    onChange={(e) => setReportDescription(e.target.value)}
                                    multiline
                                    rows={2}
                                    sx={{ mb: 2 }}
                                />
                                
                                <FormControlLabel
                                    control={<Switch defaultChecked />}
                                    label="Request Page"
                                    sx={{ mb: 2 }}
                                />
                                
                                <FormControlLabel
                                    control={<Switch defaultChecked />}
                                    label="Word Layout Enabled"
                                    sx={{ mb: 2 }}
                                />
                            </Paper>
                        </Grid>
                        
                        <Grid item xs={12} md={6}>
                            <Paper sx={{ p: 3 }}>
                                <Typography variant="h6" gutterBottom>
                                    Report Statistics
                                </Typography>
                                
                                <List>
                                    <ListItem>
                                        <ListItemText 
                                            primary="Datasets"
                                            secondary={`${datasets.length} data sources`}
                                        />
                                    </ListItem>
                                    <ListItem>
                                        <ListItemText 
                                            primary="Parameters"
                                            secondary={`${parameters.length} parameters`}
                                        />
                                    </ListItem>
                                    <ListItem>
                                        <ListItemText 
                                            primary="Layouts"
                                            secondary={`${layouts.length} layouts`}
                                        />
                                    </ListItem>
                                    <ListItem>
                                        <ListItemText 
                                            primary="Triggers"
                                            secondary={`${triggers.length} triggers`}
                                        />
                                    </ListItem>
                                </List>
                                
                                <Divider sx={{ my: 2 }} />
                                
                                <Typography variant="subtitle2" gutterBottom>
                                    Default Export Format
                                </Typography>
                                
                                <Chip 
                                    icon={<PdfIcon />} 
                                    label="PDF" 
                                    color="primary" 
                                    size="small"
                                    sx={{ mr: 1 }}
                                />
                                <Chip 
                                    icon={<ExcelIcon />} 
                                    label="Excel" 
                                    size="small"
                                    sx={{ mr: 1 }}
                                />
                                <Chip 
                                    icon={<CsvIcon />} 
                                    label="CSV" 
                                    size="small"
                                />
                            </Paper>
                        </Grid>
                    </Grid>
                </TabPanel>

                {/* Datasets Tab */}
                <TabPanel value={activeTab} index={1}>
                    <Box sx={{ p: 3 }}>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
                            <Typography variant="h6">Data Sources</Typography>
                            <Button
                                variant="contained"
                                startIcon={<AddIcon />}
                                onClick={handleAddDataset}
                            >
                                Add Dataset
                            </Button>
                        </Box>
                        
                        <Grid container spacing={3}>
                            {datasets.map((dataset) => (
                                <Grid item xs={12} key={dataset.name}>
                                    <Paper sx={{ p: 2 }}>
                                        <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                                            <DatasetIcon color="primary" sx={{ mr: 1 }} />
                                            <Typography variant="subtitle1" sx={{ fontWeight: 'bold', flexGrow: 1 }}>
                                                {dataset.name}
                                            </Typography>
                                            <Chip 
                                                label={dataset.tableName}
                                                size="small"
                                                sx={{ mr: 2 }}
                                            />
                                            <IconButton size="small" onClick={() => handleEditDataset(dataset)}>
                                                <EditIcon />
                                            </IconButton>
                                            <IconButton size="small" onClick={() => handleDeleteDataset(dataset.name)}>
                                                <DeleteIcon />
                                            </IconButton>
                                        </Box>
                                        
                                        <Divider sx={{ mb: 2 }} />
                                        
                                        <Typography variant="subtitle2" gutterBottom>
                                            Columns ({dataset.columns?.length || 0})
                                        </Typography>
                                        
                                        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 2 }}>
                                            {dataset.columns?.map((col: any) => (
                                                <Chip
                                                    key={col.name}
                                                    icon={<ColumnIcon />}
                                                    label={`${col.name} (${col.source})`}
                                                    size="small"
                                                    variant="outlined"
                                                />
                                            ))}
                                        </Box>
                                        
                                        <Typography variant="subtitle2" gutterBottom>
                                            Filters
                                        </Typography>
                                        
                                        <Typography variant="body2" color="textSecondary">
                                            {dataset.filters?.length || 0} filters applied
                                        </Typography>
                                    </Paper>
                                </Grid>
                            ))}
                            
                            {datasets.length === 0 && (
                                <Grid item xs={12}>
                                    <Paper sx={{ p: 4, textAlign: 'center' }}>
                                        <DatasetIcon sx={{ fontSize: 48, color: '#ccc', mb: 2 }} />
                                        <Typography color="textSecondary" gutterBottom>
                                            No datasets defined
                                        </Typography>
                                        <Button
                                            variant="contained"
                                            startIcon={<AddIcon />}
                                            onClick={handleAddDataset}
                                            sx={{ mt: 2 }}
                                        >
                                            Add Dataset
                                        </Button>
                                    </Paper>
                                </Grid>
                            )}
                        </Grid>
                    </Box>
                </TabPanel>

                {/* Parameters Tab */}
                <TabPanel value={activeTab} index={2}>
                    <Box sx={{ p: 3 }}>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
                            <Typography variant="h6">Report Parameters</Typography>
                            <Button
                                variant="contained"
                                startIcon={<AddIcon />}
                                onClick={handleAddParameter}
                            >
                                Add Parameter
                            </Button>
                        </Box>
                        
                        <Paper>
                            <List>
                                {parameters.map((parameter) => (
                                    <ListItem key={parameter.name} divider>
                                        <ListItemText
                                            primary={
                                                <Box sx={{ display: 'flex', alignItems: 'center' }}>
                                                    <Typography variant="subtitle1" sx={{ fontWeight: 'bold' }}>
                                                        {parameter.name}
                                                    </Typography>
                                                    <Chip
                                                        label={parameter.type}
                                                        size="small"
                                                        sx={{ ml: 1 }}
                                                    />
                                                    {parameter.required && (
                                                        <Chip
                                                            label="Required"
                                                            size="small"
                                                            color="warning"
                                                            sx={{ ml: 1 }}
                                                        />
                                                    )}
                                                </Box>
                                            }
                                            secondary={parameter.defaultValue ? `Default: ${parameter.defaultValue}` : ''}
                                        />
                                        <ListItemSecondaryAction>
                                            <IconButton edge="end" onClick={() => handleEditParameter(parameter)}>
                                                <EditIcon />
                                            </IconButton>
                                            <IconButton edge="end" onClick={() => handleDeleteParameter(parameter.name)}>
                                                <DeleteIcon />
                                            </IconButton>
                                        </ListItemSecondaryAction>
                                    </ListItem>
                                ))}
                                
                                {parameters.length === 0 && (
                                    <ListItem>
                                        <ListItemText
                                            primary="No parameters defined"
                                            secondary="Add parameters to make your report dynamic"
                                        />
                                    </ListItem>
                                )}
                            </List>
                        </Paper>
                    </Box>
                </TabPanel>

                {/* Layout Tab */}
                <TabPanel value={activeTab} index={3}>
                    <Box sx={{ p: 3 }}>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
                            <Typography variant="h6">Report Layouts</Typography>
                            <Button
                                variant="contained"
                                startIcon={<AddIcon />}
                                onClick={handleAddLayout}
                            >
                                Add Layout
                            </Button>
                        </Box>
                        
                        <Grid container spacing={3}>
                            {layouts.map((layout) => (
                                <Grid item xs={12} md={6} key={layout.name}>
                                    <Card>
                                        <CardContent>
                                            <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                                                <Typography variant="h6" sx={{ flexGrow: 1 }}>
                                                    {layout.name}
                                                </Typography>
                                                <Chip 
                                                    label={layout.type}
                                                    size="small"
                                                    sx={{ mr: 1 }}
                                                />
                                                <IconButton size="small" onClick={() => handleEditLayout(layout)}>
                                                    <EditIcon />
                                                </IconButton>
                                                <IconButton size="small" onClick={() => handleDeleteLayout(layout.name)}>
                                                    <DeleteIcon />
                                                </IconButton>
                                            </Box>
                                            
                                            <Divider sx={{ mb: 2 }} />
                                            
                                            <Typography variant="body2" color="textSecondary" paragraph>
                                                {layout.columns?.length || 0} columns
                                            </Typography>
                                            
                                            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                                                {layout.grouping?.map((group: string, i: number) => (
                                                    <Chip
                                                        key={i}
                                                        label={`Group by: ${group}`}
                                                        size="small"
                                                        variant="outlined"
                                                    />
                                                ))}
                                            </Box>
                                        </CardContent>
                                    </Card>
                                </Grid>
                            ))}
                            
                            {layouts.length === 0 && (
                                <Grid item xs={12}>
                                    <Paper sx={{ p: 4, textAlign: 'center' }}>
                                        <Typography color="textSecondary" gutterBottom>
                                            No layouts defined
                                        </Typography>
                                        <Button
                                            variant="contained"
                                            startIcon={<AddIcon />}
                                            onClick={handleAddLayout}
                                            sx={{ mt: 2 }}
                                        >
                                            Create Default Layout
                                        </Button>
                                    </Paper>
                                </Grid>
                            )}
                        </Grid>
                    </Box>
                </TabPanel>

                {/* Preview Tab */}
                <TabPanel value={activeTab} index={4}>
                    <Box sx={{ p: 3 }}>
                        <Typography variant="h6" gutterBottom>
                            Report Preview
                        </Typography>
                        
                        <Paper sx={{ p: 3 }}>
                            {previewData.length > 0 ? (
                                <Box sx={{ overflow: 'auto' }}>
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
                                                            {value?.toString()}
                                                        </td>
                                                    ))}
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </Box>
                            ) : (
                                <Box sx={{ py: 8, textAlign: 'center' }}>
                                    <ChartIcon sx={{ fontSize: 48, color: '#ccc', mb: 2 }} />
                                    <Typography color="textSecondary" gutterBottom>
                                        No preview data available
                                    </Typography>
                                    <Button
                                        variant="contained"
                                        startIcon={<RunIcon />}
                                        onClick={handlePreview}
                                        sx={{ mt: 2 }}
                                    >
                                        Generate Preview
                                    </Button>
                                </Box>
                            )}
                        </Paper>
                    </Box>
                </TabPanel>

                {/* Code Tab */}
                <TabPanel value={activeTab} index={5}>
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
            </Box>

            {/* Dataset Dialog */}
            <Dialog open={datasetDialogOpen} onClose={() => setDatasetDialogOpen(false)} maxWidth="md" fullWidth>
                <DialogTitle>Add Dataset</DialogTitle>
                <DialogContent>
                    <Grid container spacing={2} sx={{ pt: 2 }}>
                        <Grid item xs={6}>
                            <TextField
                                fullWidth
                                label="Dataset Name"
                                value={selectedDataset?.name || ''}
                                onChange={(e) => setSelectedDataset(prev => ({ ...prev!, name: e.target.value }))}
                            />
                        </Grid>
                        <Grid item xs={6}>
                            <TextField
                                fullWidth
                                label="Table Name"
                                value={selectedDataset?.tableName || ''}
                                onChange={(e) => setSelectedDataset(prev => ({ ...prev!, tableName: e.target.value }))}
                            />
                        </Grid>
                        
                        <Grid item xs={12}>
                            <Typography variant="subtitle2" gutterBottom>
                                Columns
                            </Typography>
                            <Paper variant="outlined" sx={{ p: 2, bgcolor: '#f5f5f5' }}>
                                <Button startIcon={<AddIcon />} size="small">
                                    Add Column
                                </Button>
                            </Paper>
                        </Grid>
                        
                        <Grid item xs={12}>
                            <Typography variant="subtitle2" gutterBottom>
                                Filters
                            </Typography>
                            <Paper variant="outlined" sx={{ p: 2, bgcolor: '#f5f5f5' }}>
                                <Button startIcon={<AddIcon />} size="small">
                                    Add Filter
                                </Button>
                            </Paper>
                        </Grid>
                    </Grid>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setDatasetDialogOpen(false)}>Cancel</Button>
                    <Button onClick={handleSaveDataset} variant="contained" color="primary">
                        Save Dataset
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Parameter Dialog */}
            <Dialog open={parameterDialogOpen} onClose={() => setParameterDialogOpen(false)} maxWidth="sm" fullWidth>
                <DialogTitle>Add Parameter</DialogTitle>
                <DialogContent>
                    <Grid container spacing={2} sx={{ pt: 2 }}>
                        <Grid item xs={6}>
                            <TextField
                                fullWidth
                                label="Parameter Name"
                                value={selectedParameter?.name || ''}
                                onChange={(e) => setSelectedParameter(prev => ({ ...prev!, name: e.target.value }))}
                            />
                        </Grid>
                        <Grid item xs={6}>
                            <FormControl fullWidth>
                                <InputLabel>Type</InputLabel>
                                <Select
                                    value={selectedParameter?.type || 'String'}
                                    label="Type"
                                    onChange={(e) => setSelectedParameter(prev => ({ ...prev!, type: e.target.value }))}
                                >
                                    {parameterTypes.map(type => (
                                        <MenuItem key={type} value={type}>{type}</MenuItem>
                                    ))}
                                </Select>
                            </FormControl>
                        </Grid>
                        <Grid item xs={12}>
                            <FormControlLabel
                                control={
                                    <Switch
                                        checked={selectedParameter?.required || false}
                                        onChange={(e) => setSelectedParameter(prev => ({ ...prev!, required: e.target.checked }))}
                                    />
                                }
                                label="Required"
                            />
                        </Grid>
                        <Grid item xs={12}>
                            <TextField
                                fullWidth
                                label="Default Value"
                                value={selectedParameter?.defaultValue || ''}
                                onChange={(e) => setSelectedParameter(prev => ({ ...prev!, defaultValue: e.target.value }))}
                            />
                        </Grid>
                    </Grid>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setParameterDialogOpen(false)}>Cancel</Button>
                    <Button onClick={handleSaveParameter} variant="contained" color="primary">
                        Save Parameter
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