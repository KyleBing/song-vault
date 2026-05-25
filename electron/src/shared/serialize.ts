/**
 * 将对象转为纯 JSON 数据，确保可通过 Electron IPC 的 structured clone 传输。
 * 用于剥离 Vue 响应式 Proxy 等不可克隆对象。
 */
export function toIpcPlain<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}
