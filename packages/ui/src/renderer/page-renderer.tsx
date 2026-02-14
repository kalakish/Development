import React from 'react';
import ReactDOM from 'react-dom';
import {
    Box,
    Card,
    Grid,
    TextField,
    Button,
    Checkbox,
    Select,
    MenuItem,
    FormControl,
    FormLabel,
    FormHelperText,
    InputLabel,
    Paper,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    IconButton,
    Typography
} from '@mui/material';
import { DatePicker } from '@mui/x-date-pickers';
import { NovaPage, PageType, PageState } from './page';
import { PageControl, ControlType } from './control';

export class PageRenderer {
    private container: HTMLElement;

    constructor(containerId: string) {
        const container = document.getElementById(containerId);
        if (!container) {
            throw new Error(`Container element '${containerId}' not found`);
        }
        this.container = container;
    }

    async renderPage(page: NovaPage): Promise<void> {
        const component = this.createPageComponent(page);
        ReactDOM.render(component, this.container);
    }

    private createPageComponent(page: NovaPage): React.ReactElement {
        switch (page.getMetadata().pageType) {
            case PageType.Card:
                return <CardPage page={page} />;
            case PageType.List:
                return <ListPage page={page} />;
            case PageType.Document:
                return <DocumentPage page={page} />;
            case PageType.RoleCenter:
                return <RoleCenterPage page={page} />;
            default:
                return <StandardPage page={page} />;
        }
    }

    destroy(): void {
        ReactDOM.unmountComponentAtNode(this.container);
    }
}

// Card Page Component
const CardPage: React.FC<{ page: NovaPage }> = ({ page }) => {
    const [state, setState] = React.useState<PageState>(page.getState());
    const [controls, setControls] = React.useState<Map<string, PageControl>>(new Map());

    React.useEffect(() => {
        // Subscribe to page events
        const onStateChange = () => setState(page.getState());
        const onControlsChange = () => setControls(page['controls']);
        
        page.on('stateChanged', onStateChange);
        page.on('controlsChanged', onControlsChange);
        
        return () => {
            page.off('stateChanged', onStateChange);
            page.off('controlsChanged', onControlsChange);
        };
    }, [page]);

    const metadata = page.getMetadata();
    const layout = metadata.layout;

    const handleFieldChange = (controlId: string, value: any) => {
        const control = controls.get(controlId);
        if (control) {
            control.setValue(value);
        }
    };

    return (
        <Box sx={{ p: 3 }}>
            {/* Toolbar */}
            <Paper elevation={1} sx={{ mb: 3, p: 2 }}>
                <Grid container spacing={2} alignItems="center">
                    <Grid item xs>
                        <Typography variant="h6">{metadata.name}</Typography>
                    </Grid>
                    <Grid item>
                        {state.mode === 'view' ? (
                            <>
                                <Button 
                                    variant="contained" 
                                    color="primary"
                                    onClick={() => page.edit()}
                                    sx={{ mr: 1 }}
                                >
                                    Edit
                                </Button>
                                <Button 
                                    variant="outlined" 
                                    color="secondary"
                                    onClick={() => page.delete()}
                                >
                                    Delete
                                </Button>
                            </>
                        ) : (
                            <>
                                <Button 
                                    variant="contained" 
                                    color="primary"
                                    onClick={() => page.save()}
                                    disabled={state.validating}
                                    sx={{ mr: 1 }}
                                >
                                    Save
                                </Button>
                                <Button 
                                    variant="outlined"
                                    onClick={() => page.cancel()}
                                >
                                    Cancel
                                </Button>
                            </>
                        )}
                    </Grid>
                </Grid>
            </Paper>

            {/* Content */}
            <Card sx={{ p: 3 }}>
                {layout.areas.map((area, areaIndex) => (
                    <Box key={areaIndex}>
                        {area.groups.map((group, groupIndex) => (
                            <Box key={groupIndex} sx={{ mb: 3 }}>
                                <Typography variant="subtitle1" gutterBottom>
                                    {group.name}
                                </Typography>
                                <Grid container spacing={3}>
                                    {group.fields.map((field, fieldIndex) => {
                                        const control = controls.get(field.name);
                                        if (!control) return null;
                                        
                                        return (
                                            <Grid item xs={12} md={6} key={fieldIndex}>
                                                <ControlRenderer 
                                                    control={control}
                                                    onChange={(value) => handleFieldChange(field.name, value)}
                                                    disabled={state.mode === 'view'}
                                                />
                                            </Grid>
                                        );
                                    })}
                                </Grid>
                            </Box>
                        ))}
                    </Box>
                ))}
            </Card>

            {/* Actions */}
            {metadata.actions && metadata.actions.length > 0 && (
                <Box sx={{ mt: 3 }}>
                    <Grid container spacing={2}>
                        {metadata.actions.map((action, index) => (
                            <Grid item key={index}>
                                <Button
                                    variant="outlined"
                                    onClick={() => page.executeAction(action.id)}
                                >
                                    {action.name}
                                </Button>
                            </Grid>
                        ))}
                    </Grid>
                </Box>
            )}
        </Box>
    );
};

// List Page Component
const ListPage: React.FC<{ page: NovaPage }> = ({ page }) => {
    const [state, setState] = React.useState<PageState>(page.getState());
    const [records, setRecords] = React.useState<any[]>([]);

    React.useEffect(() => {
        loadRecords();
        
        const onStateChange = () => setState(page.getState());
        page.on('stateChanged', onStateChange);
        
        return () => {
            page.off('stateChanged', onStateChange);
        };
    }, [page]);

    const loadRecords = async () => {
        const record = page.getRecord();
        if (record) {
            const data = await record.findSet();
            setRecords(data);
        }
    };

    const metadata = page.getMetadata();
    const layout = metadata.layout;

    // Get columns from first area group
    const columns = layout.areas[0]?.groups[0]?.fields || [];

    return (
        <Box sx={{ p: 3 }}>
            {/* Toolbar */}
            <Paper elevation={1} sx={{ mb: 3, p: 2 }}>
                <Grid container spacing={2} alignItems="center">
                    <Grid item xs>
                        <Typography variant="h6">{metadata.name}</Typography>
                    </Grid>
                    <Grid item>
                        <Button 
                            variant="contained" 
                            color="primary"
                            onClick={() => page.executeAction('new')}
                            sx={{ mr: 1 }}
                        >
                            New
                        </Button>
                        <Button 
                            variant="outlined"
                            onClick={() => page.refresh()}
                        >
                            Refresh
                        </Button>
                    </Grid>
                </Grid>
            </Paper>

            {/* Table */}
            <TableContainer component={Paper}>
                <Table>
                    <TableHead>
                        <TableRow>
                            {columns.map((column, index) => (
                                <TableCell key={index}>{column.name}</TableCell>
                            ))}
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {records.map((record, rowIndex) => (
                            <TableRow 
                                key={rowIndex}
                                hover
                                onClick={() => page.open(record.SystemId)}
                                sx={{ cursor: 'pointer' }}
                            >
                                {columns.map((column, colIndex) => (
                                    <TableCell key={colIndex}>
                                        {record[column.source]}
                                    </TableCell>
                                ))}
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </TableContainer>
        </Box>
    );
};

// Control Renderer
const ControlRenderer: React.FC<{ 
    control: PageControl; 
    onChange: (value: any) => void;
    disabled?: boolean;
}> = ({ control, onChange, disabled }) => {
    const [value, setValue] = React.useState(control.getValue());
    const [errors, setErrors] = React.useState<string[]>([]);

    React.useEffect(() => {
        const onValueChanged = (newValue: any) => {
            setValue(newValue);
            onChange(newValue);
        };
        
        const onValidated = (isValid: boolean, validationErrors: string[]) => {
            setErrors(validationErrors);
        };
        
        control.on('valueChanged', onValueChanged);
        control.on('validated', onValidated);
        
        return () => {
            control.off('valueChanged', onValueChanged);
            control.off('validated', onValidated);
        };
    }, [control, onChange]);

    const handleBlur = async () => {
        await control.validate();
    };

    const renderControl = () => {
        switch (control.type) {
            case ControlType.TextBox:
                return (
                    <TextField
                        fullWidth
                        label={control.name}
                        value={value || ''}
                        onChange={(e) => control.setValue(e.target.value)}
                        onBlur={handleBlur}
                        error={errors.length > 0}
                        helperText={errors[0]}
                        disabled={disabled || !control.isEnabled()}
                        required={control.isRequired()}
                        multiline={(control as any).multiline}
                        rows={(control as any).multiline ? 4 : 1}
                    />
                );
                
            case ControlType.NumberBox:
                return (
                    <TextField
                        fullWidth
                        type="number"
                        label={control.name}
                        value={value ?? ''}
                        onChange={(e) => control.setValue(e.target.value)}
                        onBlur={handleBlur}
                        error={errors.length > 0}
                        helperText={errors[0]}
                        disabled={disabled || !control.isEnabled()}
                        required={control.isRequired()}
                        inputProps={{
                            min: (control as any).min,
                            max: (control as any).max,
                            step: (control as any).decimals ? 0.1 : 1
                        }}
                    />
                );
                
            case ControlType.CheckBox:
                return (
                    <FormControl>
                        <FormLabel>{control.name}</FormLabel>
                        <Checkbox
                            checked={value === true}
                            onChange={(e) => control.setValue(e.target.checked)}
                            disabled={disabled || !control.isEnabled()}
                        />
                    </FormControl>
                );
                
            case ControlType.ComboBox:
                return (
                    <FormControl fullWidth error={errors.length > 0}>
                        <InputLabel>{control.name}</InputLabel>
                        <Select
                            value={value || ''}
                            onChange={(e) => control.setValue(e.target.value)}
                            onBlur={handleBlur}
                            disabled={disabled || !control.isEnabled()}
                            label={control.name}
                        >
                            {(control as any).options.map((opt: any, index: number) => (
                                <MenuItem key={index} value={opt.value}>
                                    {opt.label}
                                </MenuItem>
                            ))}
                        </Select>
                        {errors.length > 0 && (
                            <FormHelperText>{errors[0]}</FormHelperText>
                        )}
                    </FormControl>
                );
                
            case ControlType.DatePicker:
                return (
                    <DatePicker
                        label={control.name}
                        value={value}
                        onChange={(date) => control.setValue(date)}
                        disabled={disabled || !control.isEnabled()}
                        slotProps={{
                            textField: {
                                fullWidth: true,
                                error: errors.length > 0,
                                helperText: errors[0],
                                onBlur: handleBlur,
                                required: control.isRequired()
                            }
                        }}
                    />
                );
                
            default:
                return null;
        }
    };

    return renderControl();
};