import { formatFileSize } from '@shared/formatAudioDisplay'
import type { DuplicateMember } from '@shared/libraryDuplicateTypes'
import {
    formatBitrate,
    formatBitsPerSample,
    formatSampleRate
} from '@renderer/utils/formatAudioMetrics'

export function duplicateMemberMetricsLabel(member: DuplicateMember): string {
    return [
        formatFileSize(member.size),
        formatBitrate(member.audio),
        formatSampleRate(member.audio),
        formatBitsPerSample(member.audio)
    ].join(' · ')
}
