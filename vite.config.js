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
          } else if (pathname === '/order' || pathname === '/order/') {
            req.url = '/order.html' + (search ? `?${search}` : '');
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
        order: resolve(import.meta.dirname, 'order.html'),
        admin: resolve(import.meta.dirname, 'admin.html')
      }
    }
  }
});
