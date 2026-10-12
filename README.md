# machi-yomi（待ち読み）

**日本語** · [English](README.en.md)

Claude Code が作業している待ち時間に、入力欄の上へランダムな記事を表示する mod です。Wikipedia（日本語・英語）、国内外の企業、海外の論文、統計、辞書、技術記事、青空文庫など、ふだん自分からは開かないページとの「知のセレンディピティ」を届けます。

```
╭──────────────────────────────────────────────╮
│ ✦ 知のセレンディピティ                    #12 │
│ arXiv 数論・訳  ねじれディオファントス近似 I  │
│ 私たちは…（要約）                             │
│                                                │
│ コトバンク  「和算」を辞書で引く              │
│ 複数の辞書・事典の解説を… ／ 和算とは…        │
│                                                │
│ [次へ] [履歴] [隠す]                           │
╰──────────────────────────────────────────────╯
```

- Claude の作業中だけ表示し、終わると消えます。
- 30秒ごと（変更可）に切り替わります。タイトルをクリックすると記事が開きます。
- 要約が5行に届かないときは、別のサイトの記事を足して最大4件まで並べます。
- 10回に1回は「本との出会い」（青空文庫の名作か、Open Library の本）を出します。
- 表示した記事は履歴に残ります（`~/.claude/machi-yomi/history.md`）。

## 表示する情報源

| 情報源 | 内容 | 言語 |
|---|---|---|
| [Wikipedia 日本語版](https://ja.wikipedia.org/) | ランダムな記事 | 日本語 |
| [Wikipedia 英語版](https://en.wikipedia.org/) | ランダムな記事 | 英語 |
| 日本の企業（Wikipedia 日本語版） | 東証プライム・スタンダード・グロース上場企業、日本の多国籍企業から1社 | 日本語 |
| 海外の企業（Wikipedia 英語版） | ニューヨーク・ナスダック・ロンドン・パリ・フランクフルト・香港・韓国・ボンベイの上場企業から1社 | 英語 |
| [ジャパンサーチ](https://jpsearch.go.jp/) | 美術・文化財などのデジタルアーカイブ | 日本語 |
| [e-Stat](https://www.e-stat.go.jp/) | 政府統計の紹介 | 日本語 |
| [コトバンク](https://kotobank.jp/) | 辞書・事典の検索 | 日本語 |
| [ニコニコ大百科](https://dic.nicovideo.jp/) | ランダムな記事 | 日本語 |
| [ピクシブ百科事典](https://dic.pixiv.net/) | 用語リストからの記事 | 日本語 |
| [Qiita](https://qiita.com/) / [Zenn](https://zenn.dev/) | 技術記事 | 日本語 |
| [arXiv](https://arxiv.org/) | 22分野の新しめの論文 | 英語 |
| [OpenAlex](https://openalex.org/) | 全分野の論文 | 英語 |
| [青空文庫](https://www.aozora.gr.jp/) / [Open Library](https://openlibrary.org/) | 本との出会い | 日本語 / 英語 |

e-Stat・コトバンク・ピクシブ百科事典・青空文庫の要約には、その語の Wikipedia の要約を添えています。

## インストール

Claude Code の中で次を実行します。

```
/plugin marketplace add takuopannya/machi-yomi
/plugin install machi-yomi@machi-yomi
/reload-plugins
```

ターミナルからでも入れられます。

```bash
claude plugin marketplace add takuopannya/machi-yomi
```

```bash
claude plugin install machi-yomi@machi-yomi
```

## 使い方

- `/machi-yomi`：表示のオン／オフ
- `/machi-yomi-history`：履歴の一覧を開く
- 帯の [次へ]：すぐ次の記事へ ／ [履歴]：履歴を開く ／ [隠す]：非表示にする

## 設定

`/config` から変えられます。

| 項目 | 初期値 | 内容 |
|---|---|---|
| 切り替え間隔（秒） | 30 | 5〜600秒 |
| 英語の記事の翻訳 | `none` | `none`：英語のまま ／ `claude`：自分の Claude で訳す ／ `deepl`：DeepL API ／ `ollama`：ローカル LLM |
| 翻訳に使う Claude のモデル | `haiku` | `claude` を選んだとき |
| DeepL API キー | （空） | `deepl` を選んだとき。Free プランのキーも使えます。安全な保存場所に保存されます |
| Ollama の URL / モデル | `http://localhost:11434` / `qwen2.5:7b` | `ollama` を選んだとき |

- 英語の記事（Wikipedia 英語版・海外の企業・論文・Open Library）が翻訳の対象です。
- `claude` を選ぶと、英語の記事1件ごとに、あなたの Claude のトークンを少し使います。
- 翻訳に失敗したときは、英語のまま表示します。
- 自動翻訳した記事には、サイト名に「・訳」が付きます。

## プライバシーと通信

- 記事を取得するため、上の表の各サイトの API・ページにアクセスします。
- 翻訳を有効にすると、英語の記事のタイトルと要約を、選んだ翻訳先（Claude / DeepL / Ollama）に送ります。
- あなたのプロンプトやコード、会話の内容は、どこにも送りません。
- 履歴はあなたのパソコンの中（`~/.claude/machi-yomi/history.md` と Claude Code のプラグイン用ストア）にだけ保存します。

## 広告・アフィリエイトについて

現在のバージョンには、広告やアフィリエイトリンクは含まれていません。将来、規約上問題のない形で導入する場合は、リンクに「PR」と表示し、この README に明記します。

## 動作環境

- Claude Code v2.1.287 以降（mod の仕組み「function hooks」が必要）
- ターミナル版・デスクトップアプリの両方
- 動作確認は Windows で行っています。macOS / Linux は未確認です。mod の仕組みはまだ先行公開（early access）の段階なので、Claude Code の更新で動かなくなることがあります。

## 謝辞・データの出典

- Wikipedia の記事は [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/deed.ja) で提供されています。要約はリンク先の記事からの引用です。
- Thank you to arXiv for use of its open access interoperability.
- 論文情報は [OpenAlex](https://openalex.org/)（CC0）を使っています。
- 各サイトの名称・商標は、それぞれの権利者に帰属します。この mod は各サイトの公式のものではありません。

## 開発

```bash
claude plugin validate plugins/machi-yomi
```

```bash
claude plugin test plugins/machi-yomi
```

## 応援

この mod が気に入ったら、コーヒー1杯ぶんの応援をいただけるとうれしいです。

<a href="https://www.buymeacoffee.com/ju2shitamaki" target="_blank"><img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" alt="Buy Me a Coffee" height="60" width="217"></a>

## ライセンス

MIT
