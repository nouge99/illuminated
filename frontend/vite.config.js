import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { viteStaticCopy } from 'vite-plugin-static-copy'

export default defineConfig(({ mode } ) => {
  const env = loadEnv(mode, process.cwd(), '')

  return {
    plugins: [
      react(),
      viteStaticCopy({
        targets: [{
          src: 'node_modules/onnxruntime-web/dist/*.wasm',
          dest: '.'
        },
        {
          src: 'node_modules/onnxruntime-web/dist/*.mjs',
          dest: '.'
        }]
      })
    ], 
    server: {
      allowedHosts: [env.CF_TUNNEL],
      proxy: {
        '/api': 'http://localhost:8000'
      }
    },
    assetsInclude: ['**/*.wasm'],
    optimizeDeps: {
      exclude: ['onnxruntime-web']
    }
  }
})
