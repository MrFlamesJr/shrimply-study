import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// base './' makes the build work under any GitHub Pages repo path.
export default defineConfig({
  base: './',
  plugins: [react()],
})
