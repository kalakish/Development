import { createTheme } from '@mui/material/styles';
import { defaultTheme } from './default-theme';

export const lightTheme = createTheme({
    ...defaultTheme,
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
        background: {
            default: '#FFFFFF',
            paper: '#FFFFFF'
        }
    }
});