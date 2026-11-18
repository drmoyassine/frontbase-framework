// Run after pnpm -r build. Uses the public renderer and Chromium with disposable source data.
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { renderResolvedPageDocument } from '@frontbase/edge-core';
import { emptyDirectoryConfiguration } from '@frontbase/edge-core/directory/configuration';
import { homepageDisplayFields, applyHomepageDisplayFields } from '@frontbase/edge-core/localization';
import { sqliteRunner } from '@frontbase/edge-infra';
import { bookingPages } from '../../../packages/backend/dist/compat/booking-template.js';
import { resolveLiveLayoutPage } from '../../../packages/backend/dist/compat/live-layout-runtime.js';
import { liveLayoutPublicationSchema } from '../../../packages/backend/dist/compat/live-layout-publication.js';
import { createLiveDirectoryQueries } from '../../../packages/compiler/dist/queries/directory.js';

const origin = 'https://details.example.test';
const db = sqliteRunner(':memory:');
const browser = await chromium.launch(process.env.BOOKING_TEST_BROWSER ? { channel: process.env.BOOKING_TEST_BROWSER } : {});
try {
    await db.exec('CREATE TABLE cities (id INTEGER, title TEXT, country INTEGER)');
    await db.exec('CREATE TABLE schools (id INTEGER, title TEXT, path TEXT, city INTEGER, country INTEGER, cover TEXT, summary TEXT, location TEXT, website TEXT)');
    await db.exec('CREATE TABLE programs (id INTEGER, title TEXT, path TEXT, school INTEGER, country INTEGER, summary TEXT, degree TEXT, duration INTEGER, durationUnit TEXT, tuition INTEGER, currency TEXT, intakes TEXT, requirements TEXT)');
    await db.exec("INSERT INTO cities VALUES (1,'Fixture city',22)");
    await db.exec('INSERT INTO schools VALUES (?,?,?,?,?,?,?,?,?)', [1,'Coastal University','/coastal/',1,22,origin+'/cover.png','A campus near the coast.','Fixture city','https://coastal.example.test/']);
    await db.exec('INSERT INTO schools VALUES (?,?,?,?,?,?,?,?,?)', [2,'Sparse institution','/sparse/',1,22,null,null,null,'javascript:alert(1)']);
    await db.exec('INSERT INTO programs VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)', [
        11,'Media and communications','/coastal/media/',1,22,'A live program description.','Bachelor of Arts',4,'years',20000,'USD','September',null,
    ]);
    await db.exec('INSERT INTO programs VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)', [
        12,'Excluded program','/excluded/',1,99,'Excluded',null,null,null,null,null,null,null,
    ]);

    const configuration = emptyDirectoryConfiguration();
    configuration.datasourceId = 'fixture';
    configuration.site = { name:'Booking fixture', origin, locale:'en' };
    for (const [role, table] of [['city','cities'],['institution','schools'],['program','programs']]) {
        const mapping = configuration.collections[role];
        mapping.table = table;
        mapping.scope = { field:'country', value:22 };
        Object.assign(mapping.fields, { id:'id', title:'title', ...(role === 'city' ? {} : { originalPath:'path', summary:'summary' }) });
    }
    Object.assign(configuration.collections.institution.fields, { cityId:'city', cover:'cover', location:'location', website:'website' });
    Object.assign(configuration.collections.program.fields, {
        institutionId:'school', degree:'degree', duration:'duration', durationUnit:'durationUnit',
        tuition:'tuition', currency:'currency', intakes:'intakes', requirements:'requirements',
    });
    const pages = (await bookingPages('fixture')).filter(page => ['institution','program'].includes(page.role));
    for (const { layout, role } of pages) layout.root.templatePolicy = {
        schemaVersion:1, defaults:{values:{ctaHref:role === 'program' ? '/enquire/' : '/consult/'}}, rules:[], overrides:{},
    };
    const publication = liveLayoutPublicationSchema.parse({
        schemaVersion:3, runtimeVersion:'live-layout-v1', configuration,
        templates:pages.map(page => ({ pageId:page.id, role:page.role, title:page.name, description:'', layout:page.layout })),
        staticPages:[], locales:['en','ar'], redirects:[],
    });
    const queries = createLiveDirectoryQueries(configuration, 'fixture', 'sqlite', (sql, params) => db.query(sql, params));
    const reader = {
        queries,
        liveQuery:async () => { throw Error('No independent view request expected'); },
        resolveRoute:async path => {
            for (const role of ['institution','program']) {
                const [row] = await queries['directory.' + role + '.detail'].execute({ path }, {tenant:'fixture'});
                if (row) return {role,row};
            }
            return null;
        },
    };
    const english = new Map();
    const arabic = new Map([
        ['Coastal University','الجامعة الساحلية'], ['Media and communications','الإعلام والاتصال'],
        ['A campus near the coast.','حرم جامعي بالقرب من الساحل.'], ['A live program description.','وصف البرنامج المباشر.'],
        ['Browse programs','تصفّح البرامج'], ['Book consultation','احجز استشارة'], ['Programs at this institution','برامج المؤسسة'],
        ['About','نبذة'], ['Overview','نظرة عامة'], ['Offered by','تقدمه'], ['Apply','قدّم الآن'], ['Degree','الدرجة'],
        ['Duration','المدة'], ['Tuition','الرسوم الدراسية'], ['Intakes','مواعيد الالتحاق'], ['years','سنوات'],
        ['Visit the institution website','موقع المؤسسة'],
    ]);
    async function html(path, locale) {
        const request = new Request(origin + path);
        const resolved = await resolveLiveLayoutPage(publication, 'version', 'fixture', db, request, reader, locale);
        assert.ok(resolved);
        const labels = locale === 'ar' ? arabic : english;
        const fields = homepageDisplayFields(resolved.page.layout);
        const values = new Map(fields.filter(field => labels.has(field.text))
            .map(field => [JSON.stringify([field.blockId, field.versionId ?? 'default', field.path]), labels.get(field.text)]));
        const layout = applyHomepageDisplayFields(resolved.page.layout, values, {partial:true, fields});
        return renderResolvedPageDocument({ ...resolved.page, layout }, request, {
            manifest:{version:'version',pages:{},queries:{}}, environment:'edge', document:{...resolved.document,faviconUrl:'/favicon.png'},
        });
    }

    for (const locale of ['en','ar']) for (const width of [390, 1280]) {
        const page = await browser.newPage({viewport:{width,height:850}});
        await page.route('**/*', route => route.request().url() === origin + '/cover.png'
            ? route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="16" height="12"><rect width="16" height="12" fill="#29445c"/></svg>'})
            : route.abort());
        for (const path of ['/coastal/','/coastal/media/','/sparse/']) {
            await page.setContent(await html(path,locale),{waitUntil:'domcontentloaded'});
            assert.equal(await page.locator('html').getAttribute('lang'),locale);
            assert.equal(await page.locator('html').getAttribute('dir'),locale === 'ar' ? 'rtl' : 'ltr');
            assert.equal(await page.getByRole('heading',{level:1}).count(),1);
            assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${locale} ${width} ${path} overflows`);
            assert.equal(await page.getByText('Excluded program').count(),0);
            if (path === '/coastal/') {
                await page.locator('.fb-gallery img').scrollIntoViewIfNeeded();
                await page.locator('.fb-gallery img').evaluate(image => image.decode());
                const browse = page.getByRole('link',{name:locale === 'ar' ? 'تصفّح البرامج' : 'Browse programs'});
                const href = await browse.getAttribute('href');
                assert.match(href, /^#bfx-institution-related$/);
                assert.equal(await page.locator(href).isVisible(),true);
                assert.equal(await page.getByRole('link',{name:locale === 'ar' ? 'موقع المؤسسة' : 'Visit the institution website'}).getAttribute('href'),'https://coastal.example.test/');
                assert.equal(await page.getByRole('link',{name:locale === 'ar' ? 'الإعلام والاتصال' : 'Media and communications'}).isVisible(),true);
            } else if (path === '/coastal/media/') {
                const apply = page.getByRole('link',{name:locale === 'ar' ? 'قدّم الآن' : 'Apply'});
                assert.equal(await apply.isVisible(),true);
                assert.equal(await apply.getAttribute('href'),'/enquire/');
                assert.ok((await apply.boundingBox()).y < 850, 'primary action stays in the first screen');
                assert.ok(await page.getByText('20000',{exact:true}).isVisible());
                assert.ok(await page.getByText('USD',{exact:true}).isVisible());
                assert.equal(await page.getByText('Entry requirements',{exact:true}).count(),0);
                assert.equal(await page.getByText(locale === 'ar' ? 'وصف البرنامج المباشر.' : 'A live program description.',{exact:true}).isVisible(),true);
            } else {
                assert.equal(await page.getByRole('link',{name:/Browse programs|تصفّح البرامج/}).count(),0);
                assert.equal(await page.getByRole('heading',{name:/About|نبذة/}).count(),0);
                assert.equal(await page.locator('a[href^="javascript:"]').count(),0);
            }
        }
        await page.close();
    }
    await db.exec("UPDATE programs SET summary='Updated live source text.' WHERE id=11");
    assert.match(await html('/coastal/media/','en'), /Updated live source text\./);
    console.log('Booking detail browser: both layouts and sparse fallback, English/Arabic at 390/1280 px, live record edit, routes, CTA and scope PASS');
} finally {
    await browser.close();
    await db.close?.();
}
