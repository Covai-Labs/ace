# [1.16.0](https://github.com/Covai-Labs/decant/compare/v1.15.0...v1.16.0) (2026-10-06)


### Features

* **copilot:** support cloud.microsoft chat routes, pipe titles, and citation links ([#41](https://github.com/Covai-Labs/decant/issues/41)) ([f019be9](https://github.com/Covai-Labs/decant/commit/f019be901cf01ed75078007ed1f9df08b3fb755b))

# [1.15.0](https://github.com/Covai-Labs/decant/compare/v1.14.0...v1.15.0) (2026-10-05)


### Features

* support grok project chat URLs ([#40](https://github.com/Covai-Labs/decant/issues/40)) ([f0c4e2b](https://github.com/Covai-Labs/decant/commit/f0c4e2ba861690a7504b91244e8e729ad255d07a))

# [1.14.0](https://github.com/Covai-Labs/decant/compare/v1.13.0...v1.14.0) (2026-09-30)


### Features

* standardize per-message timestamps across parsers ([#36](https://github.com/Covai-Labs/decant/issues/36)) ([172de79](https://github.com/Covai-Labs/decant/commit/172de79cfb830f61f95f68e857de673640656659))

# [1.13.0](https://github.com/Covai-Labs/decant/compare/v1.12.0...v1.13.0) (2026-09-29)


### Bug Fixes

* address review findings on array parity, partial files, chip stripping ([b3b8a32](https://github.com/Covai-Labs/decant/commit/b3b8a3206144a25c612cb550d38c19033e5626f7))
* harden card removal and dedupe panel against chat text ([994a775](https://github.com/Covai-Labs/decant/commit/994a775e6573d82e3a64a148ab88f02079541be8))


### Features

* export Gemini deep-research reports, plans, and citations ([e472d9d](https://github.com/Covai-Labs/decant/commit/e472d9d4b6521761c3e1b9cf7b6ed61a3ab8344d))
* extract open deep-research immersive panel in Gemini DOM fallback ([a515159](https://github.com/Covai-Labs/decant/commit/a5151595a59a6b4186644b03cdc6f0e6a71a4272))
* hide ChatGPT tool-invocation payloads and support messages-array API shape ([ab81058](https://github.com/Covai-Labs/decant/commit/ab81058e38284ce9e8a2d40501f0557ffc020d67))
* surface Claude present_files outputs and standardise attachment headers ([4af6c99](https://github.com/Covai-Labs/decant/commit/4af6c99ad1567c1aba717f9ebca16772328b10e7))

# [1.12.0](https://github.com/Covai-Labs/decant/compare/v1.11.0...v1.12.0) (2026-09-24)


### Features

* standardize thinking process output across parsers ([#31](https://github.com/Covai-Labs/decant/issues/31)) ([eae8342](https://github.com/Covai-Labs/decant/commit/eae8342ff80efeb9d49cf40f95fe5d05d0f8a66f)), closes [#30](https://github.com/Covai-Labs/decant/issues/30)

# [1.11.0](https://github.com/Covai-Labs/decant/compare/v1.10.1...v1.11.0) (2026-09-20)


### Features

* **parser:** add Duck.ai parser and platform detection ([9701c2a](https://github.com/Covai-Labs/decant/commit/9701c2a31fd649654fb50ecf3c14d70edee77171))

## [1.17.1](https://github.com/Covai-Labs/decant/compare/v1.17.0...v1.17.1) (2026-10-18)


### Bug Fixes

* **deepseek:** support file and text attachments ([#56](https://github.com/Covai-Labs/decant/issues/56)) ([6b94ef9](https://github.com/Covai-Labs/decant/commit/6b94ef9e0ffb58952df4341f36f2a178bc5d92d1))

## [1.17.0](https://github.com/Covai-Labs/decant/compare/v1.16.0...v1.17.0) (2026-10-14)


### Features

* **ci:** migrate from semantic-release to release-please ([#44](https://github.com/Covai-Labs/decant/issues/44)) ([829bfe1](https://github.com/Covai-Labs/decant/commit/829bfe1a175484b0ffa9c2ab0c4bfc2c3e254c3d))


### Bug Fixes

* **chatgpt:** ignore conversation recovery placeholders ([#51](https://github.com/Covai-Labs/decant/issues/51)) ([c4d51a9](https://github.com/Covai-Labs/decant/commit/c4d51a9532f37f76472c27867cb38fdd6bfaaa9b))
* **chatgpt:** support anonymous session DOM structure ([#50](https://github.com/Covai-Labs/decant/issues/50)) ([a2c7876](https://github.com/Covai-Labs/decant/commit/a2c7876f70a5f239ab70ef7c4d19c4a4d61095ad))

## [1.10.1](https://github.com/Covai-Labs/decant-core/compare/v1.10.0...v1.10.1) (2026-09-16)


### Bug Fixes

* **google-search-ai:** prevent inline math newline breaks and improve formula container resolution ([72f919a](https://github.com/Covai-Labs/decant-core/commit/72f919a5c683aea468608eb1f1ecf8df5e7d3a29))
* **google-search-ai:** support data-xpm-copy-text and alt fallbacks cleanly ([8218750](https://github.com/Covai-Labs/decant-core/commit/821875033e197f174114f661cd62e27e843b8094))

# [1.10.0](https://github.com/Covai-Labs/decant-core/compare/v1.9.2...v1.10.0) (2026-09-15)


### Features

* **parsers:** add GrokParser, Z.ai/Meta internal APIs, DOM hardening from Sept fixtures ([d09d1ca](https://github.com/Covai-Labs/decant-core/commit/d09d1ca68cfd603ead7bb0ed4a1a77d61c071e7a))

## [1.9.2](https://github.com/Covai-Labs/decant-core/compare/v1.9.1...v1.9.2) (2026-09-14)


### Bug Fixes

* **ci:** deploy Pages on every main push, not just website changes ([24738d7](https://github.com/Covai-Labs/decant-core/commit/24738d7042eb908a17d8ebc6d3a5aa0d6299ff2b))
* **ci:** skip npm release on docs/website-only pushes ([7875777](https://github.com/Covai-Labs/decant-core/commit/78757775c7516ebda1343cb7627938841638ac52))

## [1.9.1](https://github.com/Covai-Labs/decant-core/compare/v1.9.0...v1.9.1) (2026-09-14)


### Bug Fixes

* explicit whitespace in release-notes prose ([ff8bd65](https://github.com/Covai-Labs/decant-core/commit/ff8bd6565ef628854bdedadbb7e607569e6b1d78))

# [1.9.0](https://github.com/Covai-Labs/decant-core/compare/v1.8.0...v1.9.0) (2026-09-14)


### Features

* **web-docs:** add release-notes page generated from CHANGELOG ([274c4c0](https://github.com/Covai-Labs/decant-core/commit/274c4c0a9d7fa9a362865bd55c76bd90cf2d2ae9))

# [1.8.0](https://github.com/Covai-Labs/decant-core/compare/v1.7.0...v1.8.0) (2026-09-13)


### Features

* **web-docs:** add light/dark/system theme support ([af4be7f](https://github.com/Covai-Labs/decant-core/commit/af4be7f4cc77bffb228c084a87a1b8217f041965))

# [1.7.0](https://github.com/Covai-Labs/decant-core/compare/v1.6.0...v1.7.0) (2026-09-13)


### Bug Fixes

* apply CodeRabbit auto-fixes ([d5896dc](https://github.com/Covai-Labs/decant-core/commit/d5896dc6946468ed9edf9f7d5df3daee723bd6d0))


### Features

* **web-docs:** add JobFoundry-style wave background ([b9a533a](https://github.com/Covai-Labs/decant-core/commit/b9a533a63350c80c37dc253708be3eac7d05f7a6))

# [1.6.0](https://github.com/Covai-Labs/decant-core/compare/v1.5.0...v1.6.0) (2026-09-12)


### Features

* **gemini:** add batchexecute RPC pagination and resilient candidate extraction with DOM fallback ([5f09682](https://github.com/Covai-Labs/decant-core/commit/5f096828cabf9cafd221a7563938c2271e65b0b9))
* **gemini:** enrich API messages with DOM attachments and add test coverage ([0365bb9](https://github.com/Covai-Labs/decant-core/commit/0365bb9e8980b879e82c351df3720a848c8973da))

# [1.5.0](https://github.com/Covai-Labs/decant-core/compare/v1.4.0...v1.5.0) (2026-09-12)


### Bug Fixes

* **chatgpt:** clean DOM webpage citation pills and support modern turn containers ([f24f481](https://github.com/Covai-Labs/decant-core/commit/f24f481a0359ecd9c52aae9abefbc33dabeb1894))
* **perplexity:** resolve account ID for authenticated thread API requests ([8aaa754](https://github.com/Covai-Labs/decant-core/commit/8aaa754a917cca4ae9eab6a3bc6fe010ca0dee17))
* **perplexity:** support modern user bubbles and extract message timestamps ([3451e18](https://github.com/Covai-Labs/decant-core/commit/3451e188b43c2cdc171a7558a1adffbbf80cec8c))


### Features

* **perplexity:** add REST API thread extraction with DOM fallback ([720b4ed](https://github.com/Covai-Labs/decant-core/commit/720b4ed539af4b3616d36a2127dbf2c5ce9fab74))

# [1.4.0](https://github.com/Covai-Labs/decant-core/compare/v1.3.1...v1.4.0) (2026-09-09)


### Features

* **claude:** support interactive elements, widgets, questionnaires, and unrolled carousels ([#7](https://github.com/Covai-Labs/decant-core/issues/7)) ([93baca7](https://github.com/Covai-Labs/decant-core/commit/93baca72364d3fc90eb0bd1a7cd3e78f2d4de594))

## [1.3.1](https://github.com/Covai-Labs/decant-core/compare/v1.3.0...v1.3.1) (2026-09-09)


### Bug Fixes

* **google-search-ai:** purge leaked sn._setImageSrc calls and stray data URIs ([#6](https://github.com/Covai-Labs/decant-core/issues/6)) ([0e250b2](https://github.com/Covai-Labs/decant-core/commit/0e250b2523862ee01f87ca32a909af11da198c61))

# [1.3.0](https://github.com/Covai-Labs/decant-core/compare/v1.2.6...v1.3.0) (2026-09-07)


### Features

* disable article extraction for content in subframes by checking window hierarchy ([a0032f6](https://github.com/Covai-Labs/decant-core/commit/a0032f68df60cc7b41238f13eff25150fcbf5368))
* improve ChatGPT math rendering and cleanup by supporting data-math-source and adding new noise filters. ([e3017e9](https://github.com/Covai-Labs/decant-core/commit/e3017e9d5c8865bedf7689ece681761c05746076))

## [1.2.6](https://github.com/Covai-Labs/decant-core/compare/v1.2.5...v1.2.6) (2026-09-07)


### Bug Fixes

* **google-search-ai:** preserve data-xpm-latex math equation images when stripping base64 images ([b293769](https://github.com/Covai-Labs/decant-core/commit/b293769df173df2fbd4e38c84aee1dc9a1b87949))

## [1.2.5](https://github.com/Covai-Labs/decant-core/compare/v1.2.4...v1.2.5) (2026-09-07)


### Bug Fixes

* katex rendering ([6584dbd](https://github.com/Covai-Labs/decant-core/commit/6584dbd00d599b1d2ae68334c1fb7739ca7d6ade))

## [1.2.4](https://github.com/Covai-Labs/decant-core/compare/v1.2.3...v1.2.4) (2026-09-06)

### Bug Fixes

- **google-search-ai:** sanitize scripts, base64 images and tracking links (Covai-Labs/ai-chat-exporter[#29](https://github.com/Covai-Labs/decant-core/issues/29)) ([f70bd42](https://github.com/Covai-Labs/decant-core/commit/f70bd42e76b163ec9b4ab2689ea0537531a7901d))

## [1.2.3](https://github.com/Covai-Labs/decant-core/compare/v1.2.2...v1.2.3) (2026-09-06)

### Bug Fixes

- preserve latex math without turndown escaping ([68dbdef](https://github.com/Covai-Labs/decant-core/commit/68dbdef00599625c4c9786f556805f810edea900))

## [1.2.2](https://github.com/Covai-Labs/decant-core/compare/v1.2.1...v1.2.2) (2026-09-01)

### Bug Fixes

- **gemini:** prioritize DOM extraction & validate API response content ([#1](https://github.com/Covai-Labs/decant-core/issues/1)) ([84ab6cb](https://github.com/Covai-Labs/decant-core/commit/84ab6cb01910c2cd5b2e45ae97ef7060fc597f8a))
- **gemini:** prioritize DOM parsing and validate API message content ([5b44011](https://github.com/Covai-Labs/decant-core/commit/5b44011390ec94bf17ee79307d2f5dfe09ff2b94))

## [1.2.1](https://github.com/Covai-Labs/decant-core/compare/v1.2.0...v1.2.1) (2026-08-31)

### Bug Fixes

- **gemini:** clean up console logs and simplify deep research extraction ([e8990a3](https://github.com/Covai-Labs/decant-core/commit/e8990a38c63f3ed92b2ba10ae1e3b92809f72de6))

# [1.2.0](https://github.com/Covai-Labs/decant-core/compare/v1.1.0...v1.2.0) (2026-08-25)

### Bug Fixes

- just prettier ([1cd3a36](https://github.com/Covai-Labs/decant-core/commit/1cd3a3620573f6a6d9462928939c12f9cab63a8d))

### Features

- standardize extraction method metadata across all AI parsers and add validation tests ([175a990](https://github.com/Covai-Labs/decant-core/commit/175a99065bd0016261a6b2dd98f0b97396dd10e0))

# [1.1.0](https://github.com/Covai-Labs/decant-core/compare/v1.0.1...v1.1.0) (2026-08-20)

### Features

- implement intelligent article extraction and web parsing using Readability, Defuddle, and Article-Extractor libraries. ([c24dc16](https://github.com/Covai-Labs/decant-core/commit/c24dc1650e3ac3c63b5fdf0760a009c5f2c298cb))

## [1.0.1](https://github.com/Covai-Labs/decant-core/compare/v1.0.0...v1.0.1) (2026-08-19)

### Bug Fixes

- **ci:** pass NPM_TOKEN to release workflow and format changelog ([9148fab](https://github.com/Covai-Labs/decant-core/commit/9148fabfb9f7ddd6ba2297be7ba3ea065559f0c9))

# 1.0.0 (2026-08-19)

### Bug Fixes

- **ci:** update node version to 22 for semantic-release ([c806c07](https://github.com/Covai-Labs/decant-core/commit/c806c07a1a671b2cebb2340d4b00d311f52842b1))

### Features

- migrate to semantic-release for automated versioning and package publishing ([c1910e8](https://github.com/Covai-Labs/decant-core/commit/c1910e807b7709c644e69ea853a15dd8b8f25916))
- shared @covai/parser-core package ([28c7998](https://github.com/Covai-Labs/decant-core/commit/28c7998551b87ac0256288fe3082ceaca8484e02))
- shared @covai/parser-core package ([eb4427e](https://github.com/Covai-Labs/decant-core/commit/eb4427ea3ad3638d7009b18d2db9fbf417806d10))
