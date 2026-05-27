export interface FileSystemGetFileOptions {
  create?: boolean
}

interface FileSystemCreateWritableOptions {
  keepExistingData?: boolean
}

interface FileSystemFileHandle {
  getFile(): Promise<File>
  createWritable(
    options?: FileSystemCreateWritableOptions
  ): Promise<FileSystemWritableFileStream>
}

interface FileSystemWritableFileStream extends WritableStream {
  write(data: BufferSource | Blob | string): Promise<void>
  close(): Promise<void>
}

export declare interface FileSystemDirectoryHandle {
  getFileHandle(
    name: string,
    options?: FileSystemGetFileOptions
  ): Promise<FileSystemFileHandle>
}
