import React, { useState, useEffect } from 'react';
import {
    Box,
    Grid,
    Paper,
    Typography,
    AppBar,
    Toolbar,
    Button,
    IconButton,
    Divider,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    TextField,
    Card,
    CardContent,
    Chip
} from '@mui/material';
import {
    Save as SaveIcon,
    Cancel as CancelIcon,
    Edit as EditIcon,
    Delete as DeleteIcon,
    Add as AddIcon,
    Print as PrintIcon,
    Email as EmailIcon,
    AttachMoney as AttachMoneyIcon
} from '@mui/icons-material';
import { NovaPage } from '../page';
import { DataGrid, GridColDef } from '@mui/x-data-grid';

interface DocumentPageProps {
    page: NovaPage;
    onPost?: () => void;
    onRelease?: () => void;
    onPrint?: () => void;
    onEmail?: () => void;
}

export const DocumentPage: React.FC<DocumentPageProps> = ({
    page,
    onPost,
    onRelease,
    onPrint,
    onEmail
}) => {
    const [header, setHeader] = useState<any>({});
    const [lines, setLines] = useState<any[]>([]);
    const [selectedLines, setSelectedLines] = useState<string[]>([]);
    const [totals, setTotals] = useState({
        amount: 0,
        discount: 0,
        tax: 0,
        total: 0
    });

    useEffect(() => {
        loadDocument();
    }, []);

    const loadDocument = async () => {
        const record = page.getRecord();
        if (record) {
            setHeader(record.getData());

            // Load document lines
            const lineRecord = page.getSession().createRecord('DocumentLine');
            const lines = await lineRecord.findSet(`DocumentNo = '${record.getField('No')}'`);
            setLines(lines);

            calculateTotals(lines);
        }
    };

    const calculateTotals = (lines: any[]) => {
        const amount = lines.reduce((sum, line) => sum + (line.Amount || 0), 0);
        const discount = lines.reduce((sum, line) => sum + (line.Discount || 0), 0);
        const tax = lines.reduce((sum, line) => sum + (line.Tax || 0), 0);
        
        setTotals({
            amount,
            discount,
            tax,
            total: amount - discount + tax
        });
    };

    const columns: GridColDef[] = [
        { field: 'LineNo', headerName: 'Line No', width: 100 },
        { field: 'ItemNo', headerName: 'Item No', width: 120 },
        { field: 'Description', headerName: 'Description', width: 250 },
        { field: 'Quantity', headerName: 'Quantity', width: 100, type: 'number' },
        { field: 'UnitPrice', headerName: 'Unit Price', width: 120, type: 'number' },
        { field: 'Discount', headerName: 'Discount %', width: 100, type: 'number' },
        { field: 'Amount', headerName: 'Amount', width: 120, type: 'number' },
        { field: 'Tax', headerName: 'Tax', width: 100, type: 'number' }
    ];

    return (
        <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            {/* Header Toolbar */}
            <AppBar position="static" color="default" elevation={1}>
                <Toolbar>
                    <Typography variant="h6" sx={{ flexGrow: 1 }}>
                        {page.getMetadata().caption || page.getMetadata().name}
                        <Chip
                            label={header.Status || 'Open'}
                            size="small"
                            color={header.Status === 'Posted' ? 'success' : 'warning'}
                            sx={{ ml: 2 }}
                        />
                    </Typography>

                    {header.Status !== 'Posted' ? (
                        <>
                            <Button
                                startIcon={<SaveIcon />}
                                variant="contained"
                                color="primary"
                                sx={{ mr: 1 }}
                            >
                                Save
                            </Button>
                            <Button
                                startIcon={<AttachMoneyIcon />}
                                variant="contained"
                                color="success"
                                onClick={onPost}
                                sx={{ mr: 1 }}
                            >
                                Post
                            </Button>
                            <Button
                                startIcon={<CancelIcon />}
                                sx={{ mr: 1 }}
                            >
                                Cancel
                            </Button>
                        </>
                    ) : (
                        <>
                            <Button
                                startIcon={<PrintIcon />}
                                onClick={onPrint}
                                sx={{ mr: 1 }}
                            >
                                Print
                            </Button>
                            <Button
                                startIcon={<EmailIcon />}
                                onClick={onEmail}
                                sx={{ mr: 1 }}
                            >
                                Email
                            </Button>
                        </>
                    )}
                </Toolbar>
            </AppBar>

            {/* Document Header */}
            <Paper sx={{ m: 2, p: 3 }}>
                <Grid container spacing={3}>
                    <Grid item xs={6}>
                        <Typography variant="subtitle2" color="textSecondary">
                            Document No.
                        </Typography>
                        <Typography variant="h6">{header.No}</Typography>
                    </Grid>
                    <Grid item xs={3}>
                        <Typography variant="subtitle2" color="textSecondary">
                            Date
                        </Typography>
                        <Typography>{new Date(header.Date).toLocaleDateString()}</Typography>
                    </Grid>
                    <Grid item xs={3}>
                        <Typography variant="subtitle2" color="textSecondary">
                            Due Date
                        </Typography>
                        <Typography>{new Date(header.DueDate).toLocaleDateString()}</Typography>
                    </Grid>
                    <Grid item xs={6}>
                        <Typography variant="subtitle2" color="textSecondary">
                            Customer/Vendor
                        </Typography>
                        <Typography variant="body1">{header.BuyFromName}</Typography>
                        <Typography variant="body2">{header.BuyFromAddress}</Typography>
                    </Grid>
                    <Grid item xs={3}>
                        <Typography variant="subtitle2" color="textSecondary">
                            Your Reference
                        </Typography>
                        <Typography>{header.YourReference}</Typography>
                    </Grid>
                    <Grid item xs={3}>
                        <Typography variant="subtitle2" color="textSecondary">
                            Shipment Date
                        </Typography>
                        <Typography>{new Date(header.ShipmentDate).toLocaleDateString()}</Typography>
                    </Grid>
                </Grid>
            </Paper>

            {/* Document Lines */}
            <Box sx={{ flexGrow: 1, m: 2 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
                    <Typography variant="h6">Lines</Typography>
                    <Button
                        startIcon={<AddIcon />}
                        variant="contained"
                        size="small"
                    >
                        Add Line
                    </Button>
                </Box>
                <Paper sx={{ height: 400 }}>
                    <DataGrid
                        rows={lines}
                        columns={columns}
                        pageSizeOptions={[25, 50]}
                        checkboxSelection
                        onRowSelectionModelChange={(ids) => setSelectedLines(ids as string[])}
                        getRowId={(row) => row.LineNo}
                        sx={{
                            '& .MuiDataGrid-cell:focus': {
                                outline: 'none'
                            }
                        }}
                    />
                </Paper>
            </Box>

            {/* Document Totals */}
            <Paper sx={{ m: 2, p: 2, display: 'flex', justifyContent: 'flex-end' }}>
                <Box sx={{ width: 300 }}>
                    <Grid container spacing={1}>
                        <Grid item xs={6}>
                            <Typography variant="body2" color="textSecondary">
                                Amount:
                            </Typography>
                        </Grid>
                        <Grid item xs={6}>
                            <Typography variant="body2" align="right">
                                {totals.amount.toFixed(2)}
                            </Typography>
                        </Grid>
                        <Grid item xs={6}>
                            <Typography variant="body2" color="textSecondary">
                                Discount:
                            </Typography>
                        </Grid>
                        <Grid item xs={6}>
                            <Typography variant="body2" align="right" color="error">
                                -{totals.discount.toFixed(2)}
                            </Typography>
                        </Grid>
                        <Grid item xs={6}>
                            <Typography variant="body2" color="textSecondary">
                                Tax:
                            </Typography>
                        </Grid>
                        <Grid item xs={6}>
                            <Typography variant="body2" align="right">
                                {totals.tax.toFixed(2)}
                            </Typography>
                        </Grid>
                        <Grid item xs={12}>
                            <Divider sx={{ my: 1 }} />
                        </Grid>
                        <Grid item xs={6}>
                            <Typography variant="subtitle1" fontWeight="bold">
                                Total:
                            </Typography>
                        </Grid>
                        <Grid item xs={6}>
                            <Typography variant="subtitle1" fontWeight="bold" align="right">
                                {totals.total.toFixed(2)}
                            </Typography>
                        </Grid>
                    </Grid>
                </Box>
            </Paper>
        </Box>
    );
};