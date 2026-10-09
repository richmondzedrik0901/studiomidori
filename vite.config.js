import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  plugins: [
    {
      name: 'admin-route-rewrite',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          const url = req.url || '';
          const [pathname, search] = url.split('?');
          if (pathname === '/admin' || pathname === '/admin/') {
            req.url = '/admin.html' + (search ? `?${search}` : '');
          }
          next();
        });
      }
    }
  ],
  build: {
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        admin: resolve(import.meta.dirname, 'admin.html')
      }
    }
  }
});
