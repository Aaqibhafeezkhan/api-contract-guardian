
import { dirname, join, normalize } from "path";
import { ApiContract } from "../../core/apiContract";
import { SourceFileContent } from "../../core/sourceFileLoader";

interface SymbolReference {
    file: string;
    name: string;
}

interface ImportReference {
    file: string;
    name: string;
    isModule?: boolean;
}

interface MountRelation {
    child: SymbolReference;
    parent: SymbolReference;
    prefix: string;
    operation: "include_router" | "register_blueprint";
    hasPrefix: boolean;
}

interface PythonModule {
    source: SourceFileContent;
    imports: Map<string, ImportReference>;
    prefixes: Map<string, string>;
    routeOwners: Map<number, string>;
    mounts: Array<{
        owner: string;
        target: string;
        prefix: string;
        operation: "include_router" | "register_blueprint";
        hasPrefix: boolean;
    }>;
    contracts: ApiContract[];
}

function normalizePath(filePath: string): string {
    return normalize(filePath).replace(/\\/g, "/");
}

function symbolKey(reference: SymbolReference): string {
    return `${normalizePath(reference.file)}::${reference.name}`;
}

function combinePaths(prefix: string, routePath: string): string {
    const left = prefix.replace(/^\/+|\/+$/g, "");
    const right = routePath.replace(/^\/+|\/+$/g, "");

    if (!left && !right) return "/";
    if (!left) return `/${right}`;
    if (!right) return `/${left}`;

    return `/${left}/${right}`;
}

function stripPythonExtension(filePath: string): string {
    return normalizePath(filePath).replace(/\.py$/i, "");
}

function resolveImportedFile(
    importerPath: string,
    moduleName: string,
    sourceFiles: SourceFileContent[]
): string | undefined {
    const normalizedImporter = normalizePath(importerPath);
    const dots = moduleName.match(/^\.+/)?.[0].length ?? 0;
    const modulePart = moduleName.slice(dots).replace(/\./g, "/");

    let basePath: string;

    if (dots > 0) {
        basePath = dirname(normalizedImporter);

        for (let i = 1; i < dots; i++) {
            basePath = dirname(basePath);
        }

        basePath = normalizePath(join(basePath, modulePart));
    } else {
        basePath = modulePart;
    }

    const candidates = [
        `${basePath}.py`,
        `${basePath}/__init__.py`
    ].map(normalizePath);

    for (const source of sourceFiles) {
        const candidatePath = normalizePath(source.path);

        if (
            candidates.includes(candidatePath) ||
            candidates.some(candidate =>
                candidatePath.endsWith(`/${candidate}`)
            )
        ) {
            return candidatePath;
        }
    }

    if (dots === 0) {
        const suffix = `/${modulePart}`;

        const match = sourceFiles.find(source => {
            const path = stripPythonExtension(source.path);

            return (
                path.endsWith(suffix) ||
                path.endsWith(`${suffix}/__init__`)
            );
        });

        if (match) {
            return normalizePath(match.path);
        }
    }

    return undefined;
}

function readImports(
    source: SourceFileContent,
    sourceFiles: SourceFileContent[]
): Map<string, ImportReference> {
    const imports = new Map<string, ImportReference>();
    const lines = source.content.split(/\r?\n/);

    for (const statement of logicalStatements(lines)) {
        const fromImport = statement.text.match(
            /^\s*from\s+([\w.]+)\s+import\s+(.+?)\s*$/
        );

        if (fromImport) {
            const targetFile = resolveImportedFile(
                source.path,
                fromImport[1],
                sourceFiles
            );

            if (!targetFile) continue;

            const importedNames = fromImport[2]
                .replace(/^\(|\)$/g, "")
                .split(",");

            for (const item of importedNames) {
                const match = item.trim().match(
                    /^(\w+)(?:\s+as\s+(\w+))?$/
                );

                if (!match) continue;

                imports.set(match[2] ?? match[1], {
                    file: targetFile,
                    name: match[1]
                });
            }

            continue;
        }

        const moduleImport = statement.text.match(
            /^\s*import\s+([\w.]+)\s+as\s+(\w+)\s*$/
        );

        if (moduleImport) {
            const targetFile = resolveImportedFile(
                source.path,
                moduleImport[1],
                sourceFiles
            );

            if (targetFile) {
                imports.set(moduleImport[2], {
                    file: targetFile,
                    name: "*",
                    isModule: true
                });
            }
        }
    }

    return imports;
}

// This lightweight scanner groups parenthesized statements; it is not a full Python tokenizer.
// Bracket/brace continuation and explicit backslash continuation are outside its scope.
export function* logicalStatements(lines: string[]): Generator<{
    line: number;
    text: string;
}> {
    let startLine = 1;
    let text = "";
    let depth = 0;
    let quote: "'" | "\"" | undefined;
    let tripleQuoted = false;
    let escaped = false;

    for (let index = 0; index < lines.length; index++) {
        const line = lines[index];

        if (!text) {
            startLine = index + 1;
        }

        let code = "";

        for (let cursor = 0; cursor < line.length; cursor++) {
            const character = line[cursor];

            if (quote) {
                code += character;

                if (escaped) {
                    escaped = false;
                    continue;
                }

                if (character === "\\") {
                    escaped = true;
                    continue;
                }

                if (tripleQuoted) {
                    if (
                        character === quote &&
                        line.slice(cursor, cursor + 3) === quote.repeat(3)
                    ) {
                        code += line.slice(cursor + 1, cursor + 3);
                        cursor += 2;
                        quote = undefined;
                        tripleQuoted = false;
                    }
                } else if (character === quote) {
                    quote = undefined;
                }

                continue;
            }

            if (character === "#") {
                break;
            }

            if (character === "'" || character === "\"") {
                quote = character;
                tripleQuoted =
                    line.slice(cursor, cursor + 3) === character.repeat(3);
                code += tripleQuoted
                    ? line.slice(cursor, cursor + 3)
                    : character;

                if (tripleQuoted) {
                    cursor += 2;
                }

                continue;
            }

            if (character === "(") {
                depth++;
            } else if (character === ")") {
                depth--;
            }

            code += character;
        }

        if (quote && !tripleQuoted && !escaped) {
            quote = undefined;
        }

        // A trailing backslash escapes the physical newline, not the next character.
        if (escaped) {
            escaped = false;
        }

        text += `${text ? " " : ""}${code.trim()}`;

        if (depth <= 0 && !tripleQuoted && !quote) {
            if (text.trim()) {
                yield { line: startLine, text };
            }
            text = "";
            depth = 0;
        }
    }

    if (text.trim()) {
        yield { line: startLine, text };
    }
}

function discoverModule(
    source: SourceFileContent,
    sourceFiles: SourceFileContent[],
    parseFile: (source: string, file: string) => ApiContract[]
): PythonModule {
    const lines = source.content.split(/\r?\n/);
    const routeOwners = new Map<number, string>();
    const prefixes = new Map<string, string>();
    const mounts: PythonModule["mounts"] = [];

    const routerPattern =
        /^\s*(\w+)\s*=\s*(?:[\w.]+\.)?APIRouter\s*\((.*)\)\s*$/;

    const blueprintPattern =
        /^\s*(\w+)\s*=\s*(?:[\w.]+\.)?Blueprint\s*\((.*)\)\s*$/;

    const routePattern =
        /^\s*@([\w.]+)\.(get|post|put|patch|delete|route)\s*\(/i;

    const mountPattern =
        /\b([\w.]+)\.(include_router|register_blueprint)\s*\(\s*([\w.]+)\s*(?:,([\s\S]*))?\)\s*$/g;

    for (const statement of logicalStatements(lines)) {
        const { line: lineNumber, text } = statement;

        const routerMatch = text.match(routerPattern);
        const blueprintMatch = text.match(blueprintPattern);

        if (routerMatch) {
            const prefix = routerMatch[2].match(
                /\bprefix\s*=\s*["']([^"']*)["']/
            )?.[1] ?? "";

            prefixes.set(routerMatch[1], prefix);
        }

        if (blueprintMatch) {
            const prefix = blueprintMatch[2].match(
                /\burl_prefix\s*=\s*["']([^"']*)["']/
            )?.[1] ?? "";

            prefixes.set(blueprintMatch[1], prefix);
        }

        const routeMatch = text.match(routePattern);

        if (routeMatch) {
            routeOwners.set(lineNumber, routeMatch[1]);
        }

        mountPattern.lastIndex = 0;

        let mountMatch: RegExpExecArray | null;

        while ((mountMatch = mountPattern.exec(text)) !== null) {
            const owner = mountMatch[1];
            const operation =
                mountMatch[2] === "register_blueprint"
                    ? "register_blueprint"
                    : "include_router";
            const target = mountMatch[3];
            const argumentsText = mountMatch[4] ?? "";

            const prefixName =
                operation === "include_router"
                    ? "prefix"
                    : "url_prefix";

            const prefixMatch = argumentsText.match(
                new RegExp(
                    `\\b${prefixName}\\s*=\\s*["']([^"']*)["']`
                )
            );
            const prefix = prefixMatch?.[1] ?? "";

            mounts.push({
                owner,
                target,
                prefix,
                operation,
                hasPrefix: prefixMatch !== null
            });
        }
    }

    return {
        source,
        imports: readImports(source, sourceFiles),
        prefixes,
        routeOwners,
        mounts,
        contracts: parseFile(source.content, source.path)
    };
}

function resolveSymbol(
    module: PythonModule,
    name: string
): SymbolReference {
    const [importName, ...members] = name.split(".");
    const imported = module.imports.get(importName);

    if (imported?.isModule && members.length > 0) {
        return {
            file: imported.file,
            name: members.join(".")
        };
    }

    if (imported && imported.name !== "*") {
        return {
            file: imported.file,
            name: [imported.name, ...members].join(".")
        };
    }

    return {
        file: normalizePath(module.source.path),
        name
    };
}

function collectPrefixes(
    reference: SymbolReference,
    mountsByChild: Map<string, MountRelation[]>,
    modulesByPath: Map<string, PythonModule>,
    visiting: Set<string>
): string[] {
    const key = symbolKey(reference);

    if (visiting.has(key)) {
        return [];
    }

    const module = modulesByPath.get(
        normalizePath(reference.file)
    );
    const intrinsicPrefix =
        module?.prefixes.get(reference.name) ?? "";
    const relations = mountsByChild.get(key) ?? [];

    if (relations.length === 0) {
        return [intrinsicPrefix];
    }

    const nextVisiting = new Set(visiting);
    nextVisiting.add(key);

    const prefixes: string[] = [];

    for (const relation of relations) {
        const parentPrefixes = collectPrefixes(
            relation.parent,
            mountsByChild,
            modulesByPath,
            nextVisiting
        );

        for (const parentPrefix of parentPrefixes) {
            prefixes.push(
                combinePaths(
                    parentPrefix,
                    relation.operation === "register_blueprint" &&
                        relation.hasPrefix
                        ? relation.prefix
                        : combinePaths(relation.prefix, intrinsicPrefix)
                )
            );
        }
    }

    return [...new Set(prefixes)];
}

export function discoverPythonContracts(
    sourceFiles: SourceFileContent[],
    parseFile: (source: string, file: string) => ApiContract[]
): ApiContract[] {
    const modules = sourceFiles.map(source =>
        discoverModule(source, sourceFiles, parseFile)
    );

    const modulesByPath = new Map(
        modules.map(module => [
            normalizePath(module.source.path),
            module
        ])
    );

    const mountsByChild = new Map<string, MountRelation[]>();

    for (const module of modules) {
        for (const mount of module.mounts) {
            const parent = resolveSymbol(module, mount.owner);
            const child = resolveSymbol(module, mount.target);

            const relation: MountRelation = {
                parent,
                child,
                prefix: mount.prefix,
                operation: mount.operation,
                hasPrefix: mount.hasPrefix
            };

            const key = symbolKey(child);
            const relations = mountsByChild.get(key) ?? [];

            relations.push(relation);
            mountsByChild.set(key, relations);
        }
    }

    const contracts: ApiContract[] = [];

    for (const module of modules) {
        for (const contract of module.contracts) {
            const ownerName = module.routeOwners.get(contract.line);

            if (!ownerName) {
                contracts.push(contract);
                continue;
            }

            const owner = resolveSymbol(module, ownerName);

            const mountPrefixes = collectPrefixes(
                owner,
                mountsByChild,
                modulesByPath,
                new Set()
            );

            const seenPaths = new Set<string>();

            for (const prefix of mountPrefixes) {
                const path = combinePaths(prefix, contract.path);

                if (seenPaths.has(path)) continue;
                seenPaths.add(path);

                contracts.push({
                    ...contract,
                    path
                });
            }
        }
    }

    return contracts;
}