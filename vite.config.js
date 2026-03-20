import { defineConfig, loadEnv } from 'vite'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL || ''
  const key = env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY || ''

  return {
    define: {
      __SUPABASE_URL__: JSON.stringify(url),
      __SUPABASE_ANON_KEY__: JSON.stringify(key),
    },
  }
})
