/**
 * Bull Queue Configuration and Setup
 * Manages background job processing for document handling
 */

import Queue, { Queue as BullQueue, Job } from "bull";
import { EntityId } from "@house-fin/contracts";

/**
 * Job data for document processing
 */
export interface DocumentProcessingJobData {
    documentId: EntityId;
    householdId: EntityId;
    correlationId: string;
}

/**
 * Create or get the document processing queue
 * Uses Redis for job persistence and distribution
 */
export function createDocumentProcessingQueue(): BullQueue<DocumentProcessingJobData> {
    const redisHost = process.env.REDIS_HOST || "localhost";
    const redisPort = parseInt(process.env.REDIS_PORT || "6379", 10);
    const redisPassword = process.env.REDIS_PASSWORD;

    const queue = new Queue<DocumentProcessingJobData>("document-processing", {
        redis: {
            host: redisHost,
            port: redisPort,
            password: redisPassword || undefined,
            retryStrategy: (times: number) => {
                const delay = Math.min(times * 50, 2000);
                return delay;
            },
        },
        settings: {
            // Process 1 job at a time per worker
            concurrency: 1,

            // Jobs have max 5 minutes to complete
            lockDuration: 5 * 60 * 1000,

            // Renew lock every 1 minute (lockDuration / 2)
            lockRenewTime: 1 * 60 * 1000,

            // Retry failed jobs 3 times with exponential backoff
            maxStalledCount: 2,

            // Move stalled jobs back to active after 30 seconds
            stalledInterval: 30 * 1000,

            // Failed jobs go to dead-letter queue after 3 attempts
            maxRetriesPerJob: 3,
        },
    });

    // Event handlers for monitoring
    queue.on("error", (err) => {
        console.error("Queue error:", err);
    });

    queue.on("completed", (job: Job<DocumentProcessingJobData>) => {
        console.log(`Document processing job ${job.id} completed for document ${job.data.documentId}`);
    });

    queue.on("failed", (job: Job<DocumentProcessingJobData>, err: Error) => {
        console.error(`Document processing job ${job.id} failed:`, err.message);
    });

    queue.on("stalled", (job: Job<DocumentProcessingJobData>) => {
        console.warn(`Document processing job ${job.id} stalled and will be retried`);
    });

    return queue;
}

/**
 * Get or create the job queue globally
 * Ensures single queue instance across application
 */
let documentProcessingQueue: BullQueue<DocumentProcessingJobData> | null = null;

export function getDocumentProcessingQueue(): BullQueue<DocumentProcessingJobData> {
    if (!documentProcessingQueue) {
        documentProcessingQueue = createDocumentProcessingQueue();
    }
    return documentProcessingQueue;
}

/**
 * Enqueue a document for processing
 * Adds job to queue with automatic retry and monitoring
 */
export async function enqueueDocumentProcessing(
    documentId: EntityId,
    householdId: EntityId,
    correlationId: string
): Promise<Job<DocumentProcessingJobData>> {
    const queue = getDocumentProcessingQueue();

    const job = await queue.add(
        {
            documentId,
            householdId,
            correlationId,
        },
        {
            // Use correlation ID as job key for deduplication
            jobId: correlationId,

            // Attempts: initial + 3 retries = 4 total
            attempts: 4,

            // Exponential backoff: delay = 1000 * 2^(attempt-1)
            backoff: {
                type: "exponential",
                delay: 2000,
            },

            // Remove job when complete (keeps queue clean)
            removeOnComplete: true,

            // Keep failed jobs for 7 days for debugging
            removeOnFail: false,
        }
    );

    console.log(
        `Enqueued document ${documentId} for processing (job ${job.id}, correlation ${correlationId})`
    );

    return job;
}

/**
 * Clean up resources when shutting down
 */
export async function closeDocumentProcessingQueue(): Promise<void> {
    if (documentProcessingQueue) {
        await documentProcessingQueue.close();
        documentProcessingQueue = null;
    }
}

/**
 * Get queue statistics for monitoring
 */
export async function getQueueStats(): Promise<{
    active: number;
    waiting: number;
    completed: number;
    failed: number;
    delayed: number;
}> {
    const queue = getDocumentProcessingQueue();
    return {
        active: await queue.getActiveCount(),
        waiting: await queue.getWaitingCount(),
        completed: await queue.getCompletedCount(),
        failed: await queue.getFailedCount(),
        delayed: await queue.getDelayedCount(),
    };
}
