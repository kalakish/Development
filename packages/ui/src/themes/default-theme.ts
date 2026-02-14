import { createTheme } from '@mui/material/styles';

export const defaultTheme = createTheme({
    palette: {
        mode: 'light',
        primary: {
            main: '#0078D4',
            light: '#2B88D8',
            dark: '#106EBE',
            contrastText: '#FFFFFF'
        },
        secondary: {
            main: '#107C10',
            light: '#13A10E',
            dark: '#0B5A0B',
            contrastText: '#FFFFFF'
        },
        error: {
            main: '#D13438',
            light: '#E7484C',
            dark: '#A4262C'
        },
        warning: {
            main: '#FF8C00',
            light: '#FFB900',
            dark: '#C75000'
        },
        info: {
            main: '#0078D7',
            light: '#3A96DD',
            dark: '#005A9E'
        },
        success: {
            main: '#107C10',
            light: '#13A10E',
            dark: '#0B5A0B'
        },
        background: {
            default: '#F5F5F5',
            paper: '#FFFFFF'
        },
        text: {
            primary: '#323130',
            secondary: '#605E5C',
            disabled: '#A19F9D'
        },
        divider: '#EDEBE9'
    },
    typography: {
        fontFamily: '"Segoe UI", "Roboto", "Helvetica", "Arial", sans-serif',
        h1: {
            fontSize: '2.5rem',
            fontWeight: 600
        },
        h2: {
            fontSize: '2rem',
            fontWeight: 600
        },
        h3: {
            fontSize: '1.75rem',
            fontWeight: 600
        },
        h4: {
            fontSize: '1.5rem',
            fontWeight: 600
        },
        h5: {
            fontSize: '1.25rem',
            fontWeight: 600
        },
        h6: {
            fontSize: '1rem',
            fontWeight: 600
        },
        body1: {
            fontSize: '0.875rem'
        },
        body2: {
            fontSize: '0.8125rem'
        },
        button: {
            textTransform: 'none',
            fontWeight: 600
        }
    },
    shape: {
        borderRadius: 4
    },
    components: {
        MuiButton: {
            styleOverrides: {
                root: {
                    boxShadow: 'none',
                    '&:hover': {
                        boxShadow: 'none'
                    }
                },
                contained: {
                    '&:hover': {
                        boxShadow: '0px 2px 4px rgba(0,0,0,0.1)'
                    }
                }
            }
        },
        MuiAppBar: {
            styleOverrides: {
                root: {
                    boxShadow: '0px 2px 4px rgba(0,0,0,0.05)'
                }
            }
        },
        MuiCard: {
            styleOverrides: {
                root: {
                    boxShadow: '0px 2px 4px rgba(0,0,0,0.05)',
                    border: '1px solid #EDEBE9'
                }
            }
        },
        MuiDataGrid: {
            styleOverrides: {
                root: {
                    border: 'none',
                    '& .MuiDataGrid-cell': {
                        borderBottom: '1px solid #EDEBE9'
                    },
                    '& .MuiDataGrid-columnHeaders': {
                        backgroundColor: '#FAF9F8',
                        borderBottom: '2px solid #0078D4'
                    }
                }
            }
        },
        MuiTextField: {
            defaultProps: {
                variant: 'outlined',
                size: 'small'
            },
            styleOverrides: {
                root: {
                    '& .MuiOutlinedInput-root': {
                        '&:hover fieldset': {
                            borderColor: '#0078D4'
                        },
                        '&.Mui-focused fieldset': {
                            borderColor: '#0078D4'
                        }
                    }
                }
            }
        },
        MuiChip: {
            styleOverrides: {
                root: {
                    borderRadius: 4
                }
            }
        },
        MuiAlert: {
            styleOverrides: {
                root: {
                    borderRadius: 4
                }
            }
        },
        MuiTab: {
            styleOverrides: {
                root: {
                    textTransform: 'none',
                    fontWeight: 600
                }
            }
        }
    }
});