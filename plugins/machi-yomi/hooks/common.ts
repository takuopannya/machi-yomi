import type { HttpInit, HttpResponse } from 'claude-code'

import type { MachiYomiItem } from '../types'

export type Fetch = (url: string, init?: HttpInit) => Promise<HttpResponse>
export type Random = () => number
export type Source = { site: string; load: (fetch: Fetch, random: Random) => Promise<MachiYomiItem> }

export const HEADERS = {
  'user-agent': 'machi-yomi/0.4 (Claude Code mod; https://github.com/takuopannya/machi-yomi)',
  accept: 'application/json, application/atom+xml, text/html',
}

export const pick = <T>(list: readonly T[], random: Random): T =>
  list[Math.floor(random() * list.length) % list.length] as T

export const enc = encodeURIComponent

export function clip(text: string, max = 800): string {
  const flat = text.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim()
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat
}

export const decode = (text: string) =>
  text
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')

/** Link 要素が受け付ける形（ASCII のみ）に直す */
export const href = (url: string) => new URL(url).href

/** リダイレクトをたどって取得する（ホストがたどらない場合にも対応） */
export async function get(fetch: Fetch, url: string, init: HttpInit = {}): Promise<{ res: HttpResponse; url: string }> {
  let current = url
  for (let hop = 0; hop < 4; hop++) {
    const res = await fetch(current, { ...init, headers: { ...HEADERS, ...init.headers } })
    const location = res.headers.location
    if (res.status >= 300 && res.status < 400 && location) {
      current = new URL(location, current).href
      continue
    }
    return { res, url: current }
  }
  throw new Error(`too many redirects: ${url}`)
}

export async function getJson<T>(fetch: Fetch, url: string, init?: HttpInit): Promise<T> {
  const { res } = await get(fetch, url, init)
  if (!res.ok) throw new Error(`${res.status} ${url}`)
  return JSON.parse(res.text) as T
}

export function item(site: string, title: string, summary: string, url: string, lang: 'ja' | 'en' = 'ja'): MachiYomiItem {
  return { site, title: clip(title, 120), summary: clip(summary), url: href(url), isAd: false, lang }
}

/** その単語の Wikipedia の要約（取れなければ空） */
export async function wikiExtract(fetch: Fetch, word: string): Promise<string> {
  try {
    const s = await getJson<{ extract?: string }>(fetch, `https://ja.wikipedia.org/api/rest_v1/page/summary/${enc(word)}`)
    return s.extract ?? ''
  } catch {
    return ''
  }
}

export const withWiki = (note: string, extract: string) => (extract ? `${note} ／ ${extract}` : note)
