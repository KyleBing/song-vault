import type { MessageApi } from 'naive-ui'

/** 在系统文件管理器中打开目录 */
export async function openDirInFileManager(
  dirPath: string | null | undefined,
  message: MessageApi
): Promise<void> {
  if (!dirPath) return
  const err = await window.electronAPI.openPathInFileManager(dirPath)
  if (err) {
    message.error(`无法在文件管理器中打开：${err}`)
  }
}
