import * as assert from "assert";
import { GitService } from "../../core/git/gitService";

suite("Git Service", () => {

    test("reads a file from a Git revision", () => {

        const gitService = new GitService();

        const source = gitService.getFileAtRevision(
            "package.json",
            "HEAD"
        );

        assert.ok(source.includes('"name": "api-contract-guardian"'));
    });

});