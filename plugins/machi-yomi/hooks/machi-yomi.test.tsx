import { expect, test } from 'claude-code/testing'
import type { HttpResponse } from 'claude-code'

import { addEntry, toMarkdown } from './history'
import { MAX_TOPICS, MIN_LINES, summaryLines } from './layout'
import { foreignCompany, japaneseCompany } from './companies'
import { abstractOf } from './papers'
import { SOURCES, nextBatch, nextItem } from './sources'
import type { Fetch } from './sources'
import { parsePair, readConfig, translateItem } from './translate'

const ok = (body: unknown, headers: Record<string, string> = {}): HttpResponse => ({
  status: 200,
  ok: true,
  headers,
  text: typeof body === 'string' ? body : JSON.stringify(body),
})

const failing: Fetch = async () => {
  throw new Error('offline')
}

test('10 回ごとに本との出会い（青空文庫など）になり、広告は出ない', async () => {
  for (const n of [10, 20, 30]) {
    const shown = await nextItem(n, failing, () => 0.1)
    expect(shown.isAd).toBe(false)
    expect(shown.site.startsWith('本との出会い')).toBe(true)
    expect(shown.url.startsWith('https://www.aozora.gr.jp/cards/')).toBe(true)
    expect(shown.url).not.toContain('amazon')
  }
})

test('それ以外の件はサイトの記事で、取得に失敗しても予備の項目になる', async () => {
  for (let n = 1; n <= 9; n++) {
    const shown = await nextItem(n, failing, () => (n / 10) % 1)
    expect(shown.isAd).toBe(false)
    expect(shown.url.startsWith('https://')).toBe(true)
    expect(shown.title.length).toBeGreaterThan(0)
  }
})

test('Wikipedia はリダイレクトをたどってタイトルと要約を出す', async () => {
  expect(SOURCES[0]?.site).toBe('Wikipedia')
  const fetch: Fetch = async url =>
    url.endsWith('/random/summary')
      ? { status: 303, ok: false, headers: { location: '/api/rest_v1/page/summary/%E7%8C%AB' }, text: '' }
      : ok({ title: '猫', extract: 'ネコ科の動物。', content_urls: { desktop: { page: 'https://ja.wikipedia.org/wiki/%E7%8C%AB' } } })
  const shown = await nextItem(1, fetch, () => 0)
  expect(shown).toEqual({
    site: 'Wikipedia 日本語',
    title: '猫',
    summary: 'ネコ科の動物。',
    url: 'https://ja.wikipedia.org/wiki/%E7%8C%AB',
    isAd: false,
    lang: 'ja',
  })
})

test('要約が 5 行に届かなければトピックを足し、届けば 1 件だけ', async () => {
  // 取得できないときの予備は要約が短いので、複数並ぶ
  const short = await nextBatch(1, failing, 70, Math.random)
  expect(short.length).toBeGreaterThan(1)
  expect(short.length).toBeLessThanOrEqual(MAX_TOPICS)
  expect(summaryLines(short, 70) >= MIN_LINES || short.length === MAX_TOPICS).toBe(true)
  expect(new Set(short.map(one => one.site)).size).toBe(Math.min(short.length, 3))

  // 長い要約なら 1 件で足りる
  const long = 'あ'.repeat(300)
  const fetch: Fetch = async () => ok({ title: '長い記事', extract: long })
  const single = await nextBatch(1, fetch, 70, () => 0)
  expect(single).toHaveLength(1)
})

test('企業はカテゴリから 1 社選び、日本は日本語・海外は英語（翻訳対象）として出す', async () => {
  const seen: string[] = []
  const wiki = (lang: string, name: string): Fetch => async url => {
    seen.push(url)
    return url.includes('list=categorymembers')
      ? ok({ query: { categorymembers: [{ title: name }] } })
      : ok({ title: name, extract: `${name} is a company.`, content_urls: { desktop: { page: `https://${lang}.wikipedia.org/wiki/X` } } })
  }
  const ja = await japaneseCompany.load(wiki('ja', '例示製作所'), () => 0)
  expect(ja.site).toBe('日本の企業（東証プライム）')
  expect(ja.lang).toBe('ja')
  expect(seen[0]).toContain('ja.wikipedia.org/w/api.php')
  expect(seen[0]).toContain('cmstartsortkeyprefix=%E3%81%82')

  const en = await foreignCompany.load(wiki('en', 'Example Corp'), () => 0)
  expect(en.site).toBe('海外の企業（NYSE）')
  expect(en.lang).toBe('en')
  expect(en.url).toBe('https://en.wikipedia.org/wiki/X')
})

test('OpenAlex の転置インデックスを文章に戻す', () => {
  expect(abstractOf({ the: [0, 3], cat: [1], sat: [2], mat: [4] })).toBe('the cat sat the mat')
  expect(abstractOf(null)).toBe('')
})

test('arXiv の論文は英語として取り込まれる', async () => {
  const arxiv = SOURCES.find(one => one.site === 'arXiv')
  const atom = '<feed><entry><id>http://arxiv.org/abs/2610.00001v1</id><title>A  Study\n of Cats</title>' +
    '<summary> Cats are &amp; were great. </summary><author><name>A. Author</name></author></entry></feed>'
  const shown = await arxiv!.load(async () => ok(atom), () => 0)
  expect(shown.title).toBe('A Study of Cats')
  expect(shown.url).toBe('https://arxiv.org/abs/2610.00001v1')
  expect(shown.summary).toBe('A. Author ／ Cats are & were great.')
  expect(shown.lang).toBe('en')
})

test('翻訳：設定どおりに訳し、失敗や対象外は元のまま', async () => {
  const en = { site: 'arXiv 人工知能', title: 'Cats', summary: 'Cats are great.', url: 'https://arxiv.org/abs/1', isAd: false, lang: 'en' as const }
  const ja = { ...en, lang: 'ja' as const }
  const complete = async () => '```json\n{"title": "猫", "summary": "猫は素晴らしい。"}\n```'
  const deps = { fetch: failing, complete }

  expect(await translateItem(en, readConfig({}), deps)).toEqual(en)
  const viaClaude = await translateItem(en, readConfig({ translator: 'claude' }), deps)
  expect(viaClaude).toEqual({ ...en, title: '猫', summary: '猫は素晴らしい。', isTranslated: true })
  expect(await translateItem(ja, readConfig({ translator: 'claude' }), deps)).toEqual(ja)
  expect(await translateItem(en, readConfig({ translator: 'ollama' }), deps)).toEqual(en)
  expect(await translateItem(en, readConfig({ translator: 'deepl' }), deps)).toEqual(en)

  const deepl: Fetch = async (url, init) => {
    expect(url).toBe('https://api-free.deepl.com/v2/translate')
    expect(init?.headers?.authorization).toBe('DeepL-Auth-Key k:fx')
    return ok({ translations: [{ text: '猫' }, { text: '猫は素晴らしい。' }] })
  }
  const viaDeepl = await translateItem(en, readConfig({ translator: 'deepl', deeplApiKey: 'k:fx' }), { fetch: deepl, complete })
  expect(viaDeepl.title).toBe('猫')
  expect(viaDeepl.isTranslated).toBe(true)

  expect(parsePair('no json')).toBeUndefined()
  expect(readConfig({ translator: 'bogus' }).translator).toBe('none')
})

test('履歴は広告以外を新しい順に残し、Markdown にできる', () => {
  const wiki = { site: 'Wikipedia', title: '猫 [ネコ]', summary: 'ネコ科の動物。', url: 'https://ja.wikipedia.org/wiki/%E7%8C%AB', isAd: false }
  const ad = { site: '本の広告', title: '新書', summary: '', url: 'https://shop.example.com/s?k=x', isAd: true }
  const zenn = { site: 'Zenn', title: 'strlen', summary: '', url: 'https://zenn.dev/a/b', isAd: false }
  // 2026-10-06 00:30 UTC = 09:30 JST
  const t = Date.UTC(2026, 9, 6, 0, 30)
  let list = addEntry([], wiki, t)
  list = addEntry(list, ad, t + 1000)
  list = addEntry(list, zenn, t + 60_000)
  expect(list.map(one => one.site)).toEqual(['Zenn', 'Wikipedia'])
  const md = toMarkdown(list)
  expect(md).toContain('## 2026-10-06')
  expect(md).toContain('- 09:30 **Wikipedia** [猫 \\[ネコ\\]](https://ja.wikipedia.org/wiki/%E7%8C%AB)')
  expect(md).not.toContain('shop.example.com')
})

test('帯は作業中だけ表示する', async ($, on) => {
  // エンジンの代わり：素の帯を描く
  on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })
  for (const surface of ['terminal', 'desktop'] as const) {
    const idle = await $.ui.mount({
      plugin: 'machi-yomi',
      surface,
      component: 'AbovePrompt',
      props: { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 80, scroll: { offset: 0, bodyRows: 10 }, view: {} },
    })
    expect(await idle.find({ text: 'engine' })).toBeDefined()
    expect(await idle.find({ text: /セレンディピティ/ })).toBeUndefined()
    await idle.unmount()

    const working = await $.ui.mount({
      plugin: 'machi-yomi',
      surface,
      component: 'AbovePrompt',
      props: { hasSurvey: false, isWorking: true, maxRows: 10, bodyColumns: 80, scroll: { offset: 0, bodyRows: 10 }, view: {} },
    })
    expect(await working.find({ text: /セレンディピティ/ })).toBeDefined()
    await working.unmount()
  }
})
