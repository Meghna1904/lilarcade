import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({ plugins: [react()], envDir: '..', envPrefix: ['VITE_', 'NEXT_PUBLIC_'], server: { port: 5173, proxy: { '/api/socket-io': { target: 'http://localhost:3001', ws: true } } } });
