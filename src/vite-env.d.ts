// src/vite-env.d.ts

/// <reference types="vite/client" />

// Для renderer процесса
interface ImportMetaEnv {
  readonly MAIN_WINDOW_VITE_DEV_SERVER_URL: string
  readonly MAIN_WINDOW_VITE_NAME: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}