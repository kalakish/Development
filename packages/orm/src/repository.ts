import { EntityManager } from './entity-manager';
import { Query } from './query';
import { FilterBuilder } from './filter';
import { PaginatedResult } from './query';

export class Repository<TEntity> {
    private entityClass: new () => TEntity;
    private tableName: string;
    private entityManager: EntityManager;

    constructor(
        entityClass: new () => TEntity,
        tableName: string,
        entityManager: EntityManager
    ) {
        this.entityClass = entityClass;
        this.tableName = tableName;
        this.entityManager = entityManager;
    }

    // ============ Basic CRUD ============

    async find(id: string): Promise<TEntity | null> {
        return this.entityManager.find(this.entityClass, this.tableName, id);
    }

    async findAll(filter?: string): Promise<TEntity[]> {
        return this.entityManager.findAll(this.entityClass, this.tableName, filter);
    }

    async save(entity: TEntity): Promise<TEntity> {
        await this.entityManager.persist(entity, this.tableName);
        return entity;
    }

    async saveAll(entities: TEntity[]): Promise<TEntity[]> {
        await this.entityManager.persistAll(entities, this.tableName);
        return entities;
    }

    async delete(entity: TEntity): Promise<void> {
        await this.entityManager.remove(entity, this.tableName);
    }

    async deleteAll(entities: TEntity[]): Promise<void> {
        await this.entityManager.removeAll(entities, this.tableName);
    }

    async deleteById(id: string): Promise<void> {
        const entity = await this.find(id);
        if (entity) {
            await this.delete(entity);
        }
    }

    // ============ Query Methods ============

    async findOne(filter: string | FilterBuilder): Promise<TEntity | null> {
        const filterString = this.resolveFilter(filter);
        const results = await this.findAll(filterString);
        return results.length > 0 ? results[0] : null;
    }

    async findMany(filter: string | FilterBuilder): Promise<TEntity[]> {
        const filterString = this.resolveFilter(filter);
        return this.findAll(filterString);
    }

    async count(filter?: string | FilterBuilder): Promise<number> {
        const filterString = filter ? this.resolveFilter(filter) : '';
        
        const query = `
            SELECT COUNT(*) AS Count 
            FROM [${this.tableName}] 
            WHERE [SystemDeletedAt] IS NULL
            ${filterString ? ` AND ${filterString}` : ''}
        `;

        const connection = await this.entityManager.getSession()
            .company.getConnection();
        
        const result = await connection.query(query);
        return result.recordset[0].Count;
    }

    async exists(id: string): Promise<boolean> {
        const count = await this.count(`[SystemId] = '${id}'`);
        return count > 0;
    }

    // ============ Pagination ============

    async paginate(
        page: number = 1,
        pageSize: number = 50,
        filter?: string | FilterBuilder,
        orderBy?: string
    ): Promise<PaginatedResult<TEntity>> {
        const filterString = filter ? this.resolveFilter(filter) : '';
        
        const offset = (page - 1) * pageSize;
        const orderByClause = orderBy ? `ORDER BY ${orderBy}` : 'ORDER BY [SystemCreatedAt] DESC';

        // Get total count
        const total = await this.count(filter);

        // Get paginated data
        const query = `
            SELECT *
            FROM [${this.tableName}]
            WHERE [SystemDeletedAt] IS NULL
            ${filterString ? ` AND ${filterString}` : ''}
            ${orderByClause}
            OFFSET ${offset} ROWS
            FETCH NEXT ${pageSize} ROWS ONLY
        `;

        const connection = await this.entityManager.getSession()
            .company.getConnection();
        
        const result = await connection.query(query);
        
        const data = await this.entityManager.getDataMapper()
            .mapCollectionToEntities<TEntity>(result.recordset.map(row => {
                const record = this.entityManager.getSession().createRecord(this.tableName);
                record['data'] = row;
                return record;
            }));

        return {
            data,
            total,
            page,
            pageSize,
            totalPages: Math.ceil(total / pageSize),
            hasNext: page < Math.ceil(total / pageSize),
            hasPrevious: page > 1
        };
    }

    // ============ Bulk Operations ============

    async bulkInsert(entities: TEntity[]): Promise<TEntity[]> {
        const records: any[] = [];

        for (const entity of entities) {
            const record = await this.entityManager.getDataMapper()
                .mapToRecord(entity, this.tableName);
            records.push(record.getData());
        }

        // Execute bulk insert
        const connection = await this.entityManager.getSession()
            .company.getConnection();

        const queryBuilder = new (require('./database/sqlserver-query-builder').SQLServerQueryBuilder)(
            this.tableName
        );

        const query = queryBuilder.buildInsertBulk(records);
        await connection.query(query.sql, query.params);

        return entities;
    }

    async bulkUpdate(entities: TEntity[], fields?: string[]): Promise<TEntity[]> {
        for (const entity of entities) {
            await this.save(entity);
        }
        return entities;
    }

    async bulkDelete(ids: string[]): Promise<void> {
        for (const id of ids) {
            await this.deleteById(id);
        }
    }

    // ============ Query Builder ============

    createQuery(): Query<TEntity> {
        // This would create a query instance for complex queries
        throw new Error('Not implemented');
    }

    // ============ Filter Builder ============

    createFilter(): FilterBuilder {
        return FilterBuilder.create();
    }

    private resolveFilter(filter: string | FilterBuilder): string {
        if (typeof filter === 'string') {
            return filter;
        }
        return filter.build().toString();
    }

    // ============ Statistics ============

    async getStats(): Promise<TableStatistics> {
        const connection = await this.entityManager.getSession()
            .company.getConnection();

        const result = await connection.query(`
            SELECT 
                COUNT(*) AS TotalRecords,
                COUNT(CASE WHEN [SystemDeletedAt] IS NOT NULL THEN 1 END) AS DeletedRecords,
                MIN([SystemCreatedAt]) AS OldestRecord,
                MAX([SystemCreatedAt]) AS NewestRecord
            FROM [${this.tableName}]
        `);

        return result.recordset[0];
    }

    // ============ Entity Manager Access ============

    getEntityManager(): EntityManager {
        return this.entityManager;
    }

    getTableName(): string {
        return this.tableName;
    }

    getEntityClass(): new () => TEntity {
        return this.entityClass;
    }
}

export interface TableStatistics {
    TotalRecords: number;
    DeletedRecords: number;
    OldestRecord: Date;
    NewestRecord: Date;
}