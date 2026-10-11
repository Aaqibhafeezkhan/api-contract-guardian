import { execFileSync } from "child_process";
import {
    GitFileChange,
    GitFileChangeType
} from "./gitFileChange";

export function getChangedFiles(
    oldRevision: string,
    newRevision: string,
    workingDirectory: string = process.cwd()
): GitFileChange[] {

    const output = execFileSync(
        "git",
        [
            "diff",
            "--name-status",
            "--no-renames",
            oldRevision,
            newRevision
        ],
        {
            cwd: workingDirectory,
            encoding: "utf-8"
        }
    );

    return output
        .split(/\r?\n/)
        .map(line => line.trim())
        .filter(Boolean)
        .map(line => {

            const [status, path] =
                line.split(/\t+/);

            let type: GitFileChangeType;

            switch (status) {

                case "A":
                    type = "ADDED";
                    break;

                case "M":
                    type = "MODIFIED";
                    break;

                case "D":
                    type = "DELETED";
                    break;

                default:
                    throw new Error(
                        `Unsupported Git change status: ${status}`
                    );
            }

            return {
                path,
                type
            };
        });
}