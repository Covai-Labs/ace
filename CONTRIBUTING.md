# Contributing to AI Chat Exporter

Thank you for your interest in contributing to AI Chat Exporter! We welcome bug reports, feature suggestions, and code contributions.

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

All platform parsers (ChatGPT, Claude, Gemini, DeepSeek, etc.) live in the shared **[decant-core](https://github.com/Covai-Labs/decant)** library, not in this repository.

If an AI platform changes its DOM or you want to add support for a new platform, please open your PR there. See [decant-core's CONTRIBUTING guide](https://github.com/Covai-Labs/decant/blob/main/CONTRIBUTING.md) for parser contribution guidelines, selector resilience rules, and test fixture instructions.

---

## Contributor License Agreement (CLA)

By submitting a Pull Request or contributing code/materials to this repository, you explicitly agree to the following terms:

1. **License Grant:** You grant the project maintainer(s) a perpetual, worldwide, non-exclusive, royalty-free, sublicensable, and transferable license to use, modify, reproduce, distribute, display, and re-license your contributions.
2. **Future Re-licensing Rights:** The project maintainer(s) reserve the right to re-release, dual-license, or change the open-source or proprietary license of any future version of this project (including under permissive, copyleft, or commercial licenses) without requiring additional permission or consent from contributors.
3. **Originality & Ownership:** You represent and warrant that your contribution is your original creation, or that you have full legal authority and authorization to submit it under these terms.
