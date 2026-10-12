import * as assert from "assert";
import { compareApiContracts } from "../../core/apiComparator";
import { ApiContract } from "../../core/apiContract";

suite("API Comparator", () => {

    test("detects removed endpoint", () => {

        const oldContracts: ApiContract[] = [
            {
                method: "GET",
                path: "/users",
                file: "server.ts",
                line: 1
            },
            {
                method: "GET",
                path: "/users/:id",
                file: "server.ts",
                line: 5
            }
        ];

        const newContracts: ApiContract[] = [
            {
                method: "GET",
                path: "/users",
                file: "server.ts",
                line: 1
            }
        ];

        const result = compareApiContracts(
            oldContracts,
            newContracts
        );

        assert.deepStrictEqual(result, [
            {
                type: "REMOVED_ENDPOINT",
                method: "GET",
                path: "/users/:id"
            }
        ]);
    });

    test("does not flag unchanged endpoint", () => {

        const oldContracts: ApiContract[] = [
            {
                method: "GET",
                path: "/users",
                file: "old.ts",
                line: 1
            }
        ];

        const newContracts: ApiContract[] = [
            {
                method: "GET",
                path: "/users",
                file: "new.ts",
                line: 1
            }
        ];

        const result = compareApiContracts(
            oldContracts,
            newContracts
        );

        assert.deepStrictEqual(result, []);
    });

    test("detects response breaking changes for matching endpoint", () => {

        const oldContracts: ApiContract[] = [
            {
                method: "GET",
                path: "/users",
                file: "server.ts",
                line: 1,
                response: {
                    fields: [
                        { name: "id", type: "number" },
                        { name: "email", type: "string" }
                    ]
                }
            }
        ];

        const newContracts: ApiContract[] = [
            {
                method: "GET",
                path: "/users",
                file: "server.ts",
                line: 1,
                response: {
                    fields: [
                        { name: "id", type: "number" }
                    ]
                }
            }
        ];

        const result = compareApiContracts(
            oldContracts,
            newContracts
        );

        assert.deepStrictEqual(result, [
            {
                type: "REMOVED_RESPONSE_FIELD",
                method: "GET",
                path: "/users",
                field: "email",
                oldType: "string"
            }
        ]);
    });

});