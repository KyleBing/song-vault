export type WASM_ptr = number;
export type WASM_NUMBER = "i8" | "i16" | "i32" | "i64" | "float" | "double";

export declare interface StreamCencrypt {
  /**
   * Call destructor and free memory from the Emscripten HEAP.
   */
  delete(): void;
}

export declare interface WASMExportedRuntime {
  /**
   * Emscripten HEAP, use this for raw memory access.
   * @type {Uint8Array}
   */
  HEAPU8: Uint8Array;

  /**
   * Allocate a block of {@link size} bytes of memory in Emscripten HEAP
   * @param size Size of the memory block, in bytes.
   * @returns {WASM_ptr} Returns a pointer to the beginning of the block.
   */
  _malloc(size: number): WASM_ptr;

  /**
   * Free an allocated block of memory.
   * @param ptr Pointer to a memory block previously allocated with `malloc`.
   */
  _free(ptr: WASM_ptr): void;

  /**
   * Write an uint8 array to the Emscripten HEAP.
   * @param data Data to be written inside the Emscripten HEAP.
   * @param bufferPointer Address pointer
   */
  writeArrayToMemory(data: Uint8Array, bufferPointer: WASM_ptr): void;

  /**
   * Gets a value at a specific memory address at run-time.
   * NOTE: it only does aligned write and read.
   * @param ptr A pointer (number) representing the memory address.
   * @param type An LLVM IR type as a string.
   * @returns value at a specific address.
   */
  getValue(ptr: WASM_ptr, type: WASM_NUMBER): number;

  /**
   * Given a pointer `ptr` to a null-terminated UTF8-encoded string in the
   * Emscripten HEAP, returns a copy of that string as a JavaScript `String`
   * object.
   * @param ptr A pointer to a null-terminated UTF8-encoded string in the
   *            Emscripten HEAP.
   * @param maxBytesToRead An optional length that specifies the maximum
   *                       number of bytes to read.
   *                       Omit to read until the null-terminator.
   */
  UTF8ToString(ptr: WASM_ptr, maxBytesToRead?: number): string;
}

export declare interface QMCCrypto extends WASMExportedRuntime {
  /**
   * Get the size of qmc_detection struct.
   */
  sizeof_qmc_detection(): number;
  offsetof_song_id(): number;
  offsetof_error_msg(): number;
  sizeof_song_id(): number;
  sizeof_error_msg(): number;

  /**
   * Detect embedded ekey position using the end-of-file buffer.
   * Recommanded size of detection buffer is 40.
   * @param result WASM ptr with size from {@link sizeof_qmc_detection}.
   * @param detectBuf WASM ptr points to the beginning of the detection buffer.
   * @param size size of detection buffer.
   * @example
   * ```js
   * // Allocate memory for detection buffer in Emscripten HEAP.
   * const detectionBuf = new Uint8Array(inputArrayBuffer.slice(-40));
   * const pDetectionBuf = QMCCrypto._malloc(detectionBuf.length);
   * QMCCrypto.writeArrayToMemory(detectionBuf, pDetectionBuf);

   * // Allocate memory for result buffer in Emscripten HEAP.
   * const pDetectionResult = QMCCrypto._malloc(QMCCrypto.sizeof_qmc_detection());

   * // Perform detection
   * const detectOK = QMCCrypto.detectKeyEndPosition(
   *     pDetectionResult,
   *     pDetectionBuf,
   *     detectionBuf.length
   * );
   *
   * // Extract result
   * const ekeyPosition = QMCCrypto.getValue(pDetectionResult, "i32");
   * const ekeyLength = QMCCrypto.getValue(pDetectionResult + 4, "i32");
   * const errorMessage = QMCCrypto.UTF8ToString(pDetectionResult + 8);
   * if (!detectOK) {
   *   console.error(errorMessage);
   * } else {
   *   // continue with ekey data...
   * }
   * ```
   */
  detectKeyEndPosition(
    result: WASM_ptr,
    detectBuf: WASM_ptr,
    size: number
  ): boolean;

  /**
   * Creates an instance of {@link StreamCencrypt} that can be later used
   *   to decrypt file created using this very key.
   * @param ekey ekey, extracted from the request or end of the file.
   * @returns {StreamCencrypt} a pointer to the encrypt class.
   */
  createInstWidthEKey(ekey: string): StreamCencrypt;

  /**
   * Decrypt
   * @param encryptor Encryptor instance created using
   *                  {@link createInstWidthEKey}.
   * @param buffer Pointer to buffer allocated using {@link _malloc}.
   *               Data can be written here using {@link writeArrayToMemory}.
   * @param offset Offset of the buffer from _original file_.
   *               This parameter is _required_ to derive correct key.
   * @param size   Size of the provided buffer.
   * @example
   * ```js
   * // Decrypt a block of the file
   *
   * // Setup:
   * const offset = 10;
   * const blockSize = 4096;
   * const buf = QMCCrypto._malloc(blockSize);
   * const blockData = new Uint8Array(
   *   inputArrayBuffer.slice(offset, offset + blockSize)
   * );
   * QMCCrypto.writeArrayToMemory(blockData, buf);
   *
   * // Decrypt:
   * QMCCrypto.decryptStream(hCrypto, buf, offset, blockSize);
   *
   * // Retrive decrypted data:
   * const decryptedBlock = QMCCrypto.HEAPU8.slice(buf, buf + blockSize);
   * ```
   */
  decryptStream(
    encryptor: StreamCencrypt,
    buffer: WASM_ptr,
    offset: number,
    size: number
  ): void;
}

/**
 * Factory to initialise QMCCryptoModule.
 */
export function QMCCryptoModule(): Promise<QMCCrypto>;
