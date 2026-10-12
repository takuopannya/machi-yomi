import type { MachiYomiHistoryEntry, MachiYomiItem } from '../types'

/** 履歴として残す最大件数 */
export const HISTORY_LIMIT = 5000

export const toEntry = (item: MachiYomiItem, shownAt: number): MachiYomiHistoryEntry => ({
  shownAt,
  site: item.site,
  title: item.title,
  summary: item.summary,
  url: item.url,
})

/** 新しいものを先頭に足す（広告は残さない） */
export function addEntry(
  list: readonly MachiYomiHistoryEntry[],
  item: MachiYomiItem,
  shownAt: number,
): MachiYomiHistoryEntry[] {
  if (item.isAd) return [...list]
  return [toEntry(item, shownAt), ...list].slice(0, HISTORY_LIMIT)
}

/** 日本時間の "2026-10-06 10:15" */
export function jst(ms: number): string {
  const d = new Date(ms + 9 * 60 * 60 * 1000)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`
}

const escape = (text: string) => text.replace(/([\[\]])/g, '\\$1')

/** 履歴ファイル（Markdown）の中身。日付ごとに見出しを付ける */
export function toMarkdown(list: readonly MachiYomiHistoryEntry[]): string {
  const lines = ['# 待ち読み 履歴', '', `${list.length} 件（新しい順）`]
  let day = ''
  for (const one of list) {
    const [date, time] = jst(one.shownAt).split(' ')
    if (date !== day) {
      day = date ?? ''
      lines.push('', `## ${day}`, '')
    }
    lines.push(`- ${time} **${one.site}** [${escape(one.title)}](${one.url})`)
    if (one.summary) lines.push(`  - ${one.summary}`)
  }
  return `${lines.join('\n')}\n`
}
