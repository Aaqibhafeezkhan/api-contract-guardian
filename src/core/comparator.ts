import {
    ApiContract,
    UNKNOWN_RESPONSE_FIELD_TYPE
} from "./apiContract";
import {
    BreakingChange,
    BreakingChangeType
} from "./breakingChange";

export function compareContracts(
    oldContract: ApiContract,
    newContract: ApiContract
): BreakingChange[] {

    const changes: BreakingChange[] = [];

    if (
        !oldContract.response ||
        !newContract.response
    ) {
        return changes;
    }

    const newFields = new Map(
        newContract.response.fields.map(field => [
            field.name,
            field.type
        ])
    );

    for (const oldField of oldContract.response.fields) {

        const newType = newFields.get(oldField.name);

        if (newType === undefined) {
            if (newContract.response.fieldsComplete === false) {
                continue;
            }

            changes.push({
                type: "REMOVED_RESPONSE_FIELD",
                method: newContract.method,
                path: newContract.path,
                field: oldField.name,
                oldType: oldField.type
            });

            continue;
        }

        if (
            oldField.type !== newType &&
            oldField.type !== UNKNOWN_RESPONSE_FIELD_TYPE &&
            newType !== UNKNOWN_RESPONSE_FIELD_TYPE
        ) {

            changes.push({
                type: "CHANGED_RESPONSE_FIELD_TYPE",
                method: newContract.method,
                path: newContract.path,
                field: oldField.name,
                oldType: oldField.type,
                newType
            });
        }
    }

    return changes;
}