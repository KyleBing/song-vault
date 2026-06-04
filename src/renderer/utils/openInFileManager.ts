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

/** 在系统文件管理器中定位并选中文件 */
export async function revealFileInFileManager(
  filePath: string | null | undefined,
  message: MessageApi
): Promise<void> {
  if (!filePath) return
  const err = await window.electronAPI.showItemInFolder(filePath)
  if (err) {
    message.error(`无法在文件管理器中打开：${err}`)
  }
}
