import { enc, get, getJson, item, pick, wikiExtract, withWiki, decode } from './common'
import type { Fetch, Random, Source } from './common'
import type { MachiYomiItem } from '../types'
import { BOOK_EVERY, bookTopic } from './books'
import { needsMore } from './layout'
import { foreignCompany, japaneseCompany, wikipediaEn, wikipediaJa } from './companies'
import { nichibun, nichibunCard } from './nichibun'
import { arxiv, openAlex } from './papers'

export type { Fetch, Random } from './common'

// ---- 単語リスト（API のないサイト・検索キーワード用） ----

const WORDS = [
  '猫', '寿司', '宇宙', '富士山', '江戸時代', '浮世絵', '量子力学', '将棋', '囲碁', '茶道',
  '俳句', '新幹線', '地震', '火山', '恐竜', '縄文土器', '和紙', '漆器', '盆栽', '落語',
  '歌舞伎', '能楽', '民謡', '妖怪', '天気予報', '暦', '和算', '金継ぎ', '醤油', '味噌',
  '発酵', '銭湯', '駄菓子', '路面電車', '灯台', '天文学', '気象', '狛犬', '招き猫', '折り紙',
  '活版印刷', '万年筆', 'カレーライス', 'ラーメン', '温泉', '城', '古墳', '和菓子', '漫画', 'アニメ',
  '特撮', 'ボーカロイド', '鉄道模型', 'ロボット', '人工知能', 'プログラミング', 'インターネット', '暗号', '素数', 'フラクタル',
]

const PIXIV_WORDS = [
  '猫耳', 'ケモミミ', 'メイド', '和風', '擬人化', '魔法少女', 'ロボット', 'ドラゴン', '妖怪', '吸血鬼',
  '巫女', '狐', '着物', 'サイバーパンク', 'スチームパンク', '異世界転生', 'ツンデレ', 'クーデレ', '幼馴染', '眼鏡',
]

const ESTAT = [
  { code: '00200521', name: '国勢調査', note: '5年に1度、日本に住むすべての人を対象にした最大の統計調査' },
  { code: '00200524', name: '人口推計', note: '国勢調査の間の年の人口を毎月推計' },
  { code: '00200531', name: '労働力調査', note: '就業者・失業者の数や失業率を毎月把握' },
  { code: '00200561', name: '家計調査', note: '世帯の収入と支出を品目ごとに記録（ぎょうざの消費額ランキングもここ）' },
  { code: '00200573', name: '消費者物価指数', note: 'モノとサービスの値段の動きを毎月測る' },
  { code: '00200533', name: '社会生活基本調査', note: '睡眠・仕事・趣味など1日の時間の使い方を調べる' },
  { code: '00200522', name: '住宅・土地統計調査', note: '空き家の数や住まいの広さがわかる' },
  { code: '00400001', name: '学校基本調査', note: '学校数・児童生徒数・進学率などの基本データ' },
  { code: '00450011', name: '人口動態調査', note: '出生・死亡・婚姻・離婚の件数を集計' },
  { code: '00500201', name: '農業経営統計調査', note: '農家の経営収支や生産費を調べる' },
  { code: '00600470', name: '法人土地・建物基本調査', note: '企業が持つ土地や建物の実態を調べる' },
]

// ---- 各サイト ----

const japanSearch: Source = {
  site: 'ジャパンサーチ',
  async load(fetch, random) {
    type Hit = { common: { id: string; title?: string; description?: string; contributor?: string[]; temporal?: string[] } }
    const word = pick(WORDS, random)
    const from = Math.floor(random() * 50)
    const r = await getJson<{ list: Hit[] }>(
      fetch,
      `https://jpsearch.go.jp/api/item/search/jps-cross?keyword=${enc(word)}&size=10&from=${from}`,
    )
    if (!r.list?.length) throw new Error('no hit')
    const { common } = pick(r.list, random)
    const summary = common.description || [common.contributor?.[0], common.temporal?.[0]].filter(Boolean).join(' / ')
    return item('ジャパンサーチ', common.title ?? `「${word}」の資料`, summary, `https://jpsearch.go.jp/item/${enc(common.id)}`)
  },
}

const estat: Source = {
  site: 'e-Stat',
  async load(fetch, random) {
    const s = pick(ESTAT, random)
    return item('e-Stat', s.name, withWiki(s.note, await wikiExtract(fetch, s.name)), `https://www.e-stat.go.jp/stat-search/files?toukei=${s.code}`)
  },
}

const kotobank: Source = {
  site: 'コトバンク',
  async load(fetch, random) {
    const word = pick(WORDS, random)
    return item('コトバンク', `「${word}」を辞書で引く`, withWiki('複数の辞書・事典の解説をまとめて読めます', await wikiExtract(fetch, word)), `https://kotobank.jp/search?q=${enc(word)}`)
  },
}

const nicopedia: Source = {
  site: 'ニコニコ大百科',
  async load(fetch) {
    let { res, url } = await get(fetch, 'https://dic.nicovideo.jp/random/a')
    // 転送用の記事は meta refresh で本来の記事へ飛ばすので、たどる
    for (let hop = 0; hop < 2; hop++) {
      const refresh = res.text.match(/http-equiv="refresh"\s+content="\d+;\s*URL=([^"]+)"/i)
      if (!refresh?.[1] || res.text.includes('og:title')) break
      ;({ res, url } = await get(fetch, new URL(decode(refresh[1]), url).href))
    }
    if (!res.ok) throw new Error(`${res.status} nicopedia`)
    const text = res.text
    const meta = (name: string) => {
      const m = text.match(new RegExp(`<meta property="og:${name}" content="([^"]*)"`))
      return m?.[1] ? decode(m[1]) : ''
    }
    const og = meta('title')
    const title = (og.match(/^(.*?)とは[ (（]/)?.[1] ?? og.replace(/ - ニコニコ大百科$/, '')).trim()
    if (!title) throw new Error('no title')
    return item('ニコニコ大百科', title, meta('description'), meta('url') || url)
  },
}

const pixiv: Source = {
  site: 'ピクシブ百科事典',
  async load(fetch, random) {
    const word = pick(PIXIV_WORDS, random)
    return item('ピクシブ百科事典', word, withWiki(`ピクシブ百科事典で「${word}」の記事を読む`, await wikiExtract(fetch, word)), `https://dic.pixiv.net/a/${enc(word)}`)
  },
}

const qiita: Source = {
  site: 'Qiita',
  async load(fetch, random) {
    type Q = { title: string; url: string; body?: string; tags?: { name: string }[]; user?: { id: string } }
    const page = 1 + Math.floor(random() * 100)
    const list = await getJson<Q[]>(fetch, `https://qiita.com/api/v2/items?page=${page}&per_page=20`)
    if (!list.length) throw new Error('no items')
    const q = pick(list, random)
    const tags = (q.tags ?? []).map(t => `#${t.name}`).join(' ')
    // 本文の冒頭（コードブロック・記号を除く）も要約に入れる
    const body = (q.body ?? '')
      .replace(/```[\s\S]*?```/g, ' ')
      .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/[#>*`|_-]+/g, ' ')
    return item('Qiita', q.title, [[q.user ? `@${q.user.id}` : '', tags].filter(Boolean).join('  '), body].join(' ／ '), q.url)
  },
}

const zenn: Source = {
  site: 'Zenn',
  async load(fetch, random) {
    type Z = { title: string; path: string; emoji?: string; user?: { username: string }; liked_count?: number }
    const page = 1 + Math.floor(random() * 30)
    const r = await getJson<{ articles: Z[] }>(fetch, `https://zenn.dev/api/articles?order=latest&page=${page}`)
    if (!r.articles?.length) throw new Error('no articles')
    const z = pick(r.articles, random)
    const by = z.user ? `@${z.user.username}` : ''
    return item('Zenn', `${z.emoji ?? ''} ${z.title}`.trim(), [by, z.liked_count ? `♥ ${z.liked_count}` : ''].filter(Boolean).join('  '), `https://zenn.dev${z.path}`)
  },
}

export const SOURCES: readonly Source[] = [
  wikipediaJa, wikipediaEn, japanSearch, estat, kotobank, nicopedia, pixiv, qiita, zenn,
  arxiv, openAlex, japaneseCompany, foreignCompany, nichibun,
]

/** API のいらない、必ず成功する予備 */
const OFFLINE: readonly Source[] = [estat, kotobank, pixiv, nichibunCard]

type Picked = { item: MachiYomiItem; source: string }

/** ランダムなサイトの記事を 1 件と、取った情報源の名前。used の情報源はなるべく避ける */
async function pickTopic(fetch: Fetch, random: Random, used: readonly string[]): Promise<Picked> {
  const fresh = SOURCES.filter(one => !used.includes(one.site))
  const source = pick(fresh.length > 0 ? fresh : SOURCES, random)
  try {
    return { item: await source.load(fetch, random), source: source.site }
  } catch {
    const spare = OFFLINE.filter(one => one !== source && !used.includes(one.site))
    const backup = pick(spare.length > 0 ? spare : OFFLINE, random)
    return { item: await backup.load(fetch, random), source: backup.site }
  }
}

/** ランダムなサイトの記事を 1 件 */
export async function nextTopic(fetch: Fetch, random: Random = Math.random): Promise<MachiYomiItem> {
  return (await pickTopic(fetch, random, [])).item
}

/** n 回目（1 始まり）の 1 件目：BOOK_EVERY 回ごとに本との出会い、それ以外はランダムなサイト */
async function firstTopic(n: number, fetch: Fetch, random: Random): Promise<Picked> {
  return n % BOOK_EVERY === 0 ? { item: await bookTopic(fetch, random), source: '本' } : pickTopic(fetch, random, [])
}

export async function nextItem(n: number, fetch: Fetch, random: Random = Math.random): Promise<MachiYomiItem> {
  return (await firstTopic(n, fetch, random)).item
}

/** n 回目の表示ぶん：要約が MIN_LINES 行に届くまで、別の情報源からトピックを足す（幅 cells で数える） */
export async function nextBatch(n: number, fetch: Fetch, cells: number, random: Random = Math.random): Promise<MachiYomiItem[]> {
  const picked = [await firstTopic(n, fetch, random)]
  while (needsMore(picked.map(one => one.item), cells)) {
    picked.push(await pickTopic(fetch, random, picked.map(one => one.source)))
  }
  return picked.map(one => one.item)
}
