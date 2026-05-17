import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const allowedHosts = [
    env.RAILWAY_PUBLIC_DOMAIN,
    ...(env.VITE_ALLOWED_HOSTS || '')
      .split(',')
      .map((host) => host.trim())
      .filter(Boolean),
  ].filter(Boolean);

  return {
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
