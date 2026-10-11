
import * as assert from "assert";
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

    test("composes Flask blueprint and registration prefixes", function () {
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
app.register_blueprint(users, url_prefix="/api")
`
            }
        ];

        const contracts = parser.discoverRepository(files);

        assert.deepStrictEqual(
            contracts.map(contract => contract.path),
            ["/api/users/list"]
        );
    });
});