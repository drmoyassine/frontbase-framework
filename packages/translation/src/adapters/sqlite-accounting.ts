import { localizationScopeSchema, type LocalizationScope } from '../contracts.js';
import { allowanceSchema, attemptSchema, attemptKeySchema, type AttemptKey, type TranslationAllowance, type TranslationAttempt, type TranslationAccountingPersistence } from '../accounting.js';
import { SqliteTranslationJobPersistence } from './sqlite-jobs.js';

/** Reference implementation: uses existing job transaction/clock and fencing, never a second queue. */
export class SqliteTranslationAccountingPersistence extends SqliteTranslationJobPersistence implements TranslationAccountingPersistence {
    override initialize(): void {
        super.initialize();
        this.transaction(() => {
            this.connection.exec(`CREATE TABLE IF NOT EXISTS ${this.prefix}allowances (
                tenant_id TEXT NOT NULL, project_id TEXT NOT NULL, allowance_id TEXT NOT NULL, body TEXT NOT NULL,
                PRIMARY KEY(tenant_id,project_id,allowance_id))`);
            this.connection.exec(`CREATE TABLE IF NOT EXISTS ${this.prefix}attempts (
                tenant_id TEXT NOT NULL, project_id TEXT NOT NULL, job_id TEXT NOT NULL, lease_version INTEGER NOT NULL,
                allowance_id TEXT NOT NULL, body TEXT NOT NULL, PRIMARY KEY(tenant_id,project_id,job_id,lease_version),
                FOREIGN KEY(tenant_id,project_id,allowance_id) REFERENCES ${this.prefix}allowances(tenant_id,project_id,allowance_id),
                FOREIGN KEY(tenant_id,project_id,job_id) REFERENCES ${this.prefix}jobs(tenant_id,project_id,job_id))`);
            this.connection.exec(`CREATE INDEX IF NOT EXISTS ${this.prefix}attempt_allowance ON ${this.prefix}attempts(tenant_id,project_id,allowance_id)`);
        });
    }
    private allowance(scope: LocalizationScope, id: string): TranslationAllowance | null {
        const row = this.connection.prepare(`SELECT body FROM ${this.prefix}allowances WHERE tenant_id=? AND project_id=? AND allowance_id=?`)
            .get(scope.tenantId, scope.projectId, id) as { body: string } | undefined;
        return row ? allowanceSchema.parse(JSON.parse(row.body)) : null;
    }
    private attempt(key: AttemptKey): TranslationAttempt | null {
        const row = this.connection.prepare(`SELECT body FROM ${this.prefix}attempts WHERE tenant_id=? AND project_id=? AND job_id=? AND lease_version=?`)
            .get(key.scope.tenantId, key.scope.projectId, key.jobId, key.leaseVersion) as { body: string } | undefined;
        return row ? attemptSchema.parse(JSON.parse(row.body)) : null;
    }
    private writeAttempt(value: TranslationAttempt): void {
        this.connection.prepare(`UPDATE ${this.prefix}attempts SET body=? WHERE tenant_id=? AND project_id=? AND job_id=? AND lease_version=?`)
            .run(JSON.stringify(attemptSchema.parse(value)), value.scope.tenantId, value.scope.projectId, value.jobId, value.leaseVersion);
    }
    async createAllowance(input: TranslationAllowance): Promise<'created' | 'already-exists' | 'conflict'> {
        const value = allowanceSchema.parse(input);
        return this.transaction(() => {
            const prior = this.allowance(value.scope, value.allowanceId);
            if (prior) return JSON.stringify(prior) === JSON.stringify(value) ? 'already-exists' : 'conflict';
            this.connection.prepare(`INSERT INTO ${this.prefix}allowances VALUES(?,?,?,?)`)
                .run(value.scope.tenantId, value.scope.projectId, value.allowanceId, JSON.stringify(value));
            return 'created';
        });
    }
    async readAllowance(scope: LocalizationScope, id: string): Promise<TranslationAllowance | null> {
        return this.allowance(localizationScopeSchema.parse(scope), allowanceSchema.shape.allowanceId.parse(id));
    }
    async readAttempt(input: AttemptKey): Promise<TranslationAttempt | null> { return this.attempt(attemptKeySchema.parse(input)); }
    async reserveAttempt(input: AttemptKey & { allowanceId: string; policyHash: string; reservedUnits: number }): Promise<boolean> {
        const value = attemptSchema.parse({ ...input, state: 'reserved', chargedUnits: null });
        return this.transaction(() => {
            const allowance = this.allowance(value.scope, value.allowanceId), job = this.getJob(value.scope, value.jobId);
            if (!allowance || allowance.policyHash !== value.policyHash || !this.live(job, value.leaseVersion) || job.dispatched || this.inputProblem(job)) return false;
            const prior = this.attempt(value);
            if (prior) return prior.state === 'reserved' && JSON.stringify(prior) === JSON.stringify(value);
            // Unknown outcomes cannot be escaped by allocating another allowance for the same job.
            const uncertain = this.connection.prepare(`SELECT COUNT(*) AS n FROM ${this.prefix}attempts WHERE tenant_id=? AND project_id=? AND job_id=? AND json_extract(body,'$.state') IN ('dispatched','uncertain')`)
                .get(value.scope.tenantId, value.scope.projectId, value.jobId) as { n: number };
            if (uncertain.n > 0) return false;
            const totals = this.connection.prepare(`SELECT COUNT(*) AS requests,
                COALESCE(SUM(CASE WHEN json_extract(body,'$.state')='settled' THEN json_extract(body,'$.chargedUnits') ELSE json_extract(body,'$.reservedUnits') END),0) AS used,
                COALESCE(SUM(CASE WHEN json_extract(body,'$.state')='settled' THEN 0 ELSE 1 END),0) AS concurrent
                FROM ${this.prefix}attempts WHERE tenant_id=? AND project_id=? AND allowance_id=? AND json_extract(body,'$.state')<>'released'`)
                .get(value.scope.tenantId, value.scope.projectId, value.allowanceId) as { requests: number; used: number; concurrent: number };
            if (totals.used + value.reservedUnits > allowance.limitUnits || totals.requests >= allowance.maxRequests || totals.concurrent >= allowance.maxConcurrent) return false;
            this.connection.prepare(`INSERT INTO ${this.prefix}attempts VALUES(?,?,?,?,?,?)`)
                .run(value.scope.tenantId, value.scope.projectId, value.jobId, value.leaseVersion, value.allowanceId, JSON.stringify(value));
            return true;
        });
    }
    async dispatchAttempt(input: AttemptKey): Promise<boolean> {
        const key = attemptKeySchema.parse(input);
        return this.transaction(() => {
            const value = this.attempt(key), job = this.getJob(key.scope, key.jobId);
            // Repeated delivery must never grant a second provider invocation for an already-dispatched attempt.
            if (!value || value.state !== 'reserved' || !this.live(job, key.leaseVersion) || job.dispatched || this.inputProblem(job)) return false;
            job.dispatched = true; this.saveJob(job); this.writeAttempt({ ...value, state: 'dispatched' }); return true;
        });
    }
    async settleAttempt(input: AttemptKey, chargedUnits: number | null): Promise<boolean> {
        const key = attemptKeySchema.parse(input), charge = attemptSchema.shape.chargedUnits.parse(chargedUnits);
        return this.transaction(() => {
            const value = this.attempt(key);
            if (!value) return false;
            if (['settled', 'uncertain'].includes(value.state)) return value.chargedUnits === charge;
            if (value.state !== 'dispatched') return false;
            // An invalid/over-reservation cost never frees money or hides an overrun.
            const amount = charge !== null && charge <= value.reservedUnits ? charge : null;
            this.writeAttempt({ ...value, state: amount === null ? 'uncertain' : 'settled', chargedUnits: amount }); return true;
        });
    }
    async releaseAttempt(input: AttemptKey): Promise<boolean> {
        const key = attemptKeySchema.parse(input);
        return this.transaction(() => {
            const value = this.attempt(key);
            if (!value || !['reserved', 'released'].includes(value.state)) return false;
            this.writeAttempt({ ...value, state: 'released', chargedUnits: 0 }); return true;
        });
    }
}
