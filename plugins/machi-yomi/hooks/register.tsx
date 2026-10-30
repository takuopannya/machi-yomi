import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { MachiYomiHistoryEntry, MachiYomiImage, MachiYomiItem } from '../types'
import { MAX_WIDTH, THUMB_WIDTH, imageCells, imageSize, pictureSvg } from './art'
import { HEADERS } from './common'
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
/** 最後に帯を描いた画面の種類（端末なら画像を PNG にもする） */
let lastSurface = 'terminal'

/** 取り込んだ画像（縮小版の URL ごと）：画面にそのまま埋め込む画像と、端末用の PNG。どちらも base64 */
type Picture = { data: string; width: number; height: number; png?: string }
const pictures = new Map<string, Picture>()

/** ~/.claude/machi-yomi の場所 */
async function dataDir($: EngineInterface): Promise<string | undefined> {
  const home = (await $.env.get('USERPROFILE')) ?? (await $.env.get('HOME'))
  return home ? `${home.replace(/[\\/]+$/, '')}/.claude/machi-yomi` : undefined
}

/** 履歴ファイルの場所（~/.claude/machi-yomi/history.md） */
async function historyPath($: EngineInterface): Promise<string | undefined> {
  const dir = await dataDir($)
  return dir ? `${dir}/history.md` : undefined
}

/**
 * 画像を別の形式・幅で書き出す（Windows は PowerShell、それ以外は sips か ImageMagick）。できなければ false。
 * width を省くと元の大きさのまま
 */
async function convert($: EngineInterface, from: string, to: string, format: 'png' | 'jpeg', width?: number): Promise<boolean> {
  const quote = (path: string) => `'${path.replace(/'/g, "''")}'`
  const fmt = format === 'png' ? 'Png' : 'Jpeg'
  const commands =
    (await $.env.get('OS')) === 'Windows_NT'
      ? [[
          'powershell', '-NoProfile', '-NonInteractive', '-Command',
          [
            'Add-Type -AssemblyName System.Drawing',
            `$s = [System.Drawing.Image]::FromFile(${quote(from)})`,
            `$w = ${width ?? '$s.Width'}`,
            '$h = [int][math]::Max(1, [math]::Round($s.Height * $w / $s.Width))',
            '$b = New-Object System.Drawing.Bitmap $s, $w, $h',
            `$b.Save(${quote(to)}, [System.Drawing.Imaging.ImageFormat]::${fmt})`,
            '$b.Dispose(); $s.Dispose()',
          ].join('; '),
        ]]
      : [
          ['sips', '-s', 'format', format, ...(width ? ['--resampleWidth', String(width)] : []), from, '--out', to],
          ['magick', from, ...(width ? ['-resize', `${width}x`] : []), to],
        ]
  for (const argv of commands) {
    try {
      if ((await $.process.run(argv, { timeoutMs: 20_000 })).exitCode === 0) return true
    } catch {
      // そのコマンドがない：次を試す
    }
  }
  return false
}

/** 画像の縮小版を取り込む（$.http は本文を文字で返すので、バイト列は curl で落とす）。大きすぎれば縮める */
async function loadPicture($: EngineInterface, image: MachiYomiImage): Promise<Picture | undefined> {
  const dir = await dataDir($)
  if (!dir) return undefined
  const raw = `${dir}/art/current.img`
  try {
    const got = await $.process.run(
      ['curl', '-sSfL', '--max-time', '20', '--create-dirs', '-A', HEADERS['user-agent'], '-o', raw, image.url],
      { timeoutMs: 30_000 },
    )
    if (got.exitCode !== 0) return undefined
    let path = raw
    let data = (await $.fs.read(raw, { as: 'bytes' })).base64
    let size = imageSize(data)
    if (!size) return undefined
    if (size.width > MAX_WIDTH || !pictureSvg(data)) {
      path = `${dir}/art/small.jpg`
      if (!(await convert($, raw, path, 'jpeg', THUMB_WIDTH))) return undefined
      data = (await $.fs.read(path, { as: 'bytes' })).base64
      size = imageSize(data)
      if (!size || !pictureSvg(data)) return undefined
    }
    const picture: Picture = { data, width: size.width, height: size.height }
    if (lastSurface === 'terminal') {
      const png = `${dir}/art/current.png`
      if (size.type === 'png') picture.png = data
      else if (await convert($, path, png, 'png')) picture.png = (await $.fs.read(png, { as: 'bytes' })).base64
    }
    return picture
  } catch {
    return undefined
  }
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
    // 画像は前のものを捨ててから、今回のぶんだけ順に取り込む（同じファイルを使い回すので並べない）
    pictures.clear()
    for (const one of shown) {
      if (!one.image) continue
      const picture = await loadPicture($, one.image)
      if (picture) pictures.set(one.image.url, picture)
    }
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
    const elements = $.ui.resolve(e)
    const { Box, Text, Link, Button } = elements
    lastSurface = e.surface

    // 見出し・トピックごとにタイトルと要約・リンク。要約が 5 行に届かなければ複数並ぶ
    const cells = Math.max(20, e.props.bodyColumns - 6)
    lastCells = cells
    const accent = shown.some(one => one.isAd) ? 'yellow' : 'cyan'
    const lines = shown.length > 1 ? MULTI_LINES : SINGLE_LINES

    /** その記事の画像：端末は Image（PNG）、ほかの画面は画像を埋め込んだ Svg。出せなければ undefined */
    const picture = (one: MachiYomiItem) => {
      const got = one.image && pictures.get(one.image.url)
      if (!got) return undefined
      const alt = `絵：${one.title}`
      if ('Image' in elements) {
        if (!got.png) return undefined
        const size = imageCells(got.width, got.height)
        return { columns: size.columns, node: <elements.Image key={`art-${n}`} source={{ png: got.png }} columns={size.columns} rows={size.rows} alt={alt} /> }
      }
      if (!('Svg' in elements)) return undefined
      const svg = pictureSvg(got.data)
      const height = 120
      return svg ? { columns: 0, node: <elements.Svg source={svg} alt={alt} width={Math.round((got.width * height) / got.height)} height={height} /> } : undefined
    }

    return (
      <Box flexDirection="column" borderStyle="round" borderColor={accent} paddingX={2}>
        <Box justifyContent="space-between">
          <Text color={accent} bold>
            ✦ 知のセレンディピティ
          </Text>
          <Text dimColor>{shown.length === 0 ? '' : `#${n}`}</Text>
        </Box>
        {shown.length === 0 && <Text dimColor>読み込み中…</Text>}
        {shown.map((one, i) => {
          const pic = picture(one)
          // 画像の横に並べるぶん、文字の幅を詰める
          const room = pic ? Math.max(20, cells - pic.columns - 2) : cells
          return (
            <Box marginTop={i === 0 ? 0 : 1} columnGap={2}>
              {pic?.node}
              <Box flexDirection="column" flexShrink={1}>
                <Box columnGap={1}>
                  <Text color={one.isAd ? 'yellow' : 'cyan'} dimColor>
                    {label(one)}
                  </Text>
                  <Link href={one.url} label={fit(one.title, Math.max(10, room - width(label(one)) - 6))} />
                </Box>
                {one.summary !== '' && <Text wrap="wrap">{fit(one.summary, room * lines)}</Text>}
              </Box>
            </Box>
          )
        })}
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
