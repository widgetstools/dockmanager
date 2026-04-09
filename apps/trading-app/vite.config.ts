import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  base: process.env.VITE_BASE_PATH ?? "/",
  plugins: [react()],
  build: {
    chunkSizeWarningLimit: 2500, // ag-grid enterprise is ~2.2MB
  },
})
