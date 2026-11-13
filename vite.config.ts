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
    build: {
      outDir: 'webroot',
      emptyOutDir: true,
      target: 'es2022',
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
