import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// A versão vem do package.json e é a mesma da etiqueta git da release;
// mostra-se no cabeçalho para o operador saber que build está a usar.
const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'))

// base = nome do repositório GitHub, para o deploy em GitHub Pages
// (https://pedrommgoncalves.github.io/dji-mission-planner/)
export default defineConfig({
  plugins: [react()],
  base: '/dji-mission-planner/',
  define: { 'import.meta.env.APP_VERSION': JSON.stringify(version) },
})
