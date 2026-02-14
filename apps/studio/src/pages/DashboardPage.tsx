import React, { useState, useEffect } from 'react';
import {
    Box,
    Grid,
    Paper,
    Typography,
    Card,
    CardContent,
    CardHeader,
    IconButton,
    Button,
    LinearProgress,
    Chip,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Avatar,
    List,
    ListItem,
    ListItemAvatar,
    ListItemText,
    ListItemSecondaryAction,
    Divider,
    Tooltip,
    useTheme
} from '@mui/material';
import {
    Refresh as RefreshIcon,
    MoreVert as MoreVertIcon,
    Code as CodeIcon,
    TableChart as TableIcon,
    Description as PageIcon,
    Build as CodeunitIcon,
    Assessment as ReportIcon,
    CompareArrows as XmlIcon,
    Search as QueryIcon,
    Label as EnumIcon,
    CheckCircle as SuccessIcon,
    Error as ErrorIcon,
    Warning as WarningIcon,
    Schedule as ScheduleIcon,
    TrendingUp as TrendingUpIcon,
    Storage as StorageIcon,
    Security as SecurityIcon,
    People as PeopleIcon
} from '@mui/icons-material';
import { useStudio } from '../hooks/useStudio';
import { useNotification } from '../hooks/useNotification';
import { useNavigate } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

export const DashboardPage: React.FC = () => {
    const theme = useTheme();
    const navigate = useNavigate();
    const { showNotification } = useNotification();
    const { getProjectStats, getRecentActivities, getSystemHealth } = useStudio();

    const [stats, setStats] = useState<any>(null);
    const [activities, setActivities] = useState<any[]>([]);
    const [health, setHealth] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    useEffect(() => {
        loadDashboardData();
    }, []);

    const loadDashboardData = async () => {
        setLoading(true);
        try {
            const [projectStats, recentActivities, systemHealth] = await Promise.all([
                getProjectStats(),
                getRecentActivities(10),
                getSystemHealth()
            ]);
            
            setStats(projectStats);
            setActivities(recentActivities);
            setHealth(systemHealth);
        } catch (error) {
            showNotification('Failed to load dashboard data', 'error');
        } finally {
            setLoading(false);
        }
    };

    const handleRefresh = async () => {
        setRefreshing(true);
        await loadDashboardData();
        setRefreshing(false);
        showNotification('Dashboard refreshed', 'success');
    };

    const getObjectIcon = (type: string) => {
        switch (type) {
            case 'Table': return <TableIcon />;
            case 'Page': return <PageIcon />;
            case 'Codeunit': return <CodeunitIcon />;
            case 'Report': return <ReportIcon />;
            case 'XMLPort': return <XmlIcon />;
            case 'Query': return <QueryIcon />;
            case 'Enum': return <EnumIcon />;
            default: return <CodeIcon />;
        }
    };

    const getActivityColor = (type: string) => {
        switch (type) {
            case 'success': return theme.palette.success.main;
            case 'error': return theme.palette.error.main;
            case 'warning': return theme.palette.warning.main;
            default: return theme.palette.info.main;
        }
    };

    const getActivityIcon = (type: string) => {
        switch (type) {
            case 'success': return <SuccessIcon />;
            case 'error': return <ErrorIcon />;
            case 'warning': return <WarningIcon />;
            default: return <ScheduleIcon />;
        }
    };

    const objectDistributionData = stats ? [
        { name: 'Tables', value: stats.objects.tables, color: '#0078D4' },
        { name: 'Pages', value: stats.objects.pages, color: '#107C10' },
        { name: 'Codeunits', value: stats.objects.codeunits, color: '#B33E5C' },
        { name: 'Reports', value: stats.objects.reports, color: '#FF8C00' },
        { name: 'XMLPorts', value: stats.objects.xmlports, color: '#8661C5' },
        { name: 'Queries', value: stats.objects.queries, color: '#00B7C3' },
        { name: 'Enums', value: stats.objects.enums, color: '#F7630C' }
    ] : [];

    const recentBuildData = stats ? [
        { name: 'Mon', builds: 3, errors: 1 },
        { name: 'Tue', builds: 5, errors: 0 },
        { name: 'Wed', builds: 2, errors: 1 },
        { name: 'Thu', builds: 7, errors: 2 },
        { name: 'Fri', builds: 4, errors: 0 },
        { name: 'Sat', builds: 1, errors: 0 },
        { name: 'Sun', builds: 0, errors: 0 }
    ] : [];

    if (loading) {
        return (
            <Box sx={{ width: '100%', mt: 4 }}>
                <LinearProgress />
                <Typography variant="body2" color="text.secondary" align="center" sx={{ mt: 2 }}>
                    Loading dashboard...
                </Typography>
            </Box>
        );
    }

    return (
        <Box sx={{ p: 3 }}>
            {/* Header */}
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
                <Typography variant="h4" component="h1" fontWeight="500">
                    Dashboard
                </Typography>
                <Box>
                    <Tooltip title="Refresh">
                        <IconButton 
                            onClick={handleRefresh} 
                            disabled={refreshing}
                            sx={{ mr: 1 }}
                        >
                            <RefreshIcon />
                        </IconButton>
                    </Tooltip>
                    <Button 
                        variant="contained" 
                        startIcon={<CodeIcon />}
                        onClick={() => navigate('/designer/new')}
                    >
                        New Object
                    </Button>
                </Box>
            </Box>

            {/* Quick Stats */}
            <Grid container spacing={3} sx={{ mb: 4 }}>
                <Grid item xs={12} sm={6} md={3}>
                    <Card elevation={0} sx={{ bgcolor: theme.palette.primary.light, color: 'white' }}>
                        <CardContent>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                <Box>
                                    <Typography variant="h3" component="div" fontWeight="600">
                                        {stats?.objects?.total || 0}
                                    </Typography>
                                    <Typography variant="body2" sx={{ opacity: 0.9 }}>
                                        Total Objects
                                    </Typography>
                                </Box>
                                <CodeIcon sx={{ fontSize: 48, opacity: 0.7 }} />
                            </Box>
                        </CardContent>
                    </Card>
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                    <Card elevation={0} sx={{ bgcolor: theme.palette.success.light, color: 'white' }}>
                        <CardContent>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                <Box>
                                    <Typography variant="h3" component="div" fontWeight="600">
                                        {stats?.compilations?.successful || 0}
                                    </Typography>
                                    <Typography variant="body2" sx={{ opacity: 0.9 }}>
                                        Successful Builds
                                    </Typography>
                                </Box>
                                <SuccessIcon sx={{ fontSize: 48, opacity: 0.7 }} />
                            </Box>
                        </CardContent>
                    </Card>
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                    <Card elevation={0} sx={{ bgcolor: theme.palette.warning.light, color: 'white' }}>
                        <CardContent>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                <Box>
                                    <Typography variant="h3" component="div" fontWeight="600">
                                        {stats?.deployments?.active || 0}
                                    </Typography>
                                    <Typography variant="body2" sx={{ opacity: 0.9 }}>
                                        Active Deployments
                                    </Typography>
                                </Box>
                                <TrendingUpIcon sx={{ fontSize: 48, opacity: 0.7 }} />
                            </Box>
                        </CardContent>
                    </Card>
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                    <Card elevation={0} sx={{ bgcolor: theme.palette.info.light, color: 'white' }}>
                        <CardContent>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                <Box>
                                    <Typography variant="h3" component="div" fontWeight="600">
                                        {stats?.projects || 1}
                                    </Typography>
                                    <Typography variant="body2" sx={{ opacity: 0.9 }}>
                                        Active Projects
                                    </Typography>
                                </Box>
                                <StorageIcon sx={{ fontSize: 48, opacity: 0.7 }} />
                            </Box>
                        </CardContent>
                    </Card>
                </Grid>
            </Grid>

            <Grid container spacing={3}>
                {/* Object Distribution Chart */}
                <Grid item xs={12} md={6}>
                    <Card elevation={1}>
                        <CardHeader
                            title="Object Distribution"
                            subheader="By object type"
                            action={
                                <IconButton>
                                    <MoreVertIcon />
                                </IconButton>
                            }
                        />
                        <Divider />
                        <CardContent>
                            <ResponsiveContainer width="100%" height={300}>
                                <PieChart>
                                    <Pie
                                        data={objectDistributionData}
                                        cx="50%"
                                        cy="50%"
                                        labelLine={false}
                                        label={(entry) => `${entry.name}: ${entry.value}`}
                                        outerRadius={100}
                                        fill="#8884d8"
                                        dataKey="value"
                                    >
                                        {objectDistributionData.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={entry.color} />
                                        ))}
                                    </Pie>
                                    <RechartsTooltip />
                                </PieChart>
                            </ResponsiveContainer>
                        </CardContent>
                    </Card>
                </Grid>

                {/* Recent Build Activity */}
                <Grid item xs={12} md={6}>
                    <Card elevation={1}>
                        <CardHeader
                            title="Build Activity"
                            subheader="Last 7 days"
                            action={
                                <IconButton>
                                    <MoreVertIcon />
                                </IconButton>
                            }
                        />
                        <Divider />
                        <CardContent>
                            <ResponsiveContainer width="100%" height={300}>
                                <BarChart data={recentBuildData}>
                                    <CartesianGrid strokeDasharray="3 3" />
                                    <XAxis dataKey="name" />
                                    <YAxis />
                                    <RechartsTooltip />
                                    <Legend />
                                    <Bar dataKey="builds" fill={theme.palette.primary.main} />
                                    <Bar dataKey="errors" fill={theme.palette.error.main} />
                                </BarChart>
                            </ResponsiveContainer>
                        </CardContent>
                    </Card>
                </Grid>

                {/* Recent Activities */}
                <Grid item xs={12} md={6}>
                    <Card elevation={1}>
                        <CardHeader
                            title="Recent Activities"
                            subheader="Your latest actions"
                        />
                        <Divider />
                        <List sx={{ width: '100%', bgcolor: 'background.paper' }}>
                            {activities.length > 0 ? (
                                activities.map((activity, index) => (
                                    <React.Fragment key={activity.id}>
                                        <ListItem alignItems="flex-start">
                                            <ListItemAvatar>
                                                <Avatar sx={{ bgcolor: getActivityColor(activity.type) }}>
                                                    {getActivityIcon(activity.type)}
                                                </Avatar>
                                            </ListItemAvatar>
                                            <ListItemText
                                                primary={activity.message}
                                                secondary={
                                                    <Typography
                                                        component="span"
                                                        variant="body2"
                                                        color="text.secondary"
                                                    >
                                                        {activity.timestamp} • {activity.user}
                                                    </Typography>
                                                }
                                            />
                                            <ListItemSecondaryAction>
                                                <Chip 
                                                    label={activity.objectType} 
                                                    size="small" 
                                                    icon={getObjectIcon(activity.objectType)}
                                                />
                                            </ListItemSecondaryAction>
                                        </ListItem>
                                        {index < activities.length - 1 && <Divider variant="inset" component="li" />}
                                    </React.Fragment>
                                ))
                            ) : (
                                <ListItem>
                                    <ListItemText primary="No recent activities" />
                                </ListItem>
                            )}
                        </List>
                    </Card>
                </Grid>

                {/* System Health */}
                <Grid item xs={12} md={6}>
                    <Card elevation={1}>
                        <CardHeader
                            title="System Health"
                            subheader="Current status"
                        />
                        <Divider />
                        <CardContent>
                            <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                                <Box sx={{ position: 'relative', display: 'inline-flex', mr: 3 }}>
                                    <LinearProgress 
                                        variant="determinate" 
                                        value={health?.overall || 100} 
                                        sx={{ width: 100, height: 10, borderRadius: 5 }}
                                    />
                                </Box>
                                <Box>
                                    <Typography variant="h6" component="div">
                                        {health?.status || 'Healthy'}
                                    </Typography>
                                    <Typography variant="body2" color="text.secondary">
                                        Overall System Status
                                    </Typography>
                                </Box>
                            </Box>
                            <Divider sx={{ my: 2 }} />
                            <Grid container spacing={2}>
                                <Grid item xs={6}>
                                    <Box sx={{ display: 'flex', alignItems: 'center' }}>
                                        <StorageIcon sx={{ mr: 1, color: theme.palette.primary.main }} />
                                        <Box>
                                            <Typography variant="body2" color="text.secondary">
                                                Database
                                            </Typography>
                                            <Typography variant="body1">
                                                {health?.database || 'Connected'}
                                            </Typography>
                                        </Box>
                                    </Box>
                                </Grid>
                                <Grid item xs={6}>
                                    <Box sx={{ display: 'flex', alignItems: 'center' }}>
                                        <CodeIcon sx={{ mr: 1, color: theme.palette.success.main }} />
                                        <Box>
                                            <Typography variant="body2" color="text.secondary">
                                                Compiler
                                            </Typography>
                                            <Typography variant="body1">
                                                {health?.compiler || 'Ready'}
                                            </Typography>
                                        </Box>
                                    </Box>
                                </Grid>
                                <Grid item xs={6}>
                                    <Box sx={{ display: 'flex', alignItems: 'center' }}>
                                        <SecurityIcon sx={{ mr: 1, color: theme.palette.warning.main }} />
                                        <Box>
                                            <Typography variant="body2" color="text.secondary">
                                                Security
                                            </Typography>
                                            <Typography variant="body1">
                                                {health?.security || 'Active'}
                                            </Typography>
                                        </Box>
                                    </Box>
                                </Grid>
                                <Grid item xs={6}>
                                    <Box sx={{ display: 'flex', alignItems: 'center' }}>
                                        <PeopleIcon sx={{ mr: 1, color: theme.palette.info.main }} />
                                        <Box>
                                            <Typography variant="body2" color="text.secondary">
                                                Active Users
                                            </Typography>
                                            <Typography variant="body1">
                                                {health?.activeUsers || 0}
                                            </Typography>
                                        </Box>
                                    </Box>
                                </Grid>
                            </Grid>
                        </CardContent>
                    </Card>
                </Grid>
            </Grid>
        </Box>
    );
};