/// <reference types="vite/client" />

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
