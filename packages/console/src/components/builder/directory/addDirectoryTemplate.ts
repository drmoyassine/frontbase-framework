import {addDirectoryTemplate as generate} from '@frontbase/edge-core/directory/starter';
import type {DirectoryQueryBinding} from '@frontbase/edge-core/directory/configuration';
import type {Page} from '@/types/builder';
export function addDirectoryTemplate(page:Page,binding:DirectoryQueryBinding):NonNullable<Page['layoutData']>{return generate(page,binding) as NonNullable<Page['layoutData']>;}
