import * as fs from 'fs-extra';
import * as path from 'path';
import { ObjectMetadata, ObjectType } from '../models/object-metadata';
import { TableMetadata } from '../models/table-metadata';
import { PageMetadata } from '../models/page-metadata';
import { CodeunitMetadata } from '../models/codeunit-metadata';
import { ReportMetadata } from '../models/report-metadata';
import { XMLPortMetadata } from '../models/xmlport-metadata';
import { QueryMetadata } from '../models/query-metadata';
import { EnumMetadata } from '../models/enum-metadata';

export class FileMetadataLoader {
    private basePath: string;
    private fileExtensions = ['.al', '.json'];

    constructor(basePath: string) {
        this.basePath = basePath;
    }

    async loadAll(): Promise<ObjectMetadata[]> {
        const objects: ObjectMetadata[] = [];

        // Load from AL files
        const alFiles = await this.findFiles('**/*.al');
        for (const file of alFiles) {
            const obj = await this.loadFromALFile(file);
            if (obj) objects.push(obj);
        }

        // Load from JSON files
        const jsonFiles = await this.findFiles('**/*.json');
        for (const file of jsonFiles) {
            const objs = await this.loadFromJSONFile(file);
            objects.push(...objs);
        }

        return objects;
    }

    async loadByType(objectType: ObjectType): Promise<ObjectMetadata[]> {
        const all = await this.loadAll();
        return all.filter(obj => obj.objectType === objectType);
    }

    async loadById(objectType: ObjectType, objectId: number): Promise<ObjectMetadata | null> {
        const all = await this.loadAll();
        return all.find(obj => obj.objectType === objectType && obj.id === objectId) || null;
    }

    async loadByName(objectType: ObjectType, name: string): Promise<ObjectMetadata | null> {
        const all = await this.loadAll();
        return all.find(obj => obj.objectType === objectType && obj.name === name) || null;
    }

    private async loadFromALFile(filePath: string): Promise<ObjectMetadata | null> {
        try {
            const content = await fs.readFile(filePath, 'utf8');
            
            // Parse AL file to extract metadata
            // This is a simplified implementation - you would integrate with the AL parser
            const metadata = this.parseALContent(content);
            
            if (metadata) {
                metadata.definition = content;
                return metadata;
            }
        } catch (error) {
            console.error(`Error loading AL file ${filePath}:`, error);
        }

        return null;
    }

    private parseALContent(content: string): ObjectMetadata | null {
        // This would use the AL parser to extract metadata
        // For now, return null
        return null;
    }

    private async loadFromJSONFile(filePath: string): Promise<ObjectMetadata[]> {
        try {
            const content = await fs.readFile(filePath, 'utf8');
            const data = JSON.parse(content);
            
            if (Array.isArray(data)) {
                return data.map(item => this.parseJSONObject(item));
            } else {
                return [this.parseJSONObject(data)];
            }
        } catch (error) {
            console.error(`Error loading JSON file ${filePath}:`, error);
            return [];
        }
    }

    private parseJSONObject(data: any): ObjectMetadata {
        const base: ObjectMetadata = {
            id: data.id,
            name: data.name,
            objectType: data.objectType,
            extension: data.extension,
            properties: data.properties || {},
            definition: data.definition,
            version: data.version || 1
        };

        switch (data.objectType) {
            case ObjectType.Table:
                return {
                    ...base,
                    objectType: ObjectType.Table,
                    fields: data.fields || [],
                    keys: data.keys || [],
                    triggers: data.triggers || [],
                    dataPerCompany: data.dataPerCompany ?? true,
                    extensible: data.extensible ?? false
                } as TableMetadata;

            case ObjectType.Page:
                return {
                    ...base,
                    objectType: ObjectType.Page,
                    pageType: data.pageType || 'Card',
                    sourceTable: data.sourceTable,
                    layout: data.layout || { areas: [] },
                    actions: data.actions || [],
                    triggers: data.triggers || [],
                    editable: data.editable ?? true
                } as PageMetadata;

            default:
                return base;
        }
    }

    private async findFiles(pattern: string): Promise<string[]> {
        const { glob } = require('glob');
        return glob(pattern, { 
            cwd: this.basePath,
            absolute: true,
            ignore: ['**/node_modules/**', '**/dist/**']
        });
    }

    async saveToFile(metadata: ObjectMetadata, filePath: string): Promise<void> {
        const content = metadata.definition || JSON.stringify(metadata, null, 2);
        await fs.ensureDir(path.dirname(filePath));
        await fs.writeFile(filePath, content);
    }

    async deleteFile(filePath: string): Promise<void> {
        if (await fs.pathExists(filePath)) {
            await fs.remove(filePath);
        }
    }

    getBasePath(): string {
        return this.basePath;
    }
}