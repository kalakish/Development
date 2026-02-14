/// <reference types="node" />
import { EventEmitter } from 'events';
import { EventStore, StoredEvent } from './event-store';
import { EventDispatcher } from './event-dispatcher';
import { SQLServerConnection } from '../database/sqlserver-connection';
export interface ReplayOptions {
    fromVersion?: number;
    toVersion?: number;
    fromDate?: Date;
    toDate?: Date;
    eventTypes?: string[];
    streamIds?: string[];
    batchSize?: number;
    parallel?: boolean;
    maxParallel?: number;
    continueOnError?: boolean;
    dryRun?: boolean;
}
export interface ReplayProgress {
    totalEvents: number;
    processedEvents: number;
    successfulEvents: number;
    failedEvents: number;
    skippedEvents: number;
    currentBatch: number;
    totalBatches: number;
    startTime: Date;
    endTime?: Date;
    errors: ReplayError[];
}
export interface ReplayError {
    eventId: string;
    streamId: string;
    version: number;
    error: string;
    timestamp: Date;
}
export interface ReplayResult {
    success: boolean;
    progress: ReplayProgress;
    summary: ReplaySummary;
}
export interface ReplaySummary {
    totalEvents: number;
    processed: number;
    succeeded: number;
    failed: number;
    skipped: number;
    duration: number;
    eventsPerSecond: number;
    streamsAffected: number;
}
export declare class EventReplay extends EventEmitter {
    private eventStore;
    private eventDispatcher;
    private connection;
    private replayInProgress;
    private currentReplay?;
    constructor(eventStore: EventStore, eventDispatcher: EventDispatcher, connection: SQLServerConnection);
    replayEvents(options?: ReplayOptions): Promise<ReplayResult>;
    replayStream(streamId: string, options?: ReplayOptions): Promise<ReplayResult>;
    replayEventsByType(eventType: string, options?: ReplayOptions): Promise<ReplayResult>;
    replaySince(timestamp: Date, options?: ReplayOptions): Promise<ReplayResult>;
    private processEventsSequential;
    private processEventsParallel;
    private processEvent;
    private loadEvents;
    private getTotalEvents;
    private mapToStoredEvent;
    private chunkArray;
    private calculateProgress;
    private generateSummary;
    isReplaying(): boolean;
    getCurrentReplay(): ReplayProgress | undefined;
    cancelReplay(): Promise<void>;
    getReplayableEvents(options?: ReplayOptions): Promise<StoredEvent[]>;
    estimateReplayTime(options?: ReplayOptions): Promise<number>;
    validateReplay(options?: ReplayOptions): Promise<ValidationResult>;
}
export interface ValidationResult {
    valid: boolean;
    errors: string[];
    warnings: string[];
}
//# sourceMappingURL=event-replay.d.ts.map