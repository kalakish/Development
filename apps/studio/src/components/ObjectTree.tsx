import React, { useState } from 'react';
import {
    TreeView,
    TreeItem,
    TreeItemProps
} from '@mui/lab';
import {
    Box,
    Typography,
    IconButton,
    Menu,
    MenuItem,
    ListItemIcon,
    ListItemText
} from '@mui/material';
import {
    ExpandMore,
    ChevronRight,
    TableChart,
    Web,
    Code,
    Description,
    ImportExport,
    QueryStats,
    List,
    MoreVert,
    Add,
    Edit,
    Delete,
    Copy,
    FileCopy
} from '@mui/icons-material';

interface ObjectNode {
    id: string;
    name: string;
    type: 'table' | 'page' | 'codeunit' | 'report' | 'xmlport' | 'query' | 'enum';
    children?: ObjectNode[];
    metadata?: any;
}

interface ObjectTreeProps {
    objects: ObjectNode[];
    onSelect: (node: ObjectNode) => void;
    onCreate: (parentId?: string) => void;
    onEdit: (node: ObjectNode) => void;
    onDelete: (node: ObjectNode) => void;
    onDuplicate: (node: ObjectNode) => void;
}

export const ObjectTree: React.FC<ObjectTreeProps> = ({
    objects,
    onSelect,
    onCreate,
    onEdit,
    onDelete,
    onDuplicate
}) => {
    const [contextMenu, setContextMenu] = useState<{
        mouseX: number;
        mouseY: number;
        node: ObjectNode | null;
    }>({
        mouseX: 0,
        mouseY: 0,
        node: null
    });

    const handleContextMenu = (event: React.MouseEvent, node: ObjectNode) => {
        event.preventDefault();
        setContextMenu({
            mouseX: event.clientX - 2,
            mouseY: event.clientY - 4,
            node
        });
    };

    const handleCloseContextMenu = () => {
        setContextMenu({
            mouseX: 0,
            mouseY: 0,
            node: null
        });
    };

    const getIconForType = (type: string) => {
        switch (type) {
            case 'table': return <TableChart />;
            case 'page': return <Web />;
            case 'codeunit': return <Code />;
            case 'report': return <Description />;
            case 'xmlport': return <ImportExport />;
            case 'query': return <QueryStats />;
            case 'enum': return <List />;
            default: return <FileCopy />;
        }
    };

    const renderTree = (nodes: ObjectNode[]) => {
        return nodes.map((node) => (
            <TreeItem
                key={node.id}
                nodeId={node.id}
                label={
                    <Box
                        sx={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            py: 0.5
                        }}
                        onContextMenu={(e) => handleContextMenu(e, node)}
                    >
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Box sx={{ color: 'primary.main' }}>
                                {getIconForType(node.type)}
                            </Box>
                            <Typography variant="body2">
                                {node.name}
                            </Typography>
                            {node.metadata?.id && (
                                <Typography
                                    variant="caption"
                                    sx={{ color: 'text.secondary' }}
                                >
                                    ({node.metadata.id})
                                </Typography>
                            )}
                        </Box>
                        <IconButton
                            size="small"
                            onClick={(e) => {
                                e.stopPropagation();
                                handleContextMenu(e, node);
                            }}
                        >
                            <MoreVert fontSize="small" />
                        </IconButton>
                    </Box>
                }
                onLabelClick={() => onSelect(node)}
            >
                {node.children && renderTree(node.children)}
            </TreeItem>
        ));
    };

    return (
        <>
            <TreeView
                defaultCollapseIcon={<ExpandMore />}
                defaultExpandIcon={<ChevronRight />}
                sx={{ flexGrow: 1, overflowY: 'auto' }}
            >
                {renderTree(objects)}
            </TreeView>

            <Menu
                open={contextMenu.node !== null}
                onClose={handleCloseContextMenu}
                anchorReference="anchorPosition"
                anchorPosition={
                    contextMenu.mouseY !== null && contextMenu.mouseX !== null
                        ? { top: contextMenu.mouseY, left: contextMenu.mouseX }
                        : undefined
                }
            >
                <MenuItem onClick={() => {
                    onCreate(contextMenu.node?.id);
                    handleCloseContextMenu();
                }}>
                    <ListItemIcon>
                        <Add fontSize="small" />
                    </ListItemIcon>
                    <ListItemText>New Object</ListItemText>
                </MenuItem>

                <MenuItem onClick={() => {
                    if (contextMenu.node) onEdit(contextMenu.node);
                    handleCloseContextMenu();
                }}>
                    <ListItemIcon>
                        <Edit fontSize="small" />
                    </ListItemIcon>
                    <ListItemText>Edit</ListItemText>
                </MenuItem>

                <MenuItem onClick={() => {
                    if (contextMenu.node) onDuplicate(contextMenu.node);
                    handleCloseContextMenu();
                }}>
                    <ListItemIcon>
                        <Copy fontSize="small" />
                    </ListItemIcon>
                    <ListItemText>Duplicate</ListItemText>
                </MenuItem>

                <MenuItem onClick={() => {
                    if (contextMenu.node) onDelete(contextMenu.node);
                    handleCloseContextMenu();
                }}>
                    <ListItemIcon>
                        <Delete fontSize="small" />
                    </ListItemIcon>
                    <ListItemText sx={{ color: 'error.main' }}>
                        Delete
                    </ListItemText>
                </MenuItem>
            </Menu>
        </>
    );
};