import { EventEmitter } from 'events';
import { EventStore, StoredEvent } from './event-store';
import { EventDispatcher, NovaEvent } from './event-dispatcher';
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

export class EventReplay extends EventEmitter {
    private eventStore: EventStore;
    private eventDispatcher: EventDispatcher;
    private connection: SQLServerConnection;
    private replayInProgress: boolean = false;
    private currentReplay?: ReplayProgress;

    constructor(eventStore: EventStore, eventDispatcher: EventDispatcher, connection: SQLServerConnection) {
        super();
        this.eventStore = eventStore;
        this.eventDispatcher = eventDispatcher;
        this.connection = connection;
    }

    // ============ Replay Operations ============

    async replayEvents(options: ReplayOptions = {}): Promise<ReplayResult> {
        if (this.replayInProgress) {
            throw new Error('Event replay already in progress');
        }

        this.replayInProgress = true;
        const startTime = new Date();

        const progress: ReplayProgress = {
            totalEvents: 0,
            processedEvents: 0,
            successfulEvents: 0,
            failedEvents: 0,
            skippedEvents: 0,
            currentBatch: 0,
            totalBatches: 0,
            startTime,
            errors: []
        };

        try {
            // Get total events count
            const totalEvents = await this.getTotalEvents(options);
            progress.totalEvents = totalEvents;

            // Calculate batches
            const batchSize = options.batchSize || 1000;
            const totalBatches = Math.ceil(totalEvents / batchSize);
            progress.totalBatches = totalBatches;

            this.emit('replayStarted', { options, progress });

            // Start transaction if not dry run
            if (!options.dryRun) {
                await this.connection.beginTransaction();
            }

            // Process events in batches
            for (let i = 0; i < totalBatches; i++) {
                progress.currentBatch = i + 1;
                
                const offset = i * batchSize;
                const events = await this.loadEvents(options, batchSize, offset);
                
                if (options.parallel) {
                    await this.processEventsParallel(events, options, progress);
                } else {
                    await this.processEventsSequential(events, options, progress);
                }

                this.emit('batchProcessed', { 
                    batch: i + 1, 
                    totalBatches,
                    progress: this.calculateProgress(progress)
                });
            }

            // Commit transaction if not dry run
            if (!options.dryRun) {
                await this.connection.commitTransaction();
            }

            const endTime = new Date();
            progress.endTime = endTime;

            const result: ReplayResult = {
                success: progress.failedEvents === 0,
                progress,
                summary: this.generateSummary(progress, startTime, endTime)
            };

            this.emit('replayCompleted', result);

            return result;

        } catch (error) {
            // Rollback transaction on error
            if (!options.dryRun) {
                await this.connection.rollbackTransaction();
            }

            this.emit('replayFailed', { error, progress });

            throw error;
        } finally {
            this.replayInProgress = false;
            this.currentReplay = undefined;
        }
    }

    async replayStream(
        streamId: string,
        options: ReplayOptions = {}
    ): Promise<ReplayResult> {
        return this.replayEvents({
            ...options,
            streamIds: [streamId]
        });
    }

    async replayEventsByType(
        eventType: string,
        options: ReplayOptions = {}
    ): Promise<ReplayResult> {
        return this.replayEvents({
            ...options,
            eventTypes: [eventType]
        });
    }

    async replaySince(timestamp: Date, options: ReplayOptions = {}): Promise<ReplayResult> {
        return this.replayEvents({
            ...options,
            fromDate: timestamp
        });
    }

    // ============ Event Processing ============

    private async processEventsSequential(
        events: StoredEvent[],
        options: ReplayOptions,
        progress: ReplayProgress
    ): Promise<void> {
        for (const event of events) {
            try {
                await this.processEvent(event, options);
                progress.successfulEvents++;
            } catch (error) {
                progress.failedEvents++;
                progress.errors.push({
                    eventId: event.id,
                    streamId: event.streamId,
                    version: event.version,
                    error: error.message,
                    timestamp: new Date()
                });

                if (!options.continueOnError) {
                    throw error;
                }
            } finally {
                progress.processedEvents++;
            }
        }
    }

    private async processEventsParallel(
        events: StoredEvent[],
        options: ReplayOptions,
        progress: ReplayProgress
    ): Promise<void> {
        const maxParallel = options.maxParallel || 5;
        const chunks = this.chunkArray(events, maxParallel);

        for (const chunk of chunks) {
            await Promise.all(chunk.map(async (event) => {
                try {
                    await this.processEvent(event, options);
                    progress.successfulEvents++;
                } catch (error) {
                    progress.failedEvents++;
                    progress.errors.push({
                        eventId: event.id,
                        streamId: event.streamId,
                        version: event.version,
                        error: error.message,
                        timestamp: new Date()
                    });

                    if (!options.continueOnError) {
                        throw error;
                    }
                } finally {
                    progress.processedEvents++;
                }
            }));
        }
    }

    private async processEvent(event: StoredEvent, options: ReplayOptions): Promise<void> {
        // Skip if event type is filtered
        if (options.eventTypes && !options.eventTypes.includes(event.name)) {
            progress.skippedEvents++;
            return;
        }

        // Skip if dry run
        if (options.dryRun) {
            return;
        }

        // Reconstruct event
        const replayEvent: NovaEvent = {
            id: event.id,
            name: event.name,
            data: event.data,
            timestamp: event.timestamp,
            correlationId: event.correlationId,
            causationId: event.causationId,
            metadata: {
                ...event.metadata,
                isReplay: true,
                originalVersion: event.version,
                originalStreamId: event.streamId
            }
        };

        // Dispatch event
        await this.eventDispatcher.dispatch(event.name, replayEvent.data, {
            correlationId: replayEvent.correlationId,
            metadata: replayEvent.metadata
        });
    }

    // ============ Event Loading ============

    private async loadEvents(
        options: ReplayOptions,
        limit: number,
        offset: number
    ): Promise<StoredEvent[]> {
        let query = `
            SELECT * FROM [EventStoreEvents]
            WHERE 1=1
        `;
        
        const params: any[] = [];

        // Apply filters
        if (options.streamIds && options.streamIds.length > 0) {
            const placeholders = options.streamIds.map((_, i) => `@streamId${i}`).join(',');
            query += ` AND [StreamId] IN (${placeholders})`;
            options.streamIds.forEach((id, i) => params.push(id));
        }

        if (options.eventTypes && options.eventTypes.length > 0) {
            const placeholders = options.eventTypes.map((_, i) => `@eventType${i}`).join(',');
            query += ` AND [EventType] IN (${placeholders})`;
            options.eventTypes.forEach((type, i) => params.push(type));
        }

        if (options.fromVersion !== undefined) {
            query += ` AND [Version] >= @fromVersion`;
            params.push(options.fromVersion);
        }

        if (options.toVersion !== undefined) {
            query += ` AND [Version] <= @toVersion`;
            params.push(options.toVersion);
        }

        if (options.fromDate) {
            query += ` AND [CreatedAt] >= @fromDate`;
            params.push(options.fromDate);
        }

        if (options.toDate) {
            query += ` AND [CreatedAt] <= @toDate`;
            params.push(options.toDate);
        }

        query += ` ORDER BY [CreatedAt] ASC`;
        query += ` OFFSET ${offset} ROWS FETCH NEXT ${limit} ROWS ONLY`;

        const result = await this.connection.query(query, params);
        return result.recordset.map(row => this.mapToStoredEvent(row));
    }

    private async getTotalEvents(options: ReplayOptions): Promise<number> {
        let query = `
            SELECT COUNT(*) AS Count FROM [EventStoreEvents]
            WHERE 1=1
        `;
        
        const params: any[] = [];

        // Apply filters (same as above)
        if (options.streamIds && options.streamIds.length > 0) {
            const placeholders = options.streamIds.map((_, i) => `@streamId${i}`).join(',');
            query += ` AND [StreamId] IN (${placeholders})`;
            options.streamIds.forEach((id, i) => params.push(id));
        }

        if (options.eventTypes && options.eventTypes.length > 0) {
            const placeholders = options.eventTypes.map((_, i) => `@eventType${i}`).join(',');
            query += ` AND [EventType] IN (${placeholders})`;
            options.eventTypes.forEach((type, i) => params.push(type));
        }

        if (options.fromVersion !== undefined) {
            query += ` AND [Version] >= @fromVersion`;
            params.push(options.fromVersion);
        }

        if (options.toVersion !== undefined) {
            query += ` AND [Version] <= @toVersion`;
            params.push(options.toVersion);
        }

        if (options.fromDate) {
            query += ` AND [CreatedAt] >= @fromDate`;
            params.push(options.fromDate);
        }

        if (options.toDate) {
            query += ` AND [CreatedAt] <= @toDate`;
            params.push(options.toDate);
        }

        const result = await this.connection.query(query, params);
        return result.recordset[0].Count;
    }

    // ============ Utility Methods ============

    private mapToStoredEvent(row: any): StoredEvent {
        return {
            id: row.EventId,
            streamId: row.StreamId,
            version: row.Version,
            name: row.EventName,
            type: row.EventName,
            data: JSON.parse(row.Data),
            metadata: row.Metadata ? JSON.parse(row.Metadata) : {},
            correlationId: row.CorrelationId,
            causationId: row.CausationId,
            timestamp: row.CreatedAt,
            storedAt: row.CreatedAt
        };
    }

    private chunkArray<T>(array: T[], size: number): T[][] {
        const chunks: T[][] = [];
        for (let i = 0; i < array.length; i += size) {
            chunks.push(array.slice(i, i + size));
        }
        return chunks;
    }

    private calculateProgress(progress: ReplayProgress): number {
        return (progress.processedEvents / progress.totalEvents) * 100;
    }

    private generateSummary(
        progress: ReplayProgress,
        startTime: Date,
        endTime: Date
    ): ReplaySummary {
        const duration = endTime.getTime() - startTime.getTime();
        const eventsPerSecond = duration > 0 
            ? (progress.processedEvents / duration) * 1000 
            : 0;

        // Get unique streams affected
        const uniqueStreams = new Set(progress.errors.map(e => e.streamId));
        uniqueStreams.add(...progress.errors.map(e => e.streamId));

        return {
            totalEvents: progress.totalEvents,
            processed: progress.processedEvents,
            succeeded: progress.successfulEvents,
            failed: progress.failedEvents,
            skipped: progress.skippedEvents,
            duration,
            eventsPerSecond,
            streamsAffected: uniqueStreams.size
        };
    }

    // ============ Replay Management ============

    isReplaying(): boolean {
        return this.replayInProgress;
    }

    getCurrentReplay(): ReplayProgress | undefined {
        return this.currentReplay;
    }

    async cancelReplay(): Promise<void> {
        if (this.replayInProgress) {
            this.replayInProgress = false;
            this.emit('replayCancelled', { timestamp: new Date() });
        }
    }

    async getReplayableEvents(options: ReplayOptions = {}): Promise<StoredEvent[]> {
        const limit = options.batchSize || 1000;
        const offset = 0;
        return this.loadEvents(options, limit, offset);
    }

    async estimateReplayTime(options: ReplayOptions = {}): Promise<number> {
        const totalEvents = await this.getTotalEvents(options);
        const eventsPerSecond = 100; // Estimate: 100 events per second
        return (totalEvents / eventsPerSecond) * 1000; // Return in milliseconds
    }

    // ============ Validation ============

    async validateReplay(options: ReplayOptions = {}): Promise<ValidationResult> {
        const warnings: string[] = [];
        const errors: string[] = [];

        // Check if replay is already in progress
        if (this.replayInProgress) {
            errors.push('Event replay already in progress');
        }

        // Check event count
        const totalEvents = await this.getTotalEvents(options);
        if (totalEvents === 0) {
            warnings.push('No events found matching the criteria');
        }

        // Check for large replays
        if (totalEvents > 10000) {
            warnings.push(`Large replay detected: ${totalEvents} events. Consider using batch processing.`);
        }

        // Check for potential performance impact
        if (options.parallel && totalEvents > 1000) {
            warnings.push('Parallel processing may impact system performance for large replays');
        }

        // Check for missing filters
        if (!options.streamIds && !options.eventTypes && !options.fromDate && !options.fromVersion) {
            warnings.push('No filters specified - this will replay ALL events');
        }

        return {
            valid: errors.length === 0,
            errors,
            warnings
        };
    }
}

export interface ValidationResult {
    valid: boolean;
    errors: string[];
    warnings: string[];
}