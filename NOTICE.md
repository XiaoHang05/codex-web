# Source and third-party notices

This is a local extraction of a self-hosted Web client. A public project license has not yet been selected by its owner. Do not infer a license grant for the application's own source before publication.

The interface was implemented separately from the native desktop client. Earlier design work consulted public Codex Web and NextChat layouts as references; this extraction does not include those projects' complete frontends or backends. A source/provenance review is still required before a public release.

Bundled browser libraries retain their upstream license files:

- Marked: `public/codex/vendor/marked-LICENSE.md`
- DOMPurify: `public/codex/vendor/purify-LICENSE`
- KaTeX and its font notices: `public/codex/vendor/katex/`

Server dependencies are declared and version-locked by npm. Their original licenses are included in the installed packages. Codex engines, native applications, account data, and signing material are not distributed with this source.
