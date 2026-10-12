import * as assert from "assert";

import { findConsumers } from "../../core/consumerAnalyzer";
import { BreakingChange } from "../../core/breakingChange";
import { JavaScriptConsumerParser } from "../../languages/javascript/consumerParser";

suite("Consumer Analyzer", () => {

    test("finds consumers using registered parser", () => {

        const breakingChanges: BreakingChange[] = [
            {
                type: "REMOVED_RESPONSE_FIELD",
                method: "GET",
                path: "/users/1",
                field: "email",
                oldType: "string"
            }
        ];

        const sourceFiles = new Map<string, string>([
            [
                "Profile.tsx",
                `
                    const user = fetch("/users/1");
                    console.log(user.email);
                `
            ]
        ]);

        const result = findConsumers(
            breakingChanges,
            ["Profile.tsx"],
            sourceFiles,
            [
                new JavaScriptConsumerParser()
            ]
        );

        assert.deepStrictEqual(
            result,
            [
                {
                    file: "Profile.tsx",
                    line: 3,
                    field: "email",
                    method: "GET",
                    path: "/users/1"
                }
            ]
        );
    });

    test("ignores unsupported files", () => {

        const breakingChanges: BreakingChange[] = [
            {
                type: "REMOVED_RESPONSE_FIELD",
                method: "GET",
                path: "/users/1",
                field: "email",
                oldType: "string"
            }
        ];

        const result = findConsumers(
            breakingChanges,
            ["README.md"],
            new Map([
                [
                    "README.md",
                    "user.email"
                ]
            ]),
            [
                new JavaScriptConsumerParser()
            ]
        );

        assert.deepStrictEqual(
            result,
            []
        );
    });

    test("ignores files without source", () => {

        const breakingChanges: BreakingChange[] = [
            {
                type: "REMOVED_RESPONSE_FIELD",
                method: "GET",
                path: "/users/1",
                field: "email",
                oldType: "string"
            }
        ];

        const result = findConsumers(
            breakingChanges,
            ["Profile.tsx"],
            new Map(),
            [
                new JavaScriptConsumerParser()
            ]
        );

        assert.deepStrictEqual(
            result,
            []
        );
    });
});