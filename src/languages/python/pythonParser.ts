import {
    ApiContract,
    ResponseContract,
    ResponseField,
    UNKNOWN_RESPONSE_FIELD_TYPE
} from "../../core/apiContract";
import { LanguageParser } from "../../core/parser";
import { SourceFileContent } from "../../core/sourceFileLoader";
import {
    discoverPythonContracts,
    logicalStatements
} from "./pythonRouteDiscovery";

export class PythonParser implements LanguageParser {
    supports(filePath: string): boolean {
        return filePath.toLowerCase().endsWith(".py");
    }

    parse(
        sourceCode: string,
        filePath: string
    ): ApiContract[] {
        const contracts: ApiContract[] = [];
        const lines = sourceCode.split(/\r?\n/);

        const routePattern =
            /^\s*@([\w.]+)\.(get|post|put|patch|delete|route)\s*\(\s*["']([^"']+)["'](.*?)\)\s*$/i;

        for (const statement of logicalStatements(lines)) {
            const match = statement.text.match(routePattern);

            if (!match) {
                continue;
            }

            const decorator = match[2].toLowerCase();
            const path = match[3];
            const options = match[4];

            let methods: string[];

            if (decorator === "route") {
                const methodsMatch = options.match(
                    /methods\s*=\s*\[([^\]]*)\]/i
                );

                methods = methodsMatch
                    ? [...methodsMatch[1].matchAll(/["'](GET|POST|PUT|PATCH|DELETE)["']/gi)]
                        .map(method => method[1].toUpperCase())
                    : ["GET"];
            } else {
                methods = [decorator.toUpperCase()];
            }

            const response = this.extractResponse(
                lines,
                statement.line - 1
            );

            for (const method of methods) {
                contracts.push({
                    method: method as ApiContract["method"],
                    path,
                    file: filePath,
                    line: statement.line,
                    response
                });
            }
        }

        return contracts;
    }
    discoverRepository(
    sourceFiles: SourceFileContent[]
): ApiContract[] {
    return discoverPythonContracts(
        sourceFiles,
        (source, file) => this.parse(source, file)
    );
}
    private extractResponse(
        lines: string[],
        decoratorLine: number
    ): ResponseContract | undefined {
        let functionLine = decoratorLine + 1;

        while (
            functionLine < lines.length &&
            !/^\s*(?:async\s+)?def\s+\w+\s*\(/.test(
                lines[functionLine]
            )
        ) {
            functionLine++;
        }

        if (functionLine >= lines.length) {
            return undefined;
        }

        const functionIndent =
            lines[functionLine].match(/^\s*/)?.[0].length ?? 0;

        for (
            let index = functionLine + 1;
            index < lines.length;
            index++
        ) {
            const line = lines[index];

            if (!line.trim()) {
                continue;
            }

            const indentation =
                line.match(/^\s*/)?.[0].length ?? 0;

            if (indentation <= functionIndent) {
                break;
            }

            if (!/^\s*return\s+\{/.test(line)) {
                continue;
            }

            const fields: ResponseField[] = [];
            const inlineFields = line.match(
                /^\s*return\s+\{(.*)\}\s*,?\s*(?:#.*)?$/
            );

            if (inlineFields) {
                return this.extractDictionaryFields(
                    inlineFields[1].split(","),
                    true
                );
            }

            let fieldsComplete = true;
            let dictionaryClosed = false;
            for (
                let fieldIndex = index;
                fieldIndex < lines.length;
                fieldIndex++
            ) {
                const fieldLine = lines[fieldIndex];

                if (!fieldLine.trim() || /^\s*#/.test(fieldLine)) {
                    continue;
                }

                if (/^\s*}\s*,?\s*(?:#.*)?$/.test(fieldLine)) {
                    dictionaryClosed = true;
                    break;
                }

                const fieldIndent =
                    fieldLine.match(/^\s*/)?.[0].length ?? 0;

                if (
                    fieldIndex > index &&
                    fieldLine.trim() &&
                    fieldIndent <= functionIndent
                ) {
                    break;
                }

                if (fieldIndex === index) {
                    continue;
                }

                const [field] = this.extractDictionaryFields(
                    [fieldLine],
                    false
                ).fields;

                if (field) {
                    fields.push(field);
                }
            }

            return fieldsComplete && dictionaryClosed
                ? { fields }
                : { fields, fieldsComplete: false };
        }

        return undefined;
    }

    private extractDictionaryFields(
        entries: string[],
        fieldsComplete: boolean
    ): ResponseContract {
        const fields: ResponseField[] = [];
        let complete = fieldsComplete;

        for (const entry of entries) {
            const trimmed = entry.trim();

            if (!trimmed) {
                continue;
            }

            const fieldMatch = trimmed.match(
                /^["']?([A-Za-z_]\w*)["']?\s*:\s*(.+?)\s*$/
            );

            if (!fieldMatch) {
                complete = false;
                continue;
            }

            const type = this.inferPythonType(fieldMatch[2]);

            fields.push({
                name: fieldMatch[1],
                type: type ?? UNKNOWN_RESPONSE_FIELD_TYPE
            });
        }

        return complete
            ? { fields }
            : { fields, fieldsComplete: false };
    }

    private inferPythonType(value: string): string | undefined {
        const normalized = value.trim().replace(/,\s*$/, "");

        if (
            /^["']/.test(normalized) &&
            /["']$/.test(normalized)
        ) {
            return "string";
        }

        if (/^-?\d+(?:\.\d+)?$/.test(normalized)) {
            return "number";
        }

        if (/^(True|False)$/.test(normalized)) {
            return "boolean";
        }

        if (/^None$/.test(normalized)) {
            return "null";
        }

        return undefined;
    }
}