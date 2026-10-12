import * as assert from "assert";
import {
    JavaScriptConsumerParser
} from "../../languages/javascript/consumerParser";

suite("JavaScript Consumer Parser", () => {

    test("supports JavaScript and TypeScript files", () => {

        const parser =
            new JavaScriptConsumerParser();

        assert.strictEqual(
            parser.supports("Profile.tsx"),
            true
        );

        assert.strictEqual(
            parser.supports("client.js"),
            true
        );

        assert.strictEqual(
            parser.supports("main.py"),
            false
        );
    });

    test("detects consumer of removed response field", () => {

        const parser =
            new JavaScriptConsumerParser();

        const sourceCode = `
            const user = fetch("/users/1");

            console.log(user.email);
        `;

        const result =
            parser.findConsumers(
                sourceCode,
                "Profile.tsx",
                [
                    {
                        method: "GET",
                        path: "/users/1",
                        field: "email"
                    }
                ]
            );

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
    });

    test("ignores unrelated fields", () => {

        const parser =
            new JavaScriptConsumerParser();

        const sourceCode = `
            const user = fetch("/users/1");

            console.log(user.name);
        `;

        const result =
            parser.findConsumers(
                sourceCode,
                "Profile.tsx",
                [
                    {
                        method: "GET",
                        path: "/users/1",
                        field: "email"
                    }
                ]
            );

        assert.deepStrictEqual(
            result,
            []
        );
    });

    test("ignores unrelated API paths", () => {

        const parser =
            new JavaScriptConsumerParser();

        const sourceCode = `
            const user = fetch("/products/1");

            console.log(user.email);
        `;

        const result =
            parser.findConsumers(
                sourceCode,
                "Profile.tsx",
                [
                    {
                        method: "GET",
                        path: "/users/1",
                        field: "email"
                    }
                ]
            );

        assert.deepStrictEqual(
            result,
            []
        );
    });
    test("detects consumer through chained fetch promises", () => {

    const parser =
        new JavaScriptConsumerParser();

    const sourceCode = `
        const user = fetch("/users");

        user
            .then(response => response.json())
            .then(data => console.log(data.email));
    `;

    const result =
        parser.findConsumers(
            sourceCode,
            "Profile.tsx",
            [
                {
                    method: "GET",
                    path: "/users",
                    field: "email"
                }
            ]
        );

    assert.deepStrictEqual(
        result,
        [
            {
                file: "Profile.tsx",
                line: 6,
                field: "email",
                method: "GET",
                path: "/users"
            }
        ]
    );
});
});