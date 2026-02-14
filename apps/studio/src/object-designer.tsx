import React, { useState } from 'react';
import MonacoEditor from '@monaco-editor/react';
import {
    Drawer,
    AppBar,
    Toolbar,
    Typography,
    IconButton,
    Tabs,
    Tab,
    Box,
    TreeView,
    TreeItem
} from '@mui/material';
import {
    Menu as MenuIcon,
    ChevronRight,
    ExpandMore,
    Save as SaveIcon,
    PlayArrow as RunIcon
} from '@mui/icons-material';

export const ObjectDesigner: React.FC = () => {
    const [code, setCode] = useState('');
    const [selectedObject, setSelectedObject] = useState<string>('');
    const [activeTab, setActiveTab] = useState(0);

    const handleCompile = async () => {
        try {
            const metadataManager = MetadataManager.getInstance();
            const result = await metadataManager.compileObject(code);
            
            if (result) {
                alert('Compilation successful!');
            }
        } catch (error) {
            alert(`Compilation error: ${error.message}`);
        }
    };

    return (
        <Box sx={{ display: 'flex', height: '100vh' }}>
            {/* Object Explorer */}
            <Drawer variant="permanent" sx={{ width: 300 }}>
                <Toolbar />
                <Box sx={{ p: 2 }}>
                    <Typography variant="h6">Object Explorer</Typography>
                    <TreeView
                        defaultCollapseIcon={<ExpandMore />}
                        defaultExpandIcon={<ChevronRight />}
                    >
                        <TreeItem nodeId="tables" label="Tables">
                            <TreeItem nodeId="customer" label="Customer" />
                            <TreeItem nodeId="sales" label="Sales Header" />
                            <TreeItem nodeId="item" label="Item" />
                        </TreeItem>
                        <TreeItem nodeId="pages" label="Pages">
                            <TreeItem nodeId="customer-card" label="Customer Card" />
                            <TreeItem nodeId="sales-list" label="Sales List" />
                        </TreeItem>
                        <TreeItem nodeId="codeunits" label="Codeunits">
                            <TreeItem nodeId="sales-post" label="SalesPost" />
                            <TreeItem nodeId="inventory" label="InventoryMgt" />
                        </TreeItem>
                        <TreeItem nodeId="reports" label="Reports">
                            <TreeItem nodeId="customer-balance" label="Customer Balance" />
                            <TreeItem nodeId="sales-invoice" label="Sales Invoice" />
                        </TreeItem>
                    </TreeView>
                </Box>
            </Drawer>

            {/* Main Editor Area */}
            <Box sx={{ flexGrow: 1 }}>
                <AppBar position="static" color="default">
                    <Toolbar>
                        <IconButton edge="start" color="inherit">
                            <MenuIcon />
                        </IconButton>
                        <Typography variant="h6" sx={{ flexGrow: 1, ml: 2 }}>
                            Object Designer - {selectedObject || 'Untitled'}
                        </Typography>
                        <IconButton color="primary" onClick={handleCompile}>
                            <RunIcon />
                        </IconButton>
                        <IconButton color="primary">
                            <SaveIcon />
                        </IconButton>
                    </Toolbar>
                    <Tabs value={activeTab} onChange={(_, v) => setActiveTab(v)}>
                        <Tab label="Design" />
                        <Tab label="Code" />
                        <Tab label="Preview" />
                        <Tab label="Properties" />
                    </Tabs>
                </AppBar>

                {/* Editor Panel */}
                <Box sx={{ height: 'calc(100% - 128px)' }}>
                    {activeTab === 0 && (
                        <Box sx={{ p: 3 }}>
                            <Typography variant="h5" gutterBottom>
                                Visual Designer
                            </Typography>
                            {/* Visual designer UI */}
                        </Box>
                    )}
                    {activeTab === 1 && (
                        <MonacoEditor
                            height="100%"
                            defaultLanguage="al"
                            theme="vs-dark"
                            value={code}
                            onChange={(value) => setCode(value || '')}
                            options={{
                                minimap: { enabled: false },
                                fontSize: 14,
                                wordWrap: 'on'
                            }}
                        />
                    )}
                    {activeTab === 2 && (
                        <Box sx={{ p: 3 }}>
                            <Typography variant="h5" gutterBottom>
                                Preview
                            </Typography>
                            {/* Live preview */}
                        </Box>
                    )}
                    {activeTab === 3 && (
                        <Box sx={{ p: 3 }}>
                            <Typography variant="h5" gutterBottom>
                                Properties
                            </Typography>
                            {/* Property grid */}
                        </Box>
                    )}
                </Box>
            </Box>
        </Box>
    );
};