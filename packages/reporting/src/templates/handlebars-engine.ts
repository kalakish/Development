import Handlebars from 'handlebars';
import { TemplateData } from './template-engine';

export interface HandlebarsHelper {
    name: string;
    fn: Handlebars.HelperDelegate;
}

export interface HandlebarsPartial {
    name: string;
    template: string;
}

export class HandlebarsEngine {
    private handlebars: typeof Handlebars;

    constructor() {
        this.handlebars = Handlebars.create();
        this.registerDefaultHelpers();
    }

    // ============ Compilation ============

    compile(template: string): HandlebarsTemplateDelegate {
        return this.handlebars.compile(template);
    }

    compileAST(template: string): HandlebarsTemplateDelegate {
        const ast = this.handlebars.parse(template);
        return this.handlebars.compileAST(ast);
    }

    // ============ Rendering ============

    render(template: HandlebarsTemplateDelegate, data: TemplateData): string {
        return template(data);
    }

    renderString(template: string, data: TemplateData): string {
        const compiled = this.compile(template);
        return compiled(data);
    }

    // ============ Register Helpers ============

    registerHelper(name: string, fn: Handlebars.HelperDelegate): void {
        this.handlebars.registerHelper(name, fn);
    }

    registerHelpers(helpers: HandlebarsHelper[]): void {
        helpers.forEach(helper => {
            this.registerHelper(helper.name, helper.fn);
        });
    }

    unregisterHelper(name: string): void {
        this.handlebars.unregisterHelper(name);
    }

    private registerDefaultHelpers(): void {
        // Math helpers
        this.registerHelper('add', (a: number, b: number) => a + b);
        this.registerHelper('subtract', (a: number, b: number) => a - b);
        this.registerHelper('multiply', (a: number, b: number) => a * b);
        this.registerHelper('divide', (a: number, b: number) => a / b);
        this.registerHelper('mod', (a: number, b: number) => a % b);
        this.registerHelper('round', (value: number) => Math.round(value));
        this.registerHelper('ceil', (value: number) => Math.ceil(value));
        this.registerHelper('floor', (value: number) => Math.floor(value));
        this.registerHelper('abs', (value: number) => Math.abs(value));

        // String helpers
        this.registerHelper('uppercase', (str: string) => String(str).toUpperCase());
        this.registerHelper('lowercase', (str: string) => String(str).toLowerCase());
        this.registerHelper('capitalize', (str: string) => {
            return String(str).charAt(0).toUpperCase() + String(str).slice(1).toLowerCase();
        });
        this.registerHelper('truncate', (str: string, length: number) => {
            if (str.length <= length) return str;
            return str.substring(0, length - 3) + '...';
        });
        this.registerHelper('replace', (str: string, find: string, replace: string) => {
            return String(str).replace(new RegExp(find, 'g'), replace);
        });

        // Array helpers
        this.registerHelper('first', (array: any[]) => array[0]);
        this.registerHelper('last', (array: any[]) => array[array.length - 1]);
        this.registerHelper('join', (array: any[], separator: string = ', ') => array.join(separator));
        this.registerHelper('sort', (array: any[]) => [...array].sort());
        this.registerHelper('reverse', (array: any[]) => [...array].reverse());
        this.registerHelper('slice', (array: any[], start: number, end?: number) => array.slice(start, end));
        this.registerHelper('length', (array: any[]) => array.length);

        // Comparison helpers
        this.registerHelper('eq', (a: any, b: any) => a === b);
        this.registerHelper('neq', (a: any, b: any) => a !== b);
        this.registerHelper('gt', (a: any, b: any) => a > b);
        this.registerHelper('gte', (a: any, b: any) => a >= b);
        this.registerHelper('lt', (a: any, b: any) => a < b);
        this.registerHelper('lte', (a: any, b: any) => a <= b);
        this.registerHelper('and', (...args: any[]) => {
            const conditions = args.slice(0, -1);
            return conditions.every(Boolean);
        });
        this.registerHelper('or', (...args: any[]) => {
            const conditions = args.slice(0, -1);
            return conditions.some(Boolean);
        });
        this.registerHelper('not', (value: any) => !value);
        this.registerHelper('typeof', (value: any) => typeof value);
        this.registerHelper('instanceof', (value: any, type: string) => {
            return value instanceof global[type as keyof typeof global];
        });

        // Date helpers
        this.registerHelper('date', (date: Date, format: string) => {
            if (!date) return '';
            const d = new Date(date);
            
            const formats: Record<string, string> = {
                'YYYY-MM-DD': d.toISOString().split('T')[0],
                'MM/DD/YYYY': `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`,
                'DD/MM/YYYY': `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`,
                'YYYY-MM-DD HH:mm:ss': d.toISOString().replace('T', ' ').replace('Z', ''),
                'timestamp': d.getTime().toString()
            };

            return formats[format] || d.toLocaleString();
        });

        this.registerHelper('now', (format?: string) => {
            const now = new Date();
            return format ? Handlebars.helpers.date(now, format) : now.toISOString();
        });

        this.registerHelper('dateAdd', (date: Date, days: number) => {
            const d = new Date(date);
            d.setDate(d.getDate() + days);
            return d;
        });

        // Number formatting
        this.registerHelper('formatNumber', (value: number, decimals: number = 0) => {
            return value.toFixed(decimals).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
        });

        this.registerHelper('formatCurrency', (value: number, currency: string = 'USD') => {
            return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(value);
        });

        this.registerHelper('formatPercent', (value: number, decimals: number = 2) => {
            return `${(value * 100).toFixed(decimals)}%`;
        });

        // JSON helpers
        this.registerHelper('json', (value: any, indent: number = 2) => {
            return JSON.stringify(value, null, indent);
        });

        this.registerHelper('parseJSON', (json: string) => {
            try {
                return JSON.parse(json);
            } catch {
                return null;
            }
        });

        // Conditional helpers
        this.registerHelper('switch', function(value: any, options: any) {
            this._switch_value = value;
            const result = options.fn(this);
            delete this._switch_value;
            return result;
        });

        this.registerHelper('case', function(value: any, options: any) {
            if (value === this._switch_value) {
                return options.fn(this);
            }
        });

        this.registerHelper('default', function(options: any) {
            return options.fn(this);
        });

        // Loop helpers
        this.registerHelper('times', function(n: number, block: any) {
            let accum = '';
            for (let i = 0; i < n; i++) {
                accum += block.fn(i);
            }
            return accum;
        });

        this.registerHelper('range', function(start: number, end: number, block: any) {
            let accum = '';
            for (let i = start; i <= end; i++) {
                accum += block.fn(i);
            }
            return accum;
        });

        this.registerHelper('groupBy', function(array: any[], property: string, options: any) {
            const groups: Record<string, any[]> = {};
            
            array.forEach(item => {
                const key = item[property];
                if (!groups[key]) groups[key] = [];
                groups[key].push(item);
            });

            const result = Object.keys(groups).map(key => ({
                key,
                items: groups[key]
            }));

            return options.fn(result);
        });

        // Debug helpers
        this.registerHelper('log', (value: any) => {
            console.log('[Handlebars Debug]:', value);
            return '';
        });

        this.registerHelper('inspect', (value: any) => {
            return JSON.stringify(value, null, 2);
        });

        // URL helpers
        this.registerHelper('encodeURI', (str: string) => encodeURI(str));
        this.registerHelper('encodeURIComponent', (str: string) => encodeURIComponent(str));
        this.registerHelper('decodeURI', (str: string) => decodeURI(str));
        this.registerHelper('decodeURIComponent', (str: string) => decodeURIComponent(str));

        // Color helpers
        this.registerHelper('rgb', (r: number, g: number, b: number) => `rgb(${r}, ${g}, ${b})`);
        this.registerHelper('rgba', (r: number, g: number, b: number, a: number) => `rgba(${r}, ${g}, ${b}, ${a})`);
        this.registerHelper('hex', (value: string) => {
            // Convert color name to hex
            const ctx = document?.createElement('canvas').getContext('2d');
            if (ctx) {
                ctx.fillStyle = value;
                return ctx.fillStyle;
            }
            return value;
        });
    }

    // ============ Register Partials ============

    registerPartial(name: string, template: string): void {
        this.handlebars.registerPartial(name, template);
    }

    registerPartials(partials: HandlebarsPartial[]): void {
        partials.forEach(partial => {
            this.registerPartial(partial.name, partial.template);
        });
    }

    unregisterPartial(name: string): void {
        this.handlebars.unregisterPartial(name);
    }

    // ============ Register Decorators ============

    registerDecorator(name: string, fn: Handlebars.DecoratorDelegate): void {
        this.handlebars.registerDecorator(name, fn);
    }

    unregisterDecorator(name: string): void {
        this.handlebars.unregisterDecorator(name);
    }

    // ============ AST Helpers ============

    parse(template: string): hbs.AST.Program {
        return this.handlebars.parse(template);
    }

    printAST(ast: hbs.AST.Program): string {
        return this.handlebars.print(ast);
    }

    // ============ Configuration ============

    setCompilerFlags(flags: {
        preventIndent?: boolean;
        ignoreStandalone?: boolean;
        explicitPartialContext?: boolean;
    }): void {
        this.handlebars.Compiler.prototype.compilerFlags = flags;
    }

    setLogger(logger: (level: string, ...args: any[]) => void): void {
        this.handlebars.logger = logger;
    }

    // ============ Safe String ============

    safeString(str: string): Handlebars.SafeString {
        return new this.handlebars.SafeString(str);
    }

    escapeExpression(str: string): string {
        return this.handlebars.escapeExpression(str);
    }

    // ============ Utils ============

    createFrame(data: any): any {
        return this.handlebars.createFrame(data);
    }

    Exception = this.handlebars.Exception;
    Visitor = this.handlebars.Visitor;
}