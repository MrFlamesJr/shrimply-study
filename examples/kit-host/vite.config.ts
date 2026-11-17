import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// A separate app: its own root, so `npx vite build examples/kit-host` builds only this folder.
export default defineConfig({ base: './', plugins: [react()] })
