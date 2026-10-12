import type { MachiYomiItem } from '../types'
import type { Fetch } from './common'

export type Translator = 'none' | 'claude' | 'deepl' | 'ollama'

export type TranslateConfig = {
  translator: Translator
  claudeModel: string
  deeplApiKey: string
  ollamaUrl: string
  ollamaModel: string
}

export type TranslateDeps = {
  fetch: Fetch
  /** Claude に 1 回問い合わせて本文を返す（答えがなければ undefined） */
  complete: (model: string, prompt: string) => Promise<string | undefined>
}

/** 翻訳に送る要約の上限（文字数・トークンの節約） */
const SEND_LIMIT = 1500

export function readConfig(options: Readonly<Record<string, unknown>>): TranslateConfig {
  const text = (key: string, fallback: string) => {
    const value = options[key]
    return typeof value === 'string' && value.trim() !== '' ? value.trim() : fallback
  }
  const translator = text('translator', 'none')
  return {
    translator: (['none', 'claude', 'deepl', 'ollama'] as const).find(one => one === translator) ?? 'none',
    claudeModel: text('claudeModel', 'haiku'),
    deeplApiKey: text('deeplApiKey', ''),
    ollamaUrl: text('ollamaUrl', 'http://localhost:11434').replace(/\/+$/, ''),
    ollamaModel: text('ollamaModel', 'qwen2.5:7b'),
  }
}

const PROMPT = (title: string, summary: string) =>
  [
    'Translate the following title and summary of an article into natural Japanese.',
    'Reply with JSON only, in the form {"title": "...", "summary": "..."}. Keep proper nouns as they are when no common Japanese name exists.',
    '',
    `title: ${title}`,
    `summary: ${summary}`,
  ].join('\n')

/** 返答から {"title","summary"} を取り出す */
export function parsePair(text: string | undefined): { title: string; summary: string } | undefined {
  const json = text?.match(/\{[\s\S]*\}/)?.[0]
  if (!json) return undefined
  try {
    const v = JSON.parse(json) as { title?: unknown; summary?: unknown }
    return typeof v.title === 'string' && typeof v.summary === 'string' && v.title.trim() !== ''
      ? { title: v.title.trim(), summary: v.summary.trim() }
      : undefined
  } catch {
    return undefined
  }
}

async function viaClaude(config: TranslateConfig, deps: TranslateDeps, title: string, summary: string) {
  return parsePair(await deps.complete(config.claudeModel, PROMPT(title, summary)))
}

async function viaDeepl(config: TranslateConfig, deps: TranslateDeps, title: string, summary: string) {
  if (!config.deeplApiKey) return undefined
  // Free プランのキーは末尾が ":fx"
  const host = config.deeplApiKey.endsWith(':fx') ? 'api-free.deepl.com' : 'api.deepl.com'
  const res = await deps.fetch(`https://${host}/v2/translate`, {
    method: 'POST',
    headers: { authorization: `DeepL-Auth-Key ${config.deeplApiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({ text: [title, summary || ' '], target_lang: 'JA' }),
  })
  if (!res.ok) return undefined
  const [t, s] = (JSON.parse(res.text) as { translations?: { text: string }[] }).translations ?? []
  return t ? { title: t.text, summary: summary ? (s?.text ?? '') : '' } : undefined
}

async function viaOllama(config: TranslateConfig, deps: TranslateDeps, title: string, summary: string) {
  const res = await deps.fetch(`${config.ollamaUrl}/api/generate`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model: config.ollamaModel, prompt: PROMPT(title, summary), stream: false, format: 'json' }),
  })
  if (!res.ok) return undefined
  return parsePair((JSON.parse(res.text) as { response?: string }).response)
}

/** 英語の記事を日本語にする。設定がない・失敗したときは元のまま返す */
export async function translateItem(one: MachiYomiItem, config: TranslateConfig, deps: TranslateDeps): Promise<MachiYomiItem> {
  if (one.lang !== 'en' || config.translator === 'none') return one
  const summary = one.summary.slice(0, SEND_LIMIT)
  try {
    const pair =
      config.translator === 'claude'
        ? await viaClaude(config, deps, one.title, summary)
        : config.translator === 'deepl'
          ? await viaDeepl(config, deps, one.title, summary)
          : await viaOllama(config, deps, one.title, summary)
    return pair ? { ...one, title: pair.title, summary: pair.summary, isTranslated: true } : one
  } catch {
    return one
  }
}
