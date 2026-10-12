import * as assert from "assert";
import { ContractLoader } from "../../core/contract/contractLoader";
import { GitService } from "../../core/git/gitService";
import { JavaScriptParser } from "../../languages/javascript/javascriptParser";

suite("Contract Loader", () => {

    test("loads API contracts from a Git revision", () => {

        const gitService = new GitService();

        const loader = new ContractLoader(
            gitService,
            [
                new JavaScriptParser()
            ]
        );

        const contracts = loader.loadFromRevision(
            ["src/extension.ts"],
            "HEAD"
        );

        assert.ok(Array.isArray(contracts));
    });

    test("ignores unsupported files", () => {

        const gitService = new GitService();

        const loader = new ContractLoader(
            gitService,
            [
                new JavaScriptParser()
            ]
        );

        const contracts = loader.loadFromRevision(
            ["README.md"],
            "HEAD"
        );

        assert.deepStrictEqual(contracts, []);
    });
});