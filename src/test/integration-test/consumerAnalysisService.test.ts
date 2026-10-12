import * as assert from "assert";
import {
    mkdtempSync,
    writeFileSync
} from "fs";
import { rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

import {
    ConsumerAnalysisService
} from "../../core/consumerAnalysisService";

import {
    JavaScriptConsumerParser
} from "../../languages/javascript/consumerParser";

suite("Consumer Analysis Service", () => {

    test(
        "finds consumer across workspace files",
        async function () {

            this.timeout(10000);

            const workspacePath =
                mkdtempSync(
                    join(
                        tmpdir(),
                        "api-contract-guardian-"
                    )
                );

            try {

                writeFileSync(
                    join(
                        workspacePath,
                        "Profile.tsx"
                    ),
                    `
                        const user = fetch("/users/1");

                        console.log(user.email);
                    `
                );

                writeFileSync(
                    join(
                        workspacePath,
                        "README.md"
                    ),
                    `
                        user.email
                    `
                );

                const service =
                    new ConsumerAnalysisService(
                        workspacePath,
                        [
                            new JavaScriptConsumerParser()
                        ]
                    );

                const result =
                    service.analyze([
                        {
                            type:
                                "REMOVED_RESPONSE_FIELD",
                            method: "GET",
                            path: "/users/1",
                            field: "email",
                            oldType: "string"
                        }
                    ]);

                assert.deepStrictEqual(
                    result,
                    [
                        {
                            file: "Profile.tsx",
                            line: 4,
                            field: "email",
                            method: "GET",
                            path: "/users/1"
                        }
                    ]
                );

            } finally {

                await rm(
                    workspacePath,
                    {
                        recursive: true,
                        force: true,
                        maxRetries: 10,
                        retryDelay: 200
                    }
                );
            }
        }
    );

    test(
        "returns no consumers when there are no breaking changes",
        () => {

            const service =
                new ConsumerAnalysisService(
                    process.cwd(),
                    [
                        new JavaScriptConsumerParser()
                    ]
                );

            const result =
                service.analyze([]);

            assert.deepStrictEqual(
                result,
                []
            );
        }
    );
});