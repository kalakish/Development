import { EventEmitter } from 'events';
import { Record } from '../record';

export interface ORMEvent {
    timestamp: Date;
    [key: string]: any;
}

export interface QueryEvent extends ORMEvent {
    query: string;
    params?: any[];
    duration: number;
    rowCount?: number;
}

export interface EntityEvent extends ORMEvent {
    entity: string;
    id?: string;
    data?: any;
}

export interface TransactionEvent extends ORMEvent {
    isolationLevel?: string;
}

export class ORMEvents extends EventEmitter {
    private static instance: ORMEvents;
    private eventHistory: ORMEvent[] = [];
    private maxHistorySize: number = 1000;

    constructor() {
        super();
        this.setupEventListeners();
    }

    static getInstance(): ORMEvents {
        if (!ORMEvents.instance) {
            ORMEvents.instance = new ORMEvents();
        }
        return ORMEvents.instance;
    }

    private setupEventListeners(): void {
        // Query events
        this.on('query:before', this.handleQueryBefore.bind(this));
        this.on('query:after', this.handleQueryAfter.bind(this));
        this.on('query:error', this.handleQueryError.bind(this));

        // Entity events
        this.on('entity:beforeInsert', this.handleEntityBeforeInsert.bind(this));
        this.on('entity:afterInsert', this.handleEntityAfterInsert.bind(this));
        this.on('entity:beforeUpdate', this.handleEntityBeforeUpdate.bind(this));
        this.on('entity:afterUpdate', this.handleEntityAfterUpdate.bind(this));
        this.on('entity:beforeDelete', this.handleEntityBeforeDelete.bind(this));
        this.on('entity:afterDelete', this.handleEntityAfterDelete.bind(this));

        // Transaction events
        this.on('transaction:begin', this.handleTransactionBegin.bind(this));
        this.on('transaction:commit', this.handleTransactionCommit.bind(this));
        this.on('transaction:rollback', this.handleTransactionRollback.bind(this));

        // Connection events
        this.on('connection:acquired', this.handleConnectionAcquired.bind(this));
        this.on('connection:released', this.handleConnectionReleased.bind(this));
    }

    // ============ Query Events ============

    async emitQueryBefore(query: string, params?: any[]): Promise<void> {
        const event: QueryEvent = {
            query,
            params,
            duration: 0,
            timestamp: new Date()
        };
        this.emit('query:before', event);
    }

    async emitQueryAfter(query: string, params: any[] | undefined, duration: number, rowCount?: number): Promise<void> {
        const event: QueryEvent = {
            query,
            params,
            duration,
            rowCount,
            timestamp: new Date()
        };
        this.emit('query:after', event);
        this.addToHistory(event);
    }

    async emitQueryFailed(query: string, params: any[] | undefined, error: string): Promise<void> {
        const event = {
            query,
            params,
            error,
            timestamp: new Date()
        };
        this.emit('query:error', event);
        this.addToHistory(event);
    }

    // ============ Entity Events ============

    async emitEntityBeforeInsert(entity: string, data: any): Promise<void> {
        this.emit('entity:beforeInsert', { entity, data, timestamp: new Date() });
    }

    async emitEntityAfterInsert(entity: string, id: string, data: any): Promise<void> {
        const event = { entity, id, data, timestamp: new Date() };
        this.emit('entity:afterInsert', event);
        this.addToHistory(event);
    }

    async emitEntityBeforeUpdate(entity: string, id: string, data: any): Promise<void> {
        this.emit('entity:beforeUpdate', { entity, id, data, timestamp: new Date() });
    }

    async emitEntityAfterUpdate(entity: string, id: string, data: any): Promise<void> {
        const event = { entity, id, data, timestamp: new Date() };
        this.emit('entity:afterUpdate', event);
        this.addToHistory(event);
    }

    async emitEntityBeforeDelete(entity: string, id: string): Promise<void> {
        this.emit('entity:beforeDelete', { entity, id, timestamp: new Date() });
    }

    async emitEntityAfterDelete(entity: string, id: string): Promise<void> {
        const event = { entity, id, timestamp: new Date() };
        this.emit('entity:afterDelete', event);
        this.addToHistory(event);
    }

    // ============ Transaction Events ============

    async emitTransactionBegin(isolationLevel?: string): Promise<void> {
        this.emit('transaction:begin', { isolationLevel, timestamp: new Date() });
    }

    async emitTransactionCommit(): Promise<void> {
        const event = { timestamp: new Date() };
        this.emit('transaction:commit', event);
        this.addToHistory(event);
    }

    async emitTransactionRollback(): Promise<void> {
        const event = { timestamp: new Date() };
        this.emit('transaction:rollback', event);
        this.addToHistory(event);
    }

    // ============ Connection Events ============

    async emitConnectionAcquired(connectionId: string): Promise<void> {
        this.emit('connection:acquired', { connectionId, timestamp: new Date() });
    }

    async emitConnectionReleased(connectionId: string): Promise<void> {
        this.emit('connection:released', { connectionId, timestamp: new Date() });
    }

    // ============ Event Handlers ============

    private handleQueryBefore(event: QueryEvent): void {
        // Can be overridden by subscribers
    }

    private handleQueryAfter(event: QueryEvent): void {
        // Can be overridden by subscribers
    }

    private handleQueryError(event: any): void {
        console.error(`Query failed: ${event.error}`);
    }

    private handleEntityBeforeInsert(event: EntityEvent): void {
        // Can be overridden by subscribers
    }

    private handleEntityAfterInsert(event: EntityEvent): void {
        // Can be overridden by subscribers
    }

    private handleEntityBeforeUpdate(event: EntityEvent): void {
        // Can be overridden by subscribers
    }

    private handleEntityAfterUpdate(event: EntityEvent): void {
        // Can be overridden by subscribers
    }

    private handleEntityBeforeDelete(event: EntityEvent): void {
        // Can be overridden by subscribers
    }

    private handleEntityAfterDelete(event: EntityEvent): void {
        // Can be overridden by subscribers
    }

    private handleTransactionBegin(event: TransactionEvent): void {
        // Can be overridden by subscribers
    }

    private handleTransactionCommit(event: TransactionEvent): void {
        // Can be overridden by subscribers
    }

    private handleTransactionRollback(event: TransactionEvent): void {
        // Can be overridden by subscribers
    }

    private handleConnectionAcquired(event: any): void {
        // Can be overridden by subscribers
    }

    private handleConnectionReleased(event: any): void {
        // Can be overridden by subscribers
    }

    // ============ History Management ============

    private addToHistory(event: ORMEvent): void {
        this.eventHistory.push(event);
        
        if (this.eventHistory.length > this.maxHistorySize) {
            this.eventHistory.shift();
        }
    }

    getEventHistory(limit?: number): ORMEvent[] {
        if (limit) {
            return this.eventHistory.slice(-limit);
        }
        return [...this.eventHistory];
    }

    getEventsByType(type: string, limit?: number): ORMEvent[] {
        const filtered = this.eventHistory.filter(e => e.type === type);
        return limit ? filtered.slice(-limit) : filtered;
    }

    clearHistory(): void {
        this.eventHistory = [];
    }

    setMaxHistorySize(size: number): void {
        this.maxHistorySize = size;
    }

    // ============ Subscription Helpers ============

    onQuery(callback: (event: QueryEvent) => void): void {
        this.on('query:after', callback);
    }

    onEntity(callback: (event: EntityEvent) => void): void {
        this.on('entity:afterInsert', callback);
        this.on('entity:afterUpdate', callback);
        this.on('entity:afterDelete', callback);
    }

    onTransaction(callback: (event: TransactionEvent) => void): void {
        this.on('transaction:begin', callback);
        this.on('transaction:commit', callback);
        this.on('transaction:rollback', callback);
    }

    // ============ Metrics ============

    getMetrics(): ORMMetrics {
        const queries = this.eventHistory.filter(e => e.query).length;
        const inserts = this.eventHistory.filter(e => e.entity && e.id).length;
        const updates = this.eventHistory.filter(e => e.entity && e.data).length;
        const deletes = this.eventHistory.filter(e => e.entity && !e.data).length;
        const transactions = this.eventHistory.filter(e => e.type === 'transaction:commit').length;

        return {
            totalQueries: queries,
            totalInserts: inserts,
            totalUpdates: updates,
            totalDeletes: deletes,
            totalTransactions: transactions,
            averageQueryTime: this.calculateAverageQueryTime()
        };
    }

    private calculateAverageQueryTime(): number {
        const queryEvents = this.eventHistory.filter(e => e.duration) as QueryEvent[];
        if (queryEvents.length === 0) return 0;

        const total = queryEvents.reduce((sum, e) => sum + (e.duration || 0), 0);
        return total / queryEvents.length;
    }
}

export interface ORMMetrics {
    totalQueries: number;
    totalInserts: number;
    totalUpdates: number;
    totalDeletes: number;
    totalTransactions: number;
    averageQueryTime: number;
}