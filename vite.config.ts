import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import federation from '@originjs/vite-plugin-federation';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import type { IncomingMessage, ServerResponse } from 'node:http';

const rootDir = path.dirname(fileURLToPath(import.meta.url));

/** The Google window has to be a top-level page without the dice isolation header. */
const authDocumentPlugin = (): Plugin => {
  const serve = async (
    req: IncomingMessage,
    res: ServerResponse,
    next: (error?: unknown) => void,
    htmlPath: string,
    transform?: (url: string, html: string) => Promise<string>,
  ) => {
    const url = req.url?.split('?')[0];
    if (url !== '/auth.html' || res.writableEnded) {
      next();
      return;
    }
    try {
      let html = await fs.readFile(htmlPath, 'utf-8');
      if (transform) html = await transform(url, html);
      res.statusCode = 200;
      res.removeHeader('Cross-Origin-Embedder-Policy');
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
      res.end(html);
    } catch (error) {
      next(error);
    }
  };

  return {
    name: 'auth-document-headers',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        void serve(req, res, next, path.join(rootDir, 'auth.html'), (url, html) => server.transformIndexHtml(url, html));
      });
    },
    configurePreviewServer(server) {
      server.middlewares.use((req, res, next) => {
        void serve(req, res, next, path.join(rootDir, 'dist', 'auth.html'));
      });
    },
  };
};

const require = createRequire(import.meta.url);

// Get version from package.json for consistent versioning
const getVersion = () => {
  try {
    const pkg = require('./package.json');
    return pkg.version;
  } catch {
    return 'dev';
  }
};

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    authDocumentPlugin(),
    react(),
    federation({
      name: 'dnd_character_system',
      filename: 'remoteEntry.js',
      exposes: {
        './CharacterSheet': './src/components/CharacterSheet/CharacterSheet.tsx',
        './dbService': './src/services/dbService.ts'
      },
      shared: ['react', 'react-dom', 'react-router-dom']
    })
  ],
  define: {
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(getVersion()),
  },
  server: {
    port: 3000,
    host: true,
    headers: {
      'Cross-Origin-Embedder-Policy': 'require-corp',
      'Cross-Origin-Opener-Policy': 'same-origin',
    }
  },
  optimizeDeps: {
    include: ['@3d-dice/dice-box']
  },
  build: {
    target: 'esnext',
    outDir: 'dist',
    sourcemap: false,
    minify: 'terser',
    reportCompressedSize: false, // Faster builds
    chunkSizeWarningLimit: 1000, // Reduce warnings
    terserOptions: {
      compress: {
        // drop_console: true, // Temporarily disabled for debugging
      },
    },
    rollupOptions: {
      input: {
        index: path.resolve(rootDir, 'index.html'),
        auth: path.resolve(rootDir, 'auth.html'),
      },
      output: {
        manualChunks(id) {
          // Leave React and the rest of node_modules to Rollup. Forcing them
          // into one vendor chunk deadlocks module federation: that chunk waits
          // on React while the shared React file waits on the same chunk.
          if (id.includes('node_modules/three')) {
            return 'three';
          }
          if (id.includes('node_modules/@react-three')) {
            return 'react-three';
          }
          if (id.includes('node_modules/@3d-dice')) {
            return 'dice-3d';
          }
          if (id.includes('node_modules/firebase') || id.includes('node_modules/@firebase')) {
            return 'firebase';
          }
        },
      },
    },
  },
  esbuild: {
    // drop: ['console', 'debugger'], // Temporarily disabled for debugging
  },
});
