"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EventStoreConcurrencyError = exports.EventStore = void 0;
const events_1 = require("events");
const sqlserver_provider_1 = require("@nova/orm/sqlserver-provider");
class EventStore extends events_1.EventEmitter {
    provider;
    tablePrefix;
    snapshotFrequency;
    maxStreams;
    retentionDays;
    initialized = false;
    constructor(options) {
        super();
        this.provider = new sqlserver_provider_1.SQLServerProvider({ connection: options.connection });
        this.tablePrefix = options.tablePrefix || 'EventStore';
        this.snapshotFrequency = options.snapshotFrequency || 100;
        this.maxStreams = options.maxStreams || 10000;
        this.retentionDays = options.retentionDays || 30;
    }
    async initialize() {
        if (this.initialized)
            return;
        await this.provider.initialize();
        await this.ensureEventStoreTables();
        this.initialized = true;
        this.emit('initialized');
    }
    async ensureEventStoreTables() {
        // Create EventStreams table
        await this.provider.executeQuery(`
            IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = '${this.tablePrefix}Streams')
            BEGIN
                CREATE TABLE [${this.tablePrefix}Streams] (
                    [Id] INT IDENTITY(1,1) NOT NULL,
                    [StreamId] NVARCHAR(255) NOT NULL,
                    [StreamType] NVARCHAR(255) NOT NULL,
                    [Version] INT NOT NULL CONSTRAINT [DF_${this.tablePrefix}Streams_Version] DEFAULT 0,
                    [SnapshotVersion] INT NULL,
                    [SnapshotData] NVARCHAR(MAX) NULL,
                    [Metadata] NVARCHAR(MAX) NULL,
                    [CreatedAt] DATETIME2 NOT NULL CONSTRAINT [DF_${this.tablePrefix}Streams_CreatedAt] DEFAULT GETUTCDATE(),
                    [UpdatedAt] DATETIME2 NOT NULL CONSTRAINT [DF_${this.tablePrefix}Streams_UpdatedAt] DEFAULT GETUTCDATE(),
                    [DeletedAt] DATETIME2 NULL,
                    CONSTRAINT [PK_${this.tablePrefix}Streams] PRIMARY KEY CLUSTERED ([Id])
                );

                CREATE UNIQUE INDEX [UX_${this.tablePrefix}Streams_StreamId] 
                    ON [${this.tablePrefix}Streams] ([StreamId]) WHERE [DeletedAt] IS NULL;
                
                PRINT '✅ Created ${this.tablePrefix}Streams table';
            END
        `);
        // Create Events table
        await this.provider.executeQuery(`
            IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = '${this.tablePrefix}Events')
            BEGIN
                CREATE TABLE [${this.tablePrefix}Events] (
                    [Id] INT IDENTITY(1,1) NOT NULL,
                    [EventId] NVARCHAR(100) NOT NULL,
                    [StreamId] NVARCHAR(255) NOT NULL,
                    [Version] INT NOT NULL,
                    [EventName] NVARCHAR(255) NOT NULL,
                    [EventType] NVARCHAR(255) NOT NULL,
                    [Data] NVARCHAR(MAX) NOT NULL,
                    [Metadata] NVARCHAR(MAX) NULL,
                    [CorrelationId] NVARCHAR(100) NULL,
                    [CausationId] NVARCHAR(100) NULL,
                    [CreatedAt] DATETIME2 NOT NULL CONSTRAINT [DF_${this.tablePrefix}Events_CreatedAt] DEFAULT GETUTCDATE(),
                    CONSTRAINT [PK_${this.tablePrefix}Events] PRIMARY KEY CLUSTERED ([Id])
                );

                CREATE UNIQUE INDEX [UX_${this.tablePrefix}Events_EventId] 
                    ON [${this.tablePrefix}Events] ([EventId]);
                
                CREATE UNIQUE INDEX [UX_${this.tablePrefix}Events_StreamVersion] 
                    ON [${this.tablePrefix}Events] ([StreamId], [Version]);
                
                CREATE INDEX [IX_${this.tablePrefix}Events_StreamId] 
                    ON [${this.tablePrefix}Events] ([StreamId]);
                
                CREATE INDEX [IX_${this.tablePrefix}Events_CreatedAt] 
                    ON [${this.tablePrefix}Events] ([CreatedAt]);
                
                PRINT '✅ Created ${this.tablePrefix}Events table';
            END
        `);
        // Create Snapshots table
        await this.provider.executeQuery(`
            IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = '${this.tablePrefix}Snapshots')
            BEGIN
                CREATE TABLE [${this.tablePrefix}Snapshots] (
                    [Id] INT IDENTITY(1,1) NOT NULL,
                    [StreamId] NVARCHAR(255) NOT NULL,
                    [Version] INT NOT NULL,
                    [Data] NVARCHAR(MAX) NOT NULL,
                    [Metadata] NVARCHAR(MAX) NULL,
                    [CreatedAt] DATETIME2 NOT NULL CONSTRAINT [DF_${this.tablePrefix}Snapshots_CreatedAt] DEFAULT GETUTCDATE(),
                    CONSTRAINT [PK_${this.tablePrefix}Snapshots] PRIMARY KEY CLUSTERED ([Id])
                );

                CREATE INDEX [IX_${this.tablePrefix}Snapshots_StreamId] 
                    ON [${this.tablePrefix}Snapshots] ([StreamId], [Version]);
                
                PRINT '✅ Created ${this.tablePrefix}Snapshots table';
            END
        `);
    }
    // ============ Event Operations ============
    async appendToStream(streamId, events, expectedVersion) {
        const stream = await this.getOrCreateStream(streamId);
        if (expectedVersion !== undefined && stream.version !== expectedVersion) {
            throw new EventStoreConcurrencyError(`Stream ${streamId} version mismatch. Expected: ${expectedVersion}, Actual: ${stream.version}`);
        }
        const storedEvents = [];
        let currentVersion = stream.version;
        for (const event of events) {
            currentVersion++;
            const storedEvent = {
                ...event,
                id: event.id || this.generateEventId(),
                streamId,
                version: currentVersion,
                storedAt: new Date(),
                metadata: event.metadata || {}
            };
            await this.saveEvent(storedEvent);
            storedEvents.push(storedEvent);
        }
        // Update stream version
        await this.updateStreamVersion(streamId, currentVersion);
        // Check if snapshot needed
        if (currentVersion % this.snapshotFrequency === 0) {
            await this.createSnapshot(streamId, currentVersion, storedEvents);
        }
        this.emit('eventsAppended', {
            streamId,
            eventCount: events.length,
            version: currentVersion,
            timestamp: new Date()
        });
        return storedEvents;
    }
    async readStream(streamId, fromVersion = 0, toVersion) {
        let query = `
            SELECT * FROM [${this.tablePrefix}Events]
            WHERE [StreamId] = @streamId AND [Version] >= @fromVersion
        `;
        const params = [streamId, fromVersion];
        if (toVersion) {
            query += ` AND [Version] <= @toVersion`;
            params.push(toVersion);
        }
        query += ` ORDER BY [Version] ASC`;
        const result = await this.provider.executeQuery(query, params);
        return result.recordset.map(this.mapToStoredEvent);
    }
    async readStreamBackwards(streamId, fromVersion, limit = 100) {
        let query = `
            SELECT TOP ${limit} * FROM [${this.tablePrefix}Events]
            WHERE [StreamId] = @streamId
        `;
        const params = [streamId];
        if (fromVersion) {
            query += ` AND [Version] <= @fromVersion`;
            params.push(fromVersion);
        }
        query += ` ORDER BY [Version] DESC`;
        const result = await this.provider.executeQuery(query, params);
        return result.recordset.map(this.mapToStoredEvent);
    }
    async getStreamVersion(streamId) {
        const query = `
            SELECT [Version] FROM [${this.tablePrefix}Streams]
            WHERE [StreamId] = @streamId AND [DeletedAt] IS NULL
        `;
        const result = await this.provider.executeQuery(query, [streamId]);
        return result.recordset.length > 0 ? result.recordset[0].Version : 0;
    }
    // ============ Stream Operations ============
    async getOrCreateStream(streamId) {
        const query = `
            SELECT * FROM [${this.tablePrefix}Streams]
            WHERE [StreamId] = @streamId AND [DeletedAt] IS NULL
        `;
        const result = await this.provider.executeQuery(query, [streamId]);
        if (result.recordset.length > 0) {
            const row = result.recordset[0];
            return {
                id: row.StreamId,
                type: row.StreamType,
                version: row.Version,
                createdAt: row.CreatedAt,
                updatedAt: row.UpdatedAt
            };
        }
        // Create new stream
        return this.createStream(streamId);
    }
    async createStream(streamId, streamType = 'default') {
        const query = `
            INSERT INTO [${this.tablePrefix}Streams] ([StreamId], [StreamType], [Version], [Metadata])
            VALUES (@streamId, @streamType, 0, @metadata);
            
            SELECT * FROM [${this.tablePrefix}Streams] WHERE [StreamId] = @streamId;
        `;
        const result = await this.provider.executeQuery(query, [
            streamId,
            streamType,
            JSON.stringify({})
        ]);
        const row = result.recordset[0];
        return {
            id: row.StreamId,
            type: row.StreamType,
            version: row.Version,
            createdAt: row.CreatedAt,
            updatedAt: row.UpdatedAt
        };
    }
    async updateStreamVersion(streamId, version) {
        const query = `
            UPDATE [${this.tablePrefix}Streams]
            SET [Version] = @version,
                [UpdatedAt] = GETUTCDATE()
            WHERE [StreamId] = @streamId
        `;
        await this.provider.executeQuery(query, [version, streamId]);
    }
    async deleteStream(streamId, softDelete = true) {
        if (softDelete) {
            const query = `
                UPDATE [${this.tablePrefix}Streams]
                SET [DeletedAt] = GETUTCDATE()
                WHERE [StreamId] = @streamId
            `;
            await this.provider.executeQuery(query, [streamId]);
        }
        else {
            const query = `
                DELETE FROM [${this.tablePrefix}Events] WHERE [StreamId] = @streamId;
                DELETE FROM [${this.tablePrefix}Snapshots] WHERE [StreamId] = @streamId;
                DELETE FROM [${this.tablePrefix}Streams] WHERE [StreamId] = @streamId;
            `;
            await this.provider.executeQuery(query, [streamId]);
        }
        this.emit('streamDeleted', { streamId, softDelete, timestamp: new Date() });
    }
    // ============ Snapshot Operations ============
    async createSnapshot(streamId, version, events) {
        const snapshotData = this.createSnapshotData(events);
        const query = `
            INSERT INTO [${this.tablePrefix}Snapshots] ([StreamId], [Version], [Data], [Metadata])
            VALUES (@streamId, @version, @data, @metadata);

            UPDATE [${this.tablePrefix}Streams]
            SET [SnapshotVersion] = @version,
                [SnapshotData] = @data
            WHERE [StreamId] = @streamId;
        `;
        await this.provider.executeQuery(query, [
            streamId,
            version,
            JSON.stringify(snapshotData),
            JSON.stringify({ createdAt: new Date() })
        ]);
        this.emit('snapshotCreated', {
            streamId,
            version,
            timestamp: new Date()
        });
    }
    async getSnapshot(streamId) {
        const query = `
            SELECT [SnapshotVersion], [SnapshotData]
            FROM [${this.tablePrefix}Streams]
            WHERE [StreamId] = @streamId AND [SnapshotVersion] IS NOT NULL
        `;
        const result = await this.provider.executeQuery(query, [streamId]);
        if (result.recordset.length === 0) {
            return null;
        }
        const row = result.recordset[0];
        return {
            version: row.SnapshotVersion,
            data: JSON.parse(row.SnapshotData)
        };
    }
    createSnapshotData(events) {
        // Override this method to implement custom snapshot logic
        return {
            eventCount: events.length,
            lastEvent: events[events.length - 1],
            timestamp: new Date()
        };
    }
    // ============ Event Queries ============
    async findEventsByCorrelationId(correlationId) {
        const query = `
            SELECT * FROM [${this.tablePrefix}Events]
            WHERE [CorrelationId] = @correlationId
            ORDER BY [Version] ASC
        `;
        const result = await this.provider.executeQuery(query, [correlationId]);
        return result.recordset.map(this.mapToStoredEvent);
    }
    async findEventsByType(eventType, fromDate, toDate) {
        let query = `
            SELECT * FROM [${this.tablePrefix}Events]
            WHERE [EventType] = @eventType
        `;
        const params = [eventType];
        if (fromDate) {
            query += ` AND [CreatedAt] >= @fromDate`;
            params.push(fromDate);
        }
        if (toDate) {
            query += ` AND [CreatedAt] <= @toDate`;
            params.push(toDate);
        }
        query += ` ORDER BY [CreatedAt] DESC`;
        const result = await this.provider.executeQuery(query, params);
        return result.recordset.map(this.mapToStoredEvent);
    }
    async getEventCount(streamId) {
        let query = `SELECT COUNT(*) AS Count FROM [${this.tablePrefix}Events]`;
        const params = [];
        if (streamId) {
            query += ` WHERE [StreamId] = @streamId`;
            params.push(streamId);
        }
        const result = await this.provider.executeQuery(query, params);
        return result.recordset[0].Count;
    }
    // ============ Maintenance ============
    async archiveEvents(olderThan) {
        const query = `
            DELETE FROM [${this.tablePrefix}Events]
            WHERE [CreatedAt] < @olderThan
        `;
        const result = await this.provider.executeQuery(query, [olderThan]);
        this.emit('eventsArchived', {
            count: result.rowsAffected[0],
            olderThan,
            timestamp: new Date()
        });
        return result.rowsAffected[0];
    }
    async truncateEvents(streamId) {
        if (streamId) {
            await this.provider.executeQuery(`DELETE FROM [${this.tablePrefix}Events] WHERE [StreamId] = @streamId`, [streamId]);
            await this.provider.executeQuery(`UPDATE [${this.tablePrefix}Streams] SET [Version] = 0 WHERE [StreamId] = @streamId`, [streamId]);
        }
        else {
            await this.provider.executeQuery(`TRUNCATE TABLE [${this.tablePrefix}Events]`);
            await this.provider.executeQuery(`UPDATE [${this.tablePrefix}Streams] SET [Version] = 0`);
        }
        this.emit('eventsTruncated', { streamId, timestamp: new Date() });
    }
    async cleanup(retentionDays) {
        const days = retentionDays || this.retentionDays;
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - days);
        const deletedEvents = await this.archiveEvents(cutoffDate);
        // Clean up old snapshots
        await this.provider.executeQuery(`
            DELETE FROM [${this.tablePrefix}Snapshots]
            WHERE [CreatedAt] < @cutoffDate
        `, [cutoffDate]);
        // Clean up soft-deleted streams
        await this.provider.executeQuery(`
            DELETE FROM [${this.tablePrefix}Streams]
            WHERE [DeletedAt] < @cutoffDate
        `, [cutoffDate]);
        return deletedEvents;
    }
    // ============ Helper Methods ============
    async saveEvent(event) {
        const query = `
            INSERT INTO [${this.tablePrefix}Events] (
                [EventId], [StreamId], [Version], [EventName],
                [EventType], [Data], [Metadata], [CorrelationId], [CausationId]
            ) VALUES (
                @eventId, @streamId, @version, @eventName,
                @eventType, @data, @metadata, @correlationId, @causationId
            )
        `;
        await this.provider.executeQuery(query, [
            event.id,
            event.streamId,
            event.version,
            event.name,
            event.name,
            JSON.stringify(event.data),
            JSON.stringify(event.metadata),
            event.correlationId || null,
            event.causationId || null
        ]);
    }
    mapToStoredEvent(row) {
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
    generateEventId() {
        return `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
    // ============ Stats ============
    async getStats() {
        const eventCount = await this.getEventCount();
        const streamCount = await this.provider.executeQuery(`SELECT COUNT(*) AS Count FROM [${this.tablePrefix}Streams] WHERE [DeletedAt] IS NULL`);
        const snapshotCount = await this.provider.executeQuery(`SELECT COUNT(*) AS Count FROM [${this.tablePrefix}Snapshots]`);
        return {
            eventCount,
            streamCount: streamCount.recordset[0].Count,
            snapshotCount: snapshotCount.recordset[0].Count,
            retentionDays: this.retentionDays,
            snapshotFrequency: this.snapshotFrequency,
            tablePrefix: this.tablePrefix
        };
    }
    async dispose() {
        await this.provider.dispose();
        this.initialized = false;
        this.emit('disposed');
    }
}
exports.EventStore = EventStore;
class EventStoreConcurrencyError extends Error {
    constructor(message) {
        super(message);
        this.name = 'EventStoreConcurrencyError';
    }
}
exports.EventStoreConcurrencyError = EventStoreConcurrencyError;
//# sourceMappingURL=event-store.js.map