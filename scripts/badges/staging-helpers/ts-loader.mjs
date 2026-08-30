import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, extname, resolve as resolvePath } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import ts from "typescript";

const TYPESCRIPT_EXTENSIONS = [".ts", ".tsx", ".mts"];
const JAVASCRIPT_EXTENSIONS = [".mjs", ".js", ".cjs"];
const RESOLVABLE_EXTENSIONS = [
  ...TYPESCRIPT_EXTENSIONS,
  ...JAVASCRIPT_EXTENSIONS,
];

export async function resolve(specifier, context, nextResolve) {
  if (specifier === "server-only") {
    return {
      shortCircuit: true,
      url: "data:text/javascript,export%20{}%3B",
    };
  }

  if (specifier.startsWith("@/")) {
    const resolved = resolveImportPath(resolvePath(process.cwd(), specifier.slice(2)));
    return {
      shortCircuit: true,
      url: pathToFileURL(resolved).href,
    };
  }

  if (
    specifier.startsWith(".") &&
    context.parentURL?.startsWith("file:")
  ) {
    const parentDirectory = dirname(fileURLToPath(context.parentURL));
    const resolved = resolveImportPath(resolvePath(parentDirectory, specifier));
    return {
      shortCircuit: true,
      url: pathToFileURL(resolved).href,
    };
  }

  return nextResolve(specifier, context);
}

export async function load(url, context, nextLoad) {
  if (!url.startsWith("file:")) {
    return nextLoad(url, context);
  }

  const path = fileURLToPath(url);
  const extension = extname(path);
  if (!TYPESCRIPT_EXTENSIONS.includes(extension)) {
    return nextLoad(url, context);
  }

  const source = await readFile(path, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      isolatedModules: true,
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: path,
  });

  return {
    format: "module",
    shortCircuit: true,
    source: output.outputText,
  };
}

function resolveImportPath(basePath) {
  if (extname(basePath) && existsSync(basePath)) {
    return basePath;
  }

  for (const extension of RESOLVABLE_EXTENSIONS) {
    const candidate = `${basePath}${extension}`;
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  for (const extension of RESOLVABLE_EXTENSIONS) {
    const candidate = resolvePath(basePath, `index${extension}`);
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  return basePath;
}
