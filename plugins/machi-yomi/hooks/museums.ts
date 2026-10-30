import { clip, decode, getJson, href, pick } from './common'
import type { Fetch, Random, Source } from './common'
import type { MachiYomiItem } from '../types'
import { THUMB_WIDTH, commonsPainting } from './art'

// ---- ヨーロッパ ----

/** SMK（デンマーク国立美術館）：パブリックドメインの絵画。画像は IIIF で縮小版を取る */
export const smkPainting: Source = {
  site: 'SMK 絵画',
  async load(fetch: Fetch, random: Random) {
    type Item = {
      titles?: { title: string; language?: string }[]
      production?: { creator?: string; creator_forename?: string; creator_surname?: string }[]
      production_date?: { period?: string }[]
      image_iiif_id?: string
      image_thumbnail?: string
      frontend_url?: string
      object_number?: string
      rights?: string
    }
    const search = (offset: number) =>
      getJson<{ found?: number; items?: Item[] }>(
        fetch,
        `https://api.smk.dk/api/v1/art/search/?keys=*&filters=%5Bhas_image:true%5D,%5Bpublic_domain:true%5D,%5Bobject_names:Painting%5D&offset=${offset}&rows=1&lang=en`,
      )
    // 該当はおよそ 4,600 点。はみ出したら先頭から
    let r = await search(Math.floor(random() * 4500))
    if (!r.items?.length) r = await search(0)
    const one = r.items?.[0]
    const image = one && smkImage(one.image_thumbnail, one.image_iiif_id)
    if (!one?.frontend_url || !image) throw new Error('no smk painting')
    const title = (one.titles?.find(t => /english|engelsk/i.test(t.language ?? '')) ?? one.titles?.[0])?.title ?? one.object_number ?? ''
    const who = one.production?.[0]
    const artist = who?.creator_forename && who.creator_surname ? `${who.creator_forename} ${who.creator_surname}` : (who?.creator ?? '')
    const byline = [artist, one.production_date?.[0]?.period].filter(Boolean).join(' / ')
    return {
      site: 'SMK デンマーク国立美術館・PD',
      title: clip(title, 120),
      summary: clip(`${byline}${byline ? ' ／ ' : ''}Statens Museum for Kunst, Copenhagen`),
      url: href(one.frontend_url),
      isAd: false,
      lang: 'en',
      image: { url: href(image) },
    }
  },
}

/** SMK の画像の縮小版：IIIF なら幅 THUMB_WIDTH で頼み、そうでなければサムネイルのまま（大きければ取り込むときに縮める） */
export function smkImage(thumbnail: string | undefined, iiif: string | undefined): string | undefined {
  if (thumbnail?.includes('/iiif/')) return thumbnail.replace(/\/full\/[^/]+\//, `/full/${THUMB_WIDTH},/`)
  if (iiif) return `${iiif}/full/${THUMB_WIDTH},/0/default.jpg`
  return thumbnail
}

/** Linked Art の言語（Getty AAT）：英語 */
const AAT_ENGLISH = 'http://vocab.getty.edu/aat/300388277'
/** Linked Art の分類：説明文 */
const AAT_DESCRIPTION = 'http://vocab.getty.edu/aat/300435452'

type Linked = { id?: string; content?: string; language?: { id?: string }[]; classified_as?: { id?: string }[] }
type RijksObject = {
  identified_by?: (Linked & { type?: string })[]
  referred_to_by?: Linked[]
  produced_by?: { carried_out_by?: { notation?: { '@language'?: string; '@value'?: string }[] }[]; part?: RijksObject['produced_by'][] }
}

const isEnglish = (one: Linked) => one.language?.some(l => l.id === AAT_ENGLISH) ?? false

/** Rijksmuseum の作品データ（Linked Art）を帯の 1 件にする（画像がなければ undefined） */
export function rijksItem(data: RijksObject, raw: string, year: number): MachiYomiItem | undefined {
  const image = raw.match(/https:\/\/iiif\.micr\.io\/([A-Za-z0-9]+)\//)?.[1]
  const number = data.identified_by?.find(one => one.type === 'Identifier')?.content
  if (!image || !number) return undefined
  const names = (data.identified_by ?? []).filter(one => one.type === 'Name' && one.content)
  const title = (names.find(isEnglish) ?? names[0])?.content ?? number
  const makers = [data.produced_by, ...(data.produced_by?.part ?? [])].flatMap(p => p?.carried_out_by ?? [])
  const artist = makers
    .map(m => (m.notation?.find(n => n['@language'] === 'en') ?? m.notation?.[0])?.['@value'])
    .filter((name): name is string => !!name && name !== 'anonymous')
    .join('、')
  const notes = (data.referred_to_by ?? []).filter(one => one.content && one.classified_as?.some(c => c.id === AAT_DESCRIPTION))
  const note = (notes.find(isEnglish) ?? notes[0])?.content ?? ''
  return {
    site: 'アムステルダム国立美術館・PD',
    title: clip(title, 120),
    summary: clip([[artist, `${year}年ごろ`].filter(Boolean).join(' / '), note].filter(Boolean).join(' ／ ')),
    url: href(`https://www.rijksmuseum.nl/en/collection/${encodeURIComponent(number)}`),
    isAd: false,
    lang: 'en',
    image: { url: `https://iiif.micr.io/${image}/full/${THUMB_WIDTH},/0/default.jpg` },
  }
}

/** Rijksmuseum（オランダ）：画像のある絵画を、ランダムな年（1450〜1900）から 1 点 */
export const rijksPainting: Source = {
  site: 'アムステルダム国立美術館',
  async load(fetch: Fetch, random: Random) {
    const year = 1450 + Math.floor(random() * 451)
    const list = await getJson<{ orderedItems?: { id: string }[] }>(
      fetch,
      `https://data.rijksmuseum.nl/search/collection?type=painting&imageAvailable=true&creationDate=${year}`,
    )
    if (!list.orderedItems?.length) throw new Error('no rijks painting')
    const { id } = pick(list.orderedItems, random)
    const data = await getJson<RijksObject>(fetch, id, { headers: { accept: 'application/ld+json' } })
    const shown = rijksItem(data, JSON.stringify(data), year)
    if (!shown) throw new Error('no rijks image')
    return shown
  },
}

// ---- アジア（日本の美術館・博物館） ----

/**
 * ジャパンサーチで選ぶ、自由に使えるライセンス（1 回の検索で 1 種類しか指定できない）と、画像付きの絵画の件数（2026-10 時点）。
 * CC0 の絵画は画像がほぼ webp で取り込めず、PDM は取れる範囲のほとんどが画像の取得を断る所なので、今は CC BY だけ
 * （ほぼ ColBase：東京・京都・奈良・九州の国立博物館）
 */
const JPS_RIGHTS = [{ id: 'ccby', name: 'CC BY', count: 8700 }] as const
/** ジャパンサーチの検索は先頭からおよそ 2,000 件までしか返さない（from が 3,000 で 0 件） */
const JPS_WINDOW = 1990

type JpsCommon = {
  id: string
  title?: string
  contributor?: string[]
  temporal?: string[]
  description?: string
  thumbnailUrl?: string[]
  contentsUrl?: string[]
  linkUrl?: string
  contentsRightsType?: string
}

const JAPANESE = /[ぁ-んァ-ヶ一-龯]/

/** 外からの画像の取得を断っている所（403 になる） */
const BLOCKED_HOSTS = ['museumcollection.tokyo']
const isBlocked = (url: string) => BLOCKED_HOSTS.some(host => url.includes(`//${host}/`))

/** ジャパンサーチの 1 件を帯の 1 件にする（JPEG・PNG の画像がなければ undefined） */
export function japanSearchItem(c: JpsCommon, license: string): MachiYomiItem | undefined {
  const image = [...(c.contentsUrl ?? []), ...(c.thumbnailUrl ?? [])].find(url => /\.(jpe?g|png)(\?|$)/i.test(url) && !isBlocked(url))
  if (!image || !c.title) return undefined
  // 作者・所蔵館は日本語の表記だけ（英語の併記は除く）
  const who = (c.contributor ?? []).filter(one => JAPANESE.test(one)).map(one => one.split(/[　]/)[0])
  const byline = [...who, c.temporal?.[0]].filter(Boolean).join(' / ')
  return {
    site: `ジャパンサーチ 絵画・${license}`,
    title: clip(c.title, 120),
    // ColBase の説明にある読み仮名の記法（岸裡＠がんり＠社）は除く
    summary: clip([byline, decode(c.description ?? '').replace(/＠[^＠]{1,20}＠/g, '')].filter(Boolean).join(' ／ ')),
    url: href(c.linkUrl ?? `https://jpsearch.go.jp/item/${encodeURIComponent(c.id)}`),
    isAd: false,
    lang: 'ja',
    image: { url: href(image) },
  }
}

/** ジャパンサーチ：東京国立博物館ほか国内の館の絵画（CC BY・CC0・パブリックドメイン） */
export const japanSearchPainting: Source = {
  site: 'ジャパンサーチ 絵画',
  async load(fetch: Fetch, random: Random) {
    const rights = pick(JPS_RIGHTS, random)
    const from = Math.floor(random() * Math.min(rights.count, JPS_WINDOW))
    const r = await getJson<{ list?: { common: JpsCommon }[] }>(
      fetch,
      `https://jpsearch.go.jp/api/item/search/jps-cross?f-type=paint&f-rights=${rights.id}&f-contents=thumb&size=10&from=${from}`,
    )
    const usable = (r.list ?? []).map(one => japanSearchItem(one.common, rights.name)).filter((one): one is MachiYomiItem => one !== undefined)
    if (usable.length === 0) throw new Error('no jps painting')
    return pick(usable, random)
  },
}

// ---- まとめ ----

export const MUSEUMS: readonly Source[] = [commonsPainting, smkPainting, rijksPainting, japanSearchPainting]

/** 絵画：上の館からランダムに 1 つ。取れなければ別の館を順に試す */
export const painting: Source = {
  site: '絵画',
  async load(fetch: Fetch, random: Random) {
    const first = Math.floor(random() * MUSEUMS.length) % MUSEUMS.length
    let last: unknown
    for (let k = 0; k < MUSEUMS.length; k++) {
      try {
        return await MUSEUMS[(first + k) % MUSEUMS.length]!.load(fetch, random)
      } catch (error) {
        last = error
      }
    }
    throw last
  },
}
