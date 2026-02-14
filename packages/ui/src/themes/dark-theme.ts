import { createTheme } from '@mui/material/styles';
import { defaultTheme } from './default-theme';

export const darkTheme = createTheme({
    ...defaultTheme,
    palette: {
        mode: 'dark',
        primary: {
            main: '#2899F0',
            light: '#4AA0F5',
            dark: '#1A73E8',
            contrastText: '#FFFFFF'
        },
        secondary: {
            main: '#30B530',
            light: '#3FC43F',
            dark: '#269126',
            contrastText: '#FFFFFF'
        },
        error: {
            main: '#F15B5F',
            light: '#F4797D',
            dark: '#C84F51'
        },
        warning: {
            main: '#FFAA44',
            light: '#FFB966',
            dark: '#CC8844'
        },
        info: {
            main: '#2899F0',
            light: '#4AA0F5',
            dark: '#1A73E8'
        },
        success: {
            main: '#30B530',
            light: '#3FC43F',
            dark: '#269126'
        },
        background: {
            default: '#1F1F1F',
            paper: '#2D2D2D'
        },
        text: {
            primary: '#FFFFFF',
            secondary: '#C8C8C8',
            disabled: '#787878'
        },
        divider: '#404040'
    }
});