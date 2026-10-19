# Contributing to decant-core

Thank you for your interest in contributing to decant-core! We welcome bug reports, feature suggestions, and code contributions.

## Getting Started

1. Check existing [Issues](https://github.com/Covai-Labs/decant/issues) and [Pull Requests](https://github.com/Covai-Labs/decant/pulls) before submitting new ones to avoid duplicates.
2. For local setup, install dependencies with `npm install`.

## Submitting Pull Requests

Before submitting a Pull Request, please ensure your changes pass all local verification checks:

```bash
npm run lint && npm run format:check
```

Please keep Pull Requests focused on a single bug fix or feature, and provide descriptive commit messages.

When adding a new parser, ensure it follows the pattern of existing parsers in `ai/` and is registered in `detection/detect-platform.js` and `ai/index.js`.

## Contributor License Agreement (CLA)

By submitting a Pull Request or contributing code/materials to this repository, you explicitly agree to the following terms:

1. **License Grant:** You grant the project maintainer(s) a perpetual, worldwide, non-exclusive, royalty-free, sublicensable, and transferable license to use, modify, reproduce, distribute, display, and re-license your contributions.
2. **Future Re-licensing Rights:** The project maintainer(s) reserve the right to re-release, dual-license, or change the open-source or proprietary license of any future version of this project (including under permissive, copyleft, or commercial licenses) without requiring additional permission or consent from contributors.
3. **Originality & Ownership:** You represent and warrant that your contribution is your original creation, or that you have full legal authority and authorization to submit it under these terms.
