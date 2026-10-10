// Compile-only proposal. Not exported, instantiated or registered with a host.
// Brands constrain typed consumers; runtime admission/lifecycle still need proof.
import type { DbRunner } from '../src/providers/types.js';

declare const admitted: unique symbol;
declare const authenticatedOwner: unique symbol;
declare const validatedIntent: unique symbol;
type Owner = string & { readonly [authenticatedOwner]: true };
type Intent = Readonly<{
    operationId: string;
    digest: string;
    expectedGeneration: number;
    expectedConfigurationRevision: number;
    resourceIds: readonly string[];
    readonly [validatedIntent]: true;
}>;
// No connection handle, provider URL, parent runner or nested transaction.
type Session = Pick<DbRunner, 'query' | 'exec'>;
type Outcome<T> =
    | { status: 'committed'; value: T; operationId: string; generation: number }
    | { status: 'refused'; code: 'state_busy' | 'state_recovery_required' | 'state_intent_conflict' | 'state_unavailable' }
    | { status: 'uncertain'; code: 'state_commit_uncertain' | 'state_cleanup_uncertain' };
type StateCapability = Readonly<{
    readonly [admitted]: true;
    forOwner(owner: Owner): Readonly<{
        status(): Promise<{ state: 'ready' | 'blocked' | 'unavailable' }>;
        run<T>(intent: Intent, work: (session: Session) => Promise<T>, options?: { signal?: AbortSignal }): Promise<Outcome<T>>;
    }>;
}>;

declare const capability: StateCapability;
declare const owner: Owner;
declare const intent: Intent;
declare const raw: DbRunner;
declare const session: Session;
const owned = capability.forOwner(owner);
const result = owned.run(intent, async tx => {
    // Existing trusted SQL stores may accept the narrow session structurally.
    const storeRunner: DbRunner = tx;
    return storeRunner.exec('UPDATE example SET value=? WHERE owner=?', ['value', owner]);
});
void result;

// @ts-expect-error An optional transaction method is not validated admission.
const notAdmitted: StateCapability = raw;
// @ts-expect-error Request-supplied strings are not authenticated owner bindings.
capability.forOwner('foreign-owner');
// @ts-expect-error Plain JSON does not establish validated destination-bound intent.
owned.run({ operationId: 'x', digest: 'x', expectedGeneration: 0, expectedConfigurationRevision: 0, resourceIds: [] }, async () => 1);
// @ts-expect-error Callback has no nested transaction API.
session.transaction(async () => 1);
// @ts-expect-error Generic reset would bypass journal-based recovery.
owned.clear();
// @ts-expect-error Caller cannot override owner per operation.
owned.run(intent, async () => 1, { owner: 'foreign-owner' });
// @ts-expect-error Success fields require outcome narrowing.
async function unsafeValue() { return (await owned.run(intent, async () => 1)).value; }
void notAdmitted;
void unsafeValue;
