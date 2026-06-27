import { resolve } from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    chunkSizeWarningLimit: 1300,
    reportCompressedSize: false,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        'proof-surfaces': resolve(__dirname, 'proof-surfaces.html'),
        'watch-pass-preview': resolve(__dirname, 'watch-pass-preview.html'),
        'watch-pass-paywall': resolve(__dirname, 'watch-pass-paywall.html'),
        'watch-pass-setup': resolve(__dirname, 'watch-pass-setup.html'),
        'visual-proof': resolve(__dirname, 'visual-proof.html'),
        'future-phaser': resolve(__dirname, 'future-phaser.html'),
        planet3d: resolve(__dirname, 'planet3d.html')
      },
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/phaser')) {
            return 'phaser';
          }

          if (id.includes('node_modules')) {
            return 'vendor';
          }
        }
      }
    }
  }
});
