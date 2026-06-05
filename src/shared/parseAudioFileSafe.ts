import { parseFile, type IAudioMetadata } from 'music-metadata'

export type ParseAudioFileOptions = {
    skipCovers?: boolean
    duration?: boolean
}

const DEFAULT_PARSE_ATTEMPTS: readonly ParseAudioFileOptions[] = [
    { skipCovers: false, duration: true },
    { skipCovers: false, duration: false },
    { skipCovers: true, duration: true },
    { skipCovers: true, duration: false }
]

function attemptKey(opts: ParseAudioFileOptions): string {
    return `${opts.skipCovers ?? false}:${opts.duration ?? false}`
}

/** 依次尝试多种 parseFile 选项，避免删封面后 skipCovers:false 误报损坏 */
export async function parseAudioFileSafe(
    filePath: string,
    preferred?: ParseAudioFileOptions
): Promise<IAudioMetadata> {
    const attempts: ParseAudioFileOptions[] = preferred
        ? [
              preferred,
              ...DEFAULT_PARSE_ATTEMPTS.filter(
                  (opts) => attemptKey(opts) !== attemptKey(preferred)
              )
          ]
        : [...DEFAULT_PARSE_ATTEMPTS]

    let lastErr: unknown
    for (const opts of attempts) {
        try {
            return await parseFile(filePath, opts)
        } catch (err) {
            lastErr = err
        }
    }
    throw lastErr
}
