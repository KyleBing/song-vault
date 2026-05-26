/**
 * 渲染进程 Node 兼容：music-metadata-browser、metaflac-js 等依赖全局 Buffer。
 */
import { Buffer } from 'buffer'

if (typeof globalThis.Buffer === 'undefined') {
  globalThis.Buffer = Buffer as typeof globalThis.Buffer
}
