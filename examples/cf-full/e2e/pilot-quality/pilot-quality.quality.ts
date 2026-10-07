/**
 * Workstream C (swarm2, quality-usability) — browser/engine acceptance for the
 * WordPress pilot directory surfaces.
 *
 * Drives the ACTIVE reviewed synthetic capture through the real host dispatch
 * plus the authenticated private render endpoint for a second (contacts-absent)
 * capture, at phone/tablet/desktop widths, with keyboard navigation, on the
 * built self-host artifact over an ephemeral database.
 *
 * Two kinds of statements live here, kept separate per the assignment:
 *  - ACTUAL CHECKS  — assertions that must hold today (they fail loudly);
 *  - FINDINGS       — recorded observations of current behavior that the
 *                     quality report ranks (written to metrics.json; several
 *                     are documented capture-v1 limitations, not bugs).
 */
import { appendFileSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import {
    MEDIA_ORIGIN, TINY_PNG_BASE64, contactsPresent,
    fixturePaths, institutions, programs, articles,
    templatePageIds,
} from './fixture-data';

interface FixtureState {
    baseUrl: string; hashActive: string; hashNoContacts: string; activeGeneration: number; activeConfirmed: string | null;
    counts: { institutions: number; programs: number; cities: number; articles: number };
    paths: typeof fixturePaths; templatePageIds: typeof templatePageIds;
    admin: { email: string; password: string };
}
// The runner published this run's ephemeral paths (see quality.config.ts);
// specs run in worker processes whose own config re-import cannot know them.
interface RunBootstrap { statePath: string; dbUrl: string; baseURL: string; port: number }
const bootstrap: RunBootstrap = JSON.parse(readFileSync(join(tmpdir(), 'pilot-quality-run', 'bootstrap.json'), 'utf8'));
const state: FixtureState = JSON.parse(readFileSync(bootstrap.statePath, 'utf8'));
const EVIDENCE_DIR = process.env.PILOT_QUALITY_EVIDENCE_DIR ?? '';
const METRICS_PATH = EVIDENCE_DIR ? join(EVIDENCE_DIR, 'pilot-quality-metrics.jsonl') : join(dirname(fileURLToPath(import.meta.url)), 'test-results', 'pilot-quality-metrics.jsonl');

const metric = (name: string, data: unknown): void => {
    mkdirSync(dirname(METRICS_PATH), { recursive: true });
    appendFileSync(METRICS_PATH, `${JSON.stringify({ at: new Date().toISOString(), name, data })}\n`);
};
const finding = (id: string, severity: 'blocker' | 'major' | 'moderate' | 'minor' | 'limitation', data: unknown): void =>
    metric('finding', { id, severity, ...data as object });
const snapshot = async (page: Page, name: string): Promise<void> => {
    if (!EVIDENCE_DIR) return;
    mkdirSync(EVIDENCE_DIR, { recursive: true });
    await page.screenshot({ path: join(EVIDENCE_DIR, name), fullPage: true });
};

/** Fulfill reserved fixture-media requests in-browser; /broken/* 404s on purpose. */
const routeFixtureMedia = async (page: Page): Promise<void> => {
    await page.route(`${MEDIA_ORIGIN}/**`, async route => {
        const url = route.request().url();
        if (url.includes('/broken/')) return route.fulfill({ status: 404, body: 'not found' });
        return route.fulfill({ status: 200, contentType: 'image/png', body: Buffer.from(TINY_PNG_BASE64, 'base64') });
    });
};

const overflowOf = (page: Page) => page.evaluate(() => {
    const d = document.documentElement, b = document.body;
    const widest = Math.max(d.scrollWidth, b ? b.scrollWidth : 0);
    return { scrollWidth: widest, clientWidth: d.clientWidth, overflow: widest - d.clientWidth };
});
const headingsOf = (page: Page) => page.evaluate(() =>
    [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')].map(h => ({ tag: h.tagName.toLowerCase(), text: (h.textContent ?? '').trim().slice(0, 90) })));
const linksOf = (page: Page) => page.evaluate(() =>
    [...document.querySelectorAll('a[href]')].map(a => ({
        text: (a.getAttribute('aria-label') || a.textContent || a.title || '').trim().slice(0, 60),
        href: a.getAttribute('href') ?? '', visible: !!(a.offsetWidth || a.offsetHeight),
    })));
const imagesOf = (page: Page) => page.evaluate(() =>
    [...document.querySelectorAll('img')].map(i => ({
        src: i.getAttribute('src') ?? '', alt: i.getAttribute('alt'), natural: i.naturalWidth,
        loaded: i.complete && i.naturalWidth > 0, visible: !!(i.offsetWidth || i.offsetHeight),
    })));

/** WCAG contrast ratio for every visible element that directly contains text. */
const contrastRows = (page: Page) => page.evaluate(() => {
    const lum = (r: number, g: number, b: number) => {
        const f = (v: number) => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
        return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    const parse = (value: string): [number, number, number, number] | null => {
        const m = value.match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/);
        return m ? [Number(m[1]), Number(m[2]), Number(m[3]), m[4] === undefined ? 1 : Number(m[4])] : null;
    };
    const out: { text: string; ratio: number; fontSize: number; bold: boolean }[] = [];
    for (const el of document.querySelectorAll('body *')) {
        const style = getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden') continue;
        const hasDirectText = [...el.childNodes].some(n => n.nodeType === 3 && n.textContent?.trim());
        if (!hasDirectText) continue;
        const rect = el.getBoundingClientRect();
        if (!rect.width || !rect.height) continue;
        const fg = parse(style.color);
        if (!fg || fg[3] === 0) continue;
        let bg: [number, number, number, number] | null = null;
        let node: Element | null = el;
        while (node) {
            const s = getComputedStyle(node);
            const parsed = parse(s.backgroundColor);
            if (parsed && parsed[3] > 0) {
                // Composite translucent backgrounds over white for a floor estimate.
                const a = parsed[3];
                bg = [parsed[0] * a + 255 * (1 - a), parsed[1] * a + 255 * (1 - a), parsed[2] * a + 255 * (1 - a), 1];
                break;
            }
            node = node.parentElement;
        }
        const white: [number, number, number, number] = [255, 255, 255, 1];
        const [fr, fgc, fb] = fg, [br, bgc, bb] = bg ?? white;
        const l1 = lum(fr, fgc, fb), l2 = lum(br, bgc, bb);
        const fontSize = parseFloat(style.fontSize);
        const bold = Number(style.fontWeight) >= 700;
        out.push({ text: (el.textContent ?? '').trim().slice(0, 60), ratio: Math.round(((Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)) * 100) / 100, fontSize, bold });
    }
    return out;
});

/** Keyboard focus walk: records stops, :focus-visible and visible focus indication. */
const focusWalk = async (page: Page, stops: number): Promise<{ tag: string; text: string; focusVisible: boolean; indicated: boolean; rect: { w: number; h: number } }[]> => {
    const seen: { tag: string; text: string; focusVisible: boolean; indicated: boolean; rect: { w: number; h: number } }[] = [];
    await page.keyboard.press('Tab');
    for (let i = 0; i < stops; i++) {
        const info = await page.evaluate(() => {
            const el = document.activeElement as HTMLElement | null;
            if (!el || el === document.body) return null;
            const s = getComputedStyle(el);
            return {
                tag: el.tagName.toLowerCase(), text: (el.textContent ?? '').trim().slice(0, 50),
                focusVisible: el.matches(':focus-visible'),
                indicated: s.outlineStyle !== 'none' || s.boxShadow !== 'none' || s.textDecorationLine.includes('underline'),
                rect: { w: el.getBoundingClientRect().width, h: el.getBoundingClientRect().height },
            };
        });
        if (!info) break;
        seen.push(info);
        await page.keyboard.press('Tab');
    }
    return seen;
};

const expectNoHorizontalOverflow = async (page: Page, label: string) => {
    const o = await overflowOf(page);
    expect(o.overflow, `${label}: horizontal overflow ${o.scrollWidth}px vs ${o.clientWidth}px viewport`).toBeLessThanOrEqual(1);
};

/** Wait for a client-side navigation by exact pathname (href attributes are root-relative). */
const waitForPath = async (page: Page, path: string) => {
    await page.waitForURL(url => url.pathname === path, { timeout: 20_000 });
};

const textResponseOf = async (request: Page['request'], path: string): Promise<{ status: number; bytes: number; ms: number; headers: Record<string, string>; body: string }> => {
    const started = Date.now();
    const response = await request.get(path);
    const body = await response.text();
    return {
        status: response.status(), bytes: Buffer.byteLength(body), ms: Date.now() - started,
        headers: response.headers(), body,
    };
};

test.describe('A. Serving and routing matrix (host dispatch of the reviewed capture)', () => {
    test('captured routes serve 200 with capture identity and no-store; uncaptured paths stay outside the capture', async ({ request }) => {
        const captured: [string, number][] = [
            [fixturePaths.directory, 200],
            [`${fixturePaths.directory}?type=program`, 200],
            [fixturePaths.institutionPaths[0]!, 200],
            [fixturePaths.programPaths[0]!, 200],
            [fixturePaths.blog, 200],
            [fixturePaths.articlePaths[0]!, 200],
        ];
        for (const [path] of captured) {
            const r = await textResponseOf(request, path);
            expect(r.status, path).toBe(200);
            expect(r.headers['x-site-version'], path).toBe(state.hashActive);
            expect(r.headers['x-site-generation'], path).toBe(String(state.activeGeneration));
            expect(r.headers['cache-control'], path).toBe('no-store');
            expect(r.headers['content-type'], path).toContain('text/html');
        }
        const missing = await textResponseOf(request, '/definitely-not-captured/');
        expect(missing.status).toBe(404);
        expect(missing.headers['cache-control']).toBe('no-store');
        expect(missing.headers['x-robots-tag']).toBe('noindex, nofollow');
        expect(missing.body).toContain('Not found');
        const invalid = await textResponseOf(request, `${fixturePaths.directory}?unsupported=1`);
        expect(invalid.status, 'unknown parameters must fail closed').toBe(503);
        const home = await textResponseOf(request, '/');
        expect(home.headers['x-site-version'], 'legacy homepage must not leak capture identity').toBeUndefined();
        metric('home-legacy', { status: home.status });
        if (home.status !== 200) {
            // OBSERVED (fresh self-host artifact): '/' is not seeded/captured, so the
            // header brand link on every captured page dead-ends.
            finding('brand-link-home-404', 'major', {
                role: 'visitor', viewport: 'all', trigger: `header brand link on any captured page (GET / answered ${home.status})`,
                observed: `the shared header brand Link binds site origin '/' but GET / answers ${home.status} on the fresh self-host; visitors tapping the brand affordance get an error page`,
                fix: 'either seed a real homepage at / on self-host boot, bind the brand link to the configured directory route, or capture a homepage route',
            });
        } else {
            expect(home.status).toBe(200);
        }
        metric('routing', { captured: captured.map(([p]) => p), missing: missing.status, invalidParam: invalid.status, home: home.status });
    });

    test('HEAD serves capture identity with an empty body; /sw.js stays the network-only shell outside the capture', async ({ request }) => {
        const head = await request.head(fixturePaths.directory);
        expect(head.status()).toBe(200);
        expect(head.headers()['x-site-version']).toBe(state.hashActive);
        expect((await head.body()).length).toBe(0);
        const sw = await request.get('/sw.js');
        expect(sw.status()).toBe(200);
        expect(sw.headers()['x-site-version'], 'the SW endpoint is infrastructure, never captured').toBeUndefined();
    });

    test('configured browsing parameters actually change server-side results (search, type, pagination)', async ({ request }) => {
        const base = await textResponseOf(request, fixturePaths.directory);
        const programsOnly = await textResponseOf(request, `${fixturePaths.directory}?type=program`);
        const search = await textResponseOf(request, `${fixturePaths.directory}?q=fixture%20polytechnic`);
        const none = await textResponseOf(request, `${fixturePaths.directory}?q=zzz-no-such-record`);
        const page2 = await textResponseOf(request, `${fixturePaths.directory}?page=2`);
        // page=834 is the last page whose offset fits the snapshot guard
        // (offset <= 10000 at pageSize 12); page=9999 is probed separately below.
        const pageEmpty = await textResponseOf(request, `${fixturePaths.directory}?page=834`);
        const pageHuge = await textResponseOf(request, `${fixturePaths.directory}?page=9999`);
        for (const r of [programsOnly, search, none, page2, pageEmpty]) expect(r.status).toBe(200);
        expect(pageHuge.status, 'offsets beyond the snapshot guard answer 503 (recorded as a finding)').toBe(503);
        finding('pages-beyond-guard-503', 'minor', {
            role: 'visitor', viewport: 'all', trigger: 'directory?page=835..9999 (public path regex allows 4-digit pages)',
            observed: 'page numbers whose offset exceeds the snapshot guard (offset > 10000, i.e. page > 834 at pageSize 12) answer 503 Site unavailable instead of clamping or returning an empty page; the private preview endpoint caps page at 834 while the public capture path does not',
            fix: 'clamp page to the last valid index, cap the public page parameter at 834 like the preview endpoint, or answer the bounded empty state',
        });
        expect(base.body).not.toContain('No records matched this preview.');
        expect(programsOnly.body).not.toContain(institutions[0]!.title, 'type=program must prune the institution list');
        expect(programsOnly.body).toContain(programs[0]!.title.slice(0, 30));
        expect(search.body).toContain('Fixture Polytechnic Institute');
        expect(none.body).toContain('No records matched this preview.');
        expect(pageEmpty.body).toContain('No records matched this preview.');
        // Page 2 must differ from page 1 (real pagination, not a copy).
        const page1Titles = institutions.map(i => i.title).sort().slice(0, 12);
        const page2Titles = institutions.map(i => i.title).sort().slice(12);
        expect(page2Titles.length).toBe(state.counts.institutions - 12);
        for (const title of page2Titles) expect(page2.body).toContain(title.slice(0, 40));
        for (const title of page1Titles.slice(0, 3)) expect(base.body).toContain(title.slice(0, 40));
        metric('browsing-params', {
            directoryBytes: base.bytes, programsOnlyBytes: programsOnly.bytes, searchBytes: search.bytes,
            page2Bytes: page2.bytes, institutions: state.counts.institutions, programs: state.counts.programs,
        });
    });
});

test.describe('B. Performance budgets on deterministic fixture data (local wall clock)', () => {
    const routes = () => [
        ['directory-list', fixturePaths.directory],
        ['directory-programs', `${fixturePaths.directory}?type=program`],
        ['institution-covered', fixturePaths.institutionPaths[0]!],
        ['institution-long-title', fixturePaths.institutionPaths[1]!],
        ['institution-many-programs', fixturePaths.institutionPaths[2]!],
        ['program-covered', fixturePaths.programPaths[0]!],
        ['program-long-body', '/fixture-polytechnic/program-7104/'],
        ['blog-index', fixturePaths.blog],
        ['article-covered', fixturePaths.articlePaths[0]!],
        ['article-plain', fixturePaths.articlePaths[1]!],
    ] as const;

    test('cold/warm timing and SSR response-size budgets hold; measured values are recorded', async ({ request }) => {
        const rows: Record<string, { cold: { ms: number; bytes: number }; warm: { ms: number; bytes: number } }> = {};
        for (const [name, path] of routes()) {
            const cold = await textResponseOf(request, path);
            const warm = await textResponseOf(request, path);
            rows[name] = { cold: { ms: cold.ms, bytes: cold.bytes }, warm: { ms: warm.ms, bytes: warm.bytes } };
            // Generous LOCAL budgets (loopback, built artifact, warm Node). These are
            // repeatable budgets, not external-network scores.
            expect(warm.ms, `${name} warm TTFB`).toBeLessThan(2000);
            expect(warm.bytes, `${name} HTML bytes`).toBeLessThan(600_000);
            expect(cold.ms, `${name} cold TTFB`).toBeLessThan(5000);
        }
        // Warm responses must not grow: no per-request HTML inflation.
        for (const [name, row] of Object.entries(rows)) {
            expect(row.warm.bytes, `${name} cold-vs-warm size drift`).toBe(row.cold.bytes);
        }
        metric('perf-budgets', rows);
    });

    test('list-versus-detail work is bounded: lists stay smaller than the longest detail; related-program pages stay proportional', async ({ request }) => {
        const list = await textResponseOf(request, fixturePaths.directory);
        const detail = await textResponseOf(request, '/fixture-polytechnic/program-7104/');
        const many = await textResponseOf(request, fixturePaths.institutionPaths[2]!);
        expect(list.status).toBe(200); expect(detail.status).toBe(200); expect(many.status).toBe(200);
        // Recorded relationship (documented, not a hard gate): the long-body detail
        // and the 12-card related list stay within 3x of the list page size.
        expect(detail.bytes).toBeLessThan(list.bytes * 3);
        expect(many.bytes).toBeLessThan(list.bytes * 3);
        metric('list-vs-detail', { listBytes: list.bytes, longDetailBytes: detail.bytes, manyRelatedBytes: many.bytes });
    });
});

test.describe('C. Directory list: accessibility, reflow, controls, keyboard', () => {
    for (const width of [320, 375, 768, 1280] as const) {
        test(`reflow at ${width}px: no horizontal overflow and grid columns follow the breakpoints`, async ({ page }) => {
            await routeFixtureMedia(page);
            await page.setViewportSize({ width, height: 900 });
            await page.goto(fixturePaths.directory);
            await expect(page.locator('h2').first()).toBeVisible();
            await expectNoHorizontalOverflow(page, `directory ${width}px`);
            const grid = await page.evaluate(() => {
                const el = document.querySelector('[class*="grid-cols-1"]');
                if (!el) return null;
                const s = getComputedStyle(el);
                return { display: s.display, columns: s.gridTemplateColumns.split(' ').length };
            });
            expect(grid, 'projected repeater must render the grid utility classes').not.toBeNull();
            const expected = width >= 1024 ? 3 : width >= 768 ? 2 : 1;
            expect(grid!.display).toBe('grid');
            expect(grid!.columns, `grid columns at ${width}px`).toBe(expected);
            if (width === 375 || width === 1280) await snapshot(page, `directory-list-${width}.png`);
            metric('reflow', { page: 'directory', width, ...await overflowOf(page), gridColumns: grid!.columns });
        });
    }

    test('heading order, page language/title, and the list-h1 finding', async ({ page }) => {
        await routeFixtureMedia(page);
        await page.goto(fixturePaths.directory);
        expect(await page.getAttribute('html', 'lang')).toBe('en');
        expect((await page.title()).length).toBeGreaterThan(0);
        const headings = await headingsOf(page);
        expect(headings.length).toBeGreaterThan(0);
        // ACTUAL CHECK: after the first heading, no level may jump by more than one.
        let previous = 0;
        for (const h of headings) {
            const level = Number(h.tag[1]);
            if (previous) expect(level - previous, `heading jump after h${previous}: ${h.text}`).toBeLessThanOrEqual(1);
            previous = level;
        }
        // FINDING (recorded): the list template currently exposes no h1 at all.
        const h1Count = headings.filter(h => h.tag === 'h1').length;
        metric('list-headings', { headings, h1Count });
        if (h1Count === 0) {
            finding('list-no-h1', 'moderate', { role: 'visitor', viewport: 'all', trigger: 'any directory list page', observed: 'no h1 on the list template; cards start at h2', fix: 'add an h1 (e.g. the page/site title) to the directory and blog index templates' });
        }
    });

    test('every link has an accessible name; identical CTA labels are recorded as a finding', async ({ page }) => {
        await routeFixtureMedia(page);
        await page.goto(fixturePaths.directory);
        const links = (await linksOf(page)).filter(l => l.visible);
        expect(links.length).toBeGreaterThan(0);
        const unnamed = links.filter(l => !l.text);
        expect(unnamed, `unnamed links: ${JSON.stringify(unnamed)}`).toEqual([]);
        const byText = new Map<string, Set<string>>();
        for (const link of links) {
            if (!byText.has(link.text)) byText.set(link.text, new Set());
            byText.get(link.text)!.add(link.href);
        }
        const duplicateCtas = [...byText.entries()].filter(([, targets]) => targets.size > 1);
        metric('link-purpose', { total: links.length, labels: [...byText.keys()], duplicateCtaLabels: duplicateCtas.map(([label, t]) => ({ label, destinations: t.size })) });
        // FINDING (recorded): every card CTA shares one label pointing at N different pages.
        expect(duplicateCtas.length, 'expected the shared "View details" pattern to be present').toBeGreaterThan(0);
        finding('same-name-ctas', 'moderate', { role: 'visitor/AT', viewport: 'all', trigger: 'links list in a screen reader', observed: `${duplicateCtas.map(d => d[0]).join(', ')} labels each point to multiple different destinations`, fix: 'include the record title in the accessible name (visually-hidden span inside the CTA) or make the whole card title the link' });
    });

    test('images: present covers load from the fixture origin with alt text; absent covers collapse', async ({ page }) => {
        await routeFixtureMedia(page);
        await page.goto(fixturePaths.directory);
        const images = await imagesOf(page);
        expect(images.length, 'covered cards must render their cover image').toBeGreaterThan(0);
        for (const img of images.filter(i => i.src)) {
            expect(img.alt === null, `img missing alt attribute: ${img.src}`).toBe(false);
            expect(img.loaded, `cover should load from routed fixture origin: ${img.src}`).toBe(true);
        }
        const loadedCount = images.filter(i => i.loaded).length;
        const absentCoverCards = await page.evaluate(() => [...document.querySelectorAll('div[style*="display: none"]')].length);
        metric('images-directory', { rendered: images.length, loaded: loadedCount, collapsedEmptyContainers: absentCoverCards });
        await snapshot(page, 'directory-list-media.png');
    });

    test('text contrast on the list meets WCAG AA (>= 4.5 normal, >= 3 large)', async ({ page }) => {
        await routeFixtureMedia(page);
        await page.goto(fixturePaths.directory);
        const rows = await contrastRows(page);
        expect(rows.length).toBeGreaterThan(5);
        const failing = rows.filter(r => r.ratio < (r.fontSize >= 24 || (r.fontSize >= 18.66 && r.bold) ? 3 : 4.5));
        metric('contrast-directory', { measured: rows.length, worst: rows.slice().sort((a, b) => a.ratio - b.ratio).slice(0, 10) });
        expect(failing, `low-contrast text: ${JSON.stringify(failing)}`).toEqual([]);
    });

    test('keyboard: focus lands in a visible, ordered trail and Enter on a card CTA opens the institution page', async ({ page }) => {
        await routeFixtureMedia(page);
        await page.setViewportSize({ width: 1280, height: 800 });
        await page.goto(fixturePaths.directory);
        const walk = await focusWalk(page, 12);
        expect(walk.length, 'keyboard should reach at least 8 stops').toBeGreaterThanOrEqual(8);
        for (const stop of walk) {
            expect(stop.focusVisible, `stop ${stop.tag} "${stop.text}" must match :focus-visible`).toBe(true);
            expect(stop.indicated, `stop ${stop.tag} "${stop.text}" needs a visible focus indication (outline/shadow/underline)`).toBe(true);
            expect(stop.rect.w, `stop ${stop.tag} "${stop.text}" must be visible`).toBeGreaterThan(0);
        }
        metric('focus-walk-directory', walk);
        const cta = page.locator('a', { hasText: 'View details' }).first();
        const href = await cta.getAttribute('href');
        expect(href, 'card CTA must bind originalPath').toBeTruthy();
        await cta.focus();
        await page.keyboard.press('Enter');
        await waitForPath(page, href!);
        const h1 = (await headingsOf(page)).find(h => h.tag === 'h1');
        expect(h1?.text).toBeTruthy();
    });

    test('empty and exhausted states render the bounded empty message; no pagination UI exists (finding)', async ({ page }) => {
        await routeFixtureMedia(page);
        await page.goto(`${fixturePaths.directory}?q=zzz-no-such-record`);
        await expect(page.getByText('No records matched this preview.')).toHaveCount(1);
        expect(await page.textContent('body')).not.toContain('crash');
        const paged = await page.goto(`${fixturePaths.directory}?page=834`);
        expect(paged!.status()).toBe(200);
        await expect(page.getByText('No records matched this preview.')).toHaveCount(1);
        // Controls audit on the normal list.
        await page.goto(fixturePaths.directory);
        const body = (await page.textContent('body')) ?? '';
        const hasSearchInput = await page.locator('input[type="search"], input[placeholder*="earch" i]').count();
        const hasPager = await page.locator('a[rel="next"], a[aria-label*="ext" i], nav[aria-label*="agination" i]').count();
        expect(hasSearchInput, 'configured search must not silently render a control it cannot back').toBe(0);
        expect(hasPager).toBe(0);
        expect(body.toLowerCase()).not.toContain('sort');
        metric('controls-directory', { searchInputs: hasSearchInput, pagerElements: hasPager });
        finding('configured-controls-not-rendered', 'limitation', {
            role: 'visitor', viewport: 'all', trigger: 'configured browsing.search/cityFilter/degreeFilter/intakeFilter/sort and pageSize pagination',
            observed: 'configuration advertises search and filters, and q/page/type parameters work server-side, but the captured v1 list renders no search input, no filter selects, no sort control and no pager; deep ?page=2 is reachable only by hand-built URLs',
            fix: 'capture-v1 scope: keep the server-side q/page/type parameters and either render matching controls in the template or document the omission; do not render controls without server support',
        });
    });
});

test.describe('D. Institution detail pages', () => {
    test('covered institution: single h1, loaded cover/logo, related programs, contrast', async ({ page }) => {
        await routeFixtureMedia(page);
        await page.setViewportSize({ width: 1280, height: 900 });
        await page.goto(fixturePaths.institutionPaths[0]!);
        const headings = await headingsOf(page);
        const h1s = headings.filter(h => h.tag === 'h1');
        expect(h1s.length, 'exactly one h1').toBe(1);
        expect(h1s[0]!.text).toContain('Fixture Muhlenberg Sample College');
        const images = await imagesOf(page);
        expect(images.filter(i => i.loaded).length).toBeGreaterThanOrEqual(1);
        const related = page.locator('a', { hasText: 'View details' });
        expect(await related.count()).toBeGreaterThanOrEqual(1);
        const rows = await contrastRows(page);
        const failing = rows.filter(r => r.ratio < (r.fontSize >= 24 || (r.fontSize >= 18.66 && r.bold) ? 3 : 4.5));
        expect(failing, `low-contrast text: ${JSON.stringify(failing)}`).toEqual([]);
        await snapshot(page, 'institution-covered-1280.png');
        metric('institution-covered', { headings: headings.length, images: images.length });
    });

    test('many-program institution: related-program list truncates at the configured page size with no pager (finding)', async ({ page }) => {
        await routeFixtureMedia(page);
        await page.setViewportSize({ width: 375, height: 900 });
        await page.goto(fixturePaths.institutionPaths[2]!);
        const ctas = page.locator('a', { hasText: 'View details' });
        expect(await ctas.count(), 'related programs truncate to pageSize 12').toBe(12);
        expect(await page.locator('a[rel="next"], nav[aria-label*="agination" i]').count()).toBe(0);
        await expectNoHorizontalOverflow(page, 'institution many-programs 375px');
        // Card-to-detail navigation from the related list.
        const first = ctas.first();
        const href = await first.getAttribute('href');
        await first.click();
        await waitForPath(page, href!);
        expect(href!, 'related-program CTA must point inside the polytechnic program paths').toContain('/fixture-polytechnic/');
        metric('related-programs', { rendered: 12, capturedForInstitution: 31, pager: false });
        finding('related-programs-no-pager', 'limitation', {
            role: 'visitor', viewport: 'all', trigger: 'institution with more than pageSize programs (fixture: 31)',
            observed: 'related list silently truncates at 12 with no link to the remaining programs',
            fix: 'capture-v1 scope: link a filtered directory view (?q= or a future institutionId facet) or show the total count',
        });
    });

    test('long-title institution wraps at 375px with readable detail; bare institution collapses media', async ({ page }) => {
        await routeFixtureMedia(page);
        await page.setViewportSize({ width: 375, height: 900 });
        await page.goto(fixturePaths.institutionPaths[1]!);
        await expectNoHorizontalOverflow(page, 'long-title institution 375px');
        const h1 = page.locator('h1');
        await expect(h1).toBeVisible();
        const box = await h1.boundingBox();
        expect(box!.width).toBeLessThanOrEqual(375);
        // Bare institution: empty cover must collapse, not render a broken placeholder.
        await page.goto(fixturePaths.institutionPaths[3]!);
        const images = await imagesOf(page);
        expect(images.filter(i => i.src && i.visible).length, 'no visible img when the cover is absent').toBe(0);
        await snapshot(page, 'institution-bare-375.png');
    });
});

test.describe('E. Program detail pages', () => {
    test('covered program: image loads, no self-referential CTA, detail bound to 840px, h1 equals the title', async ({ page }) => {
        await routeFixtureMedia(page);
        await page.setViewportSize({ width: 1280, height: 900 });
        await page.goto(fixturePaths.programPaths[0]!);
        const headings = await headingsOf(page);
        const h1s = headings.filter(h => h.tag === 'h1');
        expect(h1s.length).toBe(1);
        expect(h1s[0]!.text).toContain(programs[0]!.title.slice(0, 40));
        const images = await imagesOf(page);
        expect(images.filter(i => i.loaded).length).toBeGreaterThanOrEqual(1);
        const selfCtas = await page.getByRole('link', { name: 'View details' }).count();
        expect(selfCtas, 'detail pages must not link to themselves').toBe(0);
        const bound = await page.evaluate(() => {
            const el = [...document.querySelectorAll('div')].find(d => getComputedStyle(d).maxWidth === '840px');
            return el ? getComputedStyle(el).maxWidth : null;
        });
        expect(bound, 'detail container keeps the 840px bound').toBe('840px');
        await snapshot(page, 'program-covered-1280.png');
    });

    test('broken fixture cover renders a deterministic error state with alt text preserved (finding)', async ({ page }) => {
        await routeFixtureMedia(page);
        await page.goto('/fixture-polytechnic/program-7105/');
        await page.waitForTimeout(1500); // allow the 404 image request to settle
        const images = await imagesOf(page);
        const broken = images.find(i => i.src.includes('/broken/'));
        expect(broken, 'the broken fixture cover must be rendered as an img').toBeTruthy();
        expect(broken!.alt, 'broken image keeps an accessible name').toBeTruthy();
        expect(broken!.loaded).toBe(false);
        metric('broken-image', { src: broken!.src, alt: broken!.alt, natural: broken!.natural });
        // OBSERVED: the alt came from the record TITLE fallback, not cover_alt.
        finding('cover-alt-column-ignored', 'moderate', {
            role: 'visitor/AT', viewport: 'all', trigger: 'any institution/program image with a dedicated cover_alt value',
            observed: `generator binds image alt to the record title for institutions/programs; the migrated cover_alt column ("Intentionally broken fixture cover" here) is never rendered (rendered alt: "${broken!.alt}")`,
            fix: 'bind alt to coverAlt with a title fallback in addDirectoryTemplate (article images already bind coverAlt)',
        });
        finding('broken-cover-presentation', 'minor', {
            role: 'visitor', viewport: 'all', trigger: 'captured cover URL unavailable at view time',
            observed: 'the img stays in the DOM unloaded (browser broken-image chrome); no graceful collapse or retry',
            fix: 'proposed narrow patch after ownership agreement: add a capture-time availability note or an error-state style for failed captures; rights/availability auditing is workstream A',
        });
    });

    test('long program body wraps at 320px and keeps readable contrast', async ({ page }) => {
        await routeFixtureMedia(page);
        await page.setViewportSize({ width: 320, height: 900 });
        await page.goto('/fixture-polytechnic/program-7104/');
        await expectNoHorizontalOverflow(page, 'long program body 320px');
        const rows = await contrastRows(page);
        const failing = rows.filter(r => r.ratio < (r.fontSize >= 24 || (r.fontSize >= 18.66 && r.bold) ? 3 : 4.5));
        expect(failing, `low-contrast text: ${JSON.stringify(failing)}`).toEqual([]);
        const bodyText = await page.textContent('body');
        expect(bodyText).toContain('fixture sentence 10');
    });
});

test.describe('F. Blog index and article detail', () => {
    test('blog index lists approved articles; covers and metadata presence follow the fixture', async ({ page }) => {
        await routeFixtureMedia(page);
        await page.setViewportSize({ width: 1280, height: 900 });
        await page.goto(fixturePaths.blog);
        const ctas = page.locator('a', { hasText: 'Read article' });
        expect(await ctas.count()).toBe(articles.length);
        const images = await imagesOf(page);
        expect(images.filter(i => i.src && i.src.includes('announcement')).length).toBe(1);
        // Article without a cover collapses to text-only.
        const body = (await page.textContent('body')) ?? '';
        expect(body).toContain(articles[1]!.title.slice(0, 30));
        await snapshot(page, 'blog-index-1280.png');
    });

    test('article detail: heading order through body blocks, byline/date render, safe in-body link, keyboard reachable', async ({ page }) => {
        await routeFixtureMedia(page);
        await page.goto(fixturePaths.articlePaths[0]!);
        const headings = await headingsOf(page);
        const h1s = headings.filter(h => h.tag === 'h1');
        expect(h1s.length).toBe(1);
        expect(h1s[0]!.text).toContain('Fixture Announcement');
        // ACTUAL CHECK: body headings must not skip levels (h1 -> h2 -> h3 -> h2 ...).
        let previous = 0;
        for (const h of headings) {
            const level = Number(h.tag[1]);
            if (previous) expect(level - previous, `heading jump after h${previous}: ${h.text}`).toBeLessThanOrEqual(1);
            previous = level;
        }
        const body = (await page.textContent('body')) ?? '';
        expect(body).toContain('Fixture Newsroom Author');
        // FINDING (recorded): publishedAt renders raw ISO text.
        expect(body).toContain('2025-04-19T09:12:43Z');
        finding('raw-published-at', 'minor', {
            role: 'visitor', viewport: 'all', trigger: 'article detail with publishedAt',
            observed: 'publishedAt renders the raw stored timestamp "2025-04-19T09:12:43Z"',
            fix: 'format dates through the agreed date-presentation seam (first-swarm retained decision); propose during integration',
        });
        const inBodyLink = page.getByRole('link', { name: 'the fixture program page' });
        await expect(inBodyLink).toHaveCount(1);
        expect(await inBodyLink.getAttribute('href')).toBe('https://fixture-usa.invalid/fixture-polytechnic/program-7101/');
        // Keyboard: the first Tab stops are header links; Enter on the index CTA reaches the article.
        await page.goto(fixturePaths.blog);
        const walk = await focusWalk(page, 6);
        expect(walk.length).toBeGreaterThanOrEqual(4);
        const cta = page.locator('a', { hasText: 'Read article' }).first();
        const href = await cta.getAttribute('href');
        await cta.focus();
        await page.keyboard.press('Enter');
        await waitForPath(page, fixturePaths.articlePaths[0]!);
        expect(href, 'first article CTA binds the first captured article path').toBe(fixturePaths.articlePaths[0]);
    });

    test('plain article (no cover/byline/date): text-only rendering, no broken media', async ({ page }) => {
        await routeFixtureMedia(page);
        await page.goto(fixturePaths.articlePaths[1]!);
        const images = await imagesOf(page);
        expect(images.filter(i => i.src).length).toBe(0);
        const body = (await page.textContent('body')) ?? '';
        expect(body).toContain('text-only article rendering');
        expect(body).not.toContain('2025-');
    });
});

test.describe('G. Second capture (contacts absent) through the authenticated render endpoint', () => {
    let adminCookies: string | undefined;

    test.beforeAll(async ({ request }) => {
        const login = await request.post('/api/auth/login', { data: { email: state.admin.email, password: state.admin.password } });
        expect(login.status()).toBe(200);
        const setCookie = login.headersArray().filter(h => h.name.toLowerCase() === 'set-cookie').map(h => h.value.split(';')[0]);
        adminCookies = setCookie.join('; ');
        expect(adminCookies.length).toBeGreaterThan(0);
    });

    test('render endpoint serves the no-contacts capture with no-store/noindex and empty-contact pills as # (finding)', async ({ request }) => {
        const response = await request.get(`/api/project/site-configuration/publication/render/?hash=${state.hashNoContacts}&path=${encodeURIComponent(fixturePaths.directory)}`, { headers: { cookie: adminCookies! } });
        expect(response.status()).toBe(200);
        expect(response.headers()['cache-control']).toBe('no-store');
        expect(response.headers()['x-robots-tag']).toBe('noindex, nofollow');
        const body = await response.text();
        expect(body).toContain('Fixture USA Directory');
        expect(body).toContain('United States');
        const hashCount = (body.match(/href="#"/g) ?? []).length;
        expect(hashCount, 'both unconfigured contact pills must render the # placeholder').toBeGreaterThanOrEqual(2);
        metric('no-contacts-render', { placeholderHrefs: hashCount });
        finding('blank-contact-href', 'minor', {
            role: 'visitor/AT', viewport: 'all', trigger: 'site header when contacts are unconfigured',
            observed: 'unconfigured email/WhatsApp pills render as links to "#" (focusable, announced as links, go nowhere)',
            fix: 'existing hideWhenEmpty seam covers images only; propose a text-binding hide-when-empty or remove-unconfigured-pills patch after ownership agreement',
        });
    });

    test('render endpoint honors q/search parameters on the same capture version', async ({ request }) => {
        const empty = await request.get(`/api/project/site-configuration/publication/render/?hash=${state.hashActive}&path=${encodeURIComponent(fixturePaths.directory)}&q=zzz-no-such-record`, { headers: { cookie: adminCookies! } });
        expect(empty.status()).toBe(200);
        expect(await empty.text()).toContain('No records matched this preview.');
    });
});

test.describe('H. Admin authoring flow (read-only): login, pages, builder canvas, preparation contract', () => {
    let pageErrors: string[] = [];

    test.beforeEach(async ({ page }) => {
        pageErrors = [];
        page.on('pageerror', error => pageErrors.push(String(error)));
    });

    test('login form is labelled and reaches the dashboard', async ({ page }) => {
        await page.setViewportSize({ width: 1280, height: 900 });
        await page.goto('/frontbase-admin/login');
        const email = page.locator('input[type="email"]');
        const password = page.locator('input[type="password"]');
        await expect(email).toBeVisible();
        await expect(password).toBeVisible();
        // Label audit on the login form.
        const labelInfo = await page.evaluate(() => [...document.querySelectorAll('input')].map(i => ({
            type: i.type, labelled: !!(i.labels?.length || i.getAttribute('aria-label') || i.getAttribute('aria-labelledby')),
        })));
        const unlabelled = labelInfo.filter(i => !i.labelled && ['email', 'password', 'text'].includes(i.type));
        metric('admin-login-labels', { inputs: labelInfo });
        if (unlabelled.length) finding('admin-input-labels', 'major', { role: 'admin/AT', viewport: 'all', trigger: 'login form', observed: `${unlabelled.length} inputs without programmatic labels`, fix: 'associate visible labels or aria-labels' });
        await email.fill(state.admin.email);
        await password.fill(state.admin.password);
        await page.locator('button[type="submit"], button:has-text("Sign in"), button:has-text("Log in")').first().click();
        await page.waitForURL(/dashboard|pages/, { timeout: 30_000 });
        expect(pageErrors, `uncaught page errors: ${pageErrors.join(' | ')}`).toEqual([]);
        await snapshot(page, 'admin-dashboard-1280.png');
    });

    test('pages panel lists the five saved role templates', async ({ page }) => {
        await page.goto('/frontbase-admin/login');
        await page.locator('input[type="email"]').fill(state.admin.email);
        await page.locator('input[type="password"]').fill(state.admin.password);
        await page.locator('button[type="submit"], button:has-text("Sign in"), button:has-text("Log in")').first().click();
        await page.waitForURL(/dashboard|pages/, { timeout: 30_000 });
        await page.goto('/frontbase-admin/pages');
        await expect(page.getByText('Quality fixture directory')).toBeVisible({ timeout: 30_000 });
        for (const name of ['Quality fixture institution', 'Quality fixture program', 'Quality fixture article index', 'Quality fixture article']) {
            await expect(page.getByText(name, { exact: true })).toBeVisible();
        }
        await snapshot(page, 'admin-pages-1280.png');
    });

    test('builder canvas opens for the directory template without script errors; preparation stays inactive', async ({ page }) => {
        await page.goto('/frontbase-admin/login');
        await page.locator('input[type="email"]').fill(state.admin.email);
        await page.locator('input[type="password"]').fill(state.admin.password);
        await page.locator('button[type="submit"], button:has-text("Sign in"), button:has-text("Log in")').first().click();
        await page.waitForURL(/dashboard|pages/, { timeout: 30_000 });
        await page.goto(`/frontbase-admin/builder/${state.templatePageIds.directory}`);
        await page.waitForTimeout(8000); // canvas load: layout fetch + hydration
        const markers = await page.evaluate(() => ({
            reactFlow: !!document.querySelector('.react-flow'),
            iframe: !!document.querySelector('iframe'),
            canvasish: !!document.querySelector('[class*="canvas" i]'),
            pageSettings: (document.body.innerText ?? '').includes('Page Settings'),
            title: document.title,
        }));
        metric('builder-canvas', markers);
        expect(markers.reactFlow || markers.iframe || markers.canvasish || markers.pageSettings, 'builder surface must render (canvas/iframe/settings)').toBe(true);
        // The publication contract must stay inactive from the console side.
        const read = await page.evaluate(async hash => {
            const r = await fetch('/api/project/site-configuration/publication/read/', {
                method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ hash }),
            });
            return { status: r.status, json: await r.json().catch(() => null) };
        }, state.hashActive);
        expect(read.status).toBe(200);
        expect(read.json?.publicationAvailable).toBe(false);
        expect(read.json?.purpose).toBe('private-prepared-candidate');
        expect(pageErrors, `uncaught page errors in builder: ${pageErrors.join(' | ')}`).toEqual([]);
        await snapshot(page, 'admin-builder-directory-1280.png');
    });
});

test.describe('I. Shared header and contacts (active capture)', () => {
    test('header shows brand, destination and working contact pills on public pages', async ({ page }) => {
        await routeFixtureMedia(page);
        await page.goto(fixturePaths.directory);
        const links = await linksOf(page);
        const brand = links.find(l => l.text === 'Fixture USA Directory' && l.href === '/');
        expect(brand, 'brand link bound to site.name and /').toBeTruthy();
        const body = (await page.textContent('body')) ?? '';
        expect(body, 'site.destination renders as header text').toContain('United States');
        // Contact values live in href bindings, not pill text.
        expect(links.some(l => l.href === `mailto:${contactsPresent.email}`), 'email pill binds mailto:').toBe(true);
        expect(links.some(l => l.href === contactsPresent.whatsapp), 'WhatsApp pill binds the wa.me URL').toBe(true);
        // Header presence on a detail page too.
        await page.goto(fixturePaths.programPaths[0]!);
        expect((await page.textContent('body')) ?? '').toContain('United States');
        expect((await linksOf(page)).some(l => l.href === `mailto:${contactsPresent.email}`)).toBe(true);
    });
});
