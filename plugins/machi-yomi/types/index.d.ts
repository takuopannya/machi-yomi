export type MachiYomiItem = {
  site: string
  title: string
  summary: string
  url: string
  /** 広告（PR）かどうか */
  isAd: boolean
  /** 元の言語。'en' は翻訳の対象 */
  lang?: 'ja' | 'en'
  /** 自動翻訳した結果かどうか */
  isTranslated?: boolean
}

/** 表示した記事の履歴 1 件（広告は含めない） */
export type MachiYomiHistoryEntry = {
  shownAt: number
  site: string
  title: string
  summary: string
  url: string
}

declare module 'claude-code' {
  interface PluginState {
    'machi-yomi': {
      current: MachiYomiItem[]
      count: number
      isHidden: boolean
    }
  }
}
