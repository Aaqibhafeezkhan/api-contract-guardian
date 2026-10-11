import * as assert from "assert";

import {
    execFileSync
} from "child_process";

import {
    mkdirSync,
    mkdtempSync,
    writeFileSync
} from "fs";

import {
    rm
} from "fs/promises";

import {
    tmpdir
} from "os";

import {
    join
} from "path";

import {
    ApiDiscoveryService
} from "../core/apiDiscoveryService";

import {
    ApiRevisionDiscovery
} from "../core/git/apiRevisionDiscovery";

import {
    GitSourceRepository
} from "../core/git/gitSourceRepository";

import {
    JavaScriptParser
} from "../languages/javascript/javascriptParser";

suite(
    "API Revision Discovery",
    () => {

        test(
            "discovers APIs from a Git revision",
            async function () {

                this.timeout(10000);

                const repositoryPath =
                    mkdtempSync(
                        join(
                            tmpdir(),
                            "guardian-revision-"
                        )
                    );

                const runGit = (
                    args: string[]
                ): string =>
                    execFileSync(
                        "git",
                        args,
                        {
                            cwd:
                                repositoryPath,
                            encoding:
                                "utf-8"
                        }
                    ).trim();

                try {

                    runGit(["init"]);

                    runGit([
                        "config",
                        "user.email",
                        "test@example.com"
                    ]);

                    runGit([
                        "config",
                        "user.name",
                        "Guardian Test"
                    ]);

                    writeFileSync(
                        join(
                            repositoryPath,
                            "server.ts"
                        ),
                        `
                         const app = express();
                        app.get(
                            "/customers",
                            (req, res) => {
                                res.json({
                                    id: 1
                                });
                            }
                        );
                        `
                    );

                    runGit(["add", "."]);

                    runGit([
                        "commit",
                        "-m",
                        "initial API"
                    ]);

                    const revision =
                        runGit([
                            "rev-parse",
                            "HEAD"
                        ]);

                    const service =
                        new ApiRevisionDiscovery(
                            new GitSourceRepository(
                                repositoryPath
                            ),
                            new ApiDiscoveryService([
                                new JavaScriptParser()
                            ])
                        );

                    const result =
                        service.discover(
                            revision
                        );

                    assert.strictEqual(
                        result.length,
                        1
                    );

                    assert.strictEqual(
                        result[0].method,
                        "GET"
                    );

                    assert.strictEqual(
                        result[0].path,
                        "/customers"
                    );

                } finally {

                    await rm(
                        repositoryPath,
                        {
                            recursive: true,
                            force: true
                        }
                    );
                }
            }
        );

        test(
            "excludes generated and dependency directories from Git revisions",
            async function () {
                this.timeout(10000);

                const repositoryPath = mkdtempSync(
                    join(tmpdir(), "guardian-revision-filters-")
                );
                const runGit = (args: string[]): string =>
                    execFileSync(
                        "git",
                        args,
                        {
                            cwd: repositoryPath,
                            encoding: "utf-8"
                        }
                    ).trim();

                try {
                    runGit(["init"]);
                    runGit(["config", "user.email", "test@example.com"]);
                    runGit(["config", "user.name", "Guardian Test"]);

                    mkdirSync(join(repositoryPath, "node_modules", "pkg"), {
                        recursive: true
                    });
                    mkdirSync(join(repositoryPath, "dist"), {
                        recursive: true
                    });
                    mkdirSync(join(repositoryPath, ".venv", "Lib"), {
                        recursive: true
                    });
                    writeFileSync(
                        join(repositoryPath, "app.py"),
                        '@app.get("/app")\ndef app():\n    return {"id": 1}\n'
                    );
                    writeFileSync(
                        join(repositoryPath, "node_modules", "pkg", "api.py"),
                        '@app.get("/dependency")\ndef dep():\n    return {"id": 1}\n'
                    );
                    writeFileSync(
                        join(repositoryPath, "dist", "generated.ts"),
                        'app.get("/generated", (req, res) => res.json({ id: 1 }));\n'
                    );
                    writeFileSync(
                        join(repositoryPath, ".venv", "Lib", "environment.py"),
                        '@app.get("/environment")\ndef environment():\n    return {"id": 1}\n'
                    );

                    runGit(["add", "."]);
                    runGit(["commit", "-m", "add application and generated sources"]);

                    const sourceFiles =
                        new GitSourceRepository(repositoryPath)
                            .loadSourceFiles("HEAD");

                    assert.deepStrictEqual(
                        sourceFiles.map(source => source.path),
                        ["app.py"]
                    );
                } finally {
                    await rm(repositoryPath, {
                        recursive: true,
                        force: true
                    });
                }
            }
        );
    }
);