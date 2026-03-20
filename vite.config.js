import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, loadEnv } from 'vite'

const projectRoot = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig(({ mode }) => {
  // process.cwd() 가 상위 폴더(c:\coding 등)이면 .env 를 못 찾아 키가 비어 있음 → 설정 파일 기준 경로 사용
  const env = loadEnv(mode, projectRoot, '')
  const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL || ''
  const key = env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY || ''

  return {
    define: {
      __SUPABASE_URL__: JSON.stringify(url),
      __SUPABASE_ANON_KEY__: JSON.stringify(key),
    },
  }
})
