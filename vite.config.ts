import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // 1. We catch any request starting with "/gitlab-proxy"
      '/gitlab-proxy': {
        // 2. We forward it to your real GitLab instance
        target: 'https://gitlab.ics.muni.cz',
        changeOrigin: true,
        secure: false, // Set to false if you use self-signed certificates
        // 3. We remove "/gitlab-proxy" from the path before sending to GitLab
        rewrite: (path) => path.replace(/^\/gitlab-proxy/, ''),
      },
    },
  },
})