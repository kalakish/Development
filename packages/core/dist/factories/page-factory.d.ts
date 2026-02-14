import { Session } from '../session';
import { NovaPage } from '@nova/ui/page';
export declare class PageFactory {
    private session;
    private renderer;
    constructor(session: Session);
    createPage(pageId: number, recordId?: string): Promise<NovaPage>;
    renderPage(page: NovaPage, containerId: string): Promise<void>;
    private getPageClass;
    createListPage(tableName: string, filter?: string): Promise<NovaPage>;
    createCardPage(tableName: string, recordId?: string): Promise<NovaPage>;
}
//# sourceMappingURL=page-factory.d.ts.map