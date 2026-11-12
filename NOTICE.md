# Source and third-party notices

This is a local extraction of a self-hosted Web client. A public project license has not yet been selected by its owner. Do not infer a license grant for the application's own source before publication.

The interface was implemented separately from the native desktop client. Earlier design work consulted public Codex Web and NextChat layouts as references; this extraction does not include those projects' complete frontends or backends. A source/provenance review is still required before a public release.

Bundled browser libraries retain their upstream license files:

- Marked: `public/codex/vendor/marked-LICENSE.md`
- marked-cjk-friendly 0.1.3 (emphasis tokenizer only): `public/codex/vendor/marked-cjk-friendly-LICENSE.md`; upstream https://github.com/tats-u/markdown-cjk-friendly, npm archive integrity `sha512-9X5zELpCKopA6rLlNWk/f1swkRUvuuO4DedM48V0OBABaEEy520WEBYY5bdLd7GDEaqzZuTofBxgzr32/4rWFw==`. The bundled JavaScript is the unchanged package `dist/index.js`.
- DOMPurify: `public/codex/vendor/purify-LICENSE`
- KaTeX and its font notices: `public/codex/vendor/katex/`

Server dependencies are declared and version-locked by npm. Their original licenses are included in the installed packages. Codex engines, native applications, account data, and signing material are not distributed with this source.
