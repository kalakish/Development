import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
    plugins: [react()],
    server: {
        port: 3001,
        proxy: {
            '/api': 'http://localhost:3000',
            '/odata': 'http://localhost:3000',
            '/metadata': 'http://localhost:3000',
            '/socket.io': {
                target: 'http://localhost:3000',
                ws: true
            }
        }
    },
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src'),
            '@nova': path.resolve(__dirname, '../../packages')
        }
    },
    build: {
        outDir: 'dist',
        sourcemap: true
    }
});