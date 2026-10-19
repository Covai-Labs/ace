#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

const platformsPath = path.join(rootDir, "data", "platforms.json");
const supportedMdPath = path.join(rootDir, "SUPPORTED_PLATFORMS.md");
const readmePath = path.join(rootDir, "README.md");
const webDocsPlatformsPath = path.join(
  rootDir,
  "web-docs",
  "src",
  "data",
  "platforms.ts",
);

const isCheckMode = process.argv.includes("--check");

function readFileIfExists(filePath) {
  try {
    return fs.readFileSync(filePath, "utf-8");
  } catch (err) {
    if (err && err.code === "ENOENT") {
      return null;
    }
    throw err;
  }
}

async function getPrettier() {
  try {
    const mod = await import("prettier");
    return mod.default || mod;
  } catch {
    try {
      const webDocsPrettier = path.join(
        rootDir,
        "web-docs",
        "node_modules",
        "prettier",
        "index.mjs",
      );
      const mod = await import(webDocsPrettier);
      return mod.default || mod;
    } catch {
      return null;
    }
  }
}

async function formatCode(content, parser, prettierInstance) {
  if (prettierInstance && typeof prettierInstance.format === "function") {
    try {
      return await prettierInstance.format(content, { parser });
    } catch {
      return content;
    }
  }
  return content;
}

async function main() {
  const prettierInstance = await getPrettier();
  const platforms = JSON.parse(fs.readFileSync(platformsPath, "utf-8"));
  const aiPlatforms = platforms.filter((p) => p.id !== "article");
  const aiCount = aiPlatforms.length;

  // 1. Build Markdown Table
  const tableRows = platforms.map((p) => {
    return `| **${p.platform}** | \`${p.parser}\` | ${p.strategy} |`;
  });

  const markdownTable = [
    "| Platform | Parser | Extraction strategy |",
    "| :--- | :--- | :--- |",
    ...tableRows,
  ].join("\n");

  let hasDiff = false;

  // 2. Sync SUPPORTED_PLATFORMS.md
  const currentSupported = readFileIfExists(supportedMdPath);
  if (currentSupported === null) {
    if (isCheckMode) {
      console.error(`SUPPORTED_PLATFORMS.md not found at ${supportedMdPath}`);
      hasDiff = true;
    } else {
      throw new Error(`SUPPORTED_PLATFORMS.md not found at ${supportedMdPath}`);
    }
  } else {
    const supportedRegex = /(\| Platform\s*\|[\s\S]*?)(\n## Maintenance model)/;
    if (!supportedRegex.test(currentSupported)) {
      if (isCheckMode) {
        console.error(
          "SUPPORTED_PLATFORMS.md is missing the '| Platform |' or '## Maintenance model' section marker",
        );
        hasDiff = true;
      } else {
        throw new Error(
          "SUPPORTED_PLATFORMS.md is missing the '| Platform |' or '## Maintenance model' section marker",
        );
      }
    } else {
      let updatedSupported = currentSupported.replace(
        supportedRegex,
        `${markdownTable}$2`,
      );
      updatedSupported = await formatCode(
        updatedSupported,
        "markdown",
        prettierInstance,
      );
      if (currentSupported !== updatedSupported) {
        if (isCheckMode) {
          console.error(
            "SUPPORTED_PLATFORMS.md is out of sync with data/platforms.json",
          );
          hasDiff = true;
        } else {
          fs.writeFileSync(supportedMdPath, updatedSupported, "utf-8");
          console.log("✓ Updated SUPPORTED_PLATFORMS.md");
        }
      }
    }
  }

  // 3. Sync README.md
  const currentReadme = readFileIfExists(readmePath);
  if (currentReadme === null) {
    if (isCheckMode) {
      console.error(`README.md not found at ${readmePath}`);
      hasDiff = true;
    } else {
      throw new Error(`README.md not found at ${readmePath}`);
    }
  } else {
    const readmeSectionRegex =
      /(## Supported Platforms\n\n)\d+ AI chat platform parsers[^\n]*\n\n(\| Platform[\s\S]*?)(\n\nAll parsers extend)/;
    if (!readmeSectionRegex.test(currentReadme)) {
      if (isCheckMode) {
        console.error(
          "README.md is missing the '## Supported Platforms' section marker",
        );
        hasDiff = true;
      } else {
        throw new Error(
          "README.md is missing the '## Supported Platforms' section marker",
        );
      }
    } else {
      let updatedReadme = currentReadme.replace(
        /✅ \*\*\d+ AI chat platform parsers\*\*/g,
        `✅ **${aiCount} AI chat platform parsers**`,
      );
      updatedReadme = updatedReadme.replace(
        readmeSectionRegex,
        `$1${aiCount} AI chat platform parsers plus generic web article extraction:\n\n${markdownTable}$3`,
      );
      updatedReadme = await formatCode(
        updatedReadme,
        "markdown",
        prettierInstance,
      );

      if (currentReadme !== updatedReadme) {
        if (isCheckMode) {
          console.error("README.md is out of sync with data/platforms.json");
          hasDiff = true;
        } else {
          fs.writeFileSync(readmePath, updatedReadme, "utf-8");
          console.log("✓ Updated README.md");
        }
      }
    }
  }

  // 4. Sync web-docs/src/data/platforms.ts
  const webDocsDir = path.dirname(webDocsPlatformsPath);
  try {
    fs.mkdirSync(webDocsDir, { recursive: true });
  } catch {
    // directory already exists or cannot be created
  }

  let tsContent = `// Auto-generated by scripts/sync-platforms.js from data/platforms.json
// DO NOT EDIT DIRECTLY. Run 'npm run sync:platforms' to update.

export interface PlatformEntry {
  id: string;
  platform: string;
  parser: string;
  module: string;
  strategy: string;
  notes: string;
}

export const PLATFORMS: PlatformEntry[] = ${JSON.stringify(platforms, null, 2)};
`;

  tsContent = await formatCode(tsContent, "typescript", prettierInstance);

  const currentTs = readFileIfExists(webDocsPlatformsPath);
  if (currentTs !== tsContent) {
    if (isCheckMode) {
      console.error(
        "web-docs/src/data/platforms.ts is out of sync with data/platforms.json",
      );
      hasDiff = true;
    } else {
      try {
        fs.writeFileSync(webDocsPlatformsPath, tsContent, "utf-8");
        console.log("✓ Updated web-docs/src/data/platforms.ts");
      } catch (err) {
        console.error(`Failed to write ${webDocsPlatformsPath}:`, err.message);
        throw err;
      }
    }
  }

  if (isCheckMode && hasDiff) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
