import React, { useState, useEffect } from 'react';
import {
    Box,
    Card,
    Grid,
    Typography,
    TextField,
    Button,
    Divider,
    IconButton,
    Toolbar,
    AppBar,
    Paper,
    Chip,
    Alert,
    Skeleton,
    Tab,
    Tabs
} from '@mui/material';
import {
    Save as SaveIcon,
    Cancel as CancelIcon,
    Edit as EditIcon,
    Delete as DeleteIcon,
    Refresh as RefreshIcon,
    History as HistoryIcon,
    AttachFile as AttachFileIcon,
    Comment as CommentIcon
} from '@mui/icons-material';
import { NovaPage, PageMode, PageState } from '../page';
import { PageControl } from '../control';
import { useNotification } from '../../hooks/use-notification';

interface CardPageProps {
    page: NovaPage;
    onSave?: () => void;
    onCancel?: () => void;
    onEdit?: () => void;
    onDelete?: () => void;
}

export const CardPage: React.FC<CardPageProps> = ({
    page,
    onSave,
    onCancel,
    onEdit,
    onDelete
}) => {
    const [state, setState] = useState<PageState>(page.getState());
    const [controls, setControls] = useState<Map<string, PageControl>>(new Map());
    const [activeTab, setActiveTab] = useState(0);
    const [loading, setLoading] = useState(true);
    const { showNotification } = useNotification();

    useEffect(() => {
        const initialize = async () => {
            await page.initialize();
            setControls(page['controls']);
            setLoading(false);
        };

        initialize();

        const onStateChange = () => setState(page.getState());
        const onControlsChange = () => setControls(new Map(page['controls']));

        page.on('stateChanged', onStateChange);
        page.on('controlsChanged', onControlsChange);

        return () => {
            page.off('stateChanged', onStateChange);
            page.off('controlsChanged', onControlsChange);
        };
    }, [page]);

    const handleSave = async () => {
        try {
            const success = await page.save();
            if (success) {
                showNotification('Record saved successfully', 'success');
                onSave?.();
            }
        } catch (error) {
            showNotification(`Save failed: ${error.message}`, 'error');
        }
    };

    const handleDelete = async () => {
        if (window.confirm('Are you sure you want to delete this record?')) {
            try {
                const success = await page.delete();
                if (success) {
                    showNotification('Record deleted successfully', 'success');
                    onDelete?.();
                }
            } catch (error) {
                showNotification(`Delete failed: ${error.message}`, 'error');
            }
        }
    };

    if (loading) {
        return (
            <Box sx={{ p: 3 }}>
                <Skeleton variant="rectangular" height={60} sx={{ mb: 2 }} />
                <Skeleton variant="rectangular" height={400} />
            </Box>
        );
    }

    const metadata = page.getMetadata();
    const layout = metadata.layout;
    const isEditable = page.isEditable();
    const isDirty = page.isDirty();

    return (
        <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            {/* Header Toolbar */}
            <AppBar position="static" color="default" elevation={1}>
                <Toolbar>
                    <Typography variant="h6" sx={{ flexGrow: 1 }}>
                        {metadata.caption || metadata.name}
                        {isDirty && (
                            <Chip
                                label="Unsaved"
                                size="small"
                                color="warning"
                                sx={{ ml: 2 }}
                            />
                        )}
                    </Typography>

                    {state.mode === PageMode.View ? (
                        <>
                            <Button
                                startIcon={<EditIcon />}
                                onClick={() => {
                                    page.edit();
                                    onEdit?.();
                                }}
                                sx={{ mr: 1 }}
                            >
                                Edit
                            </Button>
                            <Button
                                startIcon={<DeleteIcon />}
                                color="error"
                                onClick={handleDelete}
                                sx={{ mr: 1 }}
                            >
                                Delete
                            </Button>
                            <IconButton onClick={() => page.refresh()}>
                                <RefreshIcon />
                            </IconButton>
                        </>
                    ) : (
                        <>
                            <Button
                                startIcon={<SaveIcon />}
                                variant="contained"
                                color="primary"
                                onClick={handleSave}
                                disabled={!isDirty || state.validating}
                                sx={{ mr: 1 }}
                            >
                                Save
                            </Button>
                            <Button
                                startIcon={<CancelIcon />}
                                onClick={() => {
                                    page.cancel();
                                    onCancel?.();
                                }}
                                sx={{ mr: 1 }}
                            >
                                Cancel
                            </Button>
                        </>
                    )}
                </Toolbar>
            </AppBar>

            {/* Status Bar */}
            {state.error && (
                <Alert severity="error" sx={{ m: 2 }}>
                    {state.error}
                </Alert>
            )}

            {/* Main Content */}
            <Box sx={{ flexGrow: 1, overflow: 'auto', p: 3 }}>
                <Card sx={{ p: 3 }}>
                    {/* Tabs */}
                    {layout.areas.length > 1 && (
                        <Tabs
                            value={activeTab}
                            onChange={(_, v) => setActiveTab(v)}
                            sx={{ mb: 3, borderBottom: 1, borderColor: 'divider' }}
                        >
                            {layout.areas.map((area, index) => (
                                <Tab key={index} label={area.type} />
                            ))}
                        </Tabs>
                    )}

                    {/* Content Areas */}
                    {layout.areas.map((area, areaIndex) => (
                        <Box
                            key={areaIndex}
                            sx={{ display: activeTab === areaIndex ? 'block' : 'none' }}
                        >
                            {area.groups.map((group, groupIndex) => (
                                <Box key={groupIndex} sx={{ mb: 4 }}>
                                    <Typography
                                        variant="subtitle1"
                                        sx={{
                                            fontWeight: 600,
                                            mb: 2,
                                            pb: 1,
                                            borderBottom: '2px solid',
                                            borderColor: 'primary.main'
                                        }}
                                    >
                                        {group.caption || group.name}
                                    </Typography>

                                    <Grid container spacing={3}>
                                        {group.fields.map((field, fieldIndex) => {
                                            const control = controls.get(field.name);
                                            if (!control) return null;

                                            return (
                                                <Grid
                                                    item
                                                    xs={12}
                                                    md={field.properties?.colSpan || 6}
                                                    key={fieldIndex}
                                                >
                                                    <ControlRenderer
                                                        control={control}
                                                        disabled={state.mode === PageMode.View}
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

                {/* Attachments Section */}
                <Card sx={{ mt: 3, p: 3 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                        <AttachFileIcon sx={{ mr: 1, color: 'primary.main' }} />
                        <Typography variant="h6">Attachments</Typography>
                        <Button size="small" sx={{ ml: 'auto' }}>
                            Upload
                        </Button>
                    </Box>
                    <Divider sx={{ mb: 2 }} />
                    <Typography variant="body2" color="textSecondary">
                        No attachments
                    </Typography>
                </Card>

                {/* Comments Section */}
                <Card sx={{ mt: 3, p: 3 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                        <CommentIcon sx={{ mr: 1, color: 'primary.main' }} />
                        <Typography variant="h6">Comments</Typography>
                    </Box>
                    <Divider sx={{ mb: 2 }} />
                    <TextField
                        fullWidth
                        multiline
                        rows={3}
                        placeholder="Add a comment..."
                        variant="outlined"
                        size="small"
                    />
                    <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 2 }}>
                        <Button variant="contained" size="small">
                            Post Comment
                        </Button>
                    </Box>
                </Card>
            </Box>

            {/* History Timeline */}
            <Paper
                elevation={3}
                sx={{
                    position: 'fixed',
                    right: 20,
                    top: 100,
                    width: 280,
                    p: 2,
                    display: state.mode === PageMode.View ? 'block' : 'none'
                }}
            >
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                    <HistoryIcon sx={{ mr: 1, fontSize: 20 }} />
                    <Typography variant="subtitle2">History</Typography>
                </Box>
                <Divider sx={{ mb: 2 }} />
                <Typography variant="caption" color="textSecondary">
                    Created: {new Date().toLocaleDateString()}
                </Typography>
                <Typography variant="caption" display="block" color="textSecondary">
                    Modified: {new Date().toLocaleDateString()}
                </Typography>
            </Paper>
        </Box>
    );
};

// Import from control renderer
import { ControlRenderer } from '../renderer/control-renderer';