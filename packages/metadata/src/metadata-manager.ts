export class MetadataManager {
    private static instance: MetadataManager;
    private metadataCache: Map<string, ObjectMetadata>;
    private metadataRepository: MetadataRepository;

    private constructor() {
        this.metadataCache = new Map();
        this.metadataRepository = new PostgresMetadataRepository();
    }

    static getInstance(): MetadataManager {
        if (!MetadataManager.instance) {
            MetadataManager.instance = new MetadataManager();
        }
        return MetadataManager.instance;
    }

    async getObject(objectType: ObjectType, objectId: number): Promise<ObjectMetadata | null> {
        const cacheKey = `${objectType}:${objectId}`;
        
        // Check cache first
        if (this.metadataCache.has(cacheKey)) {
            return this.metadataCache.get(cacheKey)!;
        }
        
        // Load from repository
        const metadata = await this.metadataRepository.load(objectType, objectId);
        
        if (metadata) {
            this.metadataCache.set(cacheKey, metadata);
        }
        
        return metadata;
    }

    async saveObject(metadata: ObjectMetadata): Promise<void> {
        await this.metadataRepository.save(metadata);
        
        const cacheKey = `${metadata.objectType}:${metadata.id}`;
        this.metadataCache.set(cacheKey, metadata);
    }

    async compileObject(definition: string): Promise<ObjectMetadata> {
        const compiler = new ObjectCompiler();
        const metadata = await compiler.compile(definition);
        
        // Validate metadata
        await this.validateMetadata(metadata);
        
        // Generate database schema if table
        if (metadata.objectType === ObjectType.Table) {
            await this.generateSchema(metadata);
        }
        
        return metadata;
    }

    private async validateMetadata(metadata: ObjectMetadata): Promise<void> {
        const validator = new MetadataValidator();
        await validator.validate(metadata);
    }

    private async generateSchema(metadata: ObjectMetadata): Promise<void> {
        const schemaGenerator = new SchemaGenerator();
        await schemaGenerator.generate(metadata);
    }
}

export interface ObjectMetadata {
    id: number;
    name: string;
    objectType: ObjectType;
    extension?: string;
    properties: Record<string, any>;
    fields?: FieldMetadata[];
    triggers?: TriggerMetadata[];
    permissions?: PermissionMetadata[];
    customProperties?: Map<string, any>;
    createdAt: Date;
    modifiedAt: Date;
    version: number;
}

export class ObjectCompiler {
    async compile(definition: string): Promise<ObjectMetadata> {
        // Parse object definition
        const parser = new ObjectParser();
        const ast = parser.parse(definition);
        
        // Generate metadata
        const generator = new MetadataGenerator();
        const metadata = await generator.generate(ast);
        
        return metadata;
    }
}