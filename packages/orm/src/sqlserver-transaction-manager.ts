import { ConnectionPool, Transaction, ISOLATION_LEVEL } from 'mssql';

export class SQLServerTransactionManager {
    private pool: ConnectionPool;
    private activeTransactions: Map<string, Transaction> = new Map();

    constructor(pool: ConnectionPool) {
        this.pool = pool;
    }

    async beginTransaction(
        isolationLevel?: ISOLATION_LEVEL,
        name?: string
    ): Promise<Transaction> {
        const transaction = this.pool.transaction();
        
        if (isolationLevel) {
            await transaction.begin(isolationLevel);
        } else {
            await transaction.begin();
        }

        const transactionId = name || `txn_${Date.now()}`;
        this.activeTransactions.set(transactionId, transaction);

        return transaction;
    }

    async commitTransaction(transactionId: string): Promise<void> {
        const transaction = this.activeTransactions.get(transactionId);
        if (!transaction) {
            throw new Error(`Transaction ${transactionId} not found`);
        }

        await transaction.commit();
        this.activeTransactions.delete(transactionId);
    }

    async rollbackTransaction(transactionId: string): Promise<void> {
        const transaction = this.activeTransactions.get(transactionId);
        if (!transaction) {
            throw new Error(`Transaction ${transactionId} not found`);
        }

        await transaction.rollback();
        this.activeTransactions.delete(transactionId);
    }

    async createSavepoint(transactionId: string, savepointName: string): Promise<void> {
        const transaction = this.activeTransactions.get(transactionId);
        if (!transaction) {
            throw new Error(`Transaction ${transactionId} not found`);
        }

        await transaction.request().query(`SAVE TRANSACTION ${savepointName}`);
    }

    async rollbackToSavepoint(transactionId: string, savepointName: string): Promise<void> {
        const transaction = this.activeTransactions.get(transactionId);
        if (!transaction) {
            throw new Error(`Transaction ${transactionId} not found`);
        }

        await transaction.request().query(`ROLLBACK TRANSACTION ${savepointName}`);
    }

    getActiveTransaction(transactionId: string): Transaction | undefined {
        return this.activeTransactions.get(transactionId);
    }

    getAllActiveTransactions(): Map<string, Transaction> {
        return new Map(this.activeTransactions);
    }

    async releaseTransaction(transactionId: string): Promise<void> {
        const transaction = this.activeTransactions.get(transactionId);
        if (transaction) {
            this.activeTransactions.delete(transactionId);
        }
    }
}