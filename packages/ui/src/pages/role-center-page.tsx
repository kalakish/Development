import React, { useState, useEffect } from 'react';
import {
    Box,
    Grid,
    Paper,
    Typography,
    AppBar,
    Toolbar,
    IconButton,
    Badge,
    Avatar,
    Menu,
    MenuItem,
    List,
    ListItem,
    ListItemIcon,
    ListItemText,
    ListItemButton,
    Divider
} from '@mui/material';
import {
    Dashboard as DashboardIcon,
    Notifications as NotificationsIcon,
    Settings as SettingsIcon,
    ExitToApp as LogoutIcon,
    Person as PersonIcon,
    Business as BusinessIcon,
    Assessment as AssessmentIcon,
    Receipt as ReceiptIcon,
    Inventory as InventoryIcon,
    AccountBalance as AccountBalanceIcon,
    TrendingUp as TrendingUpIcon,
    Warning as WarningIcon
} from '@mui/icons-material';
import { NovaPage } from '../page';
import { KPIWidget } from '../../dashboards/kpi-widget';
import { ChartWidget } from '../../visualizations/chart-widget';

interface RoleCenterPageProps {
    page: NovaPage;
    onNavigate?: (path: string) => void;
    onLogout?: () => void;
}

export const RoleCenterPage: React.FC<RoleCenterPageProps> = ({
    page,
    onNavigate,
    onLogout
}) => {
    const [userMenuAnchor, setUserMenuAnchor] = useState<null | HTMLElement>(null);
    const [notifications, setNotifications] = useState<any[]>([]);
    const [kpis, setKpis] = useState<any[]>([]);
    const [recentActivities, setRecentActivities] = useState<any[]>([]);

    useEffect(() => {
        loadDashboardData();
    }, []);

    const loadDashboardData = async () => {
        // Load KPI data
        setKpis([
            { title: 'Total Sales', value: 1250000, target: 1500000, format: 'currency' },
            { title: 'Open Orders', value: 245, target: 300, format: 'number' },
            { title: 'Overdue Invoices', value: 12, target: 0, format: 'number', trend: 'down' },
            { title: 'Customer Satisfaction', value: 4.8, target: 4.5, format: 'percent' }
        ]);

        // Load recent activities
        setRecentActivities([
            { id: 1, user: 'John Doe', action: 'Posted invoice INV-001', time: '5 minutes ago' },
            { id: 2, user: 'Jane Smith', action: 'Created customer ABC Corp', time: '15 minutes ago' },
            { id: 3, user: 'Bob Johnson', action: 'Approved purchase order PO-100', time: '1 hour ago' }
        ]);

        // Load notifications
        setNotifications([
            { id: 1, message: '5 orders pending approval', type: 'warning' },
            { id: 2, message: 'Credit limit exceeded for customer XYZ', type: 'error' },
            { id: 3, message: 'Daily sales report ready', type: 'info' }
        ]);
    };

    const menuItems = [
        { text: 'Dashboard', icon: <DashboardIcon />, path: '/dashboard' },
        { text: 'Sales Orders', icon: <ReceiptIcon />, path: '/sales-orders' },
        { text: 'Purchase Orders', icon: <InventoryIcon />, path: '/purchase-orders' },
        { text: 'Customers', icon: <BusinessIcon />, path: '/customers' },
        { text: 'Vendors', icon: <BusinessIcon />, path: '/vendors' },
        { text: 'Items', icon: <InventoryIcon />, path: '/items' },
        { text: 'Reports', icon: <AssessmentIcon />, path: '/reports' },
        { text: 'Financials', icon: <AccountBalanceIcon />, path: '/financials' }
    ];

    return (
        <Box sx={{ display: 'flex', height: '100vh' }}>
            {/* Sidebar Navigation */}
            <Paper
                sx={{
                    width: 280,
                    borderRadius: 0,
                    borderRight: '1px solid',
                    borderColor: 'divider'
                }}
            >
                <Box sx={{ p: 3 }}>
                    <Typography variant="h5" fontWeight="bold" color="primary">
                        NOVA ERP
                    </Typography>
                    <Typography variant="caption" color="textSecondary">
                        Role Center
                    </Typography>
                </Box>
                <Divider />
                <List>
                    {menuItems.map((item) => (
                        <ListItem key={item.text} disablePadding>
                            <ListItemButton onClick={() => onNavigate?.(item.path)}>
                                <ListItemIcon>{item.icon}</ListItemIcon>
                                <ListItemText primary={item.text} />
                            </ListItemButton>
                        </ListItem>
                    ))}
                </List>
            </Paper>

            {/* Main Content */}
            <Box sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
                {/* Top Bar */}
                <AppBar position="static" color="default" elevation={1}>
                    <Toolbar>
                        <Typography variant="h6" sx={{ flexGrow: 1 }}>
                            Welcome back, {page.getSession().user.displayName}
                        </Typography>

                        <IconButton
                            onClick={(e) => setUserMenuAnchor(e.currentTarget)}
                            color="inherit"
                        >
                            <Badge badgeContent={notifications.length} color="error">
                                <NotificationsIcon />
                            </Badge>
                        </IconButton>

                        <IconButton onClick={(e) => setUserMenuAnchor(e.currentTarget)}>
                            <Avatar sx={{ width: 32, height: 32 }}>
                                {page.getSession().user.displayName.charAt(0)}
                            </Avatar>
                        </IconButton>

                        <Menu
                            anchorEl={userMenuAnchor}
                            open={Boolean(userMenuAnchor)}
                            onClose={() => setUserMenuAnchor(null)}
                        >
                            <MenuItem>
                                <ListItemIcon>
                                    <PersonIcon fontSize="small" />
                                </ListItemIcon>
                                <ListItemText>My Profile</ListItemText>
                            </MenuItem>
                            <MenuItem>
                                <ListItemIcon>
                                    <SettingsIcon fontSize="small" />
                                </ListItemIcon>
                                <ListItemText>Settings</ListItemText>
                            </MenuItem>
                            <Divider />
                            <MenuItem onClick={onLogout}>
                                <ListItemIcon>
                                    <LogoutIcon fontSize="small" />
                                </ListItemIcon>
                                <ListItemText>Logout</ListItemText>
                            </MenuItem>
                        </Menu>
                    </Toolbar>
                </AppBar>

                {/* Dashboard Content */}
                <Box sx={{ flexGrow: 1, overflow: 'auto', p: 3 }}>
                    {/* KPI Row */}
                    <Grid container spacing={3} sx={{ mb: 4 }}>
                        {kpis.map((kpi, index) => (
                            <Grid item xs={12} sm={6} md={3} key={index}>
                                <KPIWidget
                                    title={kpi.title}
                                    value={kpi.value}
                                    target={kpi.target}
                                    format={kpi.format}
                                    trend={kpi.trend}
                                />
                            </Grid>
                        ))}
                    </Grid>

                    {/* Charts Row */}
                    <Grid container spacing={3} sx={{ mb: 4 }}>
                        <Grid item xs={12} md={8}>
                            <Paper sx={{ p: 2, height: 400 }}>
                                <Typography variant="h6" gutterBottom>
                                    Sales Trend
                                </Typography>
                                <ChartWidget
                                    type="line"
                                    data={[]}
                                    options={{
                                        xAxis: 'date',
                                        yAxis: 'amount'
                                    }}
                                />
                            </Paper>
                        </Grid>
                        <Grid item xs={12} md={4}>
                            <Paper sx={{ p: 2, height: 400 }}>
                                <Typography variant="h6" gutterBottom>
                                    Top Products
                                </Typography>
                                <ChartWidget
                                    type="pie"
                                    data={[]}
                                    options={{
                                        category: 'product',
                                        value: 'quantity'
                                    }}
                                />
                            </Paper>
                        </Grid>
                    </Grid>

                    {/* Recent Activity & Notifications */}
                    <Grid container spacing={3}>
                        <Grid item xs={12} md={6}>
                            <Paper sx={{ p: 2 }}>
                                <Typography variant="h6" gutterBottom>
                                    Recent Activity
                                </Typography>
                                <List>
                                    {recentActivities.map((activity) => (
                                        <React.Fragment key={activity.id}>
                                            <ListItem alignItems="flex-start">
                                                <ListItemText
                                                    primary={activity.action}
                                                    secondary={
                                                        <React.Fragment>
                                                            <Typography
                                                                component="span"
                                                                variant="body2"
                                                                color="textPrimary"
                                                            >
                                                                {activity.user}
                                                            </Typography>
                                                            {` — ${activity.time}`}
                                                        </React.Fragment>
                                                    }
                                                />
                                            </ListItem>
                                            <Divider component="li" />
                                        </React.Fragment>
                                    ))}
                                </List>
                            </Paper>
                        </Grid>
                        <Grid item xs={12} md={6}>
                            <Paper sx={{ p: 2 }}>
                                <Typography variant="h6" gutterBottom>
                                    Notifications
                                </Typography>
                                <List>
                                    {notifications.map((notification) => (
                                        <React.Fragment key={notification.id}>
                                            <ListItem>
                                                <ListItemIcon>
                                                    <WarningIcon color={notification.type as any} />
                                                </ListItemIcon>
                                                <ListItemText primary={notification.message} />
                                            </ListItem>
                                            <Divider component="li" />
                                        </React.Fragment>
                                    ))}
                                </List>
                            </Paper>
                        </Grid>
                    </Grid>
                </Box>
            </Box>
        </Box>
    );
};