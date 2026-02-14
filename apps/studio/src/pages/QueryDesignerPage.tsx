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
    Paper,
    Grid,
    Card,
    CardContent,
    CardHeader,
    TextField,
    FormControl,
    InputLabel,
    Select,
    MenuItem,
    Chip,
    Switch,
    FormControlLabel,
    Divider,
    List,
    ListItem,
    ListItemText,
    ListItemIcon,
    ListItemSecondaryAction,
    Accordion,
    AccordionSummary,
    AccordionDetails,
    Alert,
    AlertTitle,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    TablePagination,
    LinearProgress,
    Tooltip,
    Badge,
    Avatar
} from '@mui/material';
import {
    Menu as MenuIcon,
    Save as SaveIcon,
    PlayArrow as RunIcon,
    Settings as SettingsIcon,
    Code as CodeIcon,
    TableChart as TableIcon,
    Link as LinkIcon,
    FilterList as FilterIcon,
    Sort as SortIcon,
    Functions as AggregateIcon,
    Visibility as ViewIcon,
    Build as BuildIcon,
    Add as AddIcon,
    Delete as DeleteIcon,
    Edit as EditIcon,
    ArrowUpward as ArrowUpIcon,
    ArrowDownward as ArrowDownIcon,
    ChevronRight as ChevronRightIcon,
    ExpandMore as ExpandMoreIcon,
    FormatAlignLeft as ColumnIcon,
    JoinInner as JoinIcon,
    FileDownload as ExportIcon,
    Timeline as ChartIcon
} from '@mui/icons-material';
import MonacoEditor from '@monaco-editor/react';
import { useParams, useNavigate } from 'react-router-dom';
import { useNotification } from '../../hooks/useNotification';
import { CompilerService } from '../../services/CompilerService';
import { MetadataService } from '../../services/MetadataService';
import { DataGrid, GridColDef, GridRowsProp } from '@mui/x-data-grid';
import {
    LineChart,
    Line,
    BarChart,
    Bar,
    PieChart,
    Pie,
    Cell,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip as ChartTooltip,
    Legend,
    ResponsiveContainer
} from 'recharts';

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

interface QueryDataItem {
    id: string;
    name: string;
    tableName: string;
    alias?: string;
    link?: QueryLink;
    fields: QueryField[];
}

interface QueryLink {
    type: 'inner' | 'left' | 'right' | 'full';
    from: string;
    to: string;
}

interface QueryField {
    id: string;
    name: string;
    source: string;
    alias?: string;
    aggregate?: 'sum' | 'avg' | 'count' | 'min' | 'max';
    isVisible: boolean;
    dataType?: string;
}

interface QueryFilter {
    id: string;
    field: string;
    operator: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'like' | 'in' | 'between';
    value: any;
    secondValue?: any;
    isActive: boolean;
}

interface QueryOrder {
    id: string;
    field: string;
    direction: 'asc' | 'desc';
}

export const QueryDesignerPage: React.FC = () => {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const { showNotification } = useNotification();

    // State
    const [activeTab, setActiveTab] = useState(0);
    const [queryId, setQueryId] = useState(id || '');
    const [queryName, setQueryName] = useState('');
    const [queryCode, setQueryCode] = useState('');
    const [queryType, setQueryType] = useState('Normal');
    const [dataItems, setDataItems] = useState<QueryDataItem[]>([]);
    const [fields, setFields] = useState<QueryField[]>([]);
    const [filters, setFilters] = useState<QueryFilter[]>([]);
    const [orders, setOrders] = useState<QueryOrder[]>([]);
    const [queryResults, setQueryResults] = useState<any[]>([]);
    const [totalCount, setTotalCount] = useState(0);
    const [isExecuting, setIsExecuting] = useState(false);
    const [isCompiling, setIsCompiling] = useState(false);
    const [selectedDataItem, setSelectedDataItem] = useState<string | null>(null);
    const [availableTables, setAvailableTables] = useState<any[]>([]);
    const [availableFields, setAvailableFields] = useState<any[]>([]);
    const [page, setPage] = useState(0);
    const [pageSize, setPageSize] = useState(25);
    const [chartData, setChartData] = useState<any[]>([]);
    const [fieldDialogOpen, setFieldDialogOpen] = useState(false);
    const [filterDialogOpen, setFilterDialogOpen] = useState(false);
    const [joinDialogOpen, setJoinDialogOpen] = useState(false);
    const [editingField, setEditingField] = useState<QueryField | null>(null);
    const [editingFilter, setEditingFilter] = useState<QueryFilter | null>(null);
    const [editingJoin, setEditingJoin] = useState<QueryLink | null>(null);

    // Templates
    const templates = {
        query: `query 50100 CustomerSales
{
    QueryType = Normal;
    
    elements
    {
        dataitem(Customer; Customer)
        {
            column(No; Customer."No.") { }
            column(Name; Customer.Name) { }
            column(Balance; Customer.Balance) { }
        }
        
        dataitem(SalesHeader; "Sales Header")
            : Link(Customer."No." = SalesHeader."Sell-to Customer No.")
        {
            column(OrderNo; SalesHeader."No.") { }
            column(OrderDate; SalesHeader."Order Date") { }
            column(Amount; SalesHeader.Amount) { }
        }
    }
    
    filters
    {
        filter(Customer.Balance; '> 1000') { }
        filter(SalesHeader."Order Date"; '> 2024-01-01') { }
    }
    
    orderby
    {
        order(Customer.Name; asc) { }
        order(SalesHeader."Order Date"; desc) { }
    }
}`
    };

    useEffect(() => {
        loadAvailableTables();
        if (id) {
            loadQuery(id);
        } else {
            setQueryCode(templates.query);
            parseQueryDefinition(templates.query);
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

    const loadQuery = async (queryId: string) => {
        try {
            const metadata = await MetadataService.getObject('Query', parseInt(queryId));
            setQueryName(metadata.name);
            setQueryCode(metadata.definition);
            setQueryType(metadata.properties?.dataType || 'Normal');
            parseQueryDefinition(metadata.definition);
        } catch (error) {
            showNotification('Failed to load query', 'error');
        }
    };

    const parseQueryDefinition = (code: string) => {
        const items: QueryDataItem[] = [];
        const allFields: QueryField[] = [];
        const allFilters: QueryFilter[] = [];
        const allOrders: QueryOrder[] = [];

        // Parse dataitems
        const dataitemRegex = /dataitem\((\w+);\s*(\w+)\)(?:\s*:\s*Link\(([^)]+)\))?/g;
        let dataitemMatch;
        while ((dataitemMatch = dataitemRegex.exec(code)) !== null) {
            const itemId = `di_${Date.now()}_${items.length}`;
            const item: QueryDataItem = {
                id: itemId,
                name: dataitemMatch[1],
                tableName: dataitemMatch[2],
                fields: []
            };

            // Parse link
            if (dataitemMatch[3]) {
                const linkParts = dataitemMatch[3].split('=');
                item.link = {
                    type: 'inner',
                    from: linkParts[0].trim(),
                    to: linkParts[1].trim()
                };
            }

            // Parse columns for this dataitem
            const columnRegex = new RegExp(`column\\((\\w+);\\s*${dataitemMatch[1]}\\.([^)]+)\\)`, 'g');
            let columnMatch;
            while ((columnMatch = columnRegex.exec(code)) !== null) {
                const fieldId = `fld_${Date.now()}_${allFields.length}`;
                const field: QueryField = {
                    id: fieldId,
                    name: columnMatch[1],
                    source: columnMatch[2],
                    isVisible: true
                };
                item.fields.push(field);
                allFields.push(field);
            }

            items.push(item);
        }

        // Parse filters
        const filterRegex = /filter\(([^;]+);\s*'([^']+)'\)/g;
        let filterMatch;
        while ((filterMatch = filterRegex.exec(code)) !== null) {
            allFilters.push({
                id: `flt_${Date.now()}_${allFilters.length}`,
                field: filterMatch[1].trim(),
                operator: 'eq',
                value: filterMatch[2],
                isActive: true
            });
        }

        // Parse orderby
        const orderRegex = /order\(([^;]+);\s*(asc|desc)\)/g;
        let orderMatch;
        while ((orderMatch = orderRegex.exec(code)) !== null) {
            allOrders.push({
                id: `ord_${Date.now()}_${allOrders.length}`,
                field: orderMatch[1].trim(),
                direction: orderMatch[2] as 'asc' | 'desc'
            });
        }

        setDataItems(items);
        setFields(allFields);
        setFilters(allFilters);
        setOrders(allOrders);
    };

    const handleCompile = async () => {
        setIsCompiling(true);
        try {
            const result = await CompilerService.compile(queryCode);
            
            if (result.success) {
                showNotification('Compilation successful!', 'success');
                
                if (result.metadata && result.metadata[0]) {
                    setQueryId(result.metadata[0].id.toString());
                    setQueryName(result.metadata[0].name);
                }
                
                parseQueryDefinition(queryCode);
            } else {
                showNotification('Compilation failed', 'error');
            }
        } catch (error) {
            showNotification(`Compilation error: ${error.message}`, 'error');
        } finally {
            setIsCompiling(false);
        }
    };

    const handleExecute = async () => {
        setIsExecuting(true);
        try {
            const result = await CompilerService.executeQuery(parseInt(queryId), {
                filters: filters.filter(f => f.isActive).map(f => ({
                    field: f.field,
                    operator: f.operator,
                    value: f.value,
                    secondValue: f.secondValue
                })),
                orderBy: orders,
                page: page + 1,
                pageSize
            });

            setQueryResults(result.data || []);
            setTotalCount(result.total || 0);
            
            // Prepare chart data
            if (result.data && result.data.length > 0) {
                setChartData(result.data.slice(0, 20));
            }

            showNotification(`Query executed in ${result.executionTime}ms`, 'success');
        } catch (error) {
            showNotification(`Query execution failed: ${error.message}`, 'error');
        } finally {
            setIsExecuting(false);
        }
    };

    const handleSave = async () => {
        try {
            await MetadataService.saveObject({
                id: parseInt(queryId),
                name: queryName,
                type: 'QUERY',
                definition: queryCode,
                metadata: {
                    queryType,
                    dataItems,
                    fields,
                    filters,
                    orders
                }
            });
            showNotification('Query saved successfully', 'success');
        } catch (error) {
            showNotification(`Save failed: ${error.message}`, 'error');
        }
    };

    const handleAddDataItem = () => {
        const newItem: QueryDataItem = {
            id: `di_${Date.now()}`,
            name: `Item${dataItems.length + 1}`,
            tableName: '',
            fields: []
        };
        setDataItems([...dataItems, newItem]);
        setSelectedDataItem(newItem.id);
    };

    const handleAddField = (dataItemId: string) => {
        const newField: QueryField = {
            id: `fld_${Date.now()}`,
            name: '',
            source: '',
            isVisible: true
        };
        setEditingField(newField);
        setSelectedDataItem(dataItemId);
        setFieldDialogOpen(true);
    };

    const handleAddFilter = () => {
        setEditingFilter({
            id: `flt_${Date.now()}`,
            field: '',
            operator: 'eq',
            value: '',
            isActive: true
        });
        setFilterDialogOpen(true);
    };

    const handleAddOrder = (field: string) => {
        setOrders([...orders, {
            id: `ord_${Date.now()}`,
            field,
            direction: 'asc'
        }]);
    };

    const handleRemoveOrder = (orderId: string) => {
        setOrders(orders.filter(o => o.id !== orderId));
    };

    const handleExport = async (format: 'json' | 'csv' | 'excel') => {
        try {
            const result = await CompilerService.exportQuery(parseInt(queryId), {
                format,
                data: queryResults
            });
            
            // Download file
            const blob = new Blob([result], { 
                type: format === 'json' ? 'application/json' : 
                      format === 'csv' ? 'text/csv' : 
                      'application/vnd.ms-excel' 
            });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${queryName || 'query'}.${format}`;
            a.click();
            URL.revokeObjectURL(url);
            
            showNotification(`Exported as ${format.toUpperCase()}`, 'success');
        } catch (error) {
            showNotification(`Export failed: ${error.message}`, 'error');
        }
    };

    const getColumns = (): GridColDef[] => {
        if (queryResults.length === 0) return [];
        
        return Object.keys(queryResults[0]).map(key => ({
            field: key,
            headerName: key,
            width: 150,
            editable: false
        }));
    };

    const renderJoinVisualization = () => {
        return (
            <Box sx={{ p: 3, bgcolor: '#fafafa', borderRadius: 2 }}>
                <Typography variant="subtitle2" gutterBottom>
                    Join Relationships
                </Typography>
                <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap' }}>
                    {dataItems.map((item, index) => (
                        <React.Fragment key={item.id}>
                            <Paper 
                                elevation={3} 
                                sx={{ 
                                    p: 2, 
                                    display: 'flex', 
                                    alignItems: 'center',
                                    bgcolor: 'primary.light',
                                    color: 'white'
                                }}
                            >
                                <TableIcon sx={{ mr: 1 }} />
                                <Typography variant="body2">
                                    {item.tableName}
                                </Typography>
                            </Paper>
                            {index < dataItems.length - 1 && (
                                <Box sx={{ display: 'flex', alignItems: 'center', mx: 2 }}>
                                    <JoinIcon sx={{ color: 'text.secondary' }} />
                                    <Typography variant="caption" sx={{ ml: 1 }}>
                                        {dataItems[index + 1]?.link?.from || 'ON'}
                                    </Typography>
                                </Box>
                            )}
                        </React.Fragment>
                    ))}
                </Box>
            </Box>
        );
    };

    return (
        <Box sx={{ display: 'flex', height: '100vh' }}>
            {/* Left Sidebar - Query Explorer */}
            <Drawer
                variant="permanent"
                sx={{
                    width: 300,
                    flexShrink: 0,
                    '& .MuiDrawer-paper': {
                        width: 300,
                        boxSizing: 'border-box',
                        bgcolor: '#fafafa'
                    }
                }}
            >
                <Toolbar />
                <Box sx={{ p: 2 }}>
                    <Typography variant="h6" gutterBottom>
                        Query Explorer
                    </Typography>
                    
                    <Button
                        fullWidth
                        variant="contained"
                        startIcon={<AddIcon />}
                        onClick={handleAddDataItem}
                        sx={{ mb: 3 }}
                    >
                        Add Data Item
                    </Button>

                    {/* Data Items */}
                    {dataItems.map((item, index) => (
                        <Accordion 
                            key={item.id} 
                            expanded={selectedDataItem === item.id}
                            onChange={() => setSelectedDataItem(item.id)}
                            sx={{ mb: 1 }}
                        >
                            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                                <Box sx={{ display: 'flex', alignItems: 'center' }}>
                                    <Badge 
                                        badgeContent={index + 1} 
                                        color="primary"
                                        sx={{ mr: 1 }}
                                    >
                                        <TableIcon />
                                    </Badge>
                                    <Typography variant="body2">
                                        {item.name || 'New Item'}
                                    </Typography>
                                </Box>
                            </AccordionSummary>
                            <AccordionDetails>
                                <FormControl fullWidth size="small" sx={{ mb: 2 }}>
                                    <InputLabel>Table</InputLabel>
                                    <Select
                                        value={item.tableName}
                                        label="Table"
                                        onChange={(e) => {
                                            setDataItems(items =>
                                                items.map(i =>
                                                    i.id === item.id
                                                        ? { ...i, tableName: e.target.value }
                                                        : i
                                                )
                                            );
                                        }}
                                    >
                                        {availableTables.map(table => (
                                            <MenuItem key={table.id} value={table.name}>
                                                {table.name}
                                            </MenuItem>
                                        ))}
                                    </Select>
                                </FormControl>

                                <Typography variant="caption" sx={{ fontWeight: 'bold' }}>
                                    Fields
                                </Typography>
                                
                                <List dense>
                                    {item.fields.map(field => (
                                        <ListItem key={field.id}>
                                            <ListItemIcon>
                                                <ColumnIcon fontSize="small" />
                                            </ListItemIcon>
                                            <ListItemText 
                                                primary={field.name}
                                                secondary={field.source}
                                            />
                                            <ListItemSecondaryAction>
                                                <IconButton size="small">
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
                                    onClick={() => handleAddField(item.id)}
                                >
                                    Add Field
                                </Button>

                                {index > 0 && (
                                    <Box sx={{ mt: 2 }}>
                                        <Button
                                            size="small"
                                            startIcon={<LinkIcon />}
                                            onClick={() => {
                                                setEditingJoin(item.link || {
                                                    type: 'inner',
                                                    from: '',
                                                    to: ''
                                                });
                                                setSelectedDataItem(item.id);
                                                setJoinDialogOpen(true);
                                            }}
                                        >
                                            Configure Join
                                        </Button>
                                    </Box>
                                )}
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
                            Query Designer - {queryName || 'Untitled'}
                            {queryId && <span style={{ fontSize: 14, color: '#666' }}> (ID: {queryId})</span>}
                        </Typography>

                        <Button
                            color="primary"
                            startIcon={<BuildIcon />}
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
                            startIcon={<PlayArrowIcon />}
                            onClick={handleExecute}
                            disabled={isExecuting}
                            sx={{ mr: 1 }}
                        >
                            {isExecuting ? 'Executing...' : 'Execute'}
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
                        <Tab icon={<BuildIcon />} label="Designer" />
                        <Tab icon={<ViewIcon />} label="Results" />
                        <Tab icon={<ChartIcon />} label="Analytics" />
                        <Tab icon={<FilterIcon />} label="Filters" />
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
                            value={queryCode}
                            onChange={(value) => setQueryCode(value || '')}
                            options={{
                                minimap: { enabled: true },
                                fontSize: 14,
                                fontFamily: "'JetBrains Mono', monospace",
                                lineNumbers: 'on',
                                wordWrap: 'on',
                                automaticLayout: true
                            }}
                        />
                    </TabPanel>

                    {/* Designer Tab */}
                    <TabPanel value={activeTab} index={1}>
                        <Grid container spacing={3} sx={{ p: 3 }}>
                            <Grid item xs={12}>
                                <Card variant="outlined">
                                    <CardHeader
                                        avatar={<JoinIcon />}
                                        title="Data Relationships"
                                    />
                                    <CardContent>
                                        {renderJoinVisualization()}
                                    </CardContent>
                                </Card>
                            </Grid>

                            <Grid item xs={6}>
                                <Card variant="outlined">
                                    <CardHeader
                                        avatar={<ColumnIcon />}
                                        title="Selected Fields"
                                        action={
                                            <Chip 
                                                label={`${fields.length} fields`}
                                                size="small"
                                            />
                                        }
                                    />
                                    <CardContent>
                                        <TableContainer>
                                            <Table size="small">
                                                <TableHead>
                                                    <TableRow>
                                                        <TableCell>Field Name</TableCell>
                                                        <TableCell>Source</TableCell>
                                                        <TableCell>Aggregate</TableCell>
                                                        <TableCell></TableCell>
                                                    </TableRow>
                                                </TableHead>
                                                <TableBody>
                                                    {fields.map(field => (
                                                        <TableRow key={field.id}>
                                                            <TableCell>{field.name}</TableCell>
                                                            <TableCell>{field.source}</TableCell>
                                                            <TableCell>
                                                                {field.aggregate && (
                                                                    <Chip 
                                                                        size="small"
                                                                        label={field.aggregate}
                                                                        color="primary"
                                                                    />
                                                                )}
                                                            </TableCell>
                                                            <TableCell>
                                                                <IconButton size="small">
                                                                    <EditIcon fontSize="small" />
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

                            <Grid item xs={6}>
                                <Card variant="outlined">
                                    <CardHeader
                                        avatar={<SortIcon />}
                                        title="Sort Order"
                                        action={
                                            <Button 
                                                size="small"
                                                startIcon={<AddIcon />}
                                            >
                                                Add Sort
                                            </Button>
                                        }
                                    />
                                    <CardContent>
                                        <List>
                                            {orders.map(order => (
                                                <ListItem key={order.id}>
                                                    <ListItemIcon>
                                                        {order.direction === 'asc' ? 
                                                            <ArrowUpIcon /> : 
                                                            <ArrowDownIcon />
                                                        }
                                                    </ListItemIcon>
                                                    <ListItemText 
                                                        primary={order.field}
                                                        secondary={order.direction}
                                                    />
                                                    <ListItemSecondaryAction>
                                                        <IconButton 
                                                            size="small"
                                                            onClick={() => handleRemoveOrder(order.id)}
                                                        >
                                                            <DeleteIcon fontSize="small" />
                                                        </IconButton>
                                                    </ListItemSecondaryAction>
                                                </ListItem>
                                            ))}
                                        </List>
                                    </CardContent>
                                </Card>
                            </Grid>
                        </Grid>
                    </TabPanel>

                    {/* Results Tab */}
                    <TabPanel value={activeTab} index={2}>
                        <Box sx={{ p: 3 }}>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
                                <Typography variant="h6">
                                    Query Results
                                    <Chip 
                                        size="small" 
                                        label={`${totalCount} records`}
                                        sx={{ ml: 2 }}
                                    />
                                </Typography>
                                <Box>
                                    <Button
                                        size="small"
                                        startIcon={<ExportIcon />}
                                        onClick={() => handleExport('json')}
                                        sx={{ mr: 1 }}
                                    >
                                        JSON
                                    </Button>
                                    <Button
                                        size="small"
                                        startIcon={<ExportIcon />}
                                        onClick={() => handleExport('csv')}
                                        sx={{ mr: 1 }}
                                    >
                                        CSV
                                    </Button>
                                    <Button
                                        size="small"
                                        startIcon={<ExportIcon />}
                                        onClick={() => handleExport('excel')}
                                    >
                                        Excel
                                    </Button>
                                </Box>
                            </Box>

                            {isExecuting && <LinearProgress sx={{ mb: 2 }} />}

                            <Paper elevation={0} variant="outlined" sx={{ height: 500 }}>
                                <DataGrid
                                    rows={queryResults}
                                    columns={getColumns()}
                                    pageSizeOptions={[10, 25, 50, 100]}
                                    paginationModel={{ page, pageSize }}
                                    onPaginationModelChange={(model) => {
                                        setPage(model.page);
                                        setPageSize(model.pageSize);
                                    }}
                                    rowCount={totalCount}
                                    paginationMode="server"
                                    loading={isExecuting}
                                    disableRowSelectionOnClick
                                />
                            </Paper>
                        </Box>
                    </TabPanel>

                    {/* Analytics Tab */}
                    <TabPanel value={activeTab} index={3}>
                        <Grid container spacing={3} sx={{ p: 3 }}>
                            <Grid item xs={12}>
                                <Typography variant="h6" gutterBottom>
                                    Data Visualization
                                </Typography>
                            </Grid>
                            
                            <Grid item xs={6}>
                                <Card variant="outlined">
                                    <CardHeader title="Bar Chart" />
                                    <CardContent sx={{ height: 300 }}>
                                        <ResponsiveContainer width="100%" height="100%">
                                            <BarChart data={chartData}>
                                                <CartesianGrid strokeDasharray="3 3" />
                                                <XAxis dataKey={fields[0]?.name} />
                                                <YAxis />
                                                <ChartTooltip />
                                                <Legend />
                                                <Bar dataKey={fields[1]?.name} fill="#8884d8" />
                                            </BarChart>
                                        </ResponsiveContainer>
                                    </CardContent>
                                </Card>
                            </Grid>

                            <Grid item xs={6}>
                                <Card variant="outlined">
                                    <CardHeader title="Line Chart" />
                                    <CardContent sx={{ height: 300 }}>
                                        <ResponsiveContainer width="100%" height="100%">
                                            <LineChart data={chartData}>
                                                <CartesianGrid strokeDasharray="3 3" />
                                                <XAxis dataKey={fields[0]?.name} />
                                                <YAxis />
                                                <ChartTooltip />
                                                <Legend />
                                                <Line type="monotone" dataKey={fields[1]?.name} stroke="#8884d8" />
                                            </LineChart>
                                        </ResponsiveContainer>
                                    </CardContent>
                                </Card>
                            </Grid>
                        </Grid>
                    </TabPanel>

                    {/* Filters Tab */}
                    <TabPanel value={activeTab} index={4}>
                        <Box sx={{ p: 3 }}>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 3 }}>
                                <Typography variant="h6">
                                    Query Filters
                                </Typography>
                                <Button
                                    variant="contained"
                                    startIcon={<FilterIcon />}
                                    onClick={handleAddFilter}
                                >
                                    Add Filter
                                </Button>
                            </Box>

                            {filters.map(filter => (
                                <Paper key={filter.id} variant="outlined" sx={{ p: 2, mb: 2 }}>
                                    <Grid container spacing={2} alignItems="center">
                                        <Grid item xs={3}>
                                            <TextField
                                                fullWidth
                                                size="small"
                                                label="Field"
                                                value={filter.field}
                                            />
                                        </Grid>
                                        <Grid item xs={2}>
                                            <FormControl fullWidth size="small">
                                                <InputLabel>Operator</InputLabel>
                                                <Select
                                                    value={filter.operator}
                                                    label="Operator"
                                                >
                                                    <MenuItem value="eq">Equals (=)</MenuItem>
                                                    <MenuItem value="neq">Not Equals (<>)</MenuItem>
                                                    <MenuItem value="gt">Greater Than (>)</MenuItem>
                                                    <MenuItem value="gte">Greater/Equal (>=)</MenuItem>
                                                    <MenuItem value="lt">Less Than (<)</MenuItem>
                                                    <MenuItem value="lte">Less/Equal (<=)</MenuItem>
                                                    <MenuItem value="like">Like</MenuItem>
                                                    <MenuItem value="in">In</MenuItem>
                                                    <MenuItem value="between">Between</MenuItem>
                                                </Select>
                                            </FormControl>
                                        </Grid>
                                        <Grid item xs={2}>
                                            <TextField
                                                fullWidth
                                                size="small"
                                                label="Value"
                                                value={filter.value}
                                            />
                                        </Grid>
                                        {filter.operator === 'between' && (
                                            <Grid item xs={2}>
                                                <TextField
                                                    fullWidth
                                                    size="small"
                                                    label="And"
                                                    value={filter.secondValue}
                                                />
                                            </Grid>
                                        )}
                                        <Grid item xs={2}>
                                            <FormControlLabel
                                                control={
                                                    <Switch
                                                        checked={filter.isActive}
                                                    />
                                                }
                                                label="Active"
                                            />
                                        </Grid>
                                        <Grid item xs={1}>
                                            <IconButton>
                                                <DeleteIcon />
                                            </IconButton>
                                        </Grid>
                                    </Grid>
                                </Paper>
                            ))}
                        </Box>
                    </TabPanel>
                </Box>
            </Box>

            {/* Field Dialog */}
            <Dialog open={fieldDialogOpen} onClose={() => setFieldDialogOpen(false)} maxWidth="sm" fullWidth>
                <DialogTitle>
                    {editingField?.id ? 'Edit Field' : 'Add Field'}
                </DialogTitle>
                <DialogContent>
                    <Grid container spacing={2} sx={{ pt: 2 }}>
                        <Grid item xs={6}>
                            <TextField
                                fullWidth
                                size="small"
                                label="Field Name"
                                value={editingField?.name || ''}
                                onChange={(e) => setEditingField({
                                    ...editingField!,
                                    name: e.target.value
                                })}
                            />
                        </Grid>
                        <Grid item xs={6}>
                            <TextField
                                fullWidth
                                size="small"
                                label="Source Field"
                                value={editingField?.source || ''}
                                onChange={(e) => setEditingField({
                                    ...editingField!,
                                    source: e.target.value
                                })}
                            />
                        </Grid>
                        <Grid item xs={6}>
                            <FormControl fullWidth size="small">
                                <InputLabel>Aggregate</InputLabel>
                                <Select
                                    value={editingField?.aggregate || ''}
                                    label="Aggregate"
                                    onChange={(e) => setEditingField({
                                        ...editingField!,
                                        aggregate: e.target.value as any
                                    })}
                                >
                                    <MenuItem value="">None</MenuItem>
                                    <MenuItem value="sum">SUM</MenuItem>
                                    <MenuItem value="avg">AVG</MenuItem>
                                    <MenuItem value="count">COUNT</MenuItem>
                                    <MenuItem value="min">MIN</MenuItem>
                                    <MenuItem value="max">MAX</MenuItem>
                                </Select>
                            </FormControl>
                        </Grid>
                        <Grid item xs={6}>
                            <FormControlLabel
                                control={
                                    <Switch
                                        checked={editingField?.isVisible ?? true}
                                        onChange={(e) => setEditingField({
                                            ...editingField!,
                                            isVisible: e.target.checked
                                        })}
                                    />
                                }
                                label="Visible"
                            />
                        </Grid>
                    </Grid>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setFieldDialogOpen(false)}>Cancel</Button>
                    <Button onClick={() => {
                        if (editingField && selectedDataItem) {
                            setDataItems(items =>
                                items.map(item =>
                                    item.id === selectedDataItem
                                        ? { ...item, fields: [...item.fields, editingField] }
                                        : item
                                )
                            );
                            setFields([...fields, editingField]);
                            setFieldDialogOpen(false);
                            setEditingField(null);
                        }
                    }} variant="contained">
                        Add Field
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Join Dialog */}
            <Dialog open={joinDialogOpen} onClose={() => setJoinDialogOpen(false)} maxWidth="sm" fullWidth>
                <DialogTitle>Configure Join</DialogTitle>
                <DialogContent>
                    <Grid container spacing={2} sx={{ pt: 2 }}>
                        <Grid item xs={12}>
                            <FormControl fullWidth size="small">
                                <InputLabel>Join Type</InputLabel>
                                <Select
                                    value={editingJoin?.type || 'inner'}
                                    label="Join Type"
                                    onChange={(e) => setEditingJoin({
                                        ...editingJoin!,
                                        type: e.target.value as any
                                    })}
                                >
                                    <MenuItem value="inner">INNER JOIN</MenuItem>
                                    <MenuItem value="left">LEFT JOIN</MenuItem>
                                    <MenuItem value="right">RIGHT JOIN</MenuItem>
                                    <MenuItem value="full">FULL JOIN</MenuItem>
                                </Select>
                            </FormControl>
                        </Grid>
                        <Grid item xs={6}>
                            <TextField
                                fullWidth
                                size="small"
                                label="From Field"
                                value={editingJoin?.from || ''}
                                onChange={(e) => setEditingJoin({
                                    ...editingJoin!,
                                    from: e.target.value
                                })}
                            />
                        </Grid>
                        <Grid item xs={6}>
                            <TextField
                                fullWidth
                                size="small"
                                label="To Field"
                                value={editingJoin?.to || ''}
                                onChange={(e) => setEditingJoin({
                                    ...editingJoin!,
                                    to: e.target.value
                                })}
                            />
                        </Grid>
                    </Grid>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setJoinDialogOpen(false)}>Cancel</Button>
                    <Button onClick={() => {
                        if (editingJoin && selectedDataItem) {
                            setDataItems(items =>
                                items.map(item =>
                                    item.id === selectedDataItem
                                        ? { ...item, link: editingJoin }
                                        : item
                                )
                            );
                            setJoinDialogOpen(false);
                            setEditingJoin(null);
                        }
                    }} variant="contained">
                        Apply Join
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
};