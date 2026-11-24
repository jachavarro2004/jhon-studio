# Fonts

The faces every video is set in, as WOFF subsets (Basic Latin, Latin-1 and common punctuation:
198 code points each). Licensed under the SIL Open Font License 1.1: [OFL.txt](OFL.txt).

| File | Family | Use | Copyright |
| --- | --- | --- | --- |
| `fraunces.woff`, `fraunces-italic.woff` | Fraunces (variable) | titles, the name, the glyph mark | The Fraunces Project Authors (github.com/undercasetype/Fraunces) |
| `space-grotesk-regular.woff`, `space-grotesk-medium.woff` | Space Grotesk | body text, subtitles | The Space Grotesk Project Authors (github.com/floriankarsten/space-grotesk) |
| `firacode-medium.woff` | FiraCode Nerd Font Mono (Medium) | kickers, `code` | The Fira Code Project Authors (github.com/tonsky/FiraCode) |

A glyph mark outside these subsets (another script, a symbol) falls back to the fonts the
rendering machine has (`Noto Sans CJK JP`, `Noto Sans`, then any sans-serif).
