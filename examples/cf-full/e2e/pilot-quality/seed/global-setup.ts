/**
 * Workstream C (swarm2, quality-usability) — one-time fixture seeding.
 *
 * Runs AFTER Playwright boots the real built self-host server
 * (examples/cf-full/dist/node.mjs) against an ephemeral per-run SQLite state
 * database. This script opens THE SAME database file and seeds it through the
 * framework's own stores and the existing internal reviewed capture pipeline:
 *
 *   canonical tables -> shared configuration -> saved role templates
 *   -> synthetic article approvals -> capture preparation
 *   -> synthetic whole-version review -> internal activation of capture A.
 *
 * Everything is synthetic. The review/activation calls exercise the documented
 * internal test seam on invented rows inside a throwaway database; they approve
 * no real content and expose no new control. Capture B (contacts absent) is
 * prepared and reviewed but NOT activated — it is rendered only through the
 * authenticated private render endpoint.
 *
 * State for the tests (hashes, paths, base URL) is written to the JSON file
 * named by PILOT_QUALITY_STATE.
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sqliteRunner } from '@frontbase/edge-infra';
import { emptyDirectoryConfiguration } from '@frontbase/edge-core/directory/configuration';
import { SyncStore, createSecretCipher, PagesStore } from '@frontbase/backend';
import { SiteConfigurationStore } from '../../../../../packages/backend/dist/compat/site-configuration-store.js';
import { EditorialApprovalStore } from '../../../../../packages/backend/dist/compat/editorial-approval-store.js';
import { SitePublicationStore } from '../../../../../packages/backend/dist/compat/site-publication-store.js';
import { SitePublicationReviewStore } from '../../../../../packages/backend/dist/compat/site-publication-review-store.js';
import { prepareSitePublication } from '../../../../../packages/backend/dist/compat/site-publication-prepare.js';
import { addDirectoryTemplate } from '../../../../../packages/console/src/components/builder/directory/addDirectoryTemplate';
import { addSharedPageHeader, linkSharedConfiguration } from '../../../../../packages/console/src/components/builder/directory/linkSharedConfiguration';
import {
    ADMIN, SESSION_SECRET, TENANT, articles, cities, contactsAbsent, contactsPresent,
    DATASOURCE_ID, fixturePaths, institutions, preparedInstitutionPaths, preparedProgramPaths,
    programs, templatePageIds, CITY_COUNTRY_SCOPE,
    type FixtureArticle,
} from '../fixture-data';

const here = dirname(fileURLToPath(import.meta.url));
const statePath = process.env.PILOT_QUALITY_STATE!;
const dbUrl = process.env.PILOT_QUALITY_DB_URL!;
const baseUrl = process.env.PILOT_QUALITY_BASE_URL!;

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function waitUntilHealthy(): Promise<void> {
    // Generous deadline so ordering of webServer vs globalSetup never matters:
    // the loop simply waits until the built server answers /api/console/health.
    const deadline = Date.now() + 150_000;
    let lastError = '';
    while (Date.now() < deadline) {
        try {
            const response = await fetch(new URL('/api/console/health', baseUrl));
            if (response.ok) return;
            lastError = `health answered ${response.status}`;
        } catch (error) { lastError = String(error); }
        await sleep(500);
    }
    throw new Error(`Fixture server never became healthy: ${lastError}`);
}

function baseConfiguration(contacts: { email: string; whatsapp: string }) {
    const config = emptyDirectoryConfiguration();
    config.site = { name: 'Fixture USA Directory', destination: 'United States', origin: 'https://fixture-usa.invalid', locale: 'en' };
    config.datasourceId = DATASOURCE_ID;
    // The schema's strict field objects require every field key; start from the
    // empty configuration's full maps and set only the mapped column names.
    const commonFields = { ...config.collections.institution.fields, originalPath: 'wp_url', summary: 'summary', body: 'body', cover: 'cover', coverAlt: 'cover_alt', logo: 'logo' };
    config.collections.city = {
        table: 'pq_city', scope: { field: 'country', value: CITY_COUNTRY_SCOPE },
        fields: { ...config.collections.city.fields, id: 'id', title: 'title' },
    };
    config.collections.institution = {
        table: 'pq_institution', scope: { field: 'country', value: CITY_COUNTRY_SCOPE },
        fields: { ...commonFields, id: 'id', title: 'title', cityId: 'city_id' },
    };
    config.collections.program = {
        table: 'pq_program', scope: { field: 'country', value: CITY_COUNTRY_SCOPE },
        fields: { ...commonFields, id: 'id', title: 'title', institutionId: 'institution_id' },
    };
    config.routes = { directory: fixturePaths.directory, blog: fixturePaths.blog, preserveOriginalPaths: true };
    config.contacts = contacts;
    return config;
}

async function seedCanonicalData(db: ReturnType<typeof sqliteRunner>): Promise<void> {
    await db.exec('CREATE TABLE IF NOT EXISTS pq_city (id INTEGER PRIMARY KEY, title TEXT NOT NULL, country INTEGER NOT NULL)');
    await db.exec('CREATE TABLE IF NOT EXISTS pq_institution (id INTEGER PRIMARY KEY, title TEXT NOT NULL, wp_url TEXT NOT NULL, city_id INTEGER NOT NULL, country INTEGER NOT NULL, summary TEXT, body TEXT, cover TEXT, cover_alt TEXT, logo TEXT)');
    await db.exec('CREATE TABLE IF NOT EXISTS pq_program (id INTEGER PRIMARY KEY, title TEXT NOT NULL, wp_url TEXT NOT NULL, institution_id INTEGER NOT NULL, country INTEGER NOT NULL, summary TEXT, body TEXT, cover TEXT, cover_alt TEXT, logo TEXT)');
    for (const city of cities) {
        await db.exec('INSERT INTO pq_city (id, title, country) VALUES (?,?,?)', [city.id, city.title, city.country]);
    }
    for (const institution of institutions) {
        await db.exec('INSERT INTO pq_institution (id, title, wp_url, city_id, country, summary, body, cover, cover_alt, logo) VALUES (?,?,?,?,?,?,?,?,?,?)',
            [institution.id, institution.title, institution.wp_url, institution.city_id, institution.country, institution.summary, institution.body, institution.cover, institution.cover_alt, institution.logo]);
    }
    for (const program of programs) {
        await db.exec('INSERT INTO pq_program (id, title, wp_url, institution_id, country, summary, body, cover, cover_alt, logo) VALUES (?,?,?,?,?,?,?,?,?,?)',
            [program.id, program.title, program.wp_url, program.institution_id, program.country, program.summary, program.body, program.cover, program.cover_alt, program.logo]);
    }
}

interface LayoutPage { id: string; role: 'directory' | 'institution' | 'program' | 'article-index' | 'article'; name: string; slug: string; title: string }

const layoutPages: LayoutPage[] = [
    { id: templatePageIds.directory, role: 'directory', name: 'Quality fixture directory', slug: 'quality-directory', title: 'Explore fixture institutions and programs' },
    { id: templatePageIds.institution, role: 'institution', name: 'Quality fixture institution', slug: 'quality-institution', title: 'Fixture institution detail' },
    { id: templatePageIds.program, role: 'program', name: 'Quality fixture program', slug: 'quality-program', title: 'Fixture program detail' },
    { id: templatePageIds.articleIndex, role: 'article-index', name: 'Quality fixture article index', slug: 'quality-article-index', title: 'Fixture blog' },
    { id: templatePageIds.article, role: 'article', name: 'Quality fixture article', slug: 'quality-article', title: 'Fixture article detail' },
];

function buildLayout(role: LayoutPage['role']): Record<string, unknown> {
    const page = { layoutData: { root: {} as Record<string, unknown>, content: [] as unknown[] } };
    // linkSharedConfiguration sets root.siteConfiguration = {version:1, role}.
    let layout = linkSharedConfiguration(page as never, baseConfiguration(contactsPresent), { version: 1, role }) as Record<string, unknown>;
    const bind = (queryId: string, params: Record<string, unknown>) =>
        addDirectoryTemplate({ layoutData: layout } as never, { version: 1, queryId, params } as never) as Record<string, unknown>;
    switch (role) {
        case 'directory':
            layout = bind('directory.institution.list', {});
            layout = bind('directory.program.list', {});
            break;
        case 'institution':
            layout = bind('directory.institution.detail', { path: '/sample-institution/' });
            layout = bind('directory.program.list', { institutionId: 999 }); // authoring sample; runtime substitutes the record id
            break;
        case 'program':
            layout = bind('directory.program.detail', { path: '/sample-program/' });
            break;
        case 'article-index':
            layout = bind('directory.article.list', {});
            break;
        case 'article':
            layout = bind('directory.article.detail', { path: '/sample-article/' });
            break;
    }
    return addSharedPageHeader({ layoutData: layout } as never) as Record<string, unknown>;
}

async function approveArticle(db: ReturnType<typeof sqliteRunner>, draft: { revision: number; configuration: unknown }, article: FixtureArticle, now: string) {
    const document = {
        id: article.id, revision: article.revision, originalPath: article.originalPath, title: article.title,
        excerpt: article.excerpt, body: article.body, language: article.language, byline: article.byline,
        publishedAt: article.publishedAt, coverUrl: article.coverUrl, coverAlt: article.coverAlt,
        reviewState: 'requested' as const, reviewNote: article.reviewNote,
    };
    const approved = await new EditorialApprovalStore(db, TENANT).approve(
        document as never, draft as never, 'fixture-seed', article.reviewNote,
        { facts: true, language: true, media: true, formatting: true, urls: true, ctas: true }, now,
    );
    if (!approved) throw new Error(`Synthetic approval failed for ${article.id}`);
    return { id: article.id, revision: article.revision, fingerprint: approved.fingerprint };
}

export default async function globalSetup(): Promise<void> {
    if (!statePath || !dbUrl || !baseUrl) throw new Error('PILOT_QUALITY_STATE, PILOT_QUALITY_DB_URL and PILOT_QUALITY_BASE_URL must be set by the config');
    mkdirSync(dirname(statePath), { recursive: true });
    await waitUntilHealthy();

    const db = sqliteRunner(dbUrl);
    const now = '2026-10-07T12:00:00.000Z';
    await seedCanonicalData(db);

    const cipher = await createSecretCipher(SESSION_SECRET);
    await new SyncStore(db, TENANT, cipher).createDatasource({ name: 'Quality fixture SQLite', kind: 'sqlite', config: { url: dbUrl } }, DATASOURCE_ID, now);

    // Revision 1: contacts present — the capture that will be activated.
    const draftA = await new SiteConfigurationStore(db, TENANT).save(baseConfiguration(contactsPresent), 0, now);
    if (!draftA) throw new Error('Failed to save fixture configuration revision 1');
    const pages = new PagesStore(db, TENANT);
    for (const page of layoutPages) {
        await pages.create({ name: page.name, slug: page.slug, title: page.title, layout_data: buildLayout(page.role) }, page.id, now);
    }
    const approvals = [];
    for (const article of articles) approvals.push(await approveArticle(db, draftA, article, now));

    const selection = {
        expectedConfigurationRevision: draftA.revision,
        pageIds: layoutPages.map(page => page.id),
        institutionPaths: preparedInstitutionPaths,
        programPaths: preparedProgramPaths,
        articles: approvals,
    };
    const preparedA = await prepareSitePublication(db, db, TENANT, draftA, 'sqlite', selection as never, { id: 'fixture-seed' }, now);

    const reviewChecks = { content: true, media: true, layout: true, urls: true, ctas: true };
    const reviewNote = 'SYNTHETIC FIXTURE REVIEW — invented rows only, not real pilot content';
    const reviewA = await new SitePublicationReviewStore(db, TENANT).approve({ hash: preparedA.hash, checks: reviewChecks, note: reviewNote }, 'fixture-seed', now);
    if (!reviewA) throw new Error('Synthetic review of capture A failed');
    const pointerA = await new SitePublicationReviewStore(db, TENANT).activate(preparedA.hash, null, now);
    if (!pointerA) throw new Error('Synthetic activation of capture A failed');

    // Revision 2: contacts absent — prepared and reviewed only (never activated).
    const draftB = await new SiteConfigurationStore(db, TENANT).save(baseConfiguration(contactsAbsent), draftA.revision, now);
    if (!draftB) throw new Error('Failed to save fixture configuration revision 2');
    const preparedB = await prepareSitePublication(db, db, TENANT, draftB, 'sqlite', {
        ...selection, expectedConfigurationRevision: draftB.revision, articles: [],
    } as never, { id: 'fixture-seed' }, now);
    const reviewB = await new SitePublicationReviewStore(db, TENANT).approve({ hash: preparedB.hash, checks: reviewChecks, note: reviewNote }, 'fixture-seed', now);
    if (!reviewB) throw new Error('Synthetic review of capture B failed');
    const stillActive = await new SitePublicationStore(db, TENANT).active();
    if (stillActive?.pointer.hash !== preparedA.hash) throw new Error('Capture B preparation must not change the active pointer');

    const active = await new SitePublicationStore(db, TENANT).active();
    const state = {
        baseUrl,
        hashActive: preparedA.hash,
        hashNoContacts: preparedB.hash,
        activeGeneration: pointerA.generation,
        activeConfirmed: active?.pointer.hash ?? null,
        contactsPresent: contactsPresent.email !== '',
        counts: { institutions: institutions.length, programs: programs.length, cities: cities.length, articles: articles.length },
        paths: fixturePaths,
        templatePageIds,
        admin: ADMIN,
        seededAt: now,
    };
    writeFileSync(statePath, JSON.stringify(state, null, 2));
    if (!existsSync(dbUrl.replace(/^file:/, ''))) throw new Error('Fixture database disappeared during seeding');
}
