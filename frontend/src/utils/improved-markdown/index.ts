import { files as api } from "@/api";
import type { StatusError } from "@/api/utils";
import "@/css/improved-markdown.css";
import { useFileStore } from "@/stores/file";
import { getTheme } from "@/utils/theme";
import DOMPurify from "dompurify";
import { marked, type Tokens } from "marked";
import type nunjucks from "nunjucks";
import { decrypt, DecryptionError, deriveKey, encrypt } from "./crypto";
import { PathOperations } from "./path-operations";

declare global {
  interface Window {
    hljs: {
      configure: (options: { cssSelector?: string }) => void;
      getLanguage: (name?: string) =>
        | {
            name: string;
          }
        | undefined;
      highlightAll: () => void;
    };
    mermaid: {
      initialize: (config: {
        securityLevel?: "strict" | "loose" | "antiscript" | "sandbox";
        startOnLoad?: boolean;
        suppressErrorRendering?: boolean;
        theme?: "default" | "base" | "dark" | "forest" | "neutral" | "null";
      }) => void;
      run: () => Promise<void>;
    };
    nunjucks: typeof nunjucks;
    jsyaml: {
      loadFront: (
        text: string,
        name?: string
      ) => Record<string, any> & { [key: string]: string };
    };
  }
}

declare module "nunjucks" {
  interface Template {
    path?: string;
  }
}

type NunjucksRenderContext = Record<string, unknown> & {
  __templateStack?: string[];
};

type NunjucksRenderType = (
  this: nunjucks.Template,
  ctx: NunjucksRenderContext,
  parentFrame: unknown,
  cb?: nunjucks.TemplateCallback<string>
) => string | void;

const fileStore = useFileStore();
const path = new PathOperations("/");
let nunjucksRender:
  | ((src: string, context?: object, path?: string) => Promise<string>)
  | null = null;
let currentTheme: UserTheme | null = null;

marked.use({
  async: true,
  hooks: {
    preprocess(markdown) {
      return markedPreprocess(markdown);
    },
    postprocess(html) {
      return markedPostprocess(html);
    },
  },
  renderer: {
    code(code) {
      return markedRendererCode(code);
    },
  },
});

const markedPreprocess = async (markdown: string) => {
  const githubMarkdownCssVersion = "5.8.1";
  const highlightJsVersion = "11.11.1";
  const mermaidVersion = "11.12.2";
  const nunjucksVersion = "3.2.4";
  const yamlFrontMatterVersion = "3.4.1";

  const githubMarkdownDarkLinkElem = await assertLink(
    "im-githubmarkdowndark",
    `https://cdn.jsdelivr.net/npm/github-markdown-css@${githubMarkdownCssVersion}/github-markdown-dark.min.css`,
    "sha256-zTP99+IGwJaPkWR82beK6gjyTzQ0XL6FKrRnrLTeu2c="
  );

  const githubMarkdownLightLinkElem = await assertLink(
    "im-githubmarkdownlight",
    `https://cdn.jsdelivr.net/npm/github-markdown-css@${githubMarkdownCssVersion}/github-markdown-light.min.css`,
    "sha256-uQk7xAc+uztdrFGpdK+VuNswtG0Cha3hq0Jx5650GxQ="
  );

  const highlightJsDarkLinkElem = await assertLink(
    "im-highlightjsdark",
    `https://cdn.jsdelivr.net/npm/highlight.js@${highlightJsVersion}/styles/github-dark.min.css`,
    "sha256-nyCNAiECsdDHrr/s2OQsp5l9XeY2ZJ0rMepjCT2AkBk="
  );

  const highlightJsLightLinkElem = await assertLink(
    "im-highlightjsligh",
    `https://cdn.jsdelivr.net/npm/highlight.js@${highlightJsVersion}/styles/github.min.css`,
    "sha256-Oppd74ucMR5a5Dq96FxjEzGF7tTw2fZ/6ksAqDCM8GY="
  );

  await assertScript(
    "im-highlightjs",
    `https://cdn.jsdelivr.net/gh/highlightjs/cdn-release@${highlightJsVersion}/build/highlight.min.js`,
    "sha256-xKOZ3W9Ii8l6NUbjR2dHs+cUyZxXuUcxVMb7jSWbk4E="
  );

  await assertScript(
    "im-mermaid",
    `https://cdn.jsdelivr.net/npm/mermaid@${mermaidVersion}/dist/mermaid.min.js`,
    "sha256-0IMKbAVUbp7bj+IKj1RfPg3HxMMTTVhLrZwTqZ16ceA="
  );

  await assertScript(
    "im-nunjucks",
    `https://cdn.jsdelivr.net/npm/nunjucks@${nunjucksVersion}/browser/nunjucks.min.js`,
    "sha256-k3aSiLPrY//wLUBAa6TS1J9Itw8xV2zcMw7n9iaFbz8="
  );

  await assertScript(
    "im-yamlfrontmatter",
    `https://cdn.jsdelivr.net/npm/yaml-front-matter@${yamlFrontMatterVersion}/dist/js-yaml-front-client.min.js`,
    "sha256-H24KZmKMsfiFzP+Okwxs5Ntjpvgz0NKElm9FRbar6wg="
  );

  const { hljs, mermaid, nunjucks, jsyaml } = window;

  if (!nunjucksRender) {
    DOMPurify.addHook("afterSanitizeAttributes", function (node) {
      if (
        node.tagName === "A" &&
        node.getAttribute("data-open") === "fileborwser"
      ) {
        node.setAttribute("target", "_blank");
        node.setAttribute("rel", "noopener noreferrer");
        node.removeAttribute("data-open");
      }
    });

    hljs.configure({
      cssSelector: "pre code.hljs",
    });

    const originalRender = nunjucks.Template.prototype
      .render as NunjucksRenderType;

    (nunjucks.Template.prototype.render as NunjucksRenderType) = function (
      ctx,
      parentFrame,
      cb
    ) {
      if (typeof ctx === "function") {
        cb = ctx as nunjucks.TemplateCallback<string>;
        ctx = {};
      } else if (typeof parentFrame === "function") {
        cb = parentFrame as nunjucks.TemplateCallback<string>;
        parentFrame = null;
      }

      const renderCtx = (ctx ?? {}) as NunjucksRenderContext;
      const stack = (renderCtx.__templateStack ??= []);
      const templatePath = this.path;

      const popTemplate = () => {
        if (templatePath) {
          stack.pop();
        }
      };

      if (templatePath) {
        stack.push(templatePath);
      }

      if (typeof cb === "function") {
        return originalRender.call(
          this,
          renderCtx,
          parentFrame,
          (err: nunjucks.lib.TemplateError | null, res: string | null) => {
            popTemplate();
            return cb(err, res);
          }
        );
      }

      try {
        return originalRender.call(this, renderCtx, parentFrame, cb);
      } finally {
        popTemplate();
      }
    };

    class FileBrowserLoader implements nunjucks.ILoaderAsync {
      async = true as const;

      isRelative(filename: string): boolean {
        return !path.isAbsolute(filename);
      }

      resolve(from: string, to: string): string {
        return path.resolve(path.dirname(from), to);
      }

      getSource(
        name: string,
        callback: nunjucks.Callback<Error, nunjucks.LoaderSource>
      ): void {
        const url = "/files" + name;

        api
          .fetch(url)
          .then((value) => {
            if (value.isDir) {
              return callback(
                new Error(`Fetching ${url}:\nResource is a Dir`),
                null
              );
            } else {
              return callback(null, {
                src: value.content ?? "",
                path: value.path,
                noCache: true,
              });
            }
          })
          .catch((reason: StatusError) => {
            return callback(new Error(`Fetching ${url}:\n${reason}`), null);
          });
      }
    }

    class FileBrowserExtension implements nunjucks.Extension {
      tags = ["download", "image", "link"];

      private resolveFileArgs(context: any, arg1?: string, arg2?: string) {
        const renderCtx = (context?.ctx ?? {}) as NunjucksRenderContext;
        const stack = renderCtx.__templateStack ?? [];
        const templatePath = stack[stack.length - 1];

        if (!arg2) {
          if (!arg1) {
            throw new Error("filePath required");
          }

          arg2 = arg1;
        }

        const resolvedPath = !path.isAbsolute(arg2)
          ? path.resolve(path.dirname(templatePath), arg2)
          : arg2;

        return { name: arg1, resolvedPath };
      }

      parse(parser: any, nodes: any) {
        const tok = parser.nextToken();

        const args = parser.parseSignature(null, true);
        parser.advanceAfterBlockEnd(tok.value);

        return new nodes.CallExtension(this, tok.value, args);
      }

      download(context: any, arg1?: string, arg2?: string) {
        const { name, resolvedPath } = this.resolveFileArgs(
          context,
          arg1,
          arg2
        );

        return `[${name}](/api/raw${resolvedPath})`;
      }

      image(context: any, arg1?: string, arg2?: string) {
        const { name, resolvedPath } = this.resolveFileArgs(
          context,
          arg1,
          arg2
        );

        return `![${name}](/api/raw${resolvedPath})`;
      }

      link(context: any, arg1?: string, arg2?: string) {
        const { name, resolvedPath } = this.resolveFileArgs(
          context,
          arg1,
          arg2
        );

        return `<a href="/files${resolvedPath}" data-open="fileborwser">${name}</a>`;
      }
    }

    const nunjucksEnv = new nunjucks.Environment(new FileBrowserLoader(), {
      autoescape: false,
      throwOnUndefined: true,
    });

    nunjucksEnv.addExtension(
      "FileBrowserExtension",
      new FileBrowserExtension()
    );

    let cryptoKey: CryptoKey | null = null;

    const getKey = async () => {
      if (cryptoKey) return cryptoKey;

      let password;

      while (!password) {
        password = prompt("Enter the encryption password:");
      }

      cryptoKey = await deriveKey(password);
      return cryptoKey;
    };

    const encryptFilter = async (plaintext: string) => {
      const key = await getKey();
      const ciphertext = await encrypt(plaintext, key);
      return ciphertext;
    };

    const decryptFilter = async (ciphertext: string) => {
      const key = await getKey();

      try {
        const plaintext = await decrypt(ciphertext, key);
        return plaintext;
      } catch (e) {
        if (e instanceof DecryptionError) {
          return "#ENCRYPTED#";
        } else {
          throw e;
        }
      }
    };

    nunjucksEnv.addFilter(
      "encrypt",
      (plaintext: string, callback: nunjucks.Callback<Error, string>): void => {
        encryptFilter(plaintext)
          .then((ciphertext) => {
            return callback(null, ciphertext);
          })
          .catch((reason) => {
            return callback(reason, null);
          });
      },
      true
    );

    nunjucksEnv.addFilter(
      "decrypt",
      (
        ciphertext: string,
        callback: nunjucks.Callback<Error, string>
      ): void => {
        decryptFilter(ciphertext)
          .then((plaintext) => {
            return callback(null, plaintext);
          })
          .catch((reason) => {
            return callback(reason, null);
          });
      },
      true
    );

    nunjucksRender = async (
      src: string,
      context?: object,
      path?: string
    ): Promise<string> =>
      new Promise((resolve, reject) =>
        new nunjucks.Template(src, nunjucksEnv, path).render(
          context,
          (err, res) => (err ? reject(err) : resolve(res ?? "null"))
        )
      );
  }

  const theme = getTheme();

  if (currentTheme !== theme) {
    currentTheme = theme;

    githubMarkdownDarkLinkElem.disabled = theme !== "dark";
    githubMarkdownLightLinkElem.disabled = theme === "dark";
    highlightJsDarkLinkElem.disabled = theme !== "dark";
    highlightJsLightLinkElem.disabled = theme === "dark";

    mermaid.initialize({
      securityLevel: "loose",
      startOnLoad: false,
      suppressErrorRendering: true,
      theme: theme === "dark" ? "dark" : "default",
    });
  }

  try {
    const { __content: body, ...context } = jsyaml.loadFront(markdown);

    try {
      return await nunjucksRender(body, context, fileStore.req?.path);
    } catch (e) {
      return `# Nunjucks error\n\n\`\`\`javascript\n${e}\n\`\`\``;
    }
  } catch (e) {
    return `# Front Matter error\n\n\`\`\`javascript\n${e}\n\`\`\``;
  }
};

const markedPostprocess = (html: string) => {
  const { hljs, mermaid } = window;

  requestAnimationFrame(() => {
    mermaid.run();
    hljs.highlightAll();
  });

  return `<div class="markdown-body">${html}</div>`;
};

const markedRendererCode = (code: Tokens.Code) => {
  const { hljs } = window;

  if (code.lang === "mermaid") {
    return `<div style="text-align: center;"><pre class="mermaid">${code.text}</pre></div>`;
  }

  const hljsLang = hljs.getLanguage(code.lang);

  if (hljsLang) {
    return `<pre><code class="hljs language-${hljsLang.name.toLowerCase()}">${code.text}</code></pre>`;
  }

  return false;
};

const assertLink = async (id: string, href: string, integrity?: string) =>
  new Promise<HTMLLinkElement>((resolve, reject) => {
    const el = document.getElementById(id);

    if (el instanceof HTMLLinkElement) {
      return resolve(el);
    } else if (el) {
      el.remove();
    }

    const link = document.createElement("link");
    link.id = id;
    link.rel = "stylesheet";
    link.href = href;

    if (integrity) {
      link.integrity = integrity;
      link.crossOrigin = "anonymous";
    }

    link.onload = () => resolve(link);
    link.onerror = () =>
      reject(new Error(`Failed to load style: ${link.href}`));

    document.head.appendChild(link);
  });

const assertScript = async (id: string, src: string, integrity?: string) =>
  new Promise<HTMLScriptElement>((resolve, reject) => {
    const el = document.getElementById(id);

    if (el instanceof HTMLScriptElement) {
      return resolve(el);
    } else if (el) {
      el.remove();
    }

    const script = document.createElement("script");
    script.id = id;
    script.src = src;

    if (integrity) {
      script.integrity = integrity;
      script.crossOrigin = "anonymous";
    }

    script.onload = () => resolve(script);
    script.onerror = () =>
      reject(new Error(`Failed to load script: ${script.src}`));

    document.head.appendChild(script);
  });
