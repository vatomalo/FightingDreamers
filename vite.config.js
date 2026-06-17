import { defineConfig } from 'vite';

export default defineConfig({
  base: '/FightingDreamers/',
  server: {
    watch: {
      usePolling: true,
      interval: 300,
    },
  },
});
