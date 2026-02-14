"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PageFactory = void 0;
const page_1 = require("@nova/ui/page");
const renderer_1 = require("@nova/ui/renderer");
class PageFactory {
    session;
    renderer;
    constructor(session) {
        this.session = session;
        this.renderer = new renderer_1.PageRenderer();
    }
    async createPage(pageId, recordId) {
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
    async renderPage(page, containerId) {
        await this.renderer.renderPage(page, containerId);
    }
    getPageClass(metadata) {
        // This would dynamically load the page class based on metadata
        // For now, return a base class
        return page_1.NovaPage;
    }
    async createListPage(tableName, filter) {
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
    async createCardPage(tableName, recordId) {
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
exports.PageFactory = PageFactory;
//# sourceMappingURL=page-factory.js.map