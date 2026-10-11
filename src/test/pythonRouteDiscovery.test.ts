
import * as assert from "assert";
import { ApiDiscoveryService } from "../core/apiDiscoveryService";
import { compareApiContracts } from "../core/apiComparator";
import { JavaScriptParser } from "../languages/javascript/javascriptParser";
import { PythonParser } from "../languages/python/pythonParser";
import { SourceFileContent } from "../core/sourceFileLoader";

suite("Python route discovery", function () {
    const parser = new PythonParser();

    test("composes FastAPI router and app prefixes", function () {
        const files: SourceFileContent[] = [
            {
                path: "main.py",
                language: "python",
                content: `
from fastapi import FastAPI, APIRouter

router = APIRouter(prefix="/v1")

@router.get("/users")
def get_users():
    return {"id": 1}

app = FastAPI()
app.include_router(router, prefix="/api")
`
            }
        ];

        const contracts = parser.discoverRepository(files);

        assert.deepStrictEqual(
            contracts.map(contract => contract.path),
            ["/api/v1/users"]
        );
    });

    test("composes nested FastAPI router prefixes in order", function () {
        const files: SourceFileContent[] = [
            {
                path: "main.py",
                language: "python",
                content: `
from fastapi import FastAPI, APIRouter

child = APIRouter(prefix="/users")
parent = APIRouter(prefix="/v1")
middle = APIRouter(prefix="/groups")

@child.get("/list")
def list_users():
    return {"id": 1}

middle.include_router(child, prefix="/nested")
parent.include_router(middle, prefix="/v2")
app = FastAPI()
app.include_router(parent, prefix="/api")
`
            }
        ];

        assert.deepStrictEqual(
            parser.discoverRepository(files).map(contract => contract.path),
            ["/api/v1/v2/groups/nested/users/list"]
        );
    });

    test("discovers multiline router declarations and mounts", function () {
        const files: SourceFileContent[] = [
            {
                path: "main.py",
                language: "python",
                content: `
from fastapi import FastAPI, APIRouter

child = APIRouter(
    prefix="/users",
)
parent = APIRouter(
    prefix="/v1",
)

@child.get("/list")
def list_users():
    return {"id": 1}

parent.include_router(
    child,
    prefix="/nested",
)
app = FastAPI()
app.include_router(
    parent,
    prefix="/api",
)
`
            }
        ];

        assert.deepStrictEqual(
            parser.discoverRepository(files).map(contract => contract.path),
            ["/api/v1/nested/users/list"]
        );
    });

    test("discovers multiline decorators through the shared contract pipeline", function () {
        const content = `
from fastapi import FastAPI, APIRouter

router = APIRouter()

@router.get(
    "/users/{user_id}",
)
def get_user(user_id: int):
    return {
        "id": 1,
        "active": True
    }

app = FastAPI()
app.include_router(router)
`;
        const files: SourceFileContent[] = [
            {
                path: "main.py",
                language: "python",
                content
            }
        ];
        const routeLine = content.split(/\r?\n/).findIndex(
            line => line.trimStart().startsWith("@router.get")
        ) + 1;
        const service = new ApiDiscoveryService([parser]);
        const contracts = service.discover(files);

        assert.strictEqual(contracts.length, 1);
        assert.deepStrictEqual(
            {
                method: contracts[0].method,
                path: contracts[0].path,
                file: contracts[0].file,
                line: contracts[0].line,
                fields: contracts[0].response?.fields
            },
            {
                method: "GET",
                path: "/users/{user_id}",
                file: "main.py",
                line: routeLine,
                fields: [
                    { name: "id", type: "number" },
                    { name: "active", type: "boolean" }
                ]
            }
        );
    });

    test("does not report dynamic Python response values as removed fields", function () {
        const oldContracts = parser.parse(
            `
@app.get("/users")
def get_users():
    return {
        "id": 1
    }
`,
            "app.py"
        );
        const newContracts = parser.parse(
            `
@app.get("/users")
def get_users():
    return {
        "id": user_id
    }
`,
            "app.py"
        );

        assert.deepStrictEqual(
            compareApiContracts(oldContracts, newContracts),
            []
        );
    });

    test("discovers multiple mounts of the same router", function () {
        const files: SourceFileContent[] = [
            {
                path: "main.py",
                language: "python",
                content: `
from fastapi import FastAPI, APIRouter

router = APIRouter()

@router.get("/users")
def get_users():
    return {"id": 1}

app = FastAPI()
app.include_router(router, prefix="/api")
app.include_router(router, prefix="/internal")
`
            }
        ];

        const contracts = parser.discoverRepository(files);

        assert.deepStrictEqual(
            contracts.map(contract => contract.path).sort(),
            ["/api/users", "/internal/users"]
        );
    });

    test("does not recurse indefinitely through cyclic router mounts", function () {
        const files: SourceFileContent[] = [
            {
                path: "main.py",
                language: "python",
                content: `
from fastapi import FastAPI, APIRouter

first = APIRouter()
second = APIRouter()

@first.get("/first")
def get_first():
    return {"id": 1}

@second.get("/second")
def get_second():
    return {"id": 2}

first.include_router(second)
second.include_router(first)
app = FastAPI()
app.include_router(first, prefix="/api")
`
            }
        ];

        assert.deepStrictEqual(
            parser.discoverRepository(files).map(contract => contract.path).sort(),
            ["/api/first", "/api/second"]
        );
    });

    test("uses a Flask blueprint prefix when registration does not override it", function () {
        const files: SourceFileContent[] = [
            {
                path: "main.py",
                language: "python",
                content: `
from flask import Flask, Blueprint

users = Blueprint("users", __name__, url_prefix="/users")

@users.get("/list")
def get_users():
    return {"id": 1}

app = Flask(__name__)
app.register_blueprint(users)
`
            }
        ];

        const contracts = parser.discoverRepository(files);

        assert.deepStrictEqual(
            contracts.map(contract => contract.path),
            ["/users/list"]
        );
    });
    test("discovers relatively imported routers and preserves path parameters", function () {
    const files: SourceFileContent[] = [
        {
            path: "service/app.py",
            language: "python",
            content: `
from fastapi import FastAPI
from .routers.users import router as users_router

app = FastAPI()
app.include_router(users_router, prefix="/api")
`
        },
        {
            path: "service/routers/users.py",
            language: "python",
            content: `
from fastapi import APIRouter

router = APIRouter(prefix="/v1")

@router.get("/users/{user_id}")
def get_user(user_id: int):
    return {"id": user_id}
`
        }
    ];

    const contracts = parser.discoverRepository(files);

    assert.deepStrictEqual(
        contracts.map(contract => ({
            method: contract.method,
            path: contract.path
        })),
        [{
            method: "GET",
            path: "/api/v1/users/{user_id}"
        }]
    );
});

test("detects a removed response field on a mounted router with dynamic fields", function () {
    const oldFiles: SourceFileContent[] = [
        {
            path: "main.py",
            language: "python",
            content: `
from fastapi import FastAPI
from app.routers.users import router as users_router

app = FastAPI()
app.include_router(users_router, prefix="/api/v1")
`
        },
        {
            path: "app/routers/users.py",
            language: "python",
            content: `
from fastapi import APIRouter

router = APIRouter(prefix="/users")

@router.get("/{user_id}")
def get_user(user_id: int):
    return {
        "id": user_id,
        "name": "Komal",
        "active": True
    }
`
        }
    ];
    const newFiles = oldFiles.map(file => ({
        ...file,
        content: file.content.replace('        "name": "Komal",\n', "")
    }));

    const oldContracts = parser.discoverRepository(oldFiles);
    const newContracts = parser.discoverRepository(newFiles);

    assert.deepStrictEqual(
        compareApiContracts(oldContracts, newContracts),
        [{
            type: "REMOVED_RESPONSE_FIELD",
            method: "GET",
            path: "/api/v1/users/{user_id}",
            field: "name",
            oldType: "string"
        }]
    );
});

test("discovers a router imported through a module alias", function () {
        const files: SourceFileContent[] = [
            {
                path: "service/app.py",
                language: "python",
                content: `
from fastapi import FastAPI
import service.routers.users as users_module

app = FastAPI()
app.include_router(users_module.router, prefix="/api")
`
            },
            {
                path: "service/routers/users.py",
                language: "python",
                content: `
from fastapi import APIRouter

router = APIRouter(prefix="/v1")

@router.get("/users")
def get_users():
    return {"id": 1}
`
            }
        ];

        assert.deepStrictEqual(
            parser.discoverRepository(files).map(contract => contract.path),
            ["/api/v1/users"]
        );
    });

    test("resolves routers re-exported through a package initializer", function () {
        const files: SourceFileContent[] = [
            {
                path: "service/app.py",
                language: "python",
                content: `
from fastapi import FastAPI
from service.routers import users_router

app = FastAPI()
app.include_router(users_router, prefix="/api")
`
            },
            {
                path: "service/routers/__init__.py",
                language: "python",
                content: `
from .users import router as users_router
`
            },
            {
                path: "service/routers/users.py",
                language: "python",
                content: `
from fastapi import APIRouter
router = APIRouter(prefix="/v1")

@router.get("/users")
def get_users():
    return {"id": 1}
`
            }
        ];

        assert.deepStrictEqual(
            parser.discoverRepository(files).map(contract => contract.path),
            ["/api/v1/users"]
        );
    });

    test("discovers module-qualified route decorators and mounts", function () {
        const files: SourceFileContent[] = [
            {
                path: "service/app.py",
                language: "python",
                content: `
from fastapi import FastAPI
import service.routers.users as users_module

app = FastAPI()
app.include_router(
    users_module.router,
    prefix="/api",
)
`
            },
            {
                path: "service/routers/users.py",
                language: "python",
                content: `
from fastapi import APIRouter

router = APIRouter(prefix="/v1")
`
            },
            {
                path: "service/routers/handlers.py",
                language: "python",
                content: `
import service.routers.users as users_module

@users_module.router.get(
    "/users",
)
def get_users():
    return {"id": 1}
`
            }
        ];

        assert.deepStrictEqual(
            parser.discoverRepository(files).map(contract => contract.path),
            ["/api/v1/users"]
        );
    });

    test("keeps parentheses in comments, escaped strings, and triple-quoted strings out of statement depth", function () {
        const files: SourceFileContent[] = [
            {
                path: "main.py",
                language: "python",
                content: `
description = "escaped quote: \\" and parentheses: ) ( # not a comment"
documentation = """text with ) ( # comment-like text
and more parentheses ((()))
"""
# An unmatched opening parenthesis in a comment: (
from fastapi import FastAPI, APIRouter
router = APIRouter(prefix="/v1")

@router.get(
    "/items",
)
def get_items():
    return {"id": 1}

app = FastAPI()
app.include_router(
    router,  # an unmatched closing parenthesis in a comment: )
    prefix="/api",
)
`
            }
        ];

        assert.deepStrictEqual(
            parser.discoverRepository(files).map(contract => contract.path),
            ["/api/v1/items"]
        );
    });

    test("resolves multiline from-import aliases", function () {
        const files: SourceFileContent[] = [
            {
                path: "service/app.py",
                language: "python",
                content: `
from fastapi import FastAPI
from .routers.users import (
    router as users_router,
)

app = FastAPI()
app.include_router(users_router, prefix="/api")
`
            },
            {
                path: "service/routers/users.py",
                language: "python",
                content: `
from fastapi import APIRouter
router = APIRouter()

@router.get("/users")
def get_users():
    return {"id": 1}
`
            }
        ];

        assert.deepStrictEqual(
            parser.discoverRepository(files).map(contract => contract.path),
            ["/api/users"]
        );
    });

    test("continues discovering JavaScript and TypeScript contracts", function () {
        const service = new ApiDiscoveryService([
            new JavaScriptParser(),
            parser
        ]);

        const contracts = service.discover([
            {
                path: "server.ts",
                language: "typescript",
                content: `
const app = express();
app.get("/health", (req, res) => res.json({ status: "ok" }));
`
            },
            {
                path: "app.py",
                language: "python",
                content: `
@app.get("/status")
def get_status():
    return {"status": "ok"}
`
            }
        ]);

        assert.deepStrictEqual(
            contracts.map(contract => ({
                file: contract.file,
                method: contract.method,
                path: contract.path
            })),
            [
                {
                    file: "server.ts",
                    method: "GET",
                    path: "/health"
                },
                {
                    file: "app.py",
                    method: "GET",
                    path: "/status"
                }
            ]
        );
    });

    test("does not crash on incomplete Python statements", function () {
        const files: SourceFileContent[] = [
            {
                path: "incomplete.py",
                language: "python",
                content: `
from fastapi import APIRouter
router = APIRouter(
@router.get("/unfinished")
`
            }
        ];

        assert.doesNotThrow(() => parser.discoverRepository(files));
    });

    test("resolves cross-file Flask blueprints and overrides their prefix", function () {
        const files: SourceFileContent[] = [
            {
                path: "service/app.py",
                language: "python",
                content: `
from flask import Flask
from .blueprints.users import users as users_blueprint

app = Flask(__name__)
app.register_blueprint(users_blueprint, url_prefix="/api")
`
            },
            {
                path: "service/blueprints/users.py",
                language: "python",
                content: `
from flask import Blueprint

users = Blueprint("users", __name__, url_prefix="/users")

@users.get("/list")
def list_users():
    return {"id": 1}
`
            }
        ];

        assert.deepStrictEqual(
            parser.discoverRepository(files).map(contract => contract.path),
            ["/api/list"]
        );
    });
});