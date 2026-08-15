# Slice 2 Post-Implementation Review

**Date:** 2026-08-14  
**Scope:** Document Persistence & Statement Processing UX  
**Review Type:** Architectural, Security, Data Integrity, UX, Testing  
**Findings Classification:** CRITICAL | HIGH | MEDIUM | LOW

---

## Executive Summary

Slice 2 implementation is **substantially complete** with good foundational patterns, but has **critical gaps** in async processing, data integrity safeguards, and security controls. The implementation follows SOLID principles well at the domain layer, but lacks the operational completeness needed for production statement processing.

**Key Status:**
- ✅ Domain layer: Well-designed, comprehensive tests, idempotent operations
- ✅ Database schema: Proper constraints, enums, audit trail
- ✅ UX components: Clear, non-technical, privacy-first
- ⚠️ API layer: Incomplete async processing, no background jobs
- ⚠️ Security: File validation good, but no virus scanning, rate limiting gaps
- ⚠️ Data integrity: No transactional posting, no soft-delete pattern
- ⚠️ Testing: Domain tests strong, but missing integration/E2E/failure tests

---

## 1. ARCHITECTURAL FINDINGS

### 1.1 CRITICAL: No Background Job Processing

**Issue:** API returns 202 (Accepted) for document uploads but there is NO worker process to actually parse/reconcile/post documents.

**Evidence:**
- `apps/api/src/server.ts` line 673: `res.status(202).json(response)` comment "// 202 Accepted - async processing"
- No Bull queue, no job definitions, no worker implementation
- `apps/worker/` directory exists but is empty
- State machine shows transitions through VALIDATING → PARSING → NORMALIZING → RECONCILING → POSTING, but no code drives these transitions

**Impact:**
- Documents uploaded through API will remain in UPLOADED state forever
- Users never see processing updates, review items never appear
- Statement processing pipeline is incomplete
- **Slice 2 UX testing relies on manual status changes in database**

**Risk Level:** 🔴 **CRITICAL** - Feature is non-functional without background processing

**Recommended Fix:**
```
1. Implement Bull queue with Redis (already available in infrastructure)
2. Define document-processing job that:
   - Polls for documents in UPLOADED status
   - Transitions to VALIDATING
   - Calls parser (stub for now in Slice 2)
   - Updates status with error handling
   - Has exponential backoff + dead-letter queue
3. Implement statement-reconciliation job
4. Implement transaction-posting job
5. Add to docker-compose.yml as separate worker container
6. Add queue monitoring endpoint for ops
```

---

### 1.2 HIGH: API Server Still Single File (Not Modularized)

**Issue:** `apps/api/src/server.ts` is now 1300+ lines. Adding Slice 3 parsing/reconciliation will compound this.

**Evidence:**
- Document endpoints: lines 534-861 (328 lines)
- Review queue endpoints: lines 878-1130 (252 lines)
- Posting endpoints: lines 1147-1280 (133 lines)
- Plus financial snapshot, household, account endpoints

**Current Structure:**
```
server.ts (1300+ lines)
  ├─ POST /documents/upload (line 534)
  ├─ GET /documents/:id (line 681)
  ├─ GET /documents (line 731)
  ├─ GET /documents/:id/summary (line 790)
  ├─ GET /review-queue/* (line 878)
  ├─ POST /posting/* (line 1147)
  └─ [Plus 3 endpoints for households, accounts, snapshots]
```

**Impact:**
- Hard to test individual endpoints
- Difficult to reason about dependencies
- Reusable logic embedded in route handlers
- No clear service layer separation

**Risk Level:** 🟡 **HIGH** - Architectural debt will compound with Slice 3

**Recommended Fix:**
```
Refactor to modular structure:
  apps/api/src/
    ├─ server.ts (app setup, middleware, error handling only)
    ├─ routes/
    │  ├─ documents.routes.ts (upload, status, summary)
    │  ├─ review-queue.routes.ts (queue operations)
    │  └─ posting.routes.ts (post transactions)
    └─ services/
       ├─ document-processing.service.ts
       ├─ review-queue.service.ts
       └─ posting.service.ts
```

---

### 1.3 HIGH: ReviewQueueService in Wrong Layer

**Issue:** `PgReviewQueueService` is in `repositories.ts` (data layer), not in a separate service layer.

**Evidence:**
- `apps/api/src/db/repositories.ts` line 640+: ReviewQueueService implementation
- Mixes data access, business logic, and service logic
- Methods like `getStats()`, `resolveReviewItem()` should be domain services

**Impact:**
- Violates separation of concerns
- Hard to unit test without database
- Difficult to add business rules (e.g., "can't resolve after 30 days")
- Missing from `@house-fin/domain` package where it belongs

**Risk Level:** 🟡 **HIGH** - Data layer pollution

**Recommended Fix:**
```
Move to: packages/domain/review-queue.service.ts
  - Pure functions for review logic
  - No database calls
  - Repository injected as dependency
Move database implementation to: apps/api/src/db/review-queue.repository.ts
```

---

### 1.4 MEDIUM: ObjectStorageAdapter Not in Dedicated Service Layer

**Issue:** `ObjectStorageAdapter` is in `storage/object-storage.ts` (config layer), not connected to domain services.

**Evidence:**
- `apps/api/src/storage/object-storage.ts` - 330 lines
- No service layer that orchestrates storage + database + domain logic
- Responsibilities scattered: key generation (domain), validation (domain), upload (storage)

**Current Flow:**
```
API endpoint
  ├─ Calls storage.uploadFile(key, buffer)
  ├─ Calls documentRepo.create(metadata)
  └─ Returns response
```

**Recommended Structure:**
```
API endpoint
  └─ Calls documentProcessingService.uploadStatement(request)
      ├─ Validates (domain layer)
      ├─ Generates key (domain layer)
      ├─ Uploads file (storage layer)
      ├─ Creates record (repository layer)
      └─ Enqueues job (queue layer)
```

**Risk Level:** 🟡 **MEDIUM** - Architectural clarity issue, not a functional problem

---

### 1.5 MEDIUM: No Transaction Boundaries for Multi-Step Operations

**Issue:** Upload operation is not transactional:
1. File uploaded to MinIO
2. Database record created

If step 2 fails, step 1 succeeds but is orphaned.

**Evidence:**
- `apps/api/src/server.ts` line 634-677: File uploaded, then create() called separately
- No try/catch to clean up MinIO upload on database failure
- No transaction wrapper

**Impact:**
- MinIO can contain orphaned files
- No way to recover if database fails during create

**Risk Level:** 🟡 **MEDIUM** - Data consistency issue

**Recommended Fix:**
```typescript
try {
  await storageAdapter.uploadFile(key, buffer, mimeType);
} catch (error) {
  // File upload failed - return error, no cleanup needed
  throw error;
}

try {
  const doc = await documentRepo.create(metadata);
} catch (error) {
  // Database failed - delete uploaded file as cleanup
  try {
    await storageAdapter.deleteFile(key);
  } catch (cleanupError) {
    logger.error('Failed to clean up orphaned file', { key, cleanupError });
  }
  throw error;
}
```

---

## 2. DATA INTEGRITY FINDINGS

### 2.1 CRITICAL: No Soft-Delete Pattern for Documents

**Issue:** AGENTS.md requires "Never silently overwrite imported financial records" and "Raw imported financial data is append-only". But current design allows:
- Document status can be changed multiple times
- If processing fails → retry → overwrites previous state
- No audit trail of what was extracted

**Evidence:**
- `financial_documents` table has no `deletedAt` column
- No soft-delete constraints
- `updateStatus()` overwrites without preserving history

**Scenario:**
```
1. User uploads statement.csv → UPLOADED
2. Parser extracts 100 transactions → stored somewhere
3. Reconciliation marks status RECONCILING
4. User reuploads same statement → UPLOADED again
   (Previous parse result lost)
```

**Impact:**
- Violates AGENTS.md "append-only" requirement
- Can't audit what was extracted
- Reprocessing loses history

**Risk Level:** 🔴 **CRITICAL** - Architecture violation

**Recommended Fix:**
```sql
-- Add processing history table
CREATE TABLE document_processing_history (
  id UUID PRIMARY KEY,
  document_id UUID NOT NULL REFERENCES financial_documents(id),
  previous_status document_processing_status,
  new_status document_processing_status,
  changed_at TIMESTAMP DEFAULT NOW(),
  changed_by VARCHAR(255),
  reason TEXT -- Why status changed
);

-- Add to financial_documents: deleted_at timestamp (NULL = active)
ALTER TABLE financial_documents ADD COLUMN deleted_at TIMESTAMP;

-- Reprocessing means creating new document record, not updating old
-- Link old document with deleted_at = now()
```

---

### 2.2 CRITICAL: No Atomicity for Transaction Posting

**Issue:** Posting imported transactions to account should be atomic, but posting is done as batch INSERT without transaction wrapping.

**Evidence:**
- `PgPostingRepository.createPostedTransactions()` line 927-1000: Batch insert
- No `BEGIN TRANSACTION` wrapper
- If insert fails mid-way, partial transactions are posted

**Scenario:**
```
1. Review approves 100 transactions for posting
2. createPostedTransactions() inserts 50, then connection drops
3. 50 transactions now show as "posted"
4. Financial snapshot recalculates with incorrect balance
5. User sees wrong net worth
```

**Impact:**
- Data corruption if posting fails
- Balance discrepancies
- Violates financial correctness requirement

**Risk Level:** 🔴 **CRITICAL** - Data corruption risk

**Recommended Fix:**
```typescript
async createPostedTransactions(
  transactions: PostedTransaction[]
): Promise<PostedTransaction[]> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN TRANSACTION');
    
    // Batch insert inside transaction
    const results = await Promise.all(
      transactions.map(tx => 
        client.query('INSERT INTO posted_transactions (...) VALUES (...)')
      )
    );
    
    await client.query('COMMIT');
    return results;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
```

---

### 2.3 HIGH: No Duplicate Prevention Within Statement

**Issue:** If same transaction appears twice in CSV (rows 5 and 25), both get imported.

**Evidence:**
- Current checksum deduplicates by FILE
- No deduplication within file

**Scenario:**
```csv
Date,Description,Amount
2026-01-15,Groceries,-50.00
2026-01-15,Gas,-30.00
2026-01-15,Groceries,-50.00  ← Duplicate of row 1
```

**Current Behavior:** All 3 imported, 1 duplicate after reconciliation  
**Expected Behavior:** Row 3 flagged as duplicate within statement

**Impact:**
- User confusion ("Why is groceries listed twice?")
- Extra review items
- Manual deduplication work

**Risk Level:** 🟡 **HIGH** - UX friction, not data corruption

**Recommended Fix:**
```
Parser should track transaction fingerprints:
  - Calculate: SHA256(date + amount + description)
  - If fingerprint seen in same statement → flag as duplicate
  - Store deduplicated candidates to reconciliation
```

---

### 2.4 HIGH: No Provenance Tracking for Imported Transactions

**Issue:** After posting transactions, no way to trace back to original statement or parser version.

**Evidence:**
- `posted_transactions` table references `source_document_id` but not `source_row_number`
- No `parser_version` stored on transactions
- No way to replay parsing with new parser

**Scenario:**
```
1. Parse statement.csv with parser v1.0
2. Extract 100 transactions
3. New parser v1.1 released (better date handling)
4. User asks: "Can you re-parse with new parser?"
   → NO WAY TO DO THIS
```

**Impact:**
- Can't audit parser quality
- Can't replay on schema changes
- Violates AGENTS.md "calculation_version, source_snapshot_id" requirement

**Risk Level:** 🟡 **HIGH** - Auditability gap

**Recommended Fix:**
```sql
ALTER TABLE posted_transactions ADD COLUMN (
  parser_version VARCHAR(20) NOT NULL,
  source_row_number INTEGER,           -- Which row in CSV
  source_page_number INTEGER,          -- Which page in PDF
  parser_confidence NUMERIC(3,2),      -- Confidence score from parser
  raw_parser_output JSONB              -- Original parser result
);

-- Add to financial_documents: parser_version used
ALTER TABLE financial_documents ADD COLUMN parser_version VARCHAR(20);
```

---

### 2.5 MEDIUM: Statement Reprocessing Not Supported

**Issue:** If user re-uploads same statement, API returns 200 (idempotent) but processing_version doesn't increment.

**Evidence:**
- `findByChecksum()` returns existing document
- `processingVersion` stays at 1
- No way to reprocess with updated parser

**Expected Flow:**
```
1. Upload statement.csv (checksumA) → doc1, processing_version=1
2. 3 months later: Upload statement.csv (same checksumA)
   → Return doc1 (idempotent)
3. But if we improve parser → Want to reprocess
   → Need new processing_version entry
```

**Current Implementation:**
```typescript
// From server.ts line 630-639
const existingDoc = await documentRepo.findByChecksum(householdId, fileChecksum);
if (existingDoc) {
    // Return existing, no reprocessing possible
    return res.status(200).json(statusResponse);
}
```

**Impact:**
- Parser improvements can't be applied retroactively
- No way to "refresh" old imports
- Violates "processingVersion" design in schema

**Risk Level:** 🟡 **MEDIUM** - Missing feature, not a bug

**Recommended Fix:**
```
Add optional query param: POST /documents/upload?reprocess=true
  - If checksum exists + reprocess=true
    → Create new processing_version entry
    → Requeue for reprocessing
    → Link to previous version for history
```

---

## 3. SECURITY FINDINGS

### 3.1 HIGH: No File Content Validation (Only File Type)

**Issue:** File type is validated (CSV, PDF, image) but content is not validated.

**Evidence:**
- `validateDocumentUpload()` checks MIME type only
- No file magic numbers verification
- User could upload `.pdf` with executable content

**Scenario:**
```
User uploads "statement.pdf" (actually .exe in PDF clothing)
  → MIME type: application/pdf ✓ (passes validation)
  → Content: MZ header (exe) ✗ (not validated)
  → Gets stored in MinIO
  → If someone later downloads and executes... risk!
```

**Impact:**
- Malicious file storage
- Potential delivery vector for malware
- Violates security requirements

**Risk Level:** 🟡 **HIGH** - Security control missing

**Recommended Fix:**
```typescript
function validateFileContent(buffer: Buffer, mimeType: string): boolean {
  // Check magic numbers
  const magicNumbers = {
    'application/pdf': [0x25, 0x50, 0x44, 0x46], // %PDF
    'text/csv': [0x0D, 0x0A], // or just text
    'image/png': [0x89, 0x50, 0x4E, 0x47],
    'image/jpeg': [0xFF, 0xD8, 0xFF],
  };
  
  const expectedMagic = magicNumbers[mimeType];
  if (!expectedMagic) return false;
  
  return buffer.subarray(0, expectedMagic.length)
    .every((byte, i) => byte === expectedMagic[i]);
}
```

---

### 3.2 HIGH: No Rate Limiting on Upload Endpoint

**Issue:** POST /documents/upload has no rate limiting. User could spam large files.

**Evidence:**
- No rate limiting middleware
- No per-household quota
- No per-user throttle

**Scenario:**
```
Attacker uploads 100 × 50MB files in rapid succession
  → 5GB of MinIO storage consumed
  → Redis queue overwhelmed
  → Legitimate users blocked
```

**Impact:**
- DoS vulnerability
- Storage exhaustion
- Operational disruption

**Risk Level:** 🟡 **HIGH** - Operational security

**Recommended Fix:**
```typescript
// Add rate limit middleware
import rateLimit from 'express-rate-limit';

const uploadLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // 10 uploads per minute per household
  keyGenerator: (req) => req.context!.householdId,
  message: 'Too many uploads. Please wait before uploading again.'
});

app.post('/documents/upload', uploadLimiter, verifyHouseholdContext, ...);

// Also add storage quota per household
const HOUSEHOLD_STORAGE_QUOTA = 10 * 1024 * 1024 * 1024; // 10GB
```

---

### 3.3 HIGH: ObjectStorageKey Validation Not Restrictive Enough

**Issue:** Validation regex could be bypassed with clever inputs.

**Evidence:**
- `validateObjectKey()` line 291-299 in object-storage.ts
- Regex: `/^household-[a-f0-9-]{36}\/statements\//`
- Checks for ".." and "~" but not all path traversal vectors

**Potential Issues:**
```
household-{id}/statements/../../../etc/passwd  ← Contains ".."
household-{id}/statements/../../root  ← Contains ".."
```

These ARE caught. But what about:
```
household-{id}/statements/%2e%2e/files  ← URL encoded ".."
```

**Impact:**
- Path traversal if decoding is done
- Access to other buckets/paths

**Risk Level:** 🟡 **HIGH** - Attack vector

**Recommended Fix:**
```typescript
private validateObjectKey(objectKey: string): void {
  // Decode any URL encoding first
  const decodedKey = decodeURIComponent(objectKey);
  
  // Must not contain path traversal
  if (decodedKey.includes('..') || decodedKey.includes('~') || 
      decodedKey.includes('%') || decodedKey.includes('\\')) {
    throw new Error('Invalid object key: potential traversal attack');
  }
  
  // Must match strict pattern only
  const strictPattern = /^household-[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\/statements\/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\/\d{17}\.[a-z0-9]{1,10}$/;
  
  if (!strictPattern.test(decodedKey)) {
    throw new Error('Invalid object key: unexpected format');
  }
  
  if (decodedKey.length > 512) {
    throw new Error('Invalid object key: too long');
  }
}
```

---

### 3.4 MEDIUM: No Virus Scanning

**Issue:** No antivirus scanning on uploaded files.

**Evidence:**
- Files accepted and stored without scanning
- No integration with ClamAV or similar

**Impact:**
- Potentially compromised files stored
- Regulatory compliance gap (GDPR, SOC2)
- Risk propagation if files shared

**Risk Level:** 🟡 **MEDIUM** - Compliance/risk management

**Recommended Fix:**
```
Option 1: Integrate ClamAV
  - Add to docker-compose.yml
  - Scan file in worker job before parsing
  - Quarantine if infected

Option 2: Use cloud antivirus
  - AWS GuardDuty, Azure Defender, etc.
  - If self-hosted not viable

Option 3: Defer to Slice 3/4
  - Document as future requirement
```

---

### 3.5 MEDIUM: No File Download Authentication Check

**Issue:** `getSignedDownloadUrl()` generates URLs but doesn't verify householdId access.

**Evidence:**
- `getSignedDownloadUrl()` line 327-346 validates key format only
- Doesn't check if caller owns the document

**Scenario:**
```
1. Household A uploads statement (document_id = 123)
2. Someone guesses the signed URL
3. They can download Household A's statement without auth
```

**Current Code:**
```typescript
async getSignedDownloadUrl(objectKey: string): Promise<string> {
  this.validateObjectKey(objectKey);
  // ✓ Key format checked
  // ✗ No household ownership verified
  return presignedGetObject(objectKey);
}
```

**Impact:**
- Information disclosure
- Privacy violation

**Risk Level:** 🟡 **MEDIUM** - Access control gap

**Recommended Fix:**
```typescript
async getSignedDownloadUrl(
  householdId: EntityId,
  documentId: EntityId,
  objectKey: string
): Promise<string> {
  // Verify document belongs to household
  const doc = await documentRepo.findById(documentId);
  if (!doc || doc.householdId !== householdId) {
    throw new Error('Access denied');
  }
  
  this.validateObjectKey(objectKey);
  return presignedGetObject(objectKey);
}
```

---

### 3.6 MEDIUM: Logging May Expose Sensitive Data

**Issue:** Error messages and logs might contain sensitive data.

**Evidence:**
- `createUserFacingError()` is implemented, good
- But error logs on API could contain raw exception details
- No explicit PII scrubbing in logs

**Scenario:**
```
File upload fails → Exception logged →  Includes full file path, etc.
```

**Impact:**
- Information disclosure in logs
- Compliance issue if logs exposed

**Risk Level:** 🟡 **MEDIUM** - Logging hygiene

**Recommended Fix:**
```
1. Review all error logging in server.ts
2. Never log raw exception objects
3. Log structured errors: { errorCode, householdId, timestamp, correlationId }
4. Use correlation ID for debug log lookup
5. Implement log redaction middleware
```

---

## 4. UX FINDINGS

### 4.1 HIGH: DocumentUploadResponse Exposes Internal Structure

**Issue:** API response includes `objectStorageKey` which is implementation detail.

**Evidence:**
- `apps/api/src/server.ts` line 659: `objectStorageKey: document.objectStorageKey`
- Response type includes it in `DocumentUploadResponse`

**Response:**
```json
{
  "id": "uuid",
  "correlationId": "uuid",
  "objectStorageKey": "household-x/statements/y/timestamp.csv",  // ← Exposes internals
  "status": "UPLOADED",
  "message": "..."
}
```

**Impact:**
- Security through obscurity violation
- UI doesn't need this field
- Couples client to storage implementation

**Risk Level:** 🟡 **HIGH** - Information disclosure

**Recommended Fix:**
```typescript
export interface DocumentUploadResponse {
  id: EntityId;
  correlationId: EntityId;
  // ✗ Remove: objectStorageKey
  status: DocumentProcessingStatus;
  message: string;
  // ✓ Add polling information
  estimatedProcessingTimeMs?: number;
  statusCheckIntervalMs?: number;
}
```

---

### 4.2 HIGH: No Polling/Callback Mechanism for Async Processing

**Issue:** API returns 202 but client has no way to know when processing completes (except manual polling).

**Evidence:**
- Status endpoint exists: `GET /documents/:id`
- But no guidance on polling interval
- No webhook/callback mechanism
- UI must poll status every N seconds

**Current UX:**
```
1. User uploads → Gets correlationId
2. [Uncertain how long to wait]
3. User manually refreshes UI
4. Wait... still processing...
5. Refresh again...
```

**Impact:**
- Poor UX - users don't know when processing complete
- Inefficient polling - wasting bandwidth
- Battery drain on mobile

**Risk Level:** 🟡 **HIGH** - UX friction

**Recommended Fix:**
```typescript
// In DocumentUploadResponse, add:
{
  id: documentId,
  correlationId: uuid,
  status: "UPLOADED",
  message: "Document uploaded successfully.",
  // ✓ New fields for client polling
  statusCheckUrl: `/documents/${documentId}`,
  suggestedPollIntervalMs: 2000, // Start at 2s
  maxPollIntervalMs: 30000,       // Back off to 30s
  estimatedWaitTimeMs: 5000       // Rough estimate
}

// In GET /documents/:id response, add:
{
  id: documentId,
  processingStatus: "PARSING",
  processingProgress?: {
    stage: "PARSING",          // Current stage
    percentComplete: 45,       // 0-100
    estimatedRemainingMs: 3000
  }
}
```

Or better: **WebSocket support**
```
Client connects to ws://api/documents/:id/stream
  ← {status: "VALIDATING", progress: 10}
  ← {status: "PARSING", progress: 45}
  ← {status: "RECONCILING", progress: 80}
  ← {status: "COMPLETED", summary: {...}}
```

---

### 4.3 MEDIUM: Error Messages Could Be More Actionable

**Issue:** Error codes exist but linked error messages are in code, not configurable.

**Evidence:**
- `ERROR_GUIDANCE` in StatementUpload.tsx hardcoded
- Can't update user messages without code deploy
- No A/B testing or gradual rollout

**Current:**
```typescript
const ERROR_GUIDANCE = {
  "UPLOAD_FILE_TOO_LARGE": {
    what: "File is too large",
    why: "Files must be under 50MB",
    do: "Try a smaller or split file",
  },
  // ...
};
```

**Impact:**
- Can't hotfix misleading messages
- No analytics on error frequency
- Can't test message variations

**Risk Level:** 🟡 **MEDIUM** - Operational flexibility

**Recommended Fix:**
```
1. Move error guidance to database
2. Create /error-guidance endpoint
3. Cache in Redis (1 hour TTL)
4. Allow admin to update messages
5. Track error metrics by code
```

---

## 5. TESTING FINDINGS

### 5.1 CRITICAL: No E2E Upload → Processing → Review Flow Tests

**Issue:** Domain tests are comprehensive (44 tests), but NO end-to-end tests for full workflow.

**Evidence:**
- `tests/documents/document-upload.test.ts` - 44 domain logic tests ✓
- `tests/documents/repository.test.ts` - 13 repository tests ✓
- `tests/integration/` - Existing Slice 1 tests, no Slice 2 E2E

**Missing E2E Scenarios:**
```
1. Upload CSV → Verify stored → Verify status queryable
2. Upload PDF → Verify document created
3. Upload same file twice → Verify idempotent (200, existing doc)
4. Concurrent uploads → Verify isolation
5. Upload then query → Verify household isolation
6. Invalid file → Verify error response
7. Large file → Verify 50MB boundary
```

**Impact:**
- No verification that API/storage/database work together
- No proof that household isolation works
- No test coverage for error paths in real system

**Risk Level:** 🔴 **CRITICAL** - No integrated validation

**Recommended Fix:**
```typescript
// Add tests/integration/documents.e2e.test.ts
describe('Document Upload E2E', () => {
  test('Happy path: Upload CSV → stored → queryable', async () => {
    const csvContent = "Date,Amount\n2026-01-15,-50.00";
    const response = await fetch('/documents/upload', {
      method: 'POST',
      headers: { 'x-household-id': householdId },
      body: JSON.stringify({
        fileName: 'statement.csv',
        mimeType: 'text/csv',
        fileSize: csvContent.length,
        sourceType: 'CSV',
        fileContent: Buffer.from(csvContent).toString('base64')
      })
    });
    
    expect(response.status).toBe(202);
    const doc = await response.json();
    
    // Verify stored in MinIO (wait if needed)
    const fileExists = await storageAdapter.fileExists(doc.objectStorageKey);
    expect(fileExists).toBe(true);
    
    // Verify queryable via API
    const getResponse = await fetch(`/documents/${doc.id}`, {
      headers: { 'x-household-id': householdId }
    });
    expect(getResponse.status).toBe(200);
  });
  
  test('Idempotency: Upload same file twice → returns existing', async () => {
    // Upload file
    const response1 = await upload(csvContent);
    const doc1 = await response1.json();
    
    // Upload same file again
    const response2 = await upload(csvContent);
    expect(response2.status).toBe(200); // Idempotent
    const doc2 = await response2.json();
    
    expect(doc2.id).toBe(doc1.id); // Same document
  });
  
  test('Household isolation: Cannot access other household\'s documents', async () => {
    // Household A uploads
    const response = await upload(csvContent, householdIdA);
    const doc = await response.json();
    
    // Household B tries to access
    const getResponse = await fetch(`/documents/${doc.id}`, {
      headers: { 'x-household-id': householdIdB }
    });
    expect(getResponse.status).toBe(403);
  });
});
```

---

### 5.2 HIGH: No Failure/Retry Path Tests

**Issue:** No tests for partial failures, network errors, timeout recovery.

**Evidence:**
- Domain tests cover success paths
- No tests for:
  - MinIO unreachable
  - Database transaction timeout
  - Concurrent uploads to same document
  - Cleanup after failed upload

**Missing Tests:**
```
1. MinIO upload fails → Database rolled back?
2. Document creation fails → File deleted from MinIO?
3. Concurrent uploads of same file → Both see 200?
4. Database connection drops mid-create → Handled gracefully?
5. Rate limiting engaged → 429 response?
```

**Impact:**
- No proof that error scenarios are handled safely
- Potential orphaned files/records
- No verification of idempotency under failure

**Risk Level:** 🔴 **CRITICAL** - Untested error paths

**Recommended Fix:**
```typescript
describe('Document Upload - Failure Scenarios', () => {
  test('MinIO upload fails → no database record created', async () => {
    // Mock MinIO to fail
    storageAdapter.uploadFile = jest.fn()
      .mockRejectedValue(new Error('Connection refused'));
    
    const response = await fetch('/documents/upload', { ... });
    expect(response.status).toBe(500);
    
    // Verify no database record exists
    const count = await documentRepo.findByHouseholdId(householdId);
    expect(count.length).toBe(0);
  });
  
  test('Database create fails → MinIO file deleted', async () => {
    // Mock documentRepo to fail
    documentRepo.create = jest.fn()
      .mockRejectedValue(new Error('Constraint violation'));
    
    const response = await fetch('/documents/upload', { ... });
    expect(response.status).toBe(500);
    
    // Verify file was cleaned up
    const exists = await storageAdapter.fileExists(objectKey);
    expect(exists).toBe(false);
  });
});
```

---

### 5.3 HIGH: No Authorization Tests

**Issue:** No tests that verify household isolation is enforced.

**Evidence:**
- GET /documents/:id has 403 check (line 706-710)
- But no test verifying it works

**Missing Tests:**
```
1. Access document from different household → 403
2. Missing x-household-id header → 401/400
3. Invalid householdId → 403
4. ListDocuments filters by household → only own docs returned
```

**Impact:**
- No proof privacy is enforced
- Compliance risk (data exposure)

**Risk Level:** 🔴 **CRITICAL** - Security verification gap

**Recommended Fix:**
```typescript
describe('Document Authorization', () => {
  test('Cannot access other household\'s documents', async () => {
    const householdA = 'hh-a';
    const householdB = 'hh-b';
    
    // Create document in A
    const docInA = await documentRepo.create({
      householdId: householdA,
      ...otherFields
    });
    
    // B tries to access → 403
    const response = await fetch(`/documents/${docInA.id}`, {
      headers: { 'x-household-id': householdB }
    });
    expect(response.status).toBe(403);
  });
  
  test('List documents returns only for requesting household', async () => {
    const householdA = 'hh-a';
    const householdB = 'hh-b';
    
    // Create docs in A and B
    await documentRepo.create({ householdId: householdA, fileName: 'a.csv', ... });
    await documentRepo.create({ householdId: householdB, fileName: 'b.csv', ... });
    
    // A lists → sees only own
    const responseA = await fetch('/documents', {
      headers: { 'x-household-id': householdA }
    });
    const docsA = await responseA.json();
    expect(docsA).toHaveLength(1);
    expect(docsA[0].fileName).toBe('a.csv');
    
    // B lists → sees only own
    const responseB = await fetch('/documents', {
      headers: { 'x-household-id': householdB }
    });
    const docsB = await responseB.json();
    expect(docsB).toHaveLength(1);
    expect(docsB[0].fileName).toBe('b.csv');
  });
});
```

---

### 5.4 MEDIUM: No Reconciliation/Posting Tests

**Issue:** No tests for reconciliation engine or transaction posting.

**Evidence:**
- Reconciliation logic not yet implemented (Slice 3)
- No tests for posting pipeline
- No tests for partial failures in batch posting

**Impact:**
- When Slice 3 is implemented, no regression test baseline
- No proof posting is idempotent

**Risk Level:** 🟡 **MEDIUM** - Future-proofing gap

**Recommended Fix:**
```
Schedule for Slice 3 implementation:
- Parser tests with real CSV/PDF samples
- Reconciliation confidence scoring tests
- Batch posting transaction tests
- Partial failure recovery tests
```

---

### 5.5 MEDIUM: No Concurrent Upload Tests

**Issue:** No tests for race conditions.

**Scenario:**
```
1. Household uploads file A concurrently from 2 devices
2. Both calculate same checksum
3. Both query database simultaneously
4. Both see no existing doc
5. Both insert → Constraint violation?
```

**Impact:**
- UNIQUE constraint could be violated
- Unpredictable behavior under load

**Risk Level:** 🟡 **MEDIUM** - Edge case

**Recommended Fix:**
```typescript
describe('Concurrent Upload Handling', () => {
  test('Two concurrent uploads of same file → one wins', async () => {
    const csvContent = "Date,Amount\n2026-01-15,-50.00";
    
    // Upload same file concurrently
    const [response1, response2] = await Promise.all([
      upload(csvContent, householdId),
      upload(csvContent, householdId)
    ]);
    
    // One should be 202 (new), one should be 200 (duplicate)
    const statuses = [response1.status, response2.status].sort();
    expect(statuses).toEqual([200, 202]);
    
    // Both should reference same document
    const doc1 = await response1.json();
    const doc2 = await response2.json();
    expect(doc1.id).toBe(doc2.id);
  });
});
```

---

## 6. ARCHITECTURAL DRIFT

**From Slice 1 Architecture:**
- ✅ Repository pattern maintained
- ✅ Domain/data separation respected
- ✅ Type-safe contracts in place
- ⚠️ API server grew 300+ lines (should be modularized)
- ⚠️ Service layer moved to data layer (ReviewQueueService)
- ⚠️ No background job infrastructure (planned but not implemented)

**Compared to AGENTS.md:**
- ✅ Private financial data (PostgreSQL only)
- ✅ Append-only schema (financially)
- ✅ Type-safe tools
- ✅ No PII exposure
- ✅ User-friendly errors
- ⚠️ "Raw imported financial data is append-only" - not fully enforced (no soft delete)
- ✗ Background processing not implemented

**Against Product Contract (if existed):**
- No Product Build Contract referenced in AGENTS.md attachment
- Recommend creating document specifying success criteria

---

## 7. RECOMMENDATIONS BY PRIORITY

### Immediate (Block Slice 3)
1. ✅ Implement background job processing (Bull queue)
2. ✅ Add soft-delete pattern to documents table
3. ✅ Implement transaction wrapping for batch posting
4. ✅ Add E2E tests (upload → storage → query)
5. ✅ Add authorization tests

### Before Production
6. ✅ Remove `objectStorageKey` from API responses
7. ✅ Add file content validation (magic numbers)
8. ✅ Add rate limiting to upload endpoint
9. ✅ Implement polling/WebSocket for async status
10. ✅ Add virus scanning integration

### Medium-term Debt
11. ✅ Refactor server.ts into modular routes
12. ✅ Move ReviewQueueService to domain layer
13. ✅ Add processing history audit table
14. ✅ Add provenance fields to posted_transactions
15. ✅ Enable statement reprocessing

### Post-Production
16. Add webhook callbacks for processing completion
17. Add batch import dashboard
18. Add parser version management UI
19. Add reconciliation statistics
20. Add data retention policy enforcement

---

## 8. SLICE 3 READINESS ASSESSMENT

**Current State:** ⚠️ **PARTIAL READINESS**

**Can Proceed With Slice 3 If:**
- ✅ Background job queue implemented
- ✅ E2E tests passing
- ✅ Authorization tests passing
- ✅ Soft-delete pattern added

**Must Complete Before Slice 3:**
1. Background job infrastructure (CRITICAL)
2. E2E test framework (CRITICAL)
3. Soft-delete document pattern (CRITICAL)
4. Atomic batch posting (CRITICAL)

**Slice 3 Will Need:**
- Parser service for CSV/PDF/image
- Reconciliation engine
- Transaction normalization
- Review item workflow
- Auto-post threshold configuration

---

## 9. SECURITY CONCERNS SUMMARY

| Finding | Level | Impact | Mitigation |
|---------|-------|--------|-----------|
| No virus scanning | HIGH | Malware storage | Add ClamAV integration |
| File content validation missing | HIGH | Malware delivery | Check magic numbers |
| Rate limiting missing | HIGH | DoS risk | Add express-rate-limit |
| Path validation regex weak | HIGH | Traversal risk | Use strict pattern |
| No download auth check | MEDIUM | Info disclosure | Verify householdId |
| Logging may leak PII | MEDIUM | Compliance risk | Implement log redaction |
| API exposes objectStorageKey | MEDIUM | Implementation coupling | Remove from response |
| File delete after posting missing | MEDIUM | Storage abuse | Implement cleanup |

---

## 10. DATA INTEGRITY RISKS SUMMARY

| Finding | Level | Impact | Mitigation |
|---------|-------|--------|-----------|
| No soft-delete pattern | CRITICAL | Audit violation | Add deleted_at field |
| Batch posting not atomic | CRITICAL | Balance corruption | Wrap in transaction |
| No duplicate within statement | HIGH | UX friction | Check fingerprint in parser |
| No transaction provenance | HIGH | Audit gap | Add parser_version to posted_tx |
| Reprocessing not supported | MEDIUM | Parser stale | Add processing_version logic |
| Concurrent upload races | MEDIUM | Constraint risk | Add test + retry logic |

---

## 11. TESTING GAPS SUMMARY

| Area | Coverage | Gap |
|------|----------|-----|
| Domain logic | 44 tests ✓ | None identified |
| Repository | 13 tests ✓ | None identified |
| API endpoints | 0 tests ✗ | E2E upload flow |
| Error paths | 0 tests ✗ | MinIO/DB failures |
| Authorization | 0 tests ✗ | Household isolation |
| Concurrency | 0 tests ✗ | Race conditions |
| Reconciliation | 0 tests ✗ | (Deferred to Slice 3) |
| **Total E2E** | **0 tests** | **CRITICAL** |

---

## CONCLUSION

Slice 2 has a **solid foundational design** with excellent domain logic and test coverage. However, it has **critical operational gaps** that must be addressed before production:

1. **No async processing** - Documents never actually get processed
2. **No data integrity safeguards** - Posting can corrupt balances
3. **Missing security controls** - File validation, rate limiting, virus scanning
4. **Incomplete test coverage** - E2E and authorization tests missing
5. **Architectural clarity** - Service layer in wrong place, API monolithic

**Recommendation:** ✅ **Proceed to Slice 3** with following conditions:
- Implement background job queue (CRITICAL)
- Add E2E + authorization tests (CRITICAL)
- Add soft-delete and atomic posting (CRITICAL)
- Schedule security fixes for pre-production hardening

**Estimate to Production Ready:** 2-3 weeks additional work beyond Slice 3 implementation.

---

**Report Generated:** 2026-08-14  
**Reviewer Focus:** Architecture, Security, Data Integrity, UX, Testing  
**Classification:** Internal Review - Not for Public Distribution
