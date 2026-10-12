# machi-yomi (待ち読み, "reading while you wait")

[日本語](README.md) · **English**

A Claude Code mod that shows random articles above the prompt while Claude is working: Wikipedia, research papers, statistics, dictionaries, tech posts, classic books and more. It turns waiting time into small moments of serendipity.

- Shown only while Claude is working; it disappears when the turn ends.
- Switches every 30 seconds (configurable). Click a title to open the article.
- When one summary is shorter than 5 lines, more topics from other sites are added (up to 4).
- Every 10th round is a "book encounter" (a classic from Aozora Bunko or a book from Open Library).
- Shown articles are saved to a history file (`~/.claude/machi-yomi/history.md`).

The interface and most sources are in Japanese. English sources (English Wikipedia, international companies, arXiv, OpenAlex, Open Library) can be shown as-is or translated into Japanese.

## Sources

Wikipedia (Japanese and English), Japanese companies (TSE-listed, from Japanese Wikipedia), international companies (NYSE, Nasdaq, LSE, Euronext Paris, Frankfurt, Hong Kong, Korea, Bombay; from English Wikipedia), Japan Search, e-Stat, Kotobank, Nicopedia, pixiv Encyclopedia, Qiita, Zenn, arXiv (22 categories), OpenAlex, Aozora Bunko, Open Library.

## Install

Inside Claude Code:

```
/plugin marketplace add takuopannya/machi-yomi
/plugin install machi-yomi@machi-yomi
/reload-plugins
```

## Commands

- `/machi-yomi`: toggle the band
- `/machi-yomi-history`: open the history pane

## Settings (`/config`)

| Setting | Default | |
|---|---|---|
| intervalSeconds | 30 | 5 to 600 |
| translator | `none` | `none` / `claude` (uses your own Claude tokens) / `deepl` (your API key) / `ollama` (local LLM) |
| claudeModel | `haiku` | used with `claude` |
| deeplApiKey | (empty) | used with `deepl`; stored in secure storage |
| ollamaUrl / ollamaModel | `http://localhost:11434` / `qwen2.5:7b` | used with `ollama` |

If translation fails, the original English is shown.

## Privacy

- The mod fetches articles from the sites listed above.
- With translation on, the title and summary of English articles are sent to the translator you chose.
- Your prompts, code and conversation are never sent anywhere.
- History is stored only on your machine.

## Ads and affiliate links

This mod contains no ads or affiliate links.

## Requirements

- Claude Code v2.1.287 or later (function-hooks mods)
- Terminal and desktop app
- Tested on Windows only. Mods are early access and may break with Claude Code updates.

## Credits

- Wikipedia content is available under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/).
- Thank you to arXiv for use of its open access interoperability.
- Paper metadata from [OpenAlex](https://openalex.org/) (CC0).
- All site names and trademarks belong to their owners. This mod is not affiliated with any of them.

## Support

If you enjoy this mod, you can buy me a coffee.

<a href="https://www.buymeacoffee.com/ju2shitamaki" target="_blank"><img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" alt="Buy Me a Coffee" height="60" width="217"></a>

## License

MIT
