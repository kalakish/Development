import { Parser, Builder } from 'xml2js';

export class XMLTransformer {
    private parser: Parser;
    private builder: Builder;

    constructor() {
        this.parser = new Parser({
            explicitArray: false,
            explicitRoot: false,
            mergeAttrs: true,
            trim: true
        });

        this.builder = new Builder({
            rootName: 'root',
            xmldec: { version: '1.0', encoding: 'UTF-8' },
            renderOpts: { pretty: true, indent: '  ' }
        });
    }

    async toJSON(xml: string): Promise<any> {
        return this.parser.parseStringPromise(xml);
    }

    toXML(data: any, rootName?: string): string {
        this.builder.options.rootName = rootName || 'root';
        return this.builder.buildObject(data);
    }

    async transform(xml: string, mapping: Record<string, string>): Promise<any> {
        const json = await this.toJSON(xml);
        return this.mapFields(json, mapping);
    }

    private mapFields(data: any, mapping: Record<string, string>): any {
        if (Array.isArray(data)) {
            return data.map(item => this.mapFields(item, mapping));
        }

        if (data && typeof data === 'object') {
            const result: any = {};
            
            for (const [key, value] of Object.entries(data)) {
                const mappedKey = mapping[key] || key;
                
                if (value && typeof value === 'object') {
                    result[mappedKey] = this.mapFields(value, mapping);
                } else {
                    result[mappedKey] = value;
                }
            }
            
            return result;
        }

        return data;
    }
}