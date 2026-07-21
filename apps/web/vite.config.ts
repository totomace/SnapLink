import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'SnapLink',
        short_name: 'SnapLink',
        description: 'Chia sẻ ảnh giữa điện thoại và laptop',
        theme_color: '#6366f1',
        display: 'standalone'
      }
    })
  ],
  server: { port: 5173 }
});
