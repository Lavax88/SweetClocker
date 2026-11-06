import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig(({ command }) => {
  const isDev = command === 'serve';

  return {
    base: './',
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
        '@bridge/mock': isDev
          ? path.resolve(__dirname, './src/bridge/mock.ts')
          : path.resolve(__dirname, './src/bridge/mock-stub.ts')
      }
    },
    build: {
      outDir: 'webroot',
      emptyOutDir: true,
      target: 'es2020',
      assetsDir: 'assets',
      minify: 'esbuild',
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
