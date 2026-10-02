import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'fs';
import path from 'path';
import https from 'https';

// https://vitejs.dev/config/
export default defineConfig({
    plugins: [react()],
    server: {
        port: 6173,
        host: '0.0.0.0', // Allow access from outside container
        https: {
            key: fs.readFileSync(path.resolve(__dirname, 'certs/house-finance.key')),
            cert: fs.readFileSync(path.resolve(__dirname, 'certs/house-finance.crt')),
        },
        hmr: {
            host: 'web.house-finance.local',
            port: 6173,
            protocol: 'wss', // Secure WebSocket for Hot Module Replacement
        },
        proxy: {
            '/api': {
                target: process.env.VITE_API_PROXY_TARGET || 'http://house-fin-api:6723',
                changeOrigin: true,
                rewrite: (path) => path.replace(/^\/api/, ''),
                agent: new https.Agent({ rejectUnauthorized: false })
            }
        }
    }
})
