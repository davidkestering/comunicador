import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
// base relativa: mesmo build serve em https://comunicador.davidkestering.com/app/ e dentro do APK (https://localhost/)
export default defineConfig({ plugins: [react()], base: './', build: { target: 'es2020' } });
