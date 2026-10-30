import { clip, decode, getJson, href, pick } from './common'
import type { Fetch, Random, Source } from './common'
import type { MachiYomiItem } from '../types'

/** 絵画を探すカテゴリ（Commons の「秀逸な画像」の絵画。国・都市ごとの子カテゴリから選ぶ） */
const ROOT = 'Category:Featured pictures of paintings'
const API = 'https://commons.wikimedia.org/w/api.php'
/** 帯に出す縮小画像の幅（px） */
export const THUMB_WIDTH = 240

/** 載せてよいライセンス（クリエイティブ・コモンズとパブリックドメイン） */
export const isOpenLicense = (name: string) => /^(cc[\s-]|cc0|public domain|pd[\s-]|no restrictions)/i.test(name.trim())

const JAPANESE = /[ぁ-んァ-ヶ一-龯]/

/** 子カテゴリの一覧（1 度取ったら覚えておく） */
let categories: string[] | undefined

async function paintingCategories(fetch: Fetch): Promise<string[]> {
  if (categories?.length) return categories
  type R = { query?: { categorymembers?: { title: string }[] } }
  const r = await getJson<R>(fetch, `${API}?action=query&format=json&formatversion=2&list=categorymembers&cmtitle=${encodeURIComponent(ROOT)}&cmtype=subcat&cmlimit=500`)
  const found = (r.query?.categorymembers ?? []).map(one => one.title)
  if (found.length === 0) throw new Error('no categories')
  categories = found
  return found
}

type Meta = Record<string, { value?: unknown } | undefined>
type Page = {
  title: string
  imageinfo?: { thumburl?: string; thumbwidth?: number; thumbheight?: number; descriptionurl?: string; mime?: string; extmetadata?: Meta }[]
}

/** Commons のメタデータ（HTML）を文字にする：隠しデータ（QS:…）・「翻訳」リンク・編集アイコン・言語名を除く */
export function cleanMeta(html: string): string {
  const text = html
    .replace(/<(div|span)[^>]*display:\s*none[^>]*>[^<]*<\/\1>/gi, ' ')
    .replace(/<small class="plainlinks">[\s\S]*?<\/small>/gi, ' ')
    .replace(/<span[^>]*noprint[^>]*>[\s\S]*?<\/span>/gi, ' ')
  return clip(decode(text.replace(/&nbsp;|&#160;/g, ' ')), 400)
    // 入れ子のせいで消し残った隠しデータ（title QS:P1476,pl:"…" など）
    .replace(/(?:title|label|date)?\s*QS:[^\s"]*(?:"[^"]*")?/g, ' ')
    .replace(/^[^\s:：]{1,12}語[:：]\s*/, '')
    .replace(/\s+/g, ' ')
    .trim()
}

const metaText = (meta: Meta | undefined, key: string) => cleanMeta(String(meta?.[key]?.value ?? ''))

/** Commons の 1 ファイルを帯の 1 件にする（画像やライセンスが合わなければ undefined） */
export function paintingItem(page: Page): MachiYomiItem | undefined {
  const info = page.imageinfo?.[0]
  if (!info?.thumburl || !info.descriptionurl || !info.thumbwidth || !info.thumbheight) return undefined
  if (info.mime !== 'image/jpeg') return undefined
  const meta = info.extmetadata
  const license = metaText(meta, 'LicenseShortName')
  if (!isOpenLicense(license)) return undefined
  const title = metaText(meta, 'ObjectName') || page.title.replace(/^File:/, '').replace(/\.[a-z]+$/i, '')
  const byline = [metaText(meta, 'Artist'), metaText(meta, 'DateTimeOriginal')].filter(Boolean).join(' / ')
  const summary = [byline, metaText(meta, 'ImageDescription')].filter(Boolean).join(' ／ ')
  return {
    site: `Commons 絵画・${license}`,
    title: clip(title, 120),
    summary: clip(summary),
    url: href(info.descriptionurl),
    isAd: false,
    // 作者名だけ日本語のことが多いので、題名で決める
    lang: JAPANESE.test(title) ? 'ja' : 'en',
    image: { url: href(info.thumburl), width: info.thumbwidth, height: info.thumbheight },
  }
}

/** Wikimedia Commons の絵画（CC ライセンス・パブリックドメイン）を 1 点、縮小画像付きで */
export const commonsPainting: Source = {
  site: 'Commons 絵画',
  async load(fetch: Fetch, random: Random) {
    const category = pick(await paintingCategories(fetch), random)
    // 並び順のキーをランダムな頭文字から始めて、カテゴリの中からばらばらに選ぶ
    const letter = (0x41 + Math.floor(random() * 26)).toString(16)
    const query = (start: string) =>
      [
        `${API}?action=query&format=json&formatversion=2`,
        `generator=categorymembers&gcmtitle=${encodeURIComponent(category)}&gcmtype=file&gcmlimit=5&gcmsort=sortkey${start}`,
        `prop=imageinfo&iiprop=url|mime|extmetadata&iiurlwidth=${THUMB_WIDTH}&iiextmetadatalanguage=ja`,
        'iiextmetadatafilter=ObjectName|Artist|LicenseShortName|ImageDescription|DateTimeOriginal',
      ].join('&')
    type R = { query?: { pages?: Page[] } }
    let pages = (await getJson<R>(fetch, query(`&gcmstarthexsortkey=${letter}`))).query?.pages ?? []
    if (pages.length === 0) pages = (await getJson<R>(fetch, query(''))).query?.pages ?? []
    const usable = pages.map(paintingItem).filter((one): one is MachiYomiItem => one !== undefined)
    if (usable.length === 0) throw new Error('no painting')
    return pick(usable, random)
  },
}

/** 帯の画像の大きさ（端末の文字マスで。1 マスはおよそ縦長 1:2） */
export function imageCells(width: number, height: number, rows = 8): { columns: number; rows: number } {
  const columns = Math.round((rows * 2 * width) / Math.max(1, height))
  return { columns: Math.max(4, Math.min(32, columns)), rows }
}

/** Svg 要素に渡せる文字数の上限 */
export const SVG_LIMIT = 131072

/** これより大きい画像は縮めてから使う（px） */
export const MAX_WIDTH = 400

/** 画像の種類と大きさ（JPEG・PNG の先頭を読む）。どちらでもなければ undefined */
export function imageSize(base64: string): { type: 'jpeg' | 'png'; width: number; height: number } | undefined {
  let bin: string
  try {
    bin = atob(base64)
  } catch {
    return undefined
  }
  const at = (i: number) => bin.charCodeAt(i)
  const u16 = (i: number) => (at(i) << 8) | at(i + 1)
  if (bin.startsWith('\x89PNG')) return { type: 'png', width: (u16(16) << 16) | u16(18), height: (u16(20) << 16) | u16(22) }
  if (at(0) !== 0xff || at(1) !== 0xd8) return undefined
  // JPEG：マーカーを順にたどり、SOF（C0〜CF のうち C4・C8・CC 以外）で大きさを読む
  let i = 2
  while (i + 9 < bin.length) {
    if (at(i) !== 0xff) return undefined
    const marker = at(i + 1)
    if (marker === 0xff) {
      i += 1
      continue
    }
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { type: 'jpeg', width: u16(i + 7), height: u16(i + 5) }
    }
    i += 2 + u16(i + 2)
  }
  return undefined
}

/** 画像を埋め込んだ SVG（デスクトップ・エディタ・モバイル用）。読めない・大きすぎれば undefined */
export function pictureSvg(base64: string): string | undefined {
  const size = imageSize(base64)
  if (!size) return undefined
  const { type, width, height } = size
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><image href="data:image/${type};base64,${base64}" width="${width}" height="${height}"/></svg>`
  return svg.length <= SVG_LIMIT ? svg : undefined
}
