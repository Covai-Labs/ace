/**
 * HTML to Markdown Converter Utility
 * Uses Turndown.js to convert HTML elements to markdown format
 */

// Note: Turndown.js will be loaded separately via manifest.json
// This utility provides a wrapper around it for consistent usage across parsers

/**
 * Convert an HTML element to markdown
 * @param {HTMLElement|string} htmlContent - HTML element or HTML string to convert
 * @param {Object} options - Optional configuration for the conversion
 * @returns {string} Markdown formatted text
 */
import TurndownService from "../lib/turndown.js";
import { strikethrough, taskListItems } from "turndown-plugin-gfm";

/**
 * Convert an HTML element to markdown
 * @param {HTMLElement|string} htmlContent - HTML element or HTML string to convert
 * @param {Object} options - Optional configuration for the conversion
 * @returns {string} Markdown formatted text
 */
export function convertToMarkdown(htmlContent, options = {}) {
  const mathPlaceholders = [];
  let mathCounter = 0;

  const registerMath = (element, latex, isBlock, doc) => {
    if (!element || !element.parentNode) return;
    const cleanLatex = (latex || "").trim();
    if (!cleanLatex) return;
    const token = "DECANTMATHPLACEHOLDER" + mathCounter++ + "X";
    const text = isBlock
      ? "\n\n$$" + cleanLatex + "$$\n\n"
      : "$" + cleanLatex + "$";
    mathPlaceholders.push({ token, text });
    const textNode = doc.createTextNode(token);
    element.parentNode.replaceChild(textNode, element);
  };
  // Configure Turndown service
  const turndownService = new TurndownService({
    headingStyle: "atx", // Use # for headings (not underline style)
    hr: "* * *", // Horizontal rules
    bulletListMarker: "*", // Use * for bullet lists
    codeBlockStyle: "fenced", // Use ``` for code blocks
    fence: "```", // Code block fence characters
    emDelimiter: "*", // Use * for emphasis
    strongDelimiter: "**", // Use ** for strong
    linkStyle: "inlined", // [text](url) format
    linkReferenceStyle: "full", // Full reference style for links
    ...options,
  });

  // Enable GFM plugins (strikethrough and task list checkboxes)
  turndownService.use([strikethrough, taskListItems]);

  // Add custom rules for better conversion

  // Preserve line breaks
  turndownService.addRule("lineBreak", {
    filter: ["br"],
    replacement: () => "  \n",
  });

  // Handle Qwen's Monaco editor code blocks
  turndownService.addRule("qwenCodeBlock", {
    filter: function (node) {
      return (
        node.nodeName === "PRE" && node.classList.contains("qwen-markdown-code")
      );
    },
    replacement: function (content, node) {
      // Extract language from header
      let language = "";
      const headerDiv = node.querySelector(".qwen-markdown-code-header div");
      if (headerDiv) {
        language = headerDiv.textContent.trim();
      }

      // Extract code from Monaco editor view-lines
      const viewLines = node.querySelectorAll(".view-line");
      const codeLines = [];
      viewLines.forEach((line) => {
        // Get text content, preserving structure
        let lineText = "";
        const spans = line.querySelectorAll("span");
        spans.forEach((span) => {
          // Replace &nbsp; with spaces and get text
          const text = span.textContent.replace(/\u00A0/g, " ");
          lineText += text;
        });
        codeLines.push(lineText);
      });

      const code = codeLines.join("\n");
      if (!code.trim()) return "";

      return "\n```" + language + "\n" + code + "\n```\n";
    },
  });

  // Add table conversion rule
  turndownService.addRule("tables", {
    filter: "table",
    replacement: function (content, node) {
      // Convert HTML table to markdown table
      const rows = Array.from(node.querySelectorAll("tr"));
      if (rows.length === 0) return content;

      // Create a separate Turndown service for cell content to avoid recursion/state issues
      // and incorrectly stripping or double-processing content
      const cellTurndown = new TurndownService({
        emDelimiter: "*",
        strongDelimiter: "**",
      });

      // Handle breaks in cells
      // Convert BR to newlines first so Turndown sees them as breaks (or handle directly)
      // Actually Turndown by default drops BRs or converts to newline.
      // We want to force them to <br> string for table cells.
      cellTurndown.addRule("lineBreak", {
        filter: ["br"],
        replacement: () => "<br>",
      });

      let markdown = "\n";
      rows.forEach((row, rowIndex) => {
        const cells = Array.from(row.querySelectorAll("th, td"));

        // Convert each cell's HTML to markdown using the isolated service
        const cellContents = cells.map((cell) => {
          let cellMarkdown = cellTurndown.turndown(cell);
          // Replace any actual newlines that Turndown generated (e.g. from P tags) with <br>

          // as tables cannot have literal newlines in GFM.
          return cellMarkdown.trim().replace(/\n/g, "<br>");
        });

        // Add row
        markdown += "| " + cellContents.join(" | ") + " |\n";

        // Add separator after header row
        if (rowIndex === 0) {
          markdown += "| " + cells.map(() => "---").join(" | ") + " |\n";
        }
      });

      return markdown + "\n";
    },
  });

  // Convert the HTML
  let html;
  if (typeof htmlContent === "string") {
    html = htmlContent;
  } else if (
    htmlContent &&
    ((typeof HTMLElement !== "undefined" &&
      htmlContent instanceof HTMLElement) ||
      htmlContent.nodeType === 1 ||
      htmlContent.nodeType === 9 ||
      typeof htmlContent.querySelectorAll === "function")
  ) {
    // Clone the element to avoid modifying the original
    const clone = htmlContent.cloneNode(true);

    // Convert math equations (KaTeX, data-math, data-math-source, and data-xpm-latex) to standard markdown math blocks
    // Use alphanumeric placeholder tokens so Turndown text-escaping engine never corrupts LaTeX
    // 1. Process Gemini-style data-math attributes first (removes child .katex spans so they are not double-processed)
    clone.querySelectorAll("[data-math]").forEach((el) => {
      if (!clone.contains(el)) return;
      const latex = el.getAttribute("data-math");
      const isBlock =
        el.classList.contains("math-block") || el.tagName === "DIV";
      registerMath(el, latex, isBlock, clone.ownerDocument);
    });

    // 2. Process ChatGPT data-math-source attributes
    clone.querySelectorAll("[data-math-source]").forEach((el) => {
      if (!clone.contains(el)) return;
      const latex = el.getAttribute("data-math-source");
      if (!latex) return;
      const style = el.getAttribute("style") || "";
      const isBlock =
        el.classList.contains("katex-display") ||
        el.querySelector(".katex-display") !== null ||
        el.classList.contains("math-block") ||
        el.classList.contains("AxvpHG_mathBlock") ||
        el.closest?.(".AxvpHG_expandedDisplayContent") !== null ||
        el.tagName === "DIV" ||
        /display:\s*block/i.test(style);
      registerMath(el, latex, isBlock, clone.ownerDocument);
    });

    // 3. Process Google Search SGE LaTeX images with [data-xpm-latex] or fallback math roots
    clone
      .querySelectorAll(
        "[data-xpm-latex], [data-xpm-copy-root][data-xpm-copy-text], [data-xpm-copy-root] img[alt]",
      )
      .forEach((el) => {
        if (!clone.contains(el)) return;
        const copyRoot = el.hasAttribute("data-xpm-copy-root")
          ? el
          : el.closest("[data-xpm-copy-root]");
        if (!copyRoot) return;
        const blockContainer = el.closest(".cPGBZb");
        const inlineWrapper = el.closest(".mTEjhd") || el.closest(".dteT0b");
        const container = blockContainer || inlineWrapper || copyRoot;
        if (!container.parentNode) return;

        const img = el.tagName === "IMG" ? el : copyRoot.querySelector("img");
        const latex =
          copyRoot.getAttribute("data-xpm-latex") ||
          el.getAttribute("data-xpm-latex") ||
          copyRoot.getAttribute("data-xpm-copy-text") ||
          (img && img.getAttribute("data-xpm-latex")) ||
          el.getAttribute("alt") ||
          (img && img.getAttribute("alt")) ||
          "";
        if (!latex) return;

        // Determine if block or inline based on DOM structure
        let isBlock = false;
        if (blockContainer) {
          // Full block container (.cPGBZb)
          isBlock = true;
        } else if (inlineWrapper) {
          // Inline math wrapper (.mTEjhd, .dteT0b)
          isBlock = false;
        } else {
          const style = copyRoot.getAttribute("style") || "";
          if (/display:\s*inline/i.test(style)) {
            isBlock = false;
          } else {
            // Check enclosing block element (p, li, td, th, div) for surrounding text
            const enclosingBlock = container.closest("p, li, td, th, div");
            if (enclosingBlock) {
              const cloneBlock = enclosingBlock.cloneNode(true);
              const targetInClone =
                cloneBlock
                  .querySelector("[data-xpm-latex]")
                  ?.closest("[data-xpm-copy-root]") ||
                cloneBlock.querySelector("[data-xpm-latex]");
              if (targetInClone) targetInClone.remove();
              isBlock = cloneBlock.textContent.trim() === "";
            }
          }
        }

        registerMath(container, latex, isBlock, clone.ownerDocument);
      });

    // 4. Process block display KaTeX (.katex-display)
    clone.querySelectorAll(".katex-display").forEach((el) => {
      if (!clone.contains(el)) return;
      const annotation = el.querySelector(
        'annotation[encoding="application/x-tex"]',
      );
      const latex = annotation
        ? annotation.textContent.trim()
        : el.getAttribute("data-math-source") ||
          el.getAttribute("aria-label") ||
          el.textContent.trim();
      registerMath(el, latex, true, clone.ownerDocument);
    });

    // 5. Process inline KaTeX (.katex)
    clone.querySelectorAll(".katex").forEach((el) => {
      if (!clone.contains(el)) return;
      const annotation = el.querySelector(
        'annotation[encoding="application/x-tex"]',
      );
      const latex = annotation
        ? annotation.textContent.trim()
        : el.getAttribute("data-math-source") ||
          el.getAttribute("aria-label") ||
          el.textContent.trim();
      registerMath(el, latex, false, clone.ownerDocument);
    });

    // Preprocess code blocks (pre elements) to normalize formatting and language tags
    clone.querySelectorAll("pre").forEach((pre) => {
      // Guard against processing detached/already-replaced pre elements
      if (!clone.contains(pre)) return;

      const innerPre = pre.querySelector("pre");
      const codeElement = pre.querySelector("code");

      if (innerPre && codeElement) {
        // --- ChatGPT-style wrapped code block ---
        // Find the language label from the header (usually next to an SVG icon)
        let language = "";
        const svg = pre.querySelector("svg");
        if (svg && svg.parentElement) {
          const parent = svg.parentElement;
          svg.remove();
          language = parent.textContent.trim().toLowerCase();
        }

        // Replace all <br> elements inside the code block with actual newlines
        codeElement.querySelectorAll("br").forEach((br) => {
          if (br.parentNode) {
            const newline = clone.ownerDocument.createTextNode("\n");
            br.parentNode.replaceChild(newline, br);
          }
        });

        const codeText = codeElement.textContent;

        // Create a new clean pre and code element structure
        const newPre = clone.ownerDocument.createElement("pre");
        const newCode = clone.ownerDocument.createElement("code");
        if (language) {
          newCode.className = `language-${language}`;
        }
        newCode.textContent = codeText;
        newPre.appendChild(newCode);

        // Replace the outer pre with the new clean pre
        if (pre.parentNode) {
          pre.parentNode.replaceChild(newPre, pre);
        }
      } else {
        // --- Standard/SGE-style code block ---
        // Extract language label if available (e.g. from Google Search SGE containers)
        const code = pre.querySelector("code");
        const hasLanguage =
          code &&
          Array.from(code.classList).some(
            (cls) => cls.startsWith("language-") && cls !== "language-",
          );
        if (!hasLanguage) {
          const container =
            pre.closest(".pHpOfb") || pre.parentElement?.parentElement;
          if (container) {
            const langEl =
              container.querySelector(".vVRw1d") ||
              container.firstElementChild?.firstElementChild;
            if (langEl && langEl !== pre) {
              const language = langEl.textContent.trim().toLowerCase();
              if (code) {
                code.className = `language-${language}`;
              }
              langEl.remove();
            }
          }
        }

        // Replace all <br> elements inside the code block with actual newlines
        const codeEl = pre.querySelector("code") || pre;
        codeEl.querySelectorAll("br").forEach((br) => {
          if (br.parentNode) {
            const newline = clone.ownerDocument.createTextNode("\n");
            br.parentNode.replaceChild(newline, br);
          }
        });
      }
    });

    // Remove SGE "Use code with caution" text blocks
    clone.querySelectorAll("*").forEach((el) => {
      if (el.textContent.trim() === "Use code with caution.") {
        el.remove();
      }
    });

    // Pre-process button-wrapped images (e.g., ChatGPT image carousels) before noise button removal
    clone.querySelectorAll("button").forEach((button) => {
      const img = button.querySelector("img");
      if (!img) return;

      let caption = "Image";
      const ariaLabel = button.getAttribute("aria-label") || "";
      if (ariaLabel.toLowerCase().includes("open image details for")) {
        caption = ariaLabel.replace(/^Open image details for\s*/i, "").trim();
      } else if (
        img.getAttribute("alt") &&
        !img.getAttribute("alt").startsWith("http")
      ) {
        caption = img.getAttribute("alt").trim();
      }

      const alt = img.getAttribute("alt") || "";
      const src = img.getAttribute("src") || "";
      const imageUrl =
        alt.startsWith("http://") || alt.startsWith("https://") ? alt : src;

      if (imageUrl) {
        const newImg = clone.ownerDocument.createElement("img");
        newImg.setAttribute("src", imageUrl);
        newImg.setAttribute("alt", caption);
        button.parentNode.replaceChild(newImg, button);
      }
    });

    // Remove noise elements (buttons, icons, etc.)
    // Note: Exclude elements inside qwen-markdown-code to preserve Monaco editor content
    const noiseSelectors = [
      "button:not(.qwen-markdown-code *)",
      ".copy-button",
      '[role="button"]:not(.qwen-markdown-code *)',
      ".sr-only",
      "svg:not(.qwen-markdown-code *)",
      ".icon:not(.qwen-markdown-code *)",
      '[aria-hidden="true"]:not(.qwen-markdown-code *)',
      '[id^="shrproxy"]',
      '[id^="fbproxy"]',
      "div.HvurC",
      ".DBd2Wb",
      ".oLpkLe",
      ".OUQe0e",
      ".UrecDd",
      '[aria-label="Share public link"]',
      "aside.L9AUvd",
      "aside.UL0w9b",
      "div.qacuz",
      ".control-panel",
      "[data-input-selector-group]",
      "[data-input-selector-variable]",
      '[role="slider"]',
      ".AxvpHG_visualizationLayer",
    ];

    noiseSelectors.forEach((selector) => {
      clone.querySelectorAll(selector).forEach((el) => el.remove());
    });

    html = clone;
  } else {
    console.warn("Invalid input to convertToMarkdown:", htmlContent);
    return "";
  }

  try {
    let markdown = turndownService.turndown(html);
    for (const { token, text } of mathPlaceholders) {
      markdown = markdown.replace(token, () => text);
    }
    return markdown.trim();
  } catch (error) {
    console.error("Error converting HTML to markdown:", error);
    // Fallback to plain text
    if (typeof DOMParser !== "undefined") {
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, "text/html");
      return doc.body?.innerText || doc.body?.textContent || "";
    }
    if (typeof html === "string") {
      return html
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    }
    return html?.textContent || "";
  }
}

/**
 * Clean up markdown text by removing common artifacts
 * @param {string} markdown - Markdown text to clean
 * @returns {string} Cleaned markdown
 */
export function cleanMarkdown(markdown) {
  return (
    markdown
      // Remove excessive blank lines (max 2 consecutive)
      .replace(/\n{3,}/g, "\n\n")
      // Remove trailing whitespace from lines
      .replace(/[ \t]+$/gm, "")
      // Normalize horizontal rules
      .replace(/^(-{3,}|\*{3,}|_{3,})$/gm, "* * *")
      .trim()
  );
}
