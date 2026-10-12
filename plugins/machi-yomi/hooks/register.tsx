import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { MachiYomiHistoryEntry, MachiYomiItem } from '../types'
import { addEntry, jst, toMarkdown } from './history'
import { MULTI_LINES, SINGLE_LINES, fit, width } from './layout'
import { nextBatch } from './sources'
import { readConfig, translateItem } from './translate'
import type { TranslateConfig } from './translate'

const current = atom({ plugin: 'machi-yomi', key: 'current' } as const, [] as MachiYomiItem[])
const count = atom({ plugin: 'machi-yomi', key: 'count' } as const, 0)
const isHidden = atom({ plugin: 'machi-yomi', key: 'isHidden' } as const, false)

const HISTORY_PANE = 'machi-yomi-history'
const HISTORY_KEY = 'history'

let isWorking = false
let isLoading = false
/** 帯の要約欄の幅（最後に描いたときの値）。トピックを足すかの判断に使う */
let lastCells = 74
/** 英語の記事の翻訳設定（register で読む） */
let translateConfig: TranslateConfig = readConfig({})

/** 履歴ファイルの場所（~/.claude/machi-yomi/history.md） */
async function historyPath($: EngineInterface): Promise<string | undefined> {
  const home = (await $.env.get('USERPROFILE')) ?? (await $.env.get('HOME'))
  return home ? `${home.replace(/[\\/]+$/, '')}/.claude/machi-yomi/history.md` : undefined
}

async function loadHistory($: EngineInterface): Promise<MachiYomiHistoryEntry[]> {
  const saved = await $.store.get(HISTORY_KEY)
  return Array.isArray(saved) ? (saved as MachiYomiHistoryEntry[]) : []
}

/** 表示した記事を履歴に残す（広告は残さない） */
async function recordHistory($: EngineInterface, shown: readonly MachiYomiItem[]) {
  if (shown.every(one => one.isAd)) return
  const now = await $.clock.now()
  // 上に表示したものほど新しく並ぶよう、下から足す
  const list = [...shown].reverse().reduce((acc, one) => addEntry(acc, one, now), await loadHistory($))
  await $.store.set(HISTORY_KEY, list)
  const path = await historyPath($)
  if (path) await $.fs.write(path, toMarkdown(list))
}

/** 次の表示ぶんを取得して切り替える */
async function advance($: EngineInterface) {
  if (isLoading) return
  isLoading = true
  try {
    const n = (await read($, count)) + 1
    const fetch = (url: string, init?: Parameters<typeof $.http.fetch>[1]) => $.http.fetch(url, init)
    const complete = async (model: string, prompt: string) => {
      const r = await $.model.complete({ model, prompt, maxTokens: 2000 })
      return r.isAnswered ? r.text : undefined
    }
    const batch = await nextBatch(n, fetch, lastCells)
    const shown = await Promise.all(batch.map(one => translateItem(one, translateConfig, { fetch, complete })))
    await update($, count, () => n)
    await update($, current, () => shown)
    await recordHistory($, shown)
  } finally {
    isLoading = false
  }
}

/** サイト名の表示（広告は [PR]、自動翻訳は「・訳」を付ける） */
const label = (one: MachiYomiItem) => `${one.isAd ? '[PR] ' : ''}${one.site}${one.isTranslated ? '・訳' : ''}`

export const register: Register = (on, options) => {
  const seconds = Number(options.intervalSeconds ?? 30)
  const intervalMs = Math.max(5, Number.isFinite(seconds) ? seconds : 30) * 1000
  translateConfig = readConfig(options)

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'machi-yomi',
      description: '待ち時間の記事表示をオン／オフする',
    })
    await $.command.register({
      name: 'machi-yomi-history',
      description: '待ち読みで表示した記事の履歴を開く',
    })
    $.clock.every(intervalMs, () => {
      if (isWorking) void advance($)
    })

    return next(e)
  })

  on('command.run', { command: 'machi-yomi' }, async $ => {
    const hidden = await update($, isHidden, was => !was)

    return { text: hidden ? '待ち読み：非表示にしました' : '待ち読み：表示します' }
  })

  on('command.run', { command: 'machi-yomi-history' }, async $ => {
    await $.ui.open({ id: HISTORY_PANE, title: '待ち読み 履歴' })
    const path = await historyPath($)

    return { text: `待ち読みの履歴を開きました${path ? `（ファイル：${path}）` : ''}` }
  })

  on('prompt.submit', async ($, e, next) => {
    isWorking = true
    void advance($)

    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    isWorking = false

    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey || !e.props.isWorking || (await read($, isHidden))) {
      return next(e)
    }
    const shown = await read($, current)
    const n = await read($, count)
    const { Box, Text, Link, Button } = $.ui.resolve(e)

    // 見出し・トピックごとにタイトルと要約・リンク。要約が 5 行に届かなければ複数並ぶ
    const cells = Math.max(20, e.props.bodyColumns - 6)
    lastCells = cells
    const accent = shown.some(one => one.isAd) ? 'yellow' : 'cyan'
    const lines = shown.length > 1 ? MULTI_LINES : SINGLE_LINES

    return (
      <Box flexDirection="column" borderStyle="round" borderColor={accent} paddingX={2}>
        <Box justifyContent="space-between">
          <Text color={accent} bold>
            ✦ 知のセレンディピティ
          </Text>
          <Text dimColor>{shown.length === 0 ? '' : `#${n}`}</Text>
        </Box>
        {shown.length === 0 && <Text dimColor>読み込み中…</Text>}
        {shown.map((one, i) => (
          <Box flexDirection="column" marginTop={i === 0 ? 0 : 1}>
            <Box columnGap={1}>
              <Text color={one.isAd ? 'yellow' : 'cyan'} dimColor>
                {label(one)}
              </Text>
              <Link href={one.url} label={fit(one.title, Math.max(10, cells - width(label(one)) - 6))} />
            </Box>
            {one.summary !== '' && <Text wrap="wrap">{fit(one.summary, cells * lines)}</Text>}
          </Box>
        ))}
        <Box columnGap={1} marginTop={1}>
          <Button key="next" label="次へ" dimColor onPress={() => void advance($)} />
          <Button key="history" label="履歴" dimColor onPress={() => $.ui.open({ id: HISTORY_PANE, title: '待ち読み 履歴' })} />
          <Button key="hide" label="隠す" dimColor onPress={() => update($, isHidden, () => true)} />
        </Box>
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: HISTORY_PANE }, async ($, e) => {
    const { Box, Text, Link } = $.ui.resolve(e)
    const list = await loadHistory($)
    const path = await historyPath($)
    const room = Math.max(1, Math.floor(((e.viewport?.rows ?? 24) - 4) / 2))

    return (
      <Box flexDirection="column">
        <Text dimColor wrap="truncate-middle">
          {list.length} 件{path ? `  ·  ${path}` : ''}
        </Text>
        {list.length === 0 && <Text dimColor>まだ履歴はありません。</Text>}
        {list.slice(0, room).map(one => (
          <Box flexDirection="column" marginTop={1}>
            <Text dimColor>
              {jst(one.shownAt)}  {one.site}
            </Text>
            <Link href={one.url} label={one.title} />
          </Box>
        ))}
      </Box>
    )
  })
}
