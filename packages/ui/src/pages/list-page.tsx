import React, { useState, useEffect } from 'react';
import {
    Box,
    Paper,
    Typography,
    Button,
    IconButton,
    Toolbar,
    AppBar,
    TextField,
    InputAdornment,
    Chip,
    Menu,
    MenuItem,
    Checkbox,
    FormControlLabel,
    Popover,
    Grid,
    Badge
} from '@mui/material';
import { DataGrid, GridColDef, GridToolbar } from '@mui/x-data-grid';
import {
    Add as AddIcon,
    Refresh as RefreshIcon,
    Delete as DeleteIcon,
    Edit as EditIcon,
    FilterList as FilterIcon,
    Search as SearchIcon,
    Download as DownloadIcon,
    Upload as UploadIcon,
    ViewColumn as ViewColumnIcon,
    MoreVert as MoreVertIcon
} from '@mui/icons-material';
import { NovaPage } from '../page';
import { useNotification } from '../../hooks/use-notification';

interface ListPageProps {
    page: NovaPage;
    onNew?: () => void;
    onEdit?: (id: string) => void;
    onDelete?: (ids: string[]) => void;
    onExport?: () => void;
    onImport?: () => void;
}

export const ListPage: React.FC<ListPageProps> = ({
    page,
    onNew,
    onEdit,
    onDelete,
    onExport,
    onImport
}) => {
    const [records, setRecords] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedRows, setSelectedRows] = useState<string[]>([]);
    const [searchText, setSearchText] = useState('');
    const [filterAnchorEl, setFilterAnchorEl] = useState<HTMLButtonElement | null>(null);
    const [columnAnchorEl, setColumnAnchorEl] = useState<HTMLButtonElement | null>(null);
    const [visibleColumns, setVisibleColumns] = useState<Record<string, boolean>>({});
    const [filters, setFilters] = useState<Record<string, any>>({});
    const [paginationModel, setPaginationModel] = useState({
        page: 0,
        pageSize: 50
    });
    const [rowCount, setRowCount] = useState(0);

    const { showNotification } = useNotification();

    useEffect(() => {
        loadData();
    }, [paginationModel.page, paginationModel.pageSize, filters, searchText]);

    const loadData = async () => {
        setLoading(true);
        try {
            const record = page.getRecord();
            if (record) {
                // Apply filters
                Object.entries(filters).forEach(([field, value]) => {
                    record.setFilter(`${field} = '${value}'`);
                });

                // Apply search
                if (searchText) {
                    record.setFilter(`Name LIKE '%${searchText}%' OR No LIKE '%${searchText}%'`);
                }

                // Apply pagination
                const result = await record.paginate(
                    paginationModel.page + 1,
                    paginationModel.pageSize
                );

                setRecords(result.data);
                setRowCount(result.total);
            }
        } catch (error) {
            showNotification(`Failed to load data: ${error.message}`, 'error');
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async () => {
        if (selectedRows.length === 0) return;

        if (window.confirm(`Delete ${selectedRows.length} selected record(s)?`)) {
            try {
                const record = page.getRecord();
                if (record) {
                    for (const id of selectedRows) {
                        await record.find(id);
                        await record.delete();
                    }
                    showNotification(`${selectedRows.length} record(s) deleted`, 'success');
                    setSelectedRows([]);
                    loadData();
                    onDelete?.(selectedRows);
                }
            } catch (error) {
                showNotification(`Delete failed: ${error.message}`, 'error');
            }
        }
    };

    const metadata = page.getMetadata();
    const layout = metadata.layout;
    const columns = layout.areas[0]?.groups[0]?.fields || [];

    // Generate DataGrid columns
    const gridColumns: GridColDef[] = columns
        .filter(col => visibleColumns[col.name] !== false)
        .map(col => ({
            field: col.source,
            headerName: col.caption || col.name,
            width: col.properties?.width || 150,
            editable: col.properties?.editable || false,
            type: col.properties?.dataType === 'decimal' ? 'number' : 'string',
            valueFormatter: (params) => {
                if (col.properties?.dataType === 'date' && params.value) {
                    return new Date(params.value).toLocaleDateString();
                }
                return params.value;
            }
        }));

    return (
        <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            {/* Header Toolbar */}
            <AppBar position="static" color="default" elevation={1}>
                <Toolbar>
                    <Typography variant="h6" sx={{ flexGrow: 1 }}>
                        {metadata.caption || metadata.name}
                        <Chip
                            label={`${rowCount} records`}
                            size="small"
                            sx={{ ml: 2 }}
                        />
                    </Typography>

                    <TextField
                        size="small"
                        placeholder="Search..."
                        value={searchText}
                        onChange={(e) => setSearchText(e.target.value)}
                        InputProps={{
                            startAdornment: (
                                <InputAdornment position="start">
                                    <SearchIcon />
                                </InputAdornment>
                            )
                        }}
                        sx={{ width: 300, mr: 2 }}
                    />

                    <Badge color="primary" badgeContent={Object.keys(filters).length}>
                        <Button
                            startIcon={<FilterIcon />}
                            onClick={(e) => setFilterAnchorEl(e.currentTarget)}
                            sx={{ mr: 1 }}
                        >
                            Filter
                        </Button>
                    </Badge>

                    <Button
                        startIcon={<ViewColumnIcon />}
                        onClick={(e) => setColumnAnchorEl(e.currentTarget)}
                        sx={{ mr: 1 }}
                    >
                        Columns
                    </Button>

                    <Button
                        startIcon={<AddIcon />}
                        variant="contained"
                        color="primary"
                        onClick={() => {
                            page.createNewRecord();
                            onNew?.();
                        }}
                        sx={{ mr: 1 }}
                    >
                        New
                    </Button>

                    <Button
                        startIcon={<DeleteIcon />}
                        color="error"
                        disabled={selectedRows.length === 0}
                        onClick={handleDelete}
                        sx={{ mr: 1 }}
                    >
                        Delete
                    </Button>

                    <Button
                        startIcon={<RefreshIcon />}
                        onClick={loadData}
                        sx={{ mr: 1 }}
                    />

                    <Menu
                        anchorEl={filterAnchorEl}
                        open={Boolean(filterAnchorEl)}
                        onClose={() => setFilterAnchorEl(null)}
                    >
                        <Box sx={{ p: 2, width: 300 }}>
                            <Typography variant="subtitle2" gutterBottom>
                                Quick Filters
                            </Typography>
                            <FormControlLabel
                                control={<Checkbox />}
                                label="Active Only"
                                onChange={(e, checked) => {
                                    if (checked) {
                                        setFilters({ ...filters, Status: 'Active' });
                                    } else {
                                        const { Status, ...rest } = filters;
                                        setFilters(rest);
                                    }
                                }}
                            />
                            <Divider sx={{ my: 1 }} />
                            <Button
                                fullWidth
                                size="small"
                                onClick={() => setFilters({})}
                            >
                                Clear Filters
                            </Button>
                        </Box>
                    </Menu>

                    <Menu
                        anchorEl={columnAnchorEl}
                        open={Boolean(columnAnchorEl)}
                        onClose={() => setColumnAnchorEl(null)}
                    >
                        <Box sx={{ p: 2, width: 250 }}>
                            <Typography variant="subtitle2" gutterBottom>
                                Visible Columns
                            </Typography>
                            {columns.map((col) => (
                                <FormControlLabel
                                    key={col.name}
                                    control={
                                        <Checkbox
                                            checked={visibleColumns[col.name] !== false}
                                            onChange={(e) => setVisibleColumns({
                                                ...visibleColumns,
                                                [col.name]: e.target.checked
                                            })}
                                        />
                                    }
                                    label={col.caption || col.name}
                                />
                            ))}
                            <Divider sx={{ my: 1 }} />
                            <Button
                                fullWidth
                                size="small"
                                onClick={() => {
                                    const all: Record<string, boolean> = {};
                                    columns.forEach(col => all[col.name] = true);
                                    setVisibleColumns(all);
                                }}
                            >
                                Reset
                            </Button>
                        </Box>
                    </Menu>

                    <IconButton onClick={onExport}>
                        <DownloadIcon />
                    </IconButton>
                    <IconButton onClick={onImport}>
                        <UploadIcon />
                    </IconButton>
                    <IconButton>
                        <MoreVertIcon />
                    </IconButton>
                </Toolbar>
            </AppBar>

            {/* Data Grid */}
            <Box sx={{ flexGrow: 1, p: 2 }}>
                <Paper sx={{ height: '100%', width: '100%' }}>
                    <DataGrid
                        rows={records}
                        columns={gridColumns}
                        rowCount={rowCount}
                        loading={loading}
                        pageSizeOptions={[25, 50, 100]}
                        paginationModel={paginationModel}
                        paginationMode="server"
                        onPaginationModelChange={setPaginationModel}
                        checkboxSelection
                        onRowSelectionModelChange={(ids) => setSelectedRows(ids as string[])}
                        rowSelectionModel={selectedRows}
                        onRowDoubleClick={(params) => {
                            onEdit?.(params.id as string);
                        }}
                        slots={{ toolbar: GridToolbar }}
                        slotProps={{
                            toolbar: {
                                showQuickFilter: true,
                                quickFilterProps: { debounceMs: 500 }
                            }
                        }}
                        sx={{
                            '& .MuiDataGrid-cell:focus': {
                                outline: 'none'
                            }
                        }}
                    />
                </Paper>
            </Box>
        </Box>
    );
};