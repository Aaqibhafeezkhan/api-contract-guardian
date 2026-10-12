import { compareApiContracts } from "./apiComparator";
import { ApiContract } from "./apiContract";
import { getChangedFiles } from "./git/changedFiles";
import { ApiRevisionDiscovery } from "./git/apiRevisionDiscovery";

export class ContractComparisonService {

    constructor(
        private readonly repositoryPath: string,
        private readonly apiRevisionDiscovery:
            ApiRevisionDiscovery
    ) {}

    compare(
        oldRevision: string,
        newRevision: string
    ) {

        const changes = getChangedFiles(
            oldRevision,
            newRevision,
            this.repositoryPath
        );

        const oldContracts =
            this.apiRevisionDiscovery.discover(
                oldRevision
            );

        const newContracts =
            this.apiRevisionDiscovery.discover(
                newRevision
            );
            

        const breakingChanges =
            compareApiContracts(
                oldContracts,
                newContracts
            );
            console.log("[API Guardian] Old contracts:", JSON.stringify(oldContracts, null, 2));
console.log("[API Guardian] New contracts:", JSON.stringify(newContracts, null, 2));
console.log("[API Guardian] Breaking changes:", JSON.stringify(breakingChanges, null, 2));
        return {
            changes,
            oldContracts,
            newContracts,
            breakingChanges
        };
    }
}