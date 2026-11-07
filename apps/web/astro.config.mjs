import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://luvo.baro.site',
  output: 'static',
  vite: {
    server: {
      proxy: {
        '/api': 'http://127.0.0.1:8787',
      },
    },
  },
});
