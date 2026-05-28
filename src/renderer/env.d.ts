/// <reference types="vite/client" />

/** electron-vite 从 package.json 注入 */
declare const __APP_VERSION__: string

import type { Buffer as BufferPolyfill } from 'buffer'

declare global {
  // eslint-disable-next-line no-var
  var Buffer: typeof BufferPolyfill
}

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<object, object, unknown>
  export default component
}
