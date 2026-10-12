import { getJson, item, pick, wikiExtract, withWiki } from './common'
import type { Fetch, Random, Source } from './common'
import type { MachiYomiItem } from '../types'

/** 何回ごとに「本との出会い」の枠を入れるか */
export const BOOK_EVERY = 10

// ---- 青空文庫：名作をリストから選び、Wikipedia の要約を添える ----

const AOZORA = [
  { title: '吾輩は猫である', author: '夏目漱石', card: '000148/card789' },
  { title: 'こころ', author: '夏目漱石', card: '000148/card773' },
  { title: '坊っちゃん', author: '夏目漱石', card: '000148/card752' },
  { title: '夢十夜', author: '夏目漱石', card: '000148/card799' },
  { title: '草枕', author: '夏目漱石', card: '000148/card776' },
  { title: '三四郎', author: '夏目漱石', card: '000148/card794' },
  { title: '羅生門', author: '芥川龍之介', card: '000879/card127' },
  { title: '蜘蛛の糸', author: '芥川龍之介', card: '000879/card92' },
  { title: '杜子春', author: '芥川龍之介', card: '000879/card170' },
  { title: '鼻', author: '芥川龍之介', card: '000879/card42' },
  { title: '河童', author: '芥川龍之介', card: '000879/card69' },
  { title: '手巾', author: '芥川龍之介', card: '000879/card43' },
  { title: '走れメロス', author: '太宰治', card: '000035/card1567' },
  { title: '人間失格', author: '太宰治', card: '000035/card301' },
  { title: '斜陽', author: '太宰治', card: '000035/card1565' },
  { title: '女生徒', author: '太宰治', card: '000035/card275' },
  { title: '銀河鉄道の夜', author: '宮沢賢治', card: '000081/card456' },
  { title: '注文の多い料理店', author: '宮沢賢治', card: '000081/card43754' },
  { title: '風の又三郎', author: '宮沢賢治', card: '000081/card462' },
  { title: 'セロ弾きのゴーシュ', author: '宮沢賢治', card: '000081/card470' },
  { title: 'ドグラ・マグラ', author: '夢野久作', card: '000096/card2093' },
  { title: '山月記', author: '中島敦', card: '000119/card624' },
  { title: '檸檬', author: '梶井基次郎', card: '000074/card424' },
  { title: '高瀬舟', author: '森鴎外', card: '000129/card691' },
  { title: '舞姫', author: '森鴎外', card: '000129/card2078' },
  { title: '桜の森の満開の下', author: '坂口安吾', card: '001095/card42618' },
  { title: '堕落論', author: '坂口安吾', card: '001095/card42620' },
  { title: '怪人二十面相', author: '江戸川乱歩', card: '001779/card57228' },
  { title: '少年探偵団', author: '江戸川乱歩', card: '001779/card56669' },
  { title: '二銭銅貨', author: '江戸川乱歩', card: '001779/card56647' },
  { title: '学問のすすめ', author: '福沢諭吉', card: '000296/card47061' },
  { title: '桃太郎', author: '楠山正雄', card: '000329/card18376' },
] as const

export const aozora: Source = {
  site: '青空文庫',
  async load(fetch, random) {
    const book = pick(AOZORA, random)
    const note = `${book.author}の作品。青空文庫で全文を無料で読めます`
    return item('本との出会い 青空文庫', `${book.title}（${book.author}）`, withWiki(note, await wikiExtract(fetch, book.title)), `https://www.aozora.gr.jp/cards/${book.card}.html`)
  },
}

// ---- Open Library：分野をランダムに選び、世界の本から 1 冊 ----

const SUBJECTS = [
  'astronomy', 'mathematics', 'philosophy', 'history', 'biology', 'architecture', 'music', 'poetry',
  'cooking', 'mythology', 'science_fiction', 'design', 'economics', 'psychology', 'linguistics', 'travel',
] as const

type Work = { key: string; title: string; authors?: { name: string }[]; first_publish_year?: number }

export const openLibrary: Source = {
  site: 'Open Library',
  async load(fetch, random) {
    const subject = pick(SUBJECTS, random)
    const offset = Math.floor(random() * 200)
    const r = await getJson<{ works: Work[] }>(fetch, `https://openlibrary.org/subjects/${subject}.json?limit=1&offset=${offset}`)
    const w = r.works?.[0]
    if (!w) throw new Error('no work')
    let description = ''
    try {
      const d = await getJson<{ description?: string | { value?: string } }>(fetch, `https://openlibrary.org${w.key}.json`)
      description = typeof d.description === 'string' ? d.description : (d.description?.value ?? '')
    } catch {
      // 説明がなくても出す
    }
    const by = [w.authors?.map(a => a.name).join(', '), w.first_publish_year].filter(Boolean).join(', ')
    return item(`本との出会い Open Library（${subject.replace('_', ' ')}）`, w.title, [by, description].filter(Boolean).join(' ／ '), `https://openlibrary.org${w.key}`, 'en')
  },
}

/** 本の枠の 1 冊。取れなければ青空文庫 */
export async function bookTopic(fetch: Fetch, random: Random): Promise<MachiYomiItem> {
  const source = random() < 0.6 ? aozora : openLibrary
  try {
    return await source.load(fetch, random)
  } catch {
    return aozora.load(fetch, random)
  }
}
