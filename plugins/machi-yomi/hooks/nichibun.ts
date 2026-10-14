import { enc, getJson, item, pick } from './common'
import type { Source } from './common'

// 国際日本文化研究センター（日文研）のデータベース。
// 日文研のサイトは私的使用・引用を超える利用に許諾が要るため、中身を取り込むのは
// ジャパンサーチで CC BY-SA として公開されている資料だけにする。
// それ以外のデータベースは、自前の一言紹介とリンクだけを出す（リンクは自由）。

const SOURCE_NOTE = '出典：国際日本文化研究センター'

/** ジャパンサーチに CC BY-SA で載っている日文研のデータベース（件数は 2026-10 時点の目安） */
/** ジャパンサーチは 2000 件目より先を返さない */
const JPS_LIMIT = 2000

const JPS_DATABASES = [
  { id: 'irc01', name: '宗田文庫図版資料', note: '日本の医学・薬学の歴史を伝える資料から集めた図版', count: 2600 },
  { id: 'irc02', name: 'ちりめん本', note: '明治期に外国語で出版された、ちりめん紙の日本昔話の絵本', count: 70 },
  { id: 'irc03', name: '平安京都名所図会', note: '江戸から明治にかけての、京都の名所を描いた絵入りの案内記', count: 1900 },
  { id: 'irc05', name: '在外日本美術', note: '海外の美術館が所蔵する日本の絵画・版画・工芸品', count: 1800 },
  { id: 'irc06', name: '日本関係欧文図書目録', note: '1900年以前に欧米で出版された、日本についての本', count: 1000 },
] as const

/** 中身は取り込まず、紹介とリンクだけを出すデータベース */
const CARDS = [
  { slug: 'yokai', name: '怪異・妖怪伝承データベース', note: '全国の民俗学の資料から集めた、怪異や妖怪の言い伝え3万5千件以上の記録。地名や妖怪の名前で引けます' },
  { slug: 'yokaigazou', name: '怪異・妖怪画像データベース', note: '絵巻や版本に描かれた妖怪たちの姿を集めた画像データベース' },
  { slug: 'emakimono', name: '絵巻物', note: '日文研が所蔵する絵巻を、高精細な画像で端から端までたどれます' },
  { slug: 'namazue', name: '鯰絵コレクション', note: '安政の大地震のあとに出回った、大鯰を描いた錦絵のコレクション' },
  { slug: 'oldp', name: '古写真', note: '幕末から明治初期に撮られ、手で色付けされた写真' },
  { slug: 'gaizo', name: '外像', note: '海外の出版物に描かれた日本の姿を、挿絵や写真から5万点以上集めたもの' },
  { slug: 'chirimen', name: 'ちりめん本', note: '明治期に外国語で出版された、ちりめん紙の日本昔話の絵本' },
  { slug: 'kicho', name: '日本関係欧文貴重書', note: '主に1854年以前に欧米で出版された、日本について書かれた貴重書' },
  { slug: 'kinseiki-eiri', name: '近世期絵入百科事典', note: '『訓蒙図彙』の系統を中心とした、江戸時代の絵入り百科事典' },
  { slug: 'esoshi', name: '風俗図会', note: '江戸時代の暮らしや風俗を描いた絵本を、高精細な画像で' },
  { slug: 'heian-diaries', name: '摂関期古記録', note: '平安時代の貴族の日記を、読み下し文で全文検索できます' },
  { slug: 'zenseki', name: '中世禅籍テクスト', note: '中世の禅の書物を全文テキストで検索できます' },
  { slug: 'haikai', name: '俳諧', note: '芭蕉や蕪村をはじめとする主要な俳諧作品の句を検索できます' },
  { slug: 'renga', name: '連歌', note: '江戸時代までの連歌作品、約20万句を検索できます' },
  { slug: 'waka', name: '和歌', note: '勅撰集や主な私家集の和歌、約19万首を検索できます' },
  { slug: 'kigo', name: '季語検索', note: '3万5千以上の季語を引ける検索システム' },
  { slug: 'rokyoku', name: '浪曲SPレコード デジタルアーカイブ', note: '約1万枚の浪曲SPレコード。著作権の切れた音源は聴けます' },
  { slug: 'kaigai-hoji', name: '海外邦字新聞', note: '海外に移住した日本人のコミュニティで発行された日本語新聞の紙面' },
  { slug: 'kijinden', name: '近世畸人伝', note: '江戸時代の個性的な人物たちの伝記集を、挿絵と現代の字形のテキストで' },
  { slug: 'kojiruien-zenbun', name: '古事類苑全文', note: '明治政府が編んだ日本最大級の百科事典『古事類苑』の全文' },
  { slug: 'syozou-map', name: '所蔵地図', note: '江戸時代の都市図を中心とした、日文研所蔵の古地図' },
  { slug: 'ukiyoe', name: '米国議会図書館所蔵浮世絵', note: 'アメリカ議会図書館が所蔵する浮世絵の画像と解説' },
  { slug: 'gyouji', name: '都年中行事画帖', note: '京都の一年の行事を描いた画帖を、本文とともに' },
  { slug: 'chousen', name: '朝鮮写真絵はがき', note: '1900年代から1940年代の朝鮮半島の写真絵はがき' },
] as const

const cardItem = (card: (typeof CARDS)[number]) =>
  item('日文研 データベース紹介', card.name, `${card.note} ／ 国際日本文化研究センター`, `https://www.nichibun.ac.jp/ja/db/category/${card.slug}/`)

/** 「[資料名]」「［タイトル］」のような見出しを取る */
const cleanLabel = (text: string) => text.replace(/[[［][^\]］]*[\]］]/g, '').replace(/◆U[0-9A-F]+◆/g, '〓').trim()

type Hit = { common: { title?: string; description?: string; contributor?: string[]; temporal?: string[]; linkUrl?: string; id: string } }

/** 紹介カードだけ（ネットなしで出せる予備） */
export const nichibunCard: Source = {
  site: '日文研',
  async load(_fetch, random) {
    return cardItem(pick(CARDS, random))
  },
}

export const nichibun: Source = {
  site: '日文研',
  async load(fetch, random) {
    if (random() >= 0.65) return cardItem(pick(CARDS, random))
    const db = pick(JPS_DATABASES, random)
    const from = Math.floor(random() * Math.min(db.count, JPS_LIMIT))
    const r = await getJson<{ list?: Hit[] }>(fetch, `https://jpsearch.go.jp/api/item/search/jps-cross?f-db=${db.id}&size=1&from=${from}`)
    const c = r.list?.[0]?.common
    const title = c?.title ? cleanLabel(c.title) : ''
    if (!c || !title) throw new Error('no item')
    const details = [cleanLabel(c.contributor?.[0] ?? ''), cleanLabel(c.temporal?.[0] ?? ''), cleanLabel(c.description ?? '')].filter(Boolean)
    const summary = [db.note, ...details, `${SOURCE_NOTE}「${db.name}」（CC BY-SA）`].join(' ／ ')
    return item(`日文研 ${db.name}`, title, summary, c.linkUrl ?? `https://jpsearch.go.jp/item/${enc(c.id)}`)
  },
}
