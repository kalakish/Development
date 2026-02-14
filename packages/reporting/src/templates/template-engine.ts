import { EventEmitter } from 'events';
import { HandlebarsEngine } from './handlebars-engine';

export interface Template {
    id: string;
    name: string;
    description?: string;
    content: string;
    engine: 'handlebars' | 'ejs' | 'pug' | 'custom';
    variables?: TemplateVariable[];
    createdAt: Date;
    updatedAt: Date;
}

export interface TemplateVariable {
    name: string;
    type: 'string' | 'number' | 'boolean' | 'date' | 'array' | 'object';
    required?: boolean;
    defaultValue?: any;
    description?: string;
}

export interface TemplateData {
    [key: string]: any;
}

export interface RenderOptions {
    engine?: 'handlebars' | 'ejs' | 'pug';
    partials?: Record<string, string>;
    helpers?: Record<string, Function>;
    cache?: boolean;
    minify?: boolean;
}

export class TemplateEngine extends EventEmitter {
    private handlebars: HandlebarsEngine;
    private templates: Map<string, Template> = new Map();
    private compiledTemplates: Map<string, Function> = new Map();
    private cacheEnabled: boolean = true;

    constructor() {
        super();
        this.handlebars = new HandlebarsEngine();
    }

    // ============ Template Management ============

    async registerTemplate(template: Omit<Template, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
        const id = this.generateTemplateId();
        
        const newTemplate: Template = {
            id,
            ...template,
            createdAt: new Date(),
            updatedAt: new Date()
        };

        this.templates.set(id, newTemplate);
        
        // Pre-compile if caching is enabled
        if (this.cacheEnabled) {
            await this.compileTemplate(id);
        }

        this.emit('templateRegistered', { id, name: template.name });
        
        return id;
    }

    async updateTemplate(id: string, updates: Partial<Template>): Promise<void> {
        const template = this.templates.get(id);
        
        if (!template) {
            throw new Error(`Template not found: ${id}`);
        }

        Object.assign(template, updates, {
            updatedAt: new Date()
        });

        // Re-compile if cached
        if (this.cacheEnabled) {
            this.compiledTemplates.delete(id);
            await this.compileTemplate(id);
        }

        this.emit('templateUpdated', { id, name: template.name });
    }

    async deleteTemplate(id: string): Promise<void> {
        this.templates.delete(id);
        this.compiledTemplates.delete(id);
        this.emit('templateDeleted', { id });
    }

    getTemplate(id: string): Template | undefined {
        return this.templates.get(id);
    }

    getTemplates(): Template[] {
        return Array.from(this.templates.values());
    }

    // ============ Template Compilation ============

    private async compileTemplate(id: string): Promise<Function> {
        const template = this.templates.get(id);
        
        if (!template) {
            throw new Error(`Template not found: ${id}`);
        }

        let compiled: Function;

        switch (template.engine) {
            case 'handlebars':
                compiled = this.handlebars.compile(template.content);
                break;
            case 'ejs':
                compiled = await this.compileEJS(template.content);
                break;
            case 'pug':
                compiled = await this.compilePug(template.content);
                break;
            default:
                compiled = this.compileCustom(template.content);
        }

        if (this.cacheEnabled) {
            this.compiledTemplates.set(id, compiled);
        }

        return compiled;
    }

    private async compileEJS(content: string): Promise<Function> {
        const ejs = await import('ejs');
        return ejs.compile(content, { async: true });
    }

    private async compilePug(content: string): Promise<Function> {
        const pug = await import('pug');
        return pug.compile(content);
    }

    private compileCustom(content: string): Function {
        // Custom template engine implementation
        return (data: TemplateData) => {
            let result = content;
            
            // Simple variable replacement
            Object.entries(data).forEach(([key, value]) => {
                const regex = new RegExp(`{{\\s*${key}\\s*}}`, 'g');
                result = result.replace(regex, String(value));
            });
            
            return result;
        };
    }

    // ============ Template Rendering ============

    async render(id: string, data: TemplateData, options?: RenderOptions): Promise<string> {
        let template: Template | undefined = this.templates.get(id);
        
        if (!template) {
            throw new Error(`Template not found: ${id}`);
        }

        // Use custom engine if specified in options
        if (options?.engine && options.engine !== template.engine) {
            template = {
                ...template,
                engine: options.engine
            };
        }

        // Get compiled template
        let compiled: Function | undefined = this.compiledTemplates.get(id);
        
        if (!compiled) {
            compiled = await this.compileTemplate(id);
        }

        // Register partials
        if (options?.partials) {
            this.registerPartials(options.partials);
        }

        // Register helpers
        if (options?.helpers) {
            this.registerHelpers(options.helpers);
        }

        // Validate required variables
        this.validateVariables(template, data);

        // Render template
        let output: string;

        switch (template.engine) {
            case 'handlebars':
                output = this.handlebars.render(compiled as HandlebarsTemplateDelegate, data);
                break;
            case 'ejs':
                output = await compiled(data);
                break;
            case 'pug':
                output = compiled(data);
                break;
            default:
                output = compiled(data);
        }

        // Minify HTML if requested
        if (options?.minify) {
            output = await this.minifyHTML(output);
        }

        this.emit('templateRendered', { id, dataSize: JSON.stringify(data).length, outputSize: output.length });

        return output;
    }

    async renderString(templateString: string, data: TemplateData, options?: RenderOptions): Promise<string> {
        const engine = options?.engine || 'handlebars';
        
        switch (engine) {
            case 'handlebars':
                return this.handlebars.renderString(templateString, data);
            case 'ejs':
                const ejs = await import('ejs');
                return ejs.render(templateString, data);
            case 'pug':
                const pug = await import('pug');
                return pug.render(templateString, data);
            default:
                throw new Error(`Unsupported template engine: ${engine}`);
        }
    }

    // ============ Partials and Helpers ============

    registerPartial(name: string, content: string): void {
        this.handlebars.registerPartial(name, content);
    }

    registerPartials(partials: Record<string, string>): void {
        Object.entries(partials).forEach(([name, content]) => {
            this.registerPartial(name, content);
        });
    }

    registerHelper(name: string, helper: Function): void {
        this.handlebars.registerHelper(name, helper);
    }

    registerHelpers(helpers: Record<string, Function>): void {
        Object.entries(helpers).forEach(([name, helper]) => {
            this.registerHelper(name, helper);
        });
    }

    // ============ Validation ============

    private validateVariables(template: Template, data: TemplateData): void {
        if (!template.variables) return;

        const errors: string[] = [];

        template.variables.forEach(variable => {
            if (variable.required && data[variable.name] === undefined) {
                errors.push(`Missing required variable: ${variable.name}`);
            }

            if (data[variable.name] !== undefined) {
                this.validateVariableType(variable, data[variable.name]);
            }
        });

        if (errors.length > 0) {
            throw new Error(`Template validation failed:\n${errors.join('\n')}`);
        }
    }

    private validateVariableType(variable: TemplateVariable, value: any): void {
        const actualType = Array.isArray(value) ? 'array' : typeof value;
        
        if (actualType !== variable.type && variable.type !== 'array' && !Array.isArray(value)) {
            throw new Error(
                `Variable ${variable.name} expected type ${variable.type}, got ${actualType}`
            );
        }
    }

    // ============ Cache Management ============

    enableCache(): void {
        this.cacheEnabled = true;
    }

    disableCache(): void {
        this.cacheEnabled = false;
        this.compiledTemplates.clear();
    }

    clearCache(): void {
        this.compiledTemplates.clear();
        this.emit('cacheCleared');
    }

    // ============ Minification ============

    private async minifyHTML(html: string): Promise<string> {
        const minify = await import('html-minifier-terser');
        
        return minify.minify(html, {
            collapseWhitespace: true,
            removeComments: true,
            removeRedundantAttributes: true,
            removeScriptTypeAttributes: true,
            removeStyleLinkTypeAttributes: true,
            useShortDoctype: true,
            minifyCSS: true,
            minifyJS: true
        });
    }

    // ============ Utility ============

    private generateTemplateId(): string {
        return `tmpl_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    // ============ Export/Import ============

    async exportTemplate(id: string): Promise<string> {
        const template = this.templates.get(id);
        
        if (!template) {
            throw new Error(`Template not found: ${id}`);
        }

        return JSON.stringify(template, null, 2);
    }

    async importTemplate(json: string): Promise<string> {
        const template = JSON.parse(json) as Template;
        
        // Generate new ID to avoid conflicts
        template.id = this.generateTemplateId();
        template.createdAt = new Date();
        template.updatedAt = new Date();

        this.templates.set(template.id, template);
        
        return template.id;
    }
}