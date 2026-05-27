/**
 * 将对象转为纯 JSON 数据，确保可通过 Electron IPC 的 structured clone 传输。
 * 用于剥离 Vue 响应式 Proxy 等不可克隆对象。
 *
 * 注意：渲染进程经 contextBridge 调用 preload 时，参数会先被 structured clone，
 * 须在渲染侧先把 Ref / reactive 转为普通对象（见 renderer/utils/ipcPayload.ts）。
 */
export function toIpcPlain<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}
