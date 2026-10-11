
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
}

interface MountRelation {
    child: SymbolReference;
    parent: SymbolReference;
    prefix: string;
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

    for (const line of lines) {
        const fromImport = line.match(
            /^\s*from\s+([\w.]+)\s+import\s+(.+?)\s*(?:#.*)?$/
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

        const moduleImport = line.match(
            /^\s*import\s+([\w.]+)\s+as\s+(\w+)\s*(?:#.*)?$/
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
                    name: "*"
                });
            }
        }
    }

    return imports;
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
        /^\s*(\w+)\s*=\s*(?:[\w.]+\.)?APIRouter\s*\((.*)\)/;

    const blueprintPattern =
        /^\s*(\w+)\s*=\s*(?:[\w.]+\.)?Blueprint\s*\((.*)\)/;

    const routePattern =
        /^\s*@(\w+)\.(get|post|put|patch|delete|route)\s*\(/i;

    const mountPattern =
        /\b(\w+)\.(include_router|register_blueprint)\s*\(\s*(\w+)\s*(?:,([^)]*))?\)/g;

    for (let index = 0; index < lines.length; index++) {
        const line = lines[index];

        const routerMatch = line.match(routerPattern);
        const blueprintMatch = line.match(blueprintPattern);

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

        const routeMatch = line.match(routePattern);

        if (routeMatch) {
            routeOwners.set(index + 1, routeMatch[1]);
        }

        mountPattern.lastIndex = 0;

        let mountMatch: RegExpExecArray | null;

        while ((mountMatch = mountPattern.exec(line)) !== null) {
            const owner = mountMatch[1];
            const operation = mountMatch[2];
            const target = mountMatch[3];
            const argumentsText = mountMatch[4] ?? "";

            const prefixName =
                operation === "include_router"
                    ? "prefix"
                    : "url_prefix";

            const prefix = argumentsText.match(
                new RegExp(
                    `\\b${prefixName}\\s*=\\s*["']([^"']*)["']`
                )
            )?.[1] ?? "";

            mounts.push({ owner, target, prefix });
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
    const imported = module.imports.get(name);

    if (imported && imported.name !== "*") {
        return {
            file: imported.file,
            name: imported.name
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
    visiting: Set<string>
): string[] {
    const key = symbolKey(reference);

    if (visiting.has(key)) {
        return [];
    }

    const relations = mountsByChild.get(key) ?? [];

    if (relations.length === 0) {
        return [""];
    }

    const nextVisiting = new Set(visiting);
    nextVisiting.add(key);

    const prefixes: string[] = [];

    for (const relation of relations) {
        const parentPrefixes = collectPrefixes(
            relation.parent,
            mountsByChild,
            nextVisiting
        );

        for (const parentPrefix of parentPrefixes) {
            prefixes.push(
                combinePaths(parentPrefix, relation.prefix)
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
                prefix: mount.prefix
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
            const ownerModule = modulesByPath.get(
                normalizePath(owner.file)
            );

            const intrinsicPrefix =
                ownerModule?.prefixes.get(owner.name) ?? "";

            const mountPrefixes = collectPrefixes(
                owner,
                mountsByChild,
                new Set()
            );

            const usablePrefixes =
                mountPrefixes.length > 0 ? mountPrefixes : [""];

            const seenPaths = new Set<string>();

            for (const mountPrefix of usablePrefixes) {
                const prefix = combinePaths(
                    mountPrefix,
                    intrinsicPrefix
                );

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