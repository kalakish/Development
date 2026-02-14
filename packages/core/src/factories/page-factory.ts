import { Session } from '../session';
import { NovaPage } from '@nova/ui/page';
import { PageRenderer } from '@nova/ui/renderer';

export class PageFactory {
    private session: Session;
    private renderer: PageRenderer;

    constructor(session: Session) {
        this.session = session;
        this.renderer = new PageRenderer();
    }

    async createPage(pageId: number, recordId?: string): Promise<NovaPage> {
        // Load page metadata
        const metadata = await this.session.application.getMetadataManager()
            .getObject('Page', pageId);

        if (!metadata) {
            throw new Error(`Page not found: ${pageId}`);
        }

        // Create page instance based on page type
        const PageClass = this.getPageClass(metadata);
        const page = new PageClass(metadata, this.session);

        await page.initialize();
        
        if (recordId) {
            await page.open(recordId);
        }

        return page;
    }

    async renderPage(page: NovaPage, containerId: string): Promise<void> {
        await this.renderer.renderPage(page, containerId);
    }

    private getPageClass(metadata: any): any {
        // This would dynamically load the page class based on metadata
        // For now, return a base class
        return NovaPage;
    }

    async createListPage(tableName: string, filter?: string): Promise<NovaPage> {
        // Create a dynamic list page for any table
        const metadata = {
            id: 0,
            name: `DynamicList_${tableName}`,
            pageType: 'List',
            sourceTable: tableName,
            layout: {
                areas: [{
                    type: 'Content',
                    groups: [{
                        name: 'Records',
                        fields: [] // This would be populated with table fields
                    }]
                }]
            },
            actions: [],
            triggers: [],
            properties: {}
        };

        const PageClass = this.getPageClass(metadata);
        const page = new PageClass(metadata, this.session);

        await page.initialize();
        return page;
    }

    async createCardPage(tableName: string, recordId?: string): Promise<NovaPage> {
        // Create a dynamic card page for any table
        const metadata = {
            id: 0,
            name: `DynamicCard_${tableName}`,
            pageType: 'Card',
            sourceTable: tableName,
            layout: {
                areas: [{
                    type: 'Content',
                    groups: [{
                        name: 'General',
                        fields: [] // This would be populated with table fields
                    }]
                }]
            },
            actions: [],
            triggers: [],
            properties: {}
        };

        const PageClass = this.getPageClass(metadata);
        const page = new PageClass(metadata, this.session);

        await page.initialize();
        
        if (recordId) {
            await page.open(recordId);
        }

        return page;
    }
}