const normalizeArray = (parts: string[], allowAboveRoot: boolean): string[] => {
  const res = [];

  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];

    if (!p || p === ".") continue;

    if (p === "..") {
      if (res.length && res[res.length - 1] !== "..") {
        res.pop();
      } else if (allowAboveRoot) {
        res.push("..");
      }
    } else {
      res.push(p);
    }
  }

  return res;
};

const trimArray = (arr: string[]): string[] => {
  const lastIndex = arr.length - 1;
  let start = 0;

  for (; start <= lastIndex; start++) {
    if (arr[start]) break;
  }

  let end = lastIndex;

  for (; end >= 0; end--) {
    if (arr[end]) break;
  }

  if (start === 0 && end === lastIndex) return arr;
  if (start > end) return [];

  return arr.slice(start, end + 1);
};

const splitPathRe =
  /^(\/?|)([\s\S]*?)((?:\.{1,2}|[^/]+?|)(\.[^./]*|))(?:[/]*)$/;

const posixSplitPath = (filename: string): string[] => {
  const parts = splitPathRe.exec(filename);

  return parts ? parts.slice(1) : [];
};

export class PathOperations {
  cwd: string;

  constructor(cwd: string) {
    this.cwd = cwd;
  }

  resolve(...paths: string[]): string {
    let resolvedPath = "",
      resolvedAbsolute = false;

    for (let i = paths.length - 1; i >= -1 && !resolvedAbsolute; i--) {
      const path = i >= 0 ? paths[i] : this.cwd;

      if (!path) {
        continue;
      }

      resolvedPath = path + "/" + resolvedPath;
      resolvedAbsolute = path[0] === "/";
    }

    resolvedPath = normalizeArray(
      resolvedPath.split("/"),
      !resolvedAbsolute
    ).join("/");

    return (resolvedAbsolute ? "/" : "") + resolvedPath || ".";
  }

  isAbsolute(path: string): boolean {
    return path.charAt(0) === "/";
  }

  relative(from: string, to: string): string {
    from = this.resolve(from).substring(1);
    to = this.resolve(to).substring(1);

    const fromParts = trimArray(from.split("/"));
    const toParts = trimArray(to.split("/"));

    const length = Math.min(fromParts.length, toParts.length);
    let samePartsLength = length;

    for (let i = 0; i < length; i++) {
      if (fromParts[i] !== toParts[i]) {
        samePartsLength = i;
        break;
      }
    }

    let outputParts = [];

    for (let i = samePartsLength; i < fromParts.length; i++) {
      outputParts.push("..");
    }

    outputParts = outputParts.concat(toParts.slice(samePartsLength));

    return outputParts.join("/");
  }

  dirname(path: string): string {
    const result = posixSplitPath(path),
      root = result[0];

    let dir = result[1];

    if (!root && !dir) {
      return ".";
    }

    if (dir) {
      dir = dir.substring(0, dir.length - 1);
    }

    return root + dir;
  }
}
