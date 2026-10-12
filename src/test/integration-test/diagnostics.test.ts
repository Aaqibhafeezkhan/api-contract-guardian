import * as assert from "assert";
import { ApiContract } from "../../core/apiContract";
import { BreakingChange } from "../../core/breakingChange";
import { createDiagnostics } from "../../vscode/diagnostics";

suite("Diagnostics", () => {

    test("creates diagnostic for removed endpoint", () => {

        const contracts: ApiContract[] = [
            {
                method: "GET",
                path: "/users/:id",
                file: "server.ts",
                line: 10
            }
        ];

        const changes: BreakingChange[] = [
            {
                type: "REMOVED_ENDPOINT",
                method: "GET",
                path: "/users/:id"
            }
        ];

        const result = createDiagnostics(
            changes,
            contracts
        );

        const diagnostics =
            result.get("server.ts");

        assert.ok(diagnostics);
        assert.strictEqual(
            diagnostics.length,
            1
        );

        assert.strictEqual(
            diagnostics[0].message,
            "API endpoint GET /users/:id was removed.\n" +
            "This may break clients that depend on this endpoint."
        );

        assert.strictEqual(
            diagnostics[0].severity,
            0
        );
    });

    test("creates diagnostic for removed response field", () => {

        const contracts: ApiContract[] = [
            {
                method: "GET",
                path: "/users",
                file: "server.ts",
                line: 5,
                response: {
                    fields: [
                        {
                            name: "id",
                            type: "number"
                        }
                    ]
                }
            }
        ];

        const changes: BreakingChange[] = [
            {
                type: "REMOVED_RESPONSE_FIELD",
                method: "GET",
                path: "/users",
                field: "email",
                oldType: "string"
            }
        ];

        const result = createDiagnostics(
            changes,
            contracts
        );

        const diagnostics =
            result.get("server.ts");

        assert.ok(diagnostics);
        assert.strictEqual(
            diagnostics[0].message,
            "Response field \"email\" was removed from GET /users.\n" +
            "This may break consumers that depend on this field."
        );
    });

    test("ignores changes without a matching contract", () => {

        const changes: BreakingChange[] = [
            {
                type: "REMOVED_ENDPOINT",
                method: "GET",
                path: "/missing"
            }
        ];

        const result = createDiagnostics(
            changes,
            []
        );

        assert.strictEqual(
            result.size,
            0
        );
    });

    test("creates warning for affected consumer", () => {

    const contracts: ApiContract[] = [
        {
            method: "GET",
            path: "/users/1",
            file: "server.ts",
            line: 10,
            response: {
                fields: [
                    {
                        name: "email",
                        type: "string"
                    }
                ]
            }
        }
    ];

    const changes: BreakingChange[] = [
        {
            type: "REMOVED_RESPONSE_FIELD",
            method: "GET",
            path: "/users/1",
            field: "email",
            oldType: "string"
        }
    ];

    const consumers = [
        {
            file: "Profile.tsx",
            line: 3,
            field: "email",
            method: "GET",
            path: "/users/1"
        }
    ];

    const result = createDiagnostics(
        changes,
        contracts,
        consumers
    );

    const diagnostics =
        result.get("Profile.tsx");

    assert.ok(diagnostics);
    assert.strictEqual(
        diagnostics.length,
        1
    );

    assert.strictEqual(
        diagnostics[0].message,
        'Potentially affected consumer: response field "email" is used for GET /users/1'
    );

    assert.strictEqual(
        diagnostics[0].severity,
        1
    );
});

});