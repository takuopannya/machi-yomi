import { enc, getJson, item, pick } from './common'
import type { Fetch, Random, Source } from './common'

type Lang = 'ja' | 'en'
type Category = { category: string; label: string }

// ---- Wikipedia（日本語版・英語版のランダム記事） ----

type Summary = { title: string; extract?: string; content_urls?: { desktop?: { page?: string } } }

const pageUrl = (lang: Lang, s: Summary) => s.content_urls?.desktop?.page ?? `https://${lang}.wikipedia.org/wiki/${enc(s.title)}`

export const wikipediaJa: Source = {
  site: 'Wikipedia',
  async load(fetch) {
    const s = await getJson<Summary>(fetch, 'https://ja.wikipedia.org/api/rest_v1/page/random/summary')
    return item('Wikipedia 日本語', s.title, s.extract ?? '', pageUrl('ja', s))
  },
}

export const wikipediaEn: Source = {
  site: 'Wikipedia English',
  async load(fetch) {
    const s = await getJson<Summary>(fetch, 'https://en.wikipedia.org/api/rest_v1/page/random/summary')
    return item('Wikipedia English', s.title, s.extract ?? '', pageUrl('en', s), 'en')
  },
}

// ---- 企業：上場企業などのカテゴリから 1 社選び、その記事の要約を出す ----

const JA_CATEGORIES: readonly Category[] = [
  { category: '東証プライム上場企業', label: '東証プライム' },
  { category: '東証スタンダード上場企業', label: '東証スタンダード' },
  { category: '東証グロース上場企業', label: '東証グロース' },
  { category: '日本の多国籍企業', label: '多国籍企業' },
]

const EN_CATEGORIES: readonly Category[] = [
  { category: 'Companies listed on the New York Stock Exchange', label: 'NYSE' },
  { category: 'Companies listed on the Nasdaq', label: 'Nasdaq' },
  { category: 'Companies listed on the London Stock Exchange', label: 'ロンドン' },
  { category: 'Companies listed on Euronext Paris', label: 'パリ' },
  { category: 'Companies listed on the Frankfurt Stock Exchange', label: 'フランクフルト' },
  { category: 'Companies listed on the Hong Kong Stock Exchange', label: '香港' },
  { category: 'Companies listed on the Korea Exchange', label: '韓国' },
  { category: 'Companies listed on the Bombay Stock Exchange', label: 'ボンベイ' },
]

/** カテゴリ内の並び順（ソートキー）の頭。ここから読むことで、毎回ちがう企業に当たる */
const JA_PREFIXES = [...'あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわ']
const EN_PREFIXES = [...'ABCDEFGHIJKLMNOPRSTUVW']

type Members = { query?: { categorymembers?: { title: string }[] } }

/** カテゴリから記事名を 1 つ選ぶ */
export async function pickMember(fetch: Fetch, random: Random, lang: Lang, category: string): Promise<string> {
  const prefix = pick(lang === 'ja' ? JA_PREFIXES : EN_PREFIXES, random)
  const url =
    `https://${lang}.wikipedia.org/w/api.php?action=query&format=json&list=categorymembers` +
    `&cmtitle=${enc(`Category:${category}`)}&cmtype=page&cmlimit=20&cmstartsortkeyprefix=${enc(prefix)}`
  const pages = (await getJson<Members>(fetch, url)).query?.categorymembers ?? []
  if (pages.length === 0) throw new Error(`empty: ${category}`)
  return pick(pages, random).title
}

async function company(fetch: Fetch, random: Random, lang: Lang) {
  const { category, label } = pick(lang === 'ja' ? JA_CATEGORIES : EN_CATEGORIES, random)
  const title = await pickMember(fetch, random, lang, category)
  const s = await getJson<Summary>(fetch, `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${enc(title)}`)
  return item(`${lang === 'ja' ? '日本の企業' : '海外の企業'}（${label}）`, s.title, s.extract ?? '', pageUrl(lang, s), lang)
}

export const japaneseCompany: Source = {
  site: '日本の企業',
  load: (fetch, random) => company(fetch, random, 'ja'),
}

export const foreignCompany: Source = {
  site: '海外の企業',
  load: (fetch, random) => company(fetch, random, 'en'),
}
