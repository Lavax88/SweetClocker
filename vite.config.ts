import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig(({ command }) => {
  const isDev = command === 'serve';

  return {
    base: './',
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, './src'),
        '@bridge/mock': isDev
          ? path.resolve(import.meta.dirname, './src/bridge/mock.ts')
          : path.resolve(import.meta.dirname, './src/bridge/mock-stub.ts')
      }
    },
    css: {
      lightningcss: {
        targets: {
          chrome: 100 << 16,
          safari: 16 << 16
        }
      }
    },
    build: {
      outDir: 'webroot',
      emptyOutDir: true,
      target: ['chrome90', 'safari16', 'es2022'],
      cssTarget: ['chrome90', 'safari16'],
      cssMinify: 'lightningcss',
      assetsDir: 'assets',
      minify: 'oxc',
      sourcemap: false,
      rollupOptions: {
        output: {
          entryFileNames: 'assets/[name].js',
          chunkFileNames: 'assets/[name].js',
          assetFileNames: 'assets/[name].[ext]'
        }
      }
    }
  };
});
