/// <reference types="node" />
import { EventEmitter } from 'events';
import { SQLServerConnection } from '../database/sqlserver-connection';
import { NovaEvent } from './event-dispatcher';
export interface StoredEvent extends NovaEvent {
    id: string;
    streamId: string;
    version: number;
    storedAt: Date;
    metadata: Record<string, any>;
}
export interface EventStream {
    id: string;
    type: string;
    version: number;
    createdAt: Date;
    updatedAt: Date;
}
export interface EventStoreOptions {
    connection: SQLServerConnection;
    tablePrefix?: string;
    snapshotFrequency?: number;
    maxStreams?: number;
    retentionDays?: number;
}
export declare class EventStore extends EventEmitter {
    private provider;
    private tablePrefix;
    private snapshotFrequency;
    private maxStreams;
    private retentionDays;
    private initialized;
    constructor(options: EventStoreOptions);
    initialize(): Promise<void>;
    private ensureEventStoreTables;
    appendToStream(streamId: string, events: NovaEvent[], expectedVersion?: number): Promise<StoredEvent[]>;
    readStream(streamId: string, fromVersion?: number, toVersion?: number): Promise<StoredEvent[]>;
    readStreamBackwards(streamId: string, fromVersion?: number, limit?: number): Promise<StoredEvent[]>;
    getStreamVersion(streamId: string): Promise<number>;
    private getOrCreateStream;
    private createStream;
    private updateStreamVersion;
    deleteStream(streamId: string, softDelete?: boolean): Promise<void>;
    private createSnapshot;
    getSnapshot(streamId: string): Promise<{
        version: number;
        data: any;
    } | null>;
    private createSnapshotData;
    findEventsByCorrelationId(correlationId: string): Promise<StoredEvent[]>;
    findEventsByType(eventType: string, fromDate?: Date, toDate?: Date): Promise<StoredEvent[]>;
    getEventCount(streamId?: string): Promise<number>;
    archiveEvents(olderThan: Date): Promise<number>;
    truncateEvents(streamId?: string): Promise<void>;
    cleanup(retentionDays?: number): Promise<number>;
    private saveEvent;
    private mapToStoredEvent;
    private generateEventId;
    getStats(): Promise<EventStoreStats>;
    dispose(): Promise<void>;
}
export interface EventStoreStats {
    eventCount: number;
    streamCount: number;
    snapshotCount: number;
    retentionDays: number;
    snapshotFrequency: number;
    tablePrefix: string;
}
export declare class EventStoreConcurrencyError extends Error {
    constructor(message: string);
}
//# sourceMappingURL=event-store.d.ts.map