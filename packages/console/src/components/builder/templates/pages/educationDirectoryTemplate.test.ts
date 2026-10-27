import { describe, expect, it } from 'vitest';
import { directoryLiteral, educationDirectoryTemplate, directoryCoverImage } from './educationDirectoryTemplate';
import { expandTemplate, getSectionTemplate } from '../index';

describe('education directory', () => {
    it('uses editable images and refuses active, credential-bearing or template image references', () => {
        const image = directoryCoverImage('https://media.example.test/cover.png', '{{ secret }}');
        expect(image?.type).toBe('Image');
        expect(image?.props?.alt).not.toContain('{{');
        for (const src of ['javascript:alert(1)', 'data:image/svg+xml,bad', '//evil.test/image', 'http://example.test/a', 'https://user:password@example.test/a', 'https://example.test/{{secret}}', 'https://example.test/%7B%7Bsecret%7D%7D', 'https://example.test/%ZZ']) {
            expect(directoryCoverImage(src, 'Cover')).toBeNull();
        }
        expect(directoryCoverImage(undefined, 'Cover')).toBeNull();
        const template = educationDirectoryTemplate({ listings: [{ title: 'College', kind: 'institution', path: '/college/', cover: 'https://media.example.test/cover.png' }] });
        expect(JSON.stringify(template)).toContain('https://media.example.test/cover.png');
    });
    it('presents institution program counts and program ownership distinctly', () => {
        const template = educationDirectoryTemplate({ listings: [
            { kind: 'institution', title: 'College', city: 'City', path: '/college/', programCount: 42 },
            { kind: 'program', title: 'Engineering', path: '/college/engineering/', institutionTitle: 'College', degree: 'Bachelor' },
        ] });
        const json = JSON.stringify(template);
        expect(json).toContain('42 programs');
        expect(json).toContain('View institution & programs');
        expect(json).toContain('directory-owner');
        expect(json).toContain('View program');
    });
    it('is available in the builder and expands to editable independent components', () => {
        const template = getSectionTemplate('EducationDirectory');
        expect(template).not.toBeNull();
        const first = expandTemplate(template!);
        const second = expandTemplate(template!);
        expect(first.id).not.toEqual(second.id);
        expect(first.children.length).toBeGreaterThan(2);
        expect(JSON.stringify(first)).toContain('Repeater');
    });

    it('keeps imported Liquid-looking text literal', () => {
        expect(directoryLiteral('{{ system.env }} {% for x in records %}')).not.toContain('{{');
        expect(directoryLiteral('{{ system.env }} {% for x in records %}')).not.toContain('{%');
        expect(directoryLiteral('Ordinary title')).toBe('Ordinary title');
    });

    it('rejects remote, protocol-relative and traversing listing links', () => {
        for (const path of ['https://evil.test/', '//evil.test/', '/a/../b/', '/a/%2e%2e/b/', '/a/%0a/b/', '/a?x=1', '/a\\b']) {
            expect(() => educationDirectoryTemplate({ listings: [{ title: 'Example', kind: 'program', path }] })).toThrow();
        }
    });

    it('includes only supported contact destinations', () => {
        const valid = JSON.stringify(educationDirectoryTemplate({ whatsappUrl: 'https://wa.me/96550775711', email: 'counselor@studygram.me' }));
        expect(valid).toContain('mailto:counselor@studygram.me');
        expect(valid).toContain('https://wa.me/96550775711');
        const invalid = JSON.stringify(educationDirectoryTemplate({ whatsappUrl: 'javascript:alert(1)', email: 'a@example.com?body=bad' }));
        expect(invalid).not.toContain('javascript:');
        expect(invalid).not.toContain('?body=bad');
    });
});
