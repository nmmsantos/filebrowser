import { fetchJSON } from "@/api/utils";
import fm from "front-matter";
import hljs from "highlight.js";
import { memoize } from "lodash-es";
import { marked, type Tokens } from "marked";
import { markedHighlight } from "marked-highlight";
import nunjucks from "nunjucks";
import type { Mermaid } from "mermaid";

declare global {
  interface Window {
    mermaid: Mermaid;
  }
}

interface MermaidCodeToken extends Tokens.Code {
  mermaid?: string;
}

type ViteManifestEntry = {
  file: string;
  src: string;
  isEntry?: boolean;
};

type ViteManifest = Record<string, ViteManifestEntry>;

const mermaidVersion = "11.9.0";

const mermaidPromise = new Promise(
  (resolve: (value: Mermaid) => void, reject: (reason?: any) => void) => {
    const script = document.createElement("script");

    script.src = `https://cdn.jsdelivr.net/npm/mermaid@${mermaidVersion}/dist/mermaid.min.js`;
    script.integrity = "sha256-Cz7UN0EXNjgV2u/a38wg/3BNfdRRO1XtgDq93L2GqJg=";
    script.crossOrigin = "anonymous";
    script.onload = () => resolve(window.mermaid);
    script.onerror = () =>
      reject(new Error(`Failed to load script: ${script.src}`));

    document.head.appendChild(script);
  }
);

let mdPreviewDark: string;
let mdPreviewLight: string;
let currentTheme: string;

marked.use({
  hooks: {
    preprocess(markdown) {
      const { attributes, body } = fm(markdown);
      const md = nunjucks.renderString(body, attributes as object);
      return md;
    },
    postprocess(html) {
      return `<div class="markdown-body">${html}</div>`;
    },
  },
});

marked.use(
  markedHighlight({
    emptyLangClass: "hljs",
    langPrefix: "hljs language-",
    highlight(code, lang) {
      if (lang === "mermaid") return code;
      const language = hljs.getLanguage(lang) ? lang : "plaintext";
      return hljs.highlight(code, { language }).value;
    },
  })
);

marked.use({
  async: true,
  async walkTokens(token) {
    if (token.type === "code" && token.lang === "mermaid") {
      const mermaidCodeToken = token as MermaidCodeToken;
      mermaidCodeToken.mermaid = await renderMermaid(token.text, currentTheme);
    }
  },
  renderer: {
    code(code) {
      const mermaidCodeToken = code as MermaidCodeToken;
      if (mermaidCodeToken.mermaid) return mermaidCodeToken.mermaid;
      return false;
    },
  },
});

const renderMermaid = memoize(
  async (text: string, theme: string) => {
    const chars =
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

    const id = [...Array(12)]
      .map(() => chars[Math.floor(Math.random() * chars.length)])
      .join("");

    let html: string;

    const mermaid = await mermaidPromise;

    try {
      const { svg } = await mermaid.render(`mermaid-${id}`, text);
      html = svg;
    } catch (e) {
      const language = "plaintext";
      const text = hljs.highlight(String(e).toString(), { language }).value;
      html = `<code class="hljs language-${language}">${text}</code>`;
    }

    return `<pre data-theme="${theme}">${html}</pre>`;
  },
  (text, theme) => `${theme}::${text}`
);

const improvedMarkdownInitialize = (theme: UserTheme, filePath?: string) => {
  if (!mdPreviewDark || !mdPreviewLight) {
    fetchJSON<ViteManifest>("/static/.vite/manifest.json").then((manifest) => {
      mdPreviewDark = `/static/${manifest["src/css/mdPreview-dark.css"].file}`;
      mdPreviewLight = `/static/${manifest["src/css/mdPreview-light.css"].file}`;
      improvedMarkdownInitialize(theme, filePath);
    });
    return;
  }
};

// const applyMdPreviewTheme = (theme: "dark" | "light") => {
//   if (currentTheme === theme) return;

//   currentTheme = theme;

//   const id = "hljs-theme-css";
//   const href = theme === "dark" ? mdPreviewDark : mdPreviewLight;

//   let link = document.getElementById(id) as HTMLLinkElement | null;

//   if (link) {
//     if (link.href !== href) {
//       link.href = href;
//     }
//   } else {
//     link = document.createElement("link");
//     link.id = id;
//     link.rel = "stylesheet";
//     link.href = href;
//     document.head.appendChild(link);
//   }

//   mermaid.initialize({
//     securityLevel: "loose",
//     startOnLoad: false,
//     suppressErrorRendering: true,
//     theme: theme === "dark" ? "dark" : "default",
//   });
// };

export { improvedMarkdownInitialize };
