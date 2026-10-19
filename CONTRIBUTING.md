# Contributing to AI Chat Exporter

Thank you for your interest in contributing to AI Chat Exporter! I welcome bug reports, feature suggestions, and code contributions.

## Getting Started

1. Check existing [Issues](https://github.com/Covai-Labs/ace/issues) and [Pull Requests](https://github.com/Covai-Labs/ace/pulls) before submitting new ones to avoid duplicates.
2. For local setup, prerequisites, build steps, and codebase architecture, refer to the [Development Guide](DEVELOPMENT.md).

## Submitting Pull Requests

Before submitting a Pull Request, please ensure your changes pass all local verification checks:

```bash
npm run lint && npm run format:check && npm test
```

Please keep Pull Requests focused on a single bug fix or feature, and provide descriptive commit messages.

## Adding or Fixing a Platform Parser

All chat platform parsers (ChatGPT, Claude, Gemini, DeepSeek, Perplexity, etc.) live directly in:
`packages/decant-core/ai/`

When a platform updates its DOM or you want to add support for a new AI platform:

1. Locate or create the parser in `packages/decant-core/ai/<platform>.js`.
2. Update or add test fixtures in `packages/decant-core/tests/fixtures/` and add test coverage in `packages/decant-core/tests/`.
3. Run tests with `npm test` to verify everything passes across both the core engine and the extension.
4. Open your Pull Request directly on this repository!

---

## Contributor License Agreement (CLA)

By submitting a Pull Request or contributing code/materials to this repository, you explicitly agree to the following terms:

1. **License Grant:** You grant the project maintainer(s) a perpetual, worldwide, non-exclusive, royalty-free, sublicensable, and transferable license to use, modify, reproduce, distribute, display, and re-license your contributions.
2. **Future Re-licensing Rights:** The project maintainer(s) reserve the right to re-release, dual-license, or change the open-source or proprietary license of any future version of this project (including under permissive, copyleft, or commercial licenses) without requiring additional permission or consent from contributors.
3. **Originality & Ownership:** You represent and warrant that your contribution is your original creation, or that you have full legal authority and authorization to submit it under these terms.
