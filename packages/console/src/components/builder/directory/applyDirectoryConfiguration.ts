import { directoryConfigurationSchema, type DirectoryConfiguration } from '@frontbase/edge-core/directory/configuration';
import type { Page } from '@/types/builder';
import { educationDirectoryTemplate } from '../templates/pages/educationDirectoryTemplate';
import { expandTemplate } from '../templates';

/** Apply appearance only; record/query execution must be compiled at the server boundary. */
export function applyDirectoryConfiguration(page: Page, value: DirectoryConfiguration): Page['layoutData'] {
    const config = directoryConfigurationSchema.parse(value);
    const section = expandTemplate(educationDirectoryTemplate({ brand: config.site.name || 'Study directory', destination: config.site.destination || 'your next destination',
        email: config.contacts.email, whatsappUrl: config.contacts.whatsapp, directoryPath: config.routes.directory || '/explore/' }));
    const old = page.layoutData || { root: {}, content: [] };
    let replaced = false;
    const content = old.content.map(component => {
        if (!replaced && (component.props?.templateId === 'education-directory' || component.props?.className === 'education-directory')) { replaced = true; return section; }
        return component;
    });
    if (!replaced) content.push(section);
    return { root: { ...old.root, directoryConfiguration: config }, content };
}
