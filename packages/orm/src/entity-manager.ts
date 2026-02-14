import { Session } from '@nova/core/session';
import { Record } from './record';
import { DataMapper } from './data-mapper';
import { Query } from './query';
import { Repository } from './repository';

export class EntityManager {
    private session: Session;
    private mapper: DataMapper;
    private repositories: Map<string, Repository<any>> = new Map();
    private identityMap: Map<string, Map<string, any>> = new Map();

    constructor(session: Session) {
        this.session = session;
        this.mapper = new DataMapper(session);
    }

    // ============ Repository Management ============

    getRepository<TEntity>(entityClass: new () => TEntity, tableName: string): Repository<TEntity> {
        const key = tableName;

        if (!this.repositories.has(key)) {
            const repository = new Repository<TEntity>(entityClass, tableName, this);
            this.repositories.set(key, repository);
        }

        return this.repositories.get(key) as Repository<TEntity>;
    }

    // ============ Entity Operations ============

    async find<TEntity>(
        entityClass: new () => TEntity,
        tableName: string,
        id: string
    ): Promise<TEntity | null> {
        // Check identity map
        const identityKey = this.getIdentityKey(tableName, id);
        const cached = this.getFromIdentityMap(identityKey);
        if (cached) {
            return cached as TEntity;
        }

        // Load from database
        const record = this.session.createRecord(tableName);
        await record.find(id);

        if (record.isEmpty()) {
            return null;
        }

        // Map to entity
        const entity = await this.mapper.mapToEntity<TEntity>(record);

        // Store in identity map
        this.addToIdentityMap(identityKey, entity);

        return entity;
    }

    async findAll<TEntity>(
        entityClass: new () => TEntity,
        tableName: string,
        filter?: string
    ): Promise<TEntity[]> {
        const record = this.session.createRecord(tableName);
        
        if (filter) {
            record.setFilter(filter);
        }

        const records = await record.findSet();
        return this.mapper.mapCollectionToEntities<TEntity>(records);
    }

    async persist<TEntity>(entity: TEntity, tableName: string): Promise<void> {
        await this.mapper.saveEntity(entity, tableName);
        
        // Update identity map
        const id = (entity as any).SystemId;
        if (id) {
            const identityKey = this.getIdentityKey(tableName, id);
            this.addToIdentityMap(identityKey, entity);
        }
    }

    async persistAll<TEntity>(entities: TEntity[], tableName: string): Promise<void> {
        for (const entity of entities) {
            await this.persist(entity, tableName);
        }
    }

    async remove<TEntity>(entity: TEntity, tableName: string): Promise<void> {
        await this.mapper.deleteEntity(entity, tableName);

        // Remove from identity map
        const id = (entity as any).SystemId;
        if (id) {
            const identityKey = this.getIdentityKey(tableName, id);
            this.removeFromIdentityMap(identityKey);
        }
    }

    async removeAll<TEntity>(entities: TEntity[], tableName: string): Promise<void> {
        for (const entity of entities) {
            await this.remove(entity, tableName);
        }
    }

    // ============ Query Operations ============

    createQuery<T = any>(queryName: string): Query<T> {
        // Load query metadata and create query instance
        throw new Error('Not implemented');
    }

    async executeQuery<T = any>(sql: string, params?: any[]): Promise<T[]> {
        const connection = await this.session.company.getConnection();
        const result = await connection.query(sql, params);
        return result.recordset;
    }

    // ============ Identity Map ============

    private getIdentityKey(tableName: string, id: string): string {
        return `${tableName}:${id}`;
    }

    private getFromIdentityMap(key: string): any | undefined {
        const [tableName] = key.split(':');
        const tableMap = this.identityMap.get(tableName);
        return tableMap?.get(key);
    }

    private addToIdentityMap(key: string, entity: any): void {
        const [tableName] = key.split(':');
        
        if (!this.identityMap.has(tableName)) {
            this.identityMap.set(tableName, new Map());
        }

        this.identityMap.get(tableName)!.set(key, entity);
    }

    private removeFromIdentityMap(key: string): void {
        const [tableName] = key.split(':');
        const tableMap = this.identityMap.get(tableName);
        tableMap?.delete(key);
    }

    clearIdentityMap(): void {
        this.identityMap.clear();
    }

    clearIdentityMapForTable(tableName: string): void {
        this.identityMap.delete(tableName);
    }

    // ============ Transaction Management ============

    async beginTransaction(): Promise<void> {
        await this.session.beginTransaction();
    }

    async commitTransaction(): Promise<void> {
        await this.session.commitTransaction();
    }

    async rollbackTransaction(): Promise<void> {
        await this.session.rollbackTransaction();
    }

    // ============ Session Access ============

    getSession(): Session {
        return this.session;
    }

    getDataMapper(): DataMapper {
        return this.mapper;
    }

    // ============ Cache Management ============

    async refresh<TEntity>(entity: TEntity, tableName: string): Promise<void> {
        const id = (entity as any).SystemId;
        if (!id) return;

        const record = this.session.createRecord(tableName);
        await record.find(id);

        if (!record.isEmpty()) {
            const refreshed = await this.mapper.mapToEntity<TEntity>(record);
            Object.assign(entity, refreshed);
        }
    }

    async detach<TEntity>(entity: TEntity, tableName: string): Promise<void> {
        const id = (entity as any).SystemId;
        if (id) {
            const identityKey = this.getIdentityKey(tableName, id);
            this.removeFromIdentityMap(identityKey);
        }
    }

    async attach<TEntity>(entity: TEntity, tableName: string): Promise<void> {
        const id = (entity as any).SystemId;
        if (id) {
            const identityKey = this.getIdentityKey(tableName, id);
            this.addToIdentityMap(identityKey, entity);
        }
    }
}