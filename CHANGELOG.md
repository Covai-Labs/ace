# Changelog

## [1.24.1](https://github.com/Covai-Labs/ace/compare/v1.24.0...v1.24.1) (2026-10-30)


### Bug Fixes

* **ci:** prevent shell injection from commit author metadata in sync-decant workflow ([#161](https://github.com/Covai-Labs/ace/issues/161)) ([5a2a653](https://github.com/Covai-Labs/ace/commit/5a2a653f271c1d2a7216b6e77c4bda12ca8f595a))
* **decant-core:** harden parsers and utilities against ReDoS and nested complexity ([#165](https://github.com/Covai-Labs/ace/issues/165)) ([a477349](https://github.com/Covai-Labs/ace/commit/a4773497e8e578adc8f86d86f2ead28c2860aa55))
* **security:** resolve image formatter XSS and test server path traversal ([#164](https://github.com/Covai-Labs/ace/issues/164)) ([1c44758](https://github.com/Covai-Labs/ace/commit/1c4475849c641252d81f0b4842eb3391081e8772))
* **security:** resolve SARIF security vulnerabilities and privacy leaks ([#163](https://github.com/Covai-Labs/ace/issues/163)) ([37ca9ab](https://github.com/Covai-Labs/ace/commit/37ca9ab2b9b2249d7e98775f41e476f618eaf720))

## [1.24.0](https://github.com/Covai-Labs/ace/compare/v1.23.1...v1.24.0) (2026-10-26)


### Features

* **permissions:** migrate downloads and clipboardWrite to optional permissions ([#159](https://github.com/Covai-Labs/ace/issues/159)) ([94e53d6](https://github.com/Covai-Labs/ace/commit/94e53d653fa426139f228fe777b56f538f9863e8))

## [1.23.1](https://github.com/Covai-Labs/ace/compare/v1.23.0...v1.23.1) (2026-10-24)


### Bug Fixes

* **chatgpt,downloads:** fix ChatGPT preview on Firefox and defer blob URL revocation ([#153](https://github.com/Covai-Labs/ace/issues/153)) ([#154](https://github.com/Covai-Labs/ace/issues/154)) ([7d979d5](https://github.com/Covai-Labs/ace/commit/7d979d5dd182accba1cbeeb35e081d79098f550e))
* **ci:** resolve SonarCloud source-test path overlap and add CodeQL workflow_dispatch ([#147](https://github.com/Covai-Labs/ace/issues/147)) ([11996e5](https://github.com/Covai-Labs/ace/commit/11996e55c3fc90090f119f450ae461806ab5a410))
* **google-search-ai:** preserve citation chips, RHS sources, and align multi-turn queries ([#109](https://github.com/Covai-Labs/ace/issues/109)) ([#156](https://github.com/Covai-Labs/ace/issues/156)) ([b8c3ecd](https://github.com/Covai-Labs/ace/commit/b8c3ecd31ea7289bcdca9707fda1ee1b78a653eb))

## [1.23.0](https://github.com/Covai-Labs/ace/compare/v1.22.0...v1.23.0) (2026-10-20)


### Features

* add multi-tab batch chat export and LLM synthesis ([#144](https://github.com/Covai-Labs/ace/issues/144)) ([d71a8b1](https://github.com/Covai-Labs/ace/commit/d71a8b10338f9af31eb234a458eef8a56d8fea7e))


### Bug Fixes

* **batch:** add downloads permission, update synthesis prompt, and position batch at top of popup ([#146](https://github.com/Covai-Labs/ace/issues/146)) ([031aba1](https://github.com/Covai-Labs/ace/commit/031aba1a3e98d0cb331d7fc74921ec137fee8ff1))
* **decant:** restore standard prettier formatting and config for decant-core ([f5664de](https://github.com/Covai-Labs/ace/commit/f5664deba4cd436a559a0406c1bc074a9f3d180c))
* **decant:** sync package-lock with standalone dependencies ([3294267](https://github.com/Covai-Labs/ace/commit/32942679cd01c40e25cac2076e9147b49ca3b361))
* **decant:** update decant-core README note and isolate format check ([b85fcc4](https://github.com/Covai-Labs/ace/commit/b85fcc4e457dcd9c0d35802d1ab4e43c6ce11d2e))
* **gemini:** preserve linked text and images in html and pdf exports ([#110](https://github.com/Covai-Labs/ace/issues/110)) ([#140](https://github.com/Covai-Labs/ace/issues/140)) ([e47b37d](https://github.com/Covai-Labs/ace/commit/e47b37d99ea3a01d5b5c33f0bd412ccc6afa4bfb))
* **security:** update scanner exclusions, sanitize test fixture, and add secret prevention test ([#141](https://github.com/Covai-Labs/ace/issues/141)) ([ded1a50](https://github.com/Covai-Labs/ace/commit/ded1a50cee765594bfc3ffa4d87a2991ea707fc2))

## [1.22.0](https://github.com/Covai-Labs/ace/compare/v1.21.0...v1.22.0) (2026-10-14)


### Features

* **ci:** migrate to release-please automation and extension packaging ([#115](https://github.com/Covai-Labs/ace/issues/115)) ([423f338](https://github.com/Covai-Labs/ace/commit/423f3383f4038ab2c9d06844bc90c06c75c5fcdb))
* option to leave attached files out of exports ([#100](https://github.com/Covai-Labs/ace/issues/100)) ([#119](https://github.com/Covai-Labs/ace/issues/119)) ([4952b03](https://github.com/Covai-Labs/ace/commit/4952b03d2dde10ee26af6d4a5261eea89a100d18))
* reflect user default export format in context menu ([#111](https://github.com/Covai-Labs/ace/issues/111)) ([#125](https://github.com/Covai-Labs/ace/issues/125)) ([e9f2677](https://github.com/Covai-Labs/ace/commit/e9f26772d6ea8657b01a1b4eb0ee6b5ef9c1aac3))
* **web:** add featured-on page with Launchpadly backlink ([df59986](https://github.com/Covai-Labs/ace/commit/df5998695dcc812c2296122b830d9255e26a3021))
* **web:** add PeerPush backlink to featured-on page ([1b507bd](https://github.com/Covai-Labs/ace/commit/1b507bdf90343fe23201a263c87cf8aa7c600390))


### Bug Fixes

* **chatgpt:** support export in logged-out / anonymous session ([#96](https://github.com/Covai-Labs/ace/issues/96)) ([#127](https://github.com/Covai-Labs/ace/issues/127)) ([3b8a70a](https://github.com/Covai-Labs/ace/commit/3b8a70a67b66d21331e21f6040053cd34aa77500))
* **html:** keep underscores inside words out of emphasis ([#120](https://github.com/Covai-Labs/ace/issues/120)) ([ea9877b](https://github.com/Covai-Labs/ace/commit/ea9877bff9ea007648f2ecbf3333187ae4e14435))
* inline conversation images and improve formatting in Word (.doc) exports ([#113](https://github.com/Covai-Labs/ace/issues/113)) ([#126](https://github.com/Covai-Labs/ace/issues/126)) ([1758470](https://github.com/Covai-Labs/ace/commit/1758470b1c2084f83c55a42231c6337e169d062d))
* update installation instructions for AI Chat Exporter to clarify Edge compatibility ([7111410](https://github.com/Covai-Labs/ace/commit/7111410b155398e905bb2afac62b1c77290bc438))
