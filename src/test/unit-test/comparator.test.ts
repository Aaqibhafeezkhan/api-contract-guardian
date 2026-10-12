import * as assert from "assert";
import { ApiContract } from "../core/apiContract";
import { compareContracts } from "../core/comparator";

suite("Contract Comparator", () => {

    test("detects removed response field", () => {

        const oldContract: ApiContract = {
            method: "GET",
            path: "/users/:id",
            file: "server.ts",
            line: 1,
            response: {
                fields: [
                    { name: "id", type: "number" },
                    { name: "name", type: "string" },
                    { name: "email", type: "string" }
                ]
            }
        };

        const newContract: ApiContract = {
            method: "GET",
            path: "/users/:id",
            file: "server.ts",
            line: 1,
            response: {
                fields: [
                    { name: "id", type: "number" },
                    { name: "name", type: "string" }
                ]
            }
        };

        const result = compareContracts(
            oldContract,
            newContract
        );

        assert.deepStrictEqual(result, [
            {
                type: "REMOVED_RESPONSE_FIELD",
                method: "GET",
                path: "/users/:id",
                field: "email",
                oldType: "string"
            }
        ]);
    });


    test("detects changed response field type", () => {

        const oldContract: ApiContract = {
            method: "GET",
            path: "/users/:id",
            file: "server.ts",
            line: 1,
            response: {
                fields: [
                    { name: "id", type: "number" }
                ]
            }
        };

        const newContract: ApiContract = {
            method: "GET",
            path: "/users/:id",
            file: "server.ts",
            line: 1,
            response: {
                fields: [
                    { name: "id", type: "string" }
                ]
            }
        };

        const result = compareContracts(
            oldContract,
            newContract
        );

        assert.deepStrictEqual(result, [
            {
                type: "CHANGED_RESPONSE_FIELD_TYPE",
                method: "GET",
                path: "/users/:id",
                field: "id",
                oldType: "number",
                newType: "string"
            }
        ]);
    });


    test("does not flag added response field", () => {

        const oldContract: ApiContract = {
            method: "GET",
            path: "/users",
            file: "server.ts",
            line: 1,
            response: {
                fields: [
                    { name: "id", type: "number" }
                ]
            }
        };

        const newContract: ApiContract = {
            method: "GET",
            path: "/users",
            file: "server.ts",
            line: 1,
            response: {
                fields: [
                    { name: "id", type: "number" },
                    { name: "name", type: "string" }
                ]
            }
        };

        const result = compareContracts(
            oldContract,
            newContract
        );

        assert.deepStrictEqual(result, []);
    });


    test("does not flag unchanged response field", () => {

        const oldContract: ApiContract = {
            method: "GET",
            path: "/users",
            file: "server.ts",
            line: 1,
            response: {
                fields: [
                    { name: "id", type: "number" }
                ]
            }
        };

        const newContract: ApiContract = {
            method: "GET",
            path: "/users",
            file: "server.ts",
            line: 1,
            response: {
                fields: [
                    { name: "id", type: "number" }
                ]
            }
        };

        const result = compareContracts(
            oldContract,
            newContract
        );

        assert.deepStrictEqual(result, []);
    });


    test("does not guess when old response is unknown", () => {

        const oldContract: ApiContract = {
            method: "GET",
            path: "/users",
            file: "server.ts",
            line: 1
        };

        const newContract: ApiContract = {
            method: "GET",
            path: "/users",
            file: "server.ts",
            line: 1,
            response: {
                fields: [
                    { name: "id", type: "number" }
                ]
            }
        };

        const result = compareContracts(
            oldContract,
            newContract
        );

        assert.deepStrictEqual(result, []);
    });

});