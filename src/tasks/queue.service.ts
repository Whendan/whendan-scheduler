import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

const QUEUE_NAME = 'warehouse-optimization';

export interface PgmqMessage {
    msg_id: bigint;
    read_ct: number;
    enqueued_at: Date;
    vt: Date;
    message: Record<string, unknown>;
}

@Injectable()
export class QueueService {
    private readonly logger = new Logger(QueueService.name);

    constructor(@InjectDataSource() private readonly dataSource: DataSource) { }

    /**
     * Creates the pgmq queue if it does not already exist.
     * Safe to call multiple times — pgmq.create() is idempotent.
     */
    async ensureQueue(): Promise<void> {
        await this.dataSource.query(`SELECT pgmq.create($1)`, [QUEUE_NAME]);
        this.logger.log(`Queue "${QUEUE_NAME}" is ready.`);
    }

    /**
     * Sends a single message to the queue with the warehouse ID and run date.
     */
    async enqueue(warehouseId: string, runDate: string): Promise<void> {
        await this.dataSource.query(
            `SELECT pgmq.send($1, $2::jsonb)`,
            [QUEUE_NAME, JSON.stringify({ warehouseId, runDate })],
        );
    }

    /**
     * Reads at most one message from the queue, locking it for vtSeconds seconds
     * (visibility timeout). Returns null when the queue is empty.
     */
    async readOne(vtSeconds: number): Promise<PgmqMessage | null> {
        const rows: PgmqMessage[] = await this.dataSource.query(
            `SELECT * FROM pgmq.read($1, $2, 1)`,
            [QUEUE_NAME, vtSeconds],
        );
        return rows[0] ?? null;
    }

    /**
     * Moves a successfully processed message to the pgmq archive table for
     * long-term retention. Prefer this over delete() for audit purposes.
     */
    async archive(msgId: bigint): Promise<void> {
        await this.dataSource.query(`SELECT pgmq.archive($1, $2)`, [QUEUE_NAME, msgId]);
    }

    /**
     * Permanently deletes a message. Used after MAX_RETRIES is exceeded to
     * prevent a poison-pill message from cycling indefinitely.
     */
    async deleteMsg(msgId: bigint): Promise<void> {
        await this.dataSource.query(`SELECT pgmq.delete($1, $2)`, [QUEUE_NAME, msgId]);
    }
}
