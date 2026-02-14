import React, { useState } from 'react';
import {
    Box,
    Drawer,
    AppBar,
    Toolbar,
    Typography,
    IconButton,
    List,
    ListItem,
    ListItemIcon,
    ListItemText,
    ListItemButton,
    Divider,
    Avatar,
    Menu,
    MenuItem
} from '@mui/material';
import {
    Menu as MenuIcon,
    ChevronLeft as ChevronLeftIcon,
    Dashboard as DashboardIcon,
    Receipt as ReceiptIcon,
    People as PeopleIcon,
    Inventory as InventoryIcon,
    Assessment as AssessmentIcon,
    Settings as SettingsIcon,
    ExitToApp as LogoutIcon
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';

interface MainLayoutProps {
    children: React.ReactNode;
    title?: string;
    user?: any;
    onLogout?: () => void;
}

export const MainLayout: React.FC<MainLayoutProps> = ({
    children,
    title = 'NOVA Framework',
    user,
    onLogout
}) => {
    const [drawerOpen, setDrawerOpen] = useState(true);
    const [userMenuAnchor, setUserMenuAnchor] = useState<null | HTMLElement>(null);
    const navigate = useNavigate();

    const menuItems = [
        { text: 'Dashboard', icon: <DashboardIcon />, path: '/dashboard' },
        { text: 'Sales', icon: <ReceiptIcon />, path: '/sales' },
        { text: 'Customers', icon: <PeopleIcon />, path: '/customers' },
        { text: 'Inventory', icon: <InventoryIcon />, path: '/inventory' },
        { text: 'Reports', icon: <AssessmentIcon />, path: '/reports' },
        { text: 'Settings', icon: <SettingsIcon />, path: '/settings' }
    ];

    const drawerWidth = 280;

    return (
        <Box sx={{ display: 'flex', height: '100vh' }}>
            {/* App Bar */}
            <AppBar
                position="fixed"
                sx={{
                    zIndex: (theme) => theme.zIndex.drawer + 1,
                    transition: (theme) => theme.transitions.create(['width', 'margin'], {
                        easing: theme.transitions.easing.sharp,
                        duration: theme.transitions.duration.leavingScreen
                    }),
                    ...(drawerOpen && {
                        marginLeft: drawerWidth,
                        width: `calc(100% - ${drawerWidth}px)`,
                        transition: (theme) => theme.transitions.create(['width', 'margin'], {
                            easing: theme.transitions.easing.sharp,
                            duration: theme.transitions.duration.enteringScreen
                        })
                    })
                }}
            >
                <Toolbar>
                    <IconButton
                        color="inherit"
                        edge="start"
                        onClick={() => setDrawerOpen(!drawerOpen)}
                        sx={{ mr: 2 }}
                    >
                        <MenuIcon />
                    </IconButton>
                    <Typography variant="h6" noWrap sx={{ flexGrow: 1 }}>
                        {title}
                    </Typography>
                    {user && (
                        <>
                            <IconButton
                                onClick={(e) => setUserMenuAnchor(e.currentTarget)}
                                color="inherit"
                            >
                                <Avatar sx={{ width: 32, height: 32 }}>
                                    {user.displayName?.charAt(0) || 'U'}
                                </Avatar>
                            </IconButton>
                            <Menu
                                anchorEl={userMenuAnchor}
                                open={Boolean(userMenuAnchor)}
                                onClose={() => setUserMenuAnchor(null)}
                            >
                                <MenuItem>
                                    <ListItemIcon>
                                        <Avatar sx={{ width: 24, height: 24 }} />
                                    </ListItemIcon>
                                    <ListItemText
                                        primary={user.displayName}
                                        secondary={user.email}
                                    />
                                </MenuItem>
                                <Divider />
                                <MenuItem onClick={() => navigate('/profile')}>
                                    <ListItemIcon>
                                        <SettingsIcon fontSize="small" />
                                    </ListItemIcon>
                                    <ListItemText>Profile</ListItemText>
                                </MenuItem>
                                <MenuItem onClick={onLogout}>
                                    <ListItemIcon>
                                        <LogoutIcon fontSize="small" />
                                    </ListItemIcon>
                                    <ListItemText>Logout</ListItemText>
                                </MenuItem>
                            </Menu>
                        </>
                    )}
                </Toolbar>
            </AppBar>

            {/* Sidebar Drawer */}
            <Drawer
                variant="permanent"
                open={drawerOpen}
                sx={{
                    width: drawerWidth,
                    flexShrink: 0,
                    whiteSpace: 'nowrap',
                    boxSizing: 'border-box',
                    ...(drawerOpen && {
                        width: drawerWidth,
                        '& .MuiDrawer-paper': {
                            width: drawerWidth,
                            transition: (theme) => theme.transitions.create('width', {
                                easing: theme.transitions.easing.sharp,
                                duration: theme.transitions.duration.enteringScreen
                            }),
                            overflowX: 'hidden',
                            borderRight: '1px solid',
                            borderColor: 'divider'
                        }
                    }),
                    ...(!drawerOpen && {
                        width: 64,
                        '& .MuiDrawer-paper': {
                            width: 64,
                            transition: (theme) => theme.transitions.create('width', {
                                easing: theme.transitions.easing.sharp,
                                duration: theme.transitions.duration.leavingScreen
                            }),
                            overflowX: 'hidden',
                            borderRight: '1px solid',
                            borderColor: 'divider'
                        }
                    })
                }}
            >
                <Toolbar>
                    <Typography
                        variant="h6"
                        noWrap
                        sx={{
                            display: drawerOpen ? 'block' : 'none',
                            fontWeight: 600,
                            color: 'primary.main'
                        }}
                    >
                        NOVA ERP
                    </Typography>
                    <IconButton
                        onClick={() => setDrawerOpen(false)}
                        sx={{ display: drawerOpen ? 'block' : 'none' }}
                    >
                        <ChevronLeftIcon />
                    </IconButton>
                </Toolbar>
                <Divider />
                <List>
                    {menuItems.map((item) => (
                        <ListItem key={item.text} disablePadding>
                            <ListItemButton
                                onClick={() => navigate(item.path)}
                                sx={{
                                    minHeight: 48,
                                    justifyContent: drawerOpen ? 'initial' : 'center',
                                    px: 2.5
                                }}
                            >
                                <ListItemIcon
                                    sx={{
                                        minWidth: 0,
                                        mr: drawerOpen ? 3 : 'auto',
                                        justifyContent: 'center'
                                    }}
                                >
                                    {item.icon}
                                </ListItemIcon>
                                <ListItemText
                                    primary={item.text}
                                    sx={{
                                        display: drawerOpen ? 'block' : 'none',
                                        opacity: drawerOpen ? 1 : 0
                                    }}
                                />
                            </ListItemButton>
                        </ListItem>
                    ))}
                </List>
            </Drawer>

            {/* Main Content */}
            <Box
                component="main"
                sx={{
                    flexGrow: 1,
                    height: '100vh',
                    overflow: 'auto',
                    backgroundColor: (theme) => theme.palette.background.default,
                    padding: 3,
                    marginTop: '64px'
                }}
            >
                {children}
            </Box>
        </Box>
    );
};