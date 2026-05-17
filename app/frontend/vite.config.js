import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(__dirname, '../..')

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, repoRoot, '');
  const allowedHosts = [
    'a20-app-124.up.railway.app',
    env.RAILWAY_PUBLIC_DOMAIN,
    ...(env.VITE_ALLOWED_HOSTS || '')
      .split(',')
      .map((host) => host.trim())
      .filter(Boolean),
  ].filter(Boolean);

  return {
    envDir: repoRoot,
    plugins: [react()],
    server: {
      host: true,
      allowedHosts,
      proxy: {
        '/api': {
          target: env.VITE_API_URL || 'http://localhost:8000',
          changeOrigin: true,
          secure: false,
        },
      },
    },
  }
})
