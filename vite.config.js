import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base = nome do repositório GitHub, para o deploy em GitHub Pages
// (https://pedrommgoncalves.github.io/dji-mission-planner/)
export default defineConfig({
  plugins: [react()],
  base: '/dji-mission-planner/',
})
