import { clip, decode, enc, get, getJson, item, pick } from './common'
import type { Source } from './common'

// ---- arXiv：分野をランダムに選び、新しめの論文から 1 本 ----

const ARXIV_CATEGORIES = [
  { cat: 'cs.AI', ja: '人工知能' },
  { cat: 'cs.CL', ja: '自然言語処理' },
  { cat: 'cs.CV', ja: 'コンピュータビジョン' },
  { cat: 'cs.HC', ja: 'ヒューマンインタフェース' },
  { cat: 'cs.RO', ja: 'ロボティクス' },
  { cat: 'cs.CR', ja: '暗号・セキュリティ' },
  { cat: 'astro-ph.EP', ja: '惑星科学' },
  { cat: 'astro-ph.GA', ja: '銀河天文学' },
  { cat: 'gr-qc', ja: '一般相対論・量子宇宙論' },
  { cat: 'quant-ph', ja: '量子物理' },
  { cat: 'cond-mat.soft', ja: 'ソフトマター' },
  { cat: 'physics.soc-ph', ja: '社会物理' },
  { cat: 'physics.hist-ph', ja: '物理学の歴史と哲学' },
  { cat: 'math.HO', ja: '数学の歴史と概観' },
  { cat: 'math.CO', ja: '組合せ論' },
  { cat: 'math.NT', ja: '数論' },
  { cat: 'q-bio.NC', ja: '神経科学' },
  { cat: 'q-bio.PE', ja: '集団と進化' },
  { cat: 'econ.GN', ja: '一般経済学' },
  { cat: 'q-fin.GN', ja: '一般金融' },
  { cat: 'stat.AP', ja: '応用統計' },
  { cat: 'eess.AS', ja: '音声・音響処理' },
] as const

const tag = (xml: string, name: string) => {
  const m = xml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`))
  return m?.[1] ? decode(m[1]).replace(/\s+/g, ' ').trim() : ''
}

export const arxiv: Source = {
  site: 'arXiv',
  async load(fetch, random) {
    const { cat, ja } = pick(ARXIV_CATEGORIES, random)
    const start = Math.floor(random() * 300)
    const url = `https://export.arxiv.org/api/query?search_query=cat:${enc(cat)}&sortBy=submittedDate&sortOrder=descending&start=${start}&max_results=1`
    const { res } = await get(fetch, url)
    if (!res.ok) throw new Error(`${res.status} arxiv`)
    const entry = res.text.match(/<entry>([\s\S]*?)<\/entry>/)?.[1]
    if (!entry) throw new Error('no entry')
    const title = tag(entry, 'title')
    const id = tag(entry, 'id').replace(/^http:/, 'https:')
    if (!title || !id) throw new Error('bad entry')
    const authors = [...entry.matchAll(/<name>([^<]*)<\/name>/g)].map(m => m[1] ?? '')
    const by = authors.length > 2 ? `${authors[0]} et al.` : authors.join(', ')
    return item(`arXiv ${ja}`, title, [by, tag(entry, 'summary')].filter(Boolean).join(' ／ '), id, 'en')
  },
}

// ---- OpenAlex：全分野の論文からランダムに 1 本 ----

type Work = {
  id: string
  title?: string
  doi?: string | null
  publication_year?: number
  abstract_inverted_index?: Record<string, number[]> | null
  authorships?: { author?: { display_name?: string } }[]
  primary_topic?: { field?: { display_name?: string } } | null
}

/** OpenAlex の転置インデックス形式の要約を文章に戻す */
export function abstractOf(index: Record<string, number[]> | null | undefined): string {
  if (!index) return ''
  const words: string[] = []
  for (const [word, places] of Object.entries(index)) {
    for (const at of places) words[at] = word
  }
  return words.filter(Boolean).join(' ')
}

export const openAlex: Source = {
  site: 'OpenAlex',
  async load(fetch, random) {
    const seed = Math.floor(random() * 1_000_000)
    const r = await getJson<{ results: Work[] }>(
      fetch,
      `https://api.openalex.org/works?sample=1&seed=${seed}&filter=has_abstract:true,language:en,type:article` +
        '&select=id,title,doi,publication_year,abstract_inverted_index,authorships,primary_topic',
    )
    const w = r.results?.[0]
    if (!w?.title) throw new Error('no work')
    const field = w.primary_topic?.field?.display_name
    const first = w.authorships?.[0]?.author?.display_name
    const by = first ? `${first}${(w.authorships?.length ?? 0) > 1 ? ' et al.' : ''}` : ''
    const meta = [by, w.publication_year ?? ''].filter(Boolean).join(', ')
    return item(`論文 ${field ?? 'OpenAlex'}`, w.title, clip([meta, abstractOf(w.abstract_inverted_index)].filter(Boolean).join(' ／ ')), w.doi ?? w.id, 'en')
  },
}
