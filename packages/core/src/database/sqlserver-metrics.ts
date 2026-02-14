export class SQLServerMetrics {
    // Connection metrics
    connectionAttempts: number = 0;
    connectionSuccesses: number = 0;
    connectionFailures: number = 0;
    connectionAcquires: number = 0;
    connectionReleases: number = 0;
    connectionHits: number = 0;
    connectionMisses: number = 0;
    connectionErrors: number = 0;
    connectionTimeouts: number = 0;

    // Query metrics
    totalQueries: number = 0;
    selectQueries: number = 0;
    insertQueries: number = 0;
    updateQueries: number = 0;
    deleteQueries: number = 0;
    procedureCalls: number = 0;
    bulkOperations: number = 0;

    // Performance metrics
    totalQueryTime: number = 0;
    averageQueryTime: number = 0;
    maxQueryTime: number = 0;
    minQueryTime: number = Number.MAX_SAFE_INTEGER;
    
    totalTransactionTime: number = 0;
    averageTransactionTime: number = 0;
    maxTransactionTime: number = 0;
    minTransactionTime: number = Number.MAX_SAFE_INTEGER;

    totalAcquireTime: number = 0;
    averageAcquireTime: number = 0;
    maxAcquireTime: number = 0;
    minAcquireTime: number = Number.MAX_SAFE_INTEGER;

    totalIdleTime: number = 0;
    averageIdleTime: number = 0;

    // Throughput metrics
    rowsAffected: number = 0;
    rowsReturned: number = 0;
    bytesTransferred: number = 0;

    // Error metrics
    deadlocks: number = 0;
    timeouts: number = 0;
    constraintViolations: number = 0;
    syntaxErrors: number = 0;
    connectionErrors: number = 0;

    // Resource metrics
    cpuTime: number = 0;
    memoryUsage: number = 0;
    diskIO: number = 0;
    networkIO: number = 0;

    // Timing
    startTime: Date = new Date();
    lastUpdateTime: Date = new Date();

    constructor(initial?: Partial<SQLServerMetrics>) {
        if (initial) {
            Object.assign(this, initial);
        }
    }

    recordQuery(type: string, duration: number, rows: number = 0, bytes: number = 0): void {
        this.totalQueries++;
        
        switch (type.toLowerCase()) {
            case 'select':
                this.selectQueries++;
                this.rowsReturned += rows;
                break;
            case 'insert':
                this.insertQueries++;
                this.rowsAffected += rows;
                break;
            case 'update':
                this.updateQueries++;
                this.rowsAffected += rows;
                break;
            case 'delete':
                this.deleteQueries++;
                this.rowsAffected += rows;
                break;
        }

        this.totalQueryTime += duration;
        this.averageQueryTime = this.totalQueryTime / this.totalQueries;
        this.maxQueryTime = Math.max(this.maxQueryTime, duration);
        this.minQueryTime = Math.min(this.minQueryTime, duration);
        
        this.bytesTransferred += bytes;
        this.lastUpdateTime = new Date();
    }

    recordProcedure(duration: number): void {
        this.procedureCalls++;
        this.totalQueryTime += duration;
        this.averageQueryTime = this.totalQueryTime / (this.selectQueries + this.insertQueries + this.updateQueries + this.deleteQueries + this.procedureCalls);
    }

    recordBulkOperation(rows: number): void {
        this.bulkOperations++;
        this.rowsAffected += rows;
    }

    recordTransaction(duration: number): void {
        this.totalTransactionTime += duration;
        this.averageTransactionTime = this.totalTransactionTime / (this.totalQueries || 1);
        this.maxTransactionTime = Math.max(this.maxTransactionTime, duration);
        this.minTransactionTime = Math.min(this.minTransactionTime, duration);
    }

    recordConnectionAcquire(duration: number, hit: boolean = false): void {
        this.connectionAcquires++;
        
        if (hit) {
            this.connectionHits++;
        } else {
            this.connectionMisses++;
        }

        this.totalAcquireTime += duration;
        this.averageAcquireTime = this.totalAcquireTime / this.connectionAcquires;
        this.maxAcquireTime = Math.max(this.maxAcquireTime, duration);
        this.minAcquireTime = Math.min(this.minAcquireTime, duration);
    }

    recordConnectionRelease(idleTime: number): void {
        this.connectionReleases++;
        this.totalIdleTime += idleTime;
        this.averageIdleTime = this.totalIdleTime / this.connectionReleases;
    }

    recordError(type: string): void {
        switch (type) {
            case 'deadlock':
                this.deadlocks++;
                break;
            case 'timeout':
                this.timeouts++;
                this.connectionTimeouts++;
                break;
            case 'constraint':
                this.constraintViolations++;
                break;
            case 'syntax':
                this.syntaxErrors++;
                break;
            case 'connection':
                this.connectionErrors++;
                break;
        }
    }

    reset(): void {
        this.connectionAttempts = 0;
        this.connectionSuccesses = 0;
        this.connectionFailures = 0;
        this.connectionAcquires = 0;
        this.connectionReleases = 0;
        this.connectionHits = 0;
        this.connectionMisses = 0;
        this.connectionErrors = 0;
        this.connectionTimeouts = 0;

        this.totalQueries = 0;
        this.selectQueries = 0;
        this.insertQueries = 0;
        this.updateQueries = 0;
        this.deleteQueries = 0;
        this.procedureCalls = 0;
        this.bulkOperations = 0;

        this.totalQueryTime = 0;
        this.averageQueryTime = 0;
        this.maxQueryTime = 0;
        this.minQueryTime = Number.MAX_SAFE_INTEGER;
        
        this.totalTransactionTime = 0;
        this.averageTransactionTime = 0;
        this.maxTransactionTime = 0;
        this.minTransactionTime = Number.MAX_SAFE_INTEGER;

        this.totalAcquireTime = 0;
        this.averageAcquireTime = 0;
        this.maxAcquireTime = 0;
        this.minAcquireTime = Number.MAX_SAFE_INTEGER;

        this.totalIdleTime = 0;
        this.averageIdleTime = 0;

        this.rowsAffected = 0;
        this.rowsReturned = 0;
        this.bytesTransferred = 0;

        this.deadlocks = 0;
        this.timeouts = 0;
        this.constraintViolations = 0;
        this.syntaxErrors = 0;

        this.cpuTime = 0;
        this.memoryUsage = 0;
        this.diskIO = 0;
        this.networkIO = 0;

        this.startTime = new Date();
        this.lastUpdateTime = new Date();
    }

    toJSON(): Record<string, any> {
        return {
            connections: {
                attempts: this.connectionAttempts,
                successes: this.connectionSuccesses,
                failures: this.connectionFailures,
                acquires: this.connectionAcquires,
                releases: this.connectionReleases,
                hits: this.connectionHits,
                misses: this.connectionMisses,
                errors: this.connectionErrors,
                timeouts: this.connectionTimeouts,
                hitRate: this.connectionAcquires > 0 ? this.connectionHits / this.connectionAcquires : 0,
                missRate: this.connectionAcquires > 0 ? this.connectionMisses / this.connectionAcquires : 0
            },
            queries: {
                total: this.totalQueries,
                select: this.selectQueries,
                insert: this.insertQueries,
                update: this.updateQueries,
                delete: this.deleteQueries,
                procedures: this.procedureCalls,
                bulk: this.bulkOperations
            },
            performance: {
                averageQueryTime: this.averageQueryTime,
                maxQueryTime: this.maxQueryTime,
                minQueryTime: this.minQueryTime === Number.MAX_SAFE_INTEGER ? 0 : this.minQueryTime,
                averageTransactionTime: this.averageTransactionTime,
                maxTransactionTime: this.maxTransactionTime,
                minTransactionTime: this.minTransactionTime === Number.MAX_SAFE_INTEGER ? 0 : this.minTransactionTime,
                averageAcquireTime: this.averageAcquireTime,
                maxAcquireTime: this.maxAcquireTime,
                minAcquireTime: this.minAcquireTime === Number.MAX_SAFE_INTEGER ? 0 : this.minAcquireTime,
                averageIdleTime: this.averageIdleTime
            },
            throughput: {
                rowsAffected: this.rowsAffected,
                rowsReturned: this.rowsReturned,
                bytesTransferred: this.bytesTransferred
            },
            errors: {
                deadlocks: this.deadlocks,
                timeouts: this.timeouts,
                constraintViolations: this.constraintViolations,
                syntaxErrors: this.syntaxErrors
            },
            resources: {
                cpuTime: this.cpuTime,
                memoryUsage: this.memoryUsage,
                diskIO: this.diskIO,
                networkIO: this.networkIO
            },
            timing: {
                startTime: this.startTime,
                lastUpdateTime: this.lastUpdateTime,
                uptime: Date.now() - this.startTime.getTime()
            }
        };
    }

    clone(): SQLServerMetrics {
        return new SQLServerMetrics(this.toJSON() as any);
    }

    merge(other: SQLServerMetrics): void {
        this.connectionAttempts += other.connectionAttempts;
        this.connectionSuccesses += other.connectionSuccesses;
        this.connectionFailures += other.connectionFailures;
        this.connectionAcquires += other.connectionAcquires;
        this.connectionReleases += other.connectionReleases;
        this.connectionHits += other.connectionHits;
        this.connectionMisses += other.connectionMisses;
        this.connectionErrors += other.connectionErrors;
        this.connectionTimeouts += other.connectionTimeouts;

        this.totalQueries += other.totalQueries;
        this.selectQueries += other.selectQueries;
        this.insertQueries += other.insertQueries;
        this.updateQueries += other.updateQueries;
        this.deleteQueries += other.deleteQueries;
        this.procedureCalls += other.procedureCalls;
        this.bulkOperations += other.bulkOperations;

        this.totalQueryTime += other.totalQueryTime;
        this.totalTransactionTime += other.totalTransactionTime;
        this.totalAcquireTime += other.totalAcquireTime;
        this.totalIdleTime += other.totalIdleTime;

        this.rowsAffected += other.rowsAffected;
        this.rowsReturned += other.rowsReturned;
        this.bytesTransferred += other.bytesTransferred;

        this.deadlocks += other.deadlocks;
        this.timeouts += other.timeouts;
        this.constraintViolations += other.constraintViolations;
        this.syntaxErrors += other.syntaxErrors;

        this.cpuTime += other.cpuTime;
        this.memoryUsage += other.memoryUsage;
        this.diskIO += other.diskIO;
        this.networkIO += other.networkIO;

        // Recalculate averages
        this.averageQueryTime = this.totalQueries > 0 ? this.totalQueryTime / this.totalQueries : 0;
        this.averageTransactionTime = this.totalQueries > 0 ? this.totalTransactionTime / this.totalQueries : 0;
        this.averageAcquireTime = this.connectionAcquires > 0 ? this.totalAcquireTime / this.connectionAcquires : 0;
        this.averageIdleTime = this.connectionReleases > 0 ? this.totalIdleTime / this.connectionReleases : 0;

        this.maxQueryTime = Math.max(this.maxQueryTime, other.maxQueryTime);
        this.minQueryTime = Math.min(this.minQueryTime, other.minQueryTime);
        this.maxTransactionTime = Math.max(this.maxTransactionTime, other.maxTransactionTime);
        this.minTransactionTime = Math.min(this.minTransactionTime, other.minTransactionTime);
        this.maxAcquireTime = Math.max(this.maxAcquireTime, other.maxAcquireTime);
        this.minAcquireTime = Math.min(this.minAcquireTime, other.minAcquireTime);
    }
}