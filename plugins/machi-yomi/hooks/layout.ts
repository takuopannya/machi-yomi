import type { MachiYomiItem } from '../types'

/** 要約として最低限ほしい行数。足りなければトピックを足す */
export const MIN_LINES = 5
/** 1 回に並べるトピックの上限 */
export const MAX_TOPICS = 4
/** 1 件だけのときの要約の上限行数 */
export const SINGLE_LINES = 7
/** 複数のときの 1 件あたりの要約の上限行数 */
export const MULTI_LINES = 3

const WIDE = /[ᄀ-ᅟ⺀-꓏가-힣豈-﫿︰-﹏＀-｠￠-￦]/

/** 表示幅（全角 2・半角 1） */
export function width(text: string): number {
  let used = 0
  for (const ch of text) used += WIDE.test(ch) ? 2 : 1
  return used
}

/** 表示幅で cells に収まるよう切る */
export function fit(text: string, cells: number): string {
  let used = 0
  let out = ''
  for (const ch of text) {
    const w = WIDE.test(ch) ? 2 : 1
    if (used + w > cells - 1) return `${out}…`
    used += w
    out += ch
  }
  return out
}

/** 幅 cells で折り返したときの行数 */
export const linesOf = (text: string, cells: number) => (text === '' ? 0 : Math.ceil(width(text) / cells))

/** 並べたトピックの要約の行数の合計（各件は表示上限で頭打ち） */
export function summaryLines(items: readonly MachiYomiItem[], cells: number): number {
  const cap = items.length > 1 ? MULTI_LINES : SINGLE_LINES
  return items.reduce((sum, one) => sum + Math.min(cap, linesOf(one.summary, cells)), 0)
}

/** 要約が MIN_LINES に届かず、まだ足せるなら true */
export const needsMore = (items: readonly MachiYomiItem[], cells: number) =>
  items.length < MAX_TOPICS && summaryLines(items, cells) < MIN_LINES
