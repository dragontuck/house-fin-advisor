/**
 * PostgreSQL implementation of domain repositories
 */

import { query, getClient } from "./connection";
import {
    Household,
    HouseholdMember,
    Account,
    FinancialSnapshot,
    HouseholdSettings,
    FinancialDocument,
    EntityId,
    Money,
    CreateHouseholdRequest,
    CreateAccountRequest,
    DocumentProcessingStatus,
    DocumentSourceType,
    HouseholdMemberRole,
    HouseholdMemberVisibility,
    AccountType,
    AccountOwnership,
    AccountStatus,
    FinancialHealthStatus,
    ReviewItem,
    ReviewType,
    ReviewSeverity,
    ReviewStatus,
    ReviewResolution,
    AdvisorConversation,
    AdvisorMessage,
    AdvisorMessageRole,
    WorkflowState,
    ToolExecution,
} from "@house-fin/contracts";
import {
    HouseholdRepository,
    HouseholdMemberRepository,
    AccountRepository,
    FinancialSnapshotRepository,
    HouseholdSettingsRepository,
    FinancialDocumentRepository,
    CreateFinancialDocumentInput,
    IReviewRepository,
    IPostingRepository,
    IBudgetRepository,
    ICashFlowRepository,
    ISavingsGoalRepository,
    IDebtRepository,
    AdvisorConversationRepository,
    AdvisorMessageRepository,
    WorkflowStateRepository,
    ToolExecutionRepository,
} from "@house-fin/domain";
import {
    PostedTransaction,
    StatementPostingAudit,
    AutoPostConfig,
    Budget,
    SavingsGoal,
    GoalType,
} from "@house-fin/contracts";

// Type for database row objects
type DbRow = Record<string, unknown>;

/**
 * PostgreSQL HouseholdRepository
 */
export class PgHouseholdRepository implements HouseholdRepository {
    async create(req: CreateHouseholdRequest): Promise<Household> {
        const result = await query(
            "INSERT INTO finhouse.households (name) VALUES ($1) RETURNING id, name, created_at, updated_at",
            [req.name]
        );
        const row = result.rows[0];
        return {
            id: row.id as EntityId,
            name: row.name,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
        };
    }

    async findById(id: EntityId): Promise<Household | null> {
        const result = await query("SELECT * FROM finhouse.households WHERE id = $1", [id]);
        if (result.rows.length === 0) return null;
        const row = result.rows[0];
        return {
            id: row.id as EntityId,
            name: row.name,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
        };
    }

    async findAll(): Promise<Household[]> {
        const result = await query("SELECT * FROM finhouse.households ORDER BY created_at DESC");
        return result.rows.map((row) => ({
            id: row.id as EntityId,
            name: row.name,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
        }));
    }

    async update(id: EntityId, household: Partial<Household>): Promise<Household> {
        const updates = [];
        const values = [];
        let paramIndex = 1;

        if (household.name !== undefined) {
            updates.push(`name = $${paramIndex}`);
            values.push(household.name);
            paramIndex++;
        }

        updates.push(`updated_at = CURRENT_TIMESTAMP`);
        values.push(id);

        const result = await query(
            `UPDATE finhouse.households SET ${updates.join(", ")} WHERE id = $${paramIndex} RETURNING *`,
            values
        );
        const row = result.rows[0];
        return {
            id: row.id as EntityId,
            name: row.name,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
        };
    }
}

/**
 * PostgreSQL HouseholdMemberRepository
 */
export class PgHouseholdMemberRepository implements HouseholdMemberRepository {
    async create(
        member: Omit<HouseholdMember, "id" | "createdAt">
    ): Promise<HouseholdMember> {
        const result = await query(
            "INSERT INTO finhouse.household_members (household_id, identity_id, display_name, role, visibility) VALUES ($1, $2, $3, $4, $5) RETURNING *",
            [
                member.householdId,
                member.identityId,
                member.displayName,
                member.role,
                member.visibility,
            ]
        );
        const row = result.rows[0];
        return {
            id: row.id as EntityId,
            householdId: row.household_id as EntityId,
            identityId: row.identity_id,
            displayName: row.display_name,
            role: row.role,
            visibility: row.visibility,
            createdAt: row.created_at,
        };
    }

    async findByHouseholdId(householdId: EntityId): Promise<HouseholdMember[]> {
        const result = await query(
            "SELECT * FROM finhouse.household_members WHERE household_id = $1 ORDER BY created_at",
            [householdId]
        );
        return result.rows.map((row) => ({
            id: row.id as EntityId,
            householdId: row.household_id as EntityId,
            identityId: row.identity_id,
            displayName: row.display_name,
            role: row.role as HouseholdMemberRole,
            visibility: row.visibility as HouseholdMemberVisibility,
            createdAt: row.created_at,
        }));
    }

    async findByIdentityId(
        householdId: EntityId,
        identityId: string
    ): Promise<HouseholdMember | null> {
        const result = await query(
            "SELECT * FROM finhouse.household_members WHERE household_id = $1 AND identity_id = $2",
            [householdId, identityId]
        );
        if (result.rows.length === 0) return null;
        const row = result.rows[0];
        return {
            id: row.id as EntityId,
            householdId: row.household_id as EntityId,
            identityId: row.identity_id,
            displayName: row.display_name,
            role: row.role as HouseholdMemberRole,
            visibility: row.visibility as HouseholdMemberVisibility,
            createdAt: row.created_at,
        };
    }

    async findAll(): Promise<HouseholdMember[]> {
        const result = await query("SELECT * FROM finhouse.household_members ORDER BY created_at");
        return result.rows.map((row) => ({
            id: row.id as EntityId,
            householdId: row.household_id as EntityId,
            identityId: row.identity_id,
            displayName: row.display_name,
            role: row.role as HouseholdMemberRole,
            visibility: row.visibility as HouseholdMemberVisibility,
            createdAt: row.created_at,
        }));
    }
}

/**
 * PostgreSQL AccountRepository
 */
export class PgAccountRepository implements AccountRepository {
    async create(req: CreateAccountRequest): Promise<Account> {
        const result = await query(
            `INSERT INTO finhouse.accounts 
       (household_id, name, type, ownership, currency, current_balance_cents, institution_name) 
       VALUES ($1, $2, $3, $4, $5, $6, $7) 
       RETURNING *`,
            [
                req.householdId,
                req.name,
                req.type,
                req.ownership,
                req.currency || "USD",
                req.currentBalance,
                req.institutionName || null,
            ]
        );
        const row = result.rows[0];
        return this.rowToAccount(row);
    }

    async findById(id: EntityId): Promise<Account | null> {
        const result = await query("SELECT * FROM finhouse.accounts WHERE id = $1", [id]);
        if (result.rows.length === 0) return null;
        return this.rowToAccount(result.rows[0]);
    }

    async findByHouseholdId(householdId: EntityId): Promise<Account[]> {
        const result = await query(
            "SELECT * FROM finhouse.accounts WHERE household_id = $1 ORDER BY created_at",
            [householdId]
        );
        return result.rows.map((row) => this.rowToAccount(row));
    }

    async findAll(): Promise<Account[]> {
        const result = await query("SELECT * FROM finhouse.accounts ORDER BY created_at");
        return result.rows.map((row) => this.rowToAccount(row));
    }

    async update(id: EntityId, account: Partial<Account>): Promise<Account> {
        const updates = [];
        const values = [];
        let paramIndex = 1;

        if (account.name !== undefined) {
            updates.push(`name = $${paramIndex}`);
            values.push(account.name);
            paramIndex++;
        }
        if (account.currentBalance !== undefined) {
            updates.push(`current_balance_cents = $${paramIndex}`);
            values.push(account.currentBalance);
            paramIndex++;
        }
        if (account.status !== undefined) {
            updates.push(`status = $${paramIndex}`);
            values.push(account.status);
            paramIndex++;
        }

        updates.push(`updated_at = CURRENT_TIMESTAMP`);
        values.push(id);

        const result = await query(
            `UPDATE finhouse.accounts SET ${updates.join(", ")} WHERE id = $${paramIndex} RETURNING *`,
            values
        );
        return this.rowToAccount(result.rows[0]);
    }

    async updateDebtDetails(id: EntityId, details: {
        creditLimitCents?: number | null;
        interestRateBps?: number | null;
        minimumPaymentCents?: number | null;
        scheduledPaymentCents?: number | null;
        statementBalanceCents?: number | null;
        revolvingBalanceCents?: number | null;
    }): Promise<Account> {
        const updates: string[] = [];
        const values: unknown[] = [];
        let p = 1;

        const cols: [keyof typeof details, string][] = [
            ["creditLimitCents", "credit_limit_cents"],
            ["interestRateBps", "interest_rate_bps"],
            ["minimumPaymentCents", "minimum_payment_cents"],
            ["scheduledPaymentCents", "scheduled_payment_cents"],
            ["statementBalanceCents", "statement_balance_cents"],
            ["revolvingBalanceCents", "revolving_balance_cents"],
        ];

        for (const [key, col] of cols) {
            if (Object.prototype.hasOwnProperty.call(details, key)) {
                updates.push(`${col} = $${p++}`);
                values.push(details[key] ?? null);
            }
        }

        if (updates.length === 0) throw new Error("No debt detail fields to update");

        updates.push(`updated_at = CURRENT_TIMESTAMP`);
        values.push(id);

        const result = await query(
            `UPDATE finhouse.accounts SET ${updates.join(", ")} WHERE id = $${p} RETURNING *`,
            values
        );
        return this.rowToAccount(result.rows[0]);
    }

    private rowToAccount(row: DbRow): Account {
        return {
            id: row.id as EntityId,
            householdId: row.household_id as EntityId,
            name: row.name as string,
            type: row.type as AccountType,
            ownership: row.ownership as AccountOwnership,
            currency: row.currency as string,
            currentBalance: row.current_balance_cents as Money,
            institutionName: row.institution_name as string | undefined,
            lastUpdatedAt: row.last_updated_at as Date,
            status: row.status as AccountStatus,
            createdAt: row.created_at as Date,
            updatedAt: row.updated_at as Date,
            creditLimitCents: row.credit_limit_cents as number | null ?? null,
            interestRateBps: row.interest_rate_bps as number | null ?? null,
            minimumPaymentCents: row.minimum_payment_cents as number | null ?? null,
            scheduledPaymentCents: row.scheduled_payment_cents as number | null ?? null,
            statementBalanceCents: row.statement_balance_cents as number | null ?? null,
            revolvingBalanceCents: row.revolving_balance_cents as number | null ?? null,
        };
    }
}

/**
 * PostgreSQL FinancialSnapshotRepository
 */
export class PgFinancialSnapshotRepository implements FinancialSnapshotRepository {
    async create(
        snapshot: Omit<FinancialSnapshot, "id" | "createdAt">
    ): Promise<FinancialSnapshot> {
        // Explicitly convert Money values to plain numbers for database
        const result = await query(
            `INSERT INTO finhouse.financial_snapshots 
       (household_id, as_of, version, cash_cents, debt_cents, net_worth_cents, 
        monthly_income_cents, monthly_essential_expenses_cents, monthly_discretionary_expenses_cents,
        monthly_surplus_cents, financial_health_status, calculated_at) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) 
       RETURNING *`,
            [
                snapshot.householdId,
                snapshot.asOf,
                snapshot.version,
                Number(snapshot.cash),
                Number(snapshot.debt),
                Number(snapshot.netWorth),
                Number(snapshot.monthlyIncome),
                Number(snapshot.monthlyEssentialExpenses),
                Number(snapshot.monthlyDiscretionaryExpenses),
                Number(snapshot.monthlySurplus),
                snapshot.financialHealthStatus,
                snapshot.calculatedAt,
            ]
        );
        const row = result.rows[0];
        return this.rowToSnapshot(row);
    }

    async findLatestByHouseholdId(householdId: EntityId): Promise<FinancialSnapshot | null> {
        const result = await query(
            "SELECT * FROM finhouse.financial_snapshots WHERE household_id = $1 ORDER BY as_of DESC LIMIT 1",
            [householdId]
        );
        if (result.rows.length === 0) return null;
        return this.rowToSnapshot(result.rows[0]);
    }

    async findByHouseholdAndDate(
        householdId: EntityId,
        date: Date
    ): Promise<FinancialSnapshot | null> {
        const dateOnly = new Date(date.getFullYear(), date.getMonth(), date.getDate());
        const result = await query(
            "SELECT * FROM finhouse.financial_snapshots WHERE household_id = $1 AND as_of = $2",
            [householdId, dateOnly]
        );
        if (result.rows.length === 0) return null;
        return this.rowToSnapshot(result.rows[0]);
    }

    async findAll(): Promise<FinancialSnapshot[]> {
        const result = await query("SELECT * FROM finhouse.financial_snapshots ORDER BY created_at");
        return result.rows.map((row) => this.rowToSnapshot(row));
    }

    async findByHouseholdIdSince(householdId: EntityId, since: Date): Promise<FinancialSnapshot[]> {
        const result = await query(
            "SELECT * FROM finhouse.financial_snapshots WHERE household_id = $1 AND as_of >= $2 ORDER BY as_of ASC",
            [householdId, since]
        );
        return result.rows.map(row => this.rowToSnapshot(row));
    }

    private rowToSnapshot(row: DbRow): FinancialSnapshot {
        return {
            id: row.id as EntityId,
            householdId: row.household_id as EntityId,
            asOf: row.as_of as Date,
            version: row.version as number,
            cash: row.cash_cents as Money,
            debt: row.debt_cents as Money,
            netWorth: row.net_worth_cents as Money,
            monthlyIncome: row.monthly_income_cents as Money,
            monthlyEssentialExpenses: row.monthly_essential_expenses_cents as Money,
            monthlyDiscretionaryExpenses: row.monthly_discretionary_expenses_cents as Money,
            monthlySurplus: row.monthly_surplus_cents as Money,
            financialHealthStatus: row.financial_health_status as FinancialHealthStatus,
            sourceAccountIds: row.source_account_ids
                ? ((row.source_account_ids as string[]) || []).map(id => EntityId(id))
                : [],
            calculatedAt: row.calculated_at as Date,
            createdAt: row.created_at as Date,
        };
    }
}

/**
 * PostgreSQL HouseholdSettingsRepository
 */
export class PgHouseholdSettingsRepository implements HouseholdSettingsRepository {
    async create(
        settings: Omit<HouseholdSettings, "id">
    ): Promise<HouseholdSettings> {
        const result = await query(
            `INSERT INTO finhouse.household_settings 
       (household_id, monthly_income_cents, monthly_essential_expenses_cents, 
        monthly_discretionary_expenses_cents, currency, income_source, updated_by) 
       VALUES ($1, $2, $3, $4, $5, $6, $7) 
       RETURNING *`,
            [
                settings.householdId,
                settings.monthlyIncome,
                settings.monthlyEssentialExpenses,
                settings.monthlyDiscretionaryExpenses,
                settings.currency,
                settings.incomeSource,
                settings.updatedBy,
            ]
        );
        const row = result.rows[0];
        return this.rowToSettings(row);
    }

    async findByHouseholdId(householdId: EntityId): Promise<HouseholdSettings | null> {
        const result = await query(
            "SELECT * FROM finhouse.household_settings WHERE household_id = $1",
            [householdId]
        );
        if (result.rows.length === 0) return null;
        return this.rowToSettings(result.rows[0]);
    }

    async update(
        id: EntityId,
        settings: Partial<HouseholdSettings>
    ): Promise<HouseholdSettings> {
        const updates = [];
        const values = [];
        let paramIndex = 1;

        if (settings.monthlyIncome !== undefined) {
            updates.push(`monthly_income_cents = $${paramIndex}`);
            values.push(settings.monthlyIncome);
            paramIndex++;
        }
        if (settings.monthlyEssentialExpenses !== undefined) {
            updates.push(`monthly_essential_expenses_cents = $${paramIndex}`);
            values.push(settings.monthlyEssentialExpenses);
            paramIndex++;
        }
        if (settings.monthlyDiscretionaryExpenses !== undefined) {
            updates.push(`monthly_discretionary_expenses_cents = $${paramIndex}`);
            values.push(settings.monthlyDiscretionaryExpenses);
            paramIndex++;
        }
        if (settings.incomeSource !== undefined) {
            updates.push(`income_source = $${paramIndex}`);
            values.push(settings.incomeSource);
            paramIndex++;
        }

        updates.push(`updated_at = CURRENT_TIMESTAMP`);
        if (settings.updatedBy !== undefined) {
            updates.push(`updated_by = $${paramIndex}`);
            values.push(settings.updatedBy);
            paramIndex++;
        }
        values.push(id);

        const result = await query(
            `UPDATE finhouse.household_settings SET ${updates.join(", ")} WHERE id = $${paramIndex} RETURNING *`,
            values
        );
        return this.rowToSettings(result.rows[0]);
    }

    private rowToSettings(row: DbRow): HouseholdSettings {
        return {
            id: row.id as EntityId,
            householdId: row.household_id as EntityId,
            monthlyIncome: row.monthly_income_cents as Money,
            monthlyEssentialExpenses: row.monthly_essential_expenses_cents as Money,
            monthlyDiscretionaryExpenses: row.monthly_discretionary_expenses_cents as Money,
            currency: row.currency as string,
            incomeSource: row.income_source as "manual_entry" | "bank_feed" | "user_provided",
            updatedAt: row.updated_at as Date,
            updatedBy: row.updated_by as EntityId,
            emergencyFundMinimumMonths: (row.emergency_fund_min_months as number) ?? 3,
            emergencyFundTargetMonths: (row.emergency_fund_target_months as number) ?? 6,
            emergencyFundStretchMonths: (row.emergency_fund_stretch_months as number) ?? 9,
        };
    }
}

/**
 * PostgreSQL FinancialDocumentRepository
 * Implements statement/document storage and lifecycle management
 */
export class PgFinancialDocumentRepository implements FinancialDocumentRepository {
    async create(
        document: CreateFinancialDocumentInput
    ): Promise<FinancialDocument> {
        // Convert Date objects to ISO date strings for DATE columns
        const periodStart = document.periodStart instanceof Date
            ? document.periodStart.toISOString().split("T")[0]
            : document.periodStart;
        const periodEnd = document.periodEnd instanceof Date
            ? document.periodEnd.toISOString().split("T")[0]
            : document.periodEnd;

        const result = await query(
            `INSERT INTO finhouse.financial_documents (
                household_id, source_type, file_name, mime_type, file_size_bytes,
                file_checksum, object_storage_key, account_id, institution_name,
                statement_type, period_start, period_end, opening_balance_cents,
                closing_balance_cents, processing_status, processing_version,
                uploaded_by, uploaded_at, correlation_id
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
            RETURNING *`,
            [
                document.householdId,
                document.sourceType,
                document.fileName,
                document.mimeType,
                document.fileSizeBytes,
                document.fileChecksum,
                document.objectStorageKey,
                document.accountId || null,
                document.institutionName || null,
                document.statementType || null,
                periodStart || null,
                periodEnd || null,
                document.openingBalanceCents || null,
                document.closingBalanceCents || null,
                document.processingStatus,
                document.processingVersion,
                document.uploadedBy,
                document.uploadedAt,
                document.correlationId,
            ]
        );

        return this.rowToDocument(result.rows[0]);
    }

    async findById(id: EntityId): Promise<FinancialDocument | null> {
        const result = await query(
            "SELECT * FROM finhouse.financial_documents WHERE id = $1 AND deleted_at IS NULL",
            [id]
        );
        if (result.rows.length === 0) return null;
        return this.rowToDocument(result.rows[0]);
    }

    async findByHouseholdId(householdId: EntityId): Promise<FinancialDocument[]> {
        const result = await query(
            "SELECT * FROM finhouse.financial_documents WHERE household_id = $1 AND deleted_at IS NULL ORDER BY uploaded_at DESC",
            [householdId]
        );
        return result.rows.map((row) => this.rowToDocument(row));
    }

    async findByChecksum(
        householdId: EntityId,
        checksum: string
    ): Promise<FinancialDocument | null> {
        const result = await query(
            "SELECT * FROM finhouse.financial_documents WHERE household_id = $1 AND file_checksum = $2 AND deleted_at IS NULL",
            [householdId, checksum]
        );
        if (result.rows.length === 0) return null;
        return this.rowToDocument(result.rows[0]);
    }

    async update(id: EntityId, document: Partial<FinancialDocument>): Promise<FinancialDocument> {
        const updates = [];
        const values = [];
        let paramIndex = 1;

        if (document.accountId !== undefined) {
            updates.push(`account_id = $${paramIndex}`);
            values.push(document.accountId || null);
            paramIndex++;
        }
        if (document.institutionName !== undefined) {
            updates.push(`institution_name = $${paramIndex}`);
            values.push(document.institutionName || null);
            paramIndex++;
        }
        if (document.statementType !== undefined) {
            updates.push(`statement_type = $${paramIndex}`);
            values.push(document.statementType || null);
            paramIndex++;
        }
        if (document.periodStart !== undefined) {
            updates.push(`period_start = $${paramIndex}`);
            // Convert Date to ISO date string for DATE column
            const periodStart = document.periodStart instanceof Date
                ? document.periodStart.toISOString().split("T")[0]
                : document.periodStart;
            values.push(periodStart || null);
            paramIndex++;
        }
        if (document.periodEnd !== undefined) {
            updates.push(`period_end = $${paramIndex}`);
            // Convert Date to ISO date string for DATE column
            const periodEnd = document.periodEnd instanceof Date
                ? document.periodEnd.toISOString().split("T")[0]
                : document.periodEnd;
            values.push(periodEnd || null);
            paramIndex++;
        }
        if (document.openingBalanceCents !== undefined) {
            updates.push(`opening_balance_cents = $${paramIndex}`);
            values.push(document.openingBalanceCents || null);
            paramIndex++;
        }
        if (document.closingBalanceCents !== undefined) {
            updates.push(`closing_balance_cents = $${paramIndex}`);
            values.push(document.closingBalanceCents || null);
            paramIndex++;
        }

        updates.push(`updated_at = CURRENT_TIMESTAMP`);
        values.push(id);

        const result = await query(
            `UPDATE finhouse.financial_documents SET ${updates.join(", ")} WHERE id = $${paramIndex} RETURNING *`,
            values
        );

        return this.rowToDocument(result.rows[0]);
    }

    async updateStatus(
        id: EntityId,
        status: DocumentProcessingStatus,
        errorCode?: string,
        errorMessageUser?: string,
        correlationId?: string,
        reason?: string
    ): Promise<FinancialDocument> {
        // Get current status for audit trail
        const currentResult = await query(
            "SELECT processing_status FROM finhouse.financial_documents WHERE id = $1 AND deleted_at IS NULL",
            [id]
        );

        if (currentResult.rows.length === 0) {
            throw new Error(`Document not found: ${id}`);
        }

        const previousStatus = currentResult.rows[0].processing_status as DocumentProcessingStatus;

        // Update document status
        const terminalStatuses = ['COMPLETED', 'PARTIALLY_COMPLETED', 'FAILED'];
        const result = await query(
            `UPDATE finhouse.financial_documents
             SET processing_status = $1::finhouse.document_processing_status, error_code = $2, error_message_user = $3,
                 processed_at = CASE WHEN $1 = ANY($4) THEN CURRENT_TIMESTAMP ELSE processed_at END,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = $5 AND deleted_at IS NULL
             RETURNING *`,
            [status, errorCode || null, errorMessageUser || null, terminalStatuses, id]
        );

        if (result.rows.length === 0) {
            throw new Error(`Document not found or deleted: ${id}`);
        }

        // Log to history table (audit trail)
        if (previousStatus !== status) {
            await query(
                `INSERT INTO finhouse.document_processing_history
                 (document_id, previous_status, new_status, changed_by, reason, correlation_id)
                 VALUES ($1, $2::finhouse.document_processing_status, $3::finhouse.document_processing_status, $4, $5, $6)`,
                [id, previousStatus, status, 'system', reason || null, correlationId || null]
            );
        }

        return this.rowToDocument(result.rows[0]);
    }

    async softDelete(id: EntityId, reason?: string): Promise<void> {
        const result = await query(
            "UPDATE finhouse.financial_documents SET deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = $1 AND deleted_at IS NULL RETURNING id",
            [id]
        );

        if (result.rows.length === 0) {
            throw new Error(`Document not found or already deleted: ${id}`);
        }

        // Log deletion to history
        if (reason) {
            await query(
                `INSERT INTO finhouse.document_processing_history
                 (document_id, new_status, changed_by, reason)
                 VALUES ($1, $2::finhouse.document_processing_status, $3, $4)`,
                [id, 'FAILED', 'system', reason]
            );
        }
    }

    async getProcessingHistory(documentId: EntityId): Promise<Array<{
        previousStatus: DocumentProcessingStatus | null;
        newStatus: DocumentProcessingStatus;
        changedAt: Date;
        reason: string | null;
    }>> {
        const result = await query(
            `SELECT previous_status, new_status, changed_at, reason
             FROM finhouse.document_processing_history
             WHERE document_id = $1
             ORDER BY changed_at ASC`,
            [documentId]
        );

        return result.rows.map((row: any) => ({
            previousStatus: row.previous_status as DocumentProcessingStatus | null,
            newStatus: row.new_status as DocumentProcessingStatus,
            changedAt: new Date(row.changed_at),
            reason: row.reason as string | null
        }));
    }

    private rowToDocument(row: DbRow): FinancialDocument {
        // Helper to convert DATE strings to Date objects correctly
        const parseDate = (dateValue: any): Date | null => {
            if (!dateValue) return null;
            // If already a Date, return it
            if (dateValue instanceof Date) return dateValue;
            // Convert string to Date
            const dateStr = String(dateValue);
            // DATE columns come as YYYY-MM-DD strings, create a date in UTC
            const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
            if (match) {
                return new Date(`${match[0]}T00:00:00Z`);
            }
            return new Date(dateStr);
        };

        return {
            id: row.id as EntityId,
            householdId: row.household_id as EntityId,
            sourceType: row.source_type as DocumentSourceType,
            fileName: row.file_name as string,
            mimeType: row.mime_type as string,
            fileSizeBytes: row.file_size_bytes as number,
            fileChecksum: row.file_checksum as string,
            objectStorageKey: row.object_storage_key as string,
            accountId: row.account_id as EntityId | null,
            institutionName: row.institution_name as string | null,
            statementType: row.statement_type as string | null,
            periodStart: parseDate(row.period_start),
            periodEnd: parseDate(row.period_end),
            openingBalanceCents: row.opening_balance_cents as number | null,
            closingBalanceCents: row.closing_balance_cents as number | null,
            processingStatus: row.processing_status as DocumentProcessingStatus,
            processingVersion: row.processing_version as number,
            uploadedBy: row.uploaded_by as string,
            uploadedAt: new Date(row.uploaded_at as string),
            processedAt: row.processed_at ? new Date(row.processed_at as string) : null,
            errorCode: row.error_code as string | null,
            errorMessageUser: row.error_message_user as string | null,
            correlationId: row.correlation_id as EntityId,
            createdAt: new Date(row.created_at as string),
            updatedAt: new Date(row.updated_at as string),
        };
    }
}

/**
 * PostgreSQL Review Item Repository
 */
export class PgReviewItemRepository implements IReviewRepository {
    async createReviewItem(item: ReviewItem): Promise<ReviewItem> {
        const result = await query(
            `INSERT INTO finhouse.review_items (
                id, household_id, statement_id, type, severity, status, title, user_message,
                recommended_action, candidate_values, supporting_evidence, transaction_ids, created_at, updated_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
            RETURNING id, household_id, statement_id, type, severity, status, title, user_message,
                recommended_action, candidate_values, supporting_evidence, transaction_ids,
                created_at, updated_at, resolved_at, resolved_by`,
            [
                item.id,
                item.householdId,
                item.statementId || null,
                item.type,
                item.severity,
                item.status,
                item.title,
                item.userMessage,
                item.recommendedAction || null,
                JSON.stringify(item.candidateValues),
                JSON.stringify(item.supportingEvidence),
                item.transactionIds || [],
                item.createdAt,
                item.updatedAt,
            ]
        );
        return this.mapRowToReviewItem(result.rows[0]);
    }

    async getReviewItem(id: EntityId): Promise<ReviewItem | null> {
        const result = await query(
            `SELECT id, household_id, statement_id, type, severity, status, title, user_message,
                recommended_action, candidate_values, supporting_evidence, transaction_ids,
                created_at, updated_at, resolved_at, resolved_by
            FROM finhouse.review_items WHERE id = $1`,
            [id]
        );
        if (result.rows.length === 0) return null;
        return this.mapRowToReviewItem(result.rows[0]);
    }

    async updateReviewItem(item: ReviewItem): Promise<ReviewItem> {
        const result = await query(
            `UPDATE finhouse.review_items SET status = $2, updated_at = $3, resolved_at = $4, resolved_by = $5
            WHERE id = $1
            RETURNING id, household_id, statement_id, type, severity, status, title, user_message,
                recommended_action, candidate_values, supporting_evidence, transaction_ids,
                created_at, updated_at, resolved_at, resolved_by`,
            [item.id, item.status, item.updatedAt, item.resolvedAt || null, item.resolvedBy || null]
        );
        return this.mapRowToReviewItem(result.rows[0]);
    }

    async listReviewItems(
        householdId: EntityId,
        filters?: { status?: ReviewStatus; type?: ReviewType; severity?: ReviewSeverity }
    ): Promise<ReviewItem[]> {
        let sql = `SELECT id, household_id, statement_id, type, severity, status, title, user_message,
                recommended_action, candidate_values, supporting_evidence, transaction_ids,
                created_at, updated_at, resolved_at, resolved_by
            FROM finhouse.review_items WHERE household_id = $1`;
        const params: any[] = [householdId];

        if (filters?.status) {
            params.push(filters.status);
            sql += ` AND status = $${params.length}`;
        }
        if (filters?.type) {
            params.push(filters.type);
            sql += ` AND type = $${params.length}`;
        }
        if (filters?.severity) {
            params.push(filters.severity);
            sql += ` AND severity = $${params.length}`;
        }
        sql += ` ORDER BY created_at DESC`;

        const result = await query(sql, params);
        return result.rows.map((row) => this.mapRowToReviewItem(row));
    }

    async createResolution(resolution: ReviewResolution): Promise<ReviewResolution> {
        const result = await query(
            `INSERT INTO finhouse.review_resolutions (
                id, review_item_id, household_id, chosen_action, reasoning, affected_transaction_ids, resulting_metadata, resolved_by, resolved_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            RETURNING id, review_item_id, household_id, chosen_action, reasoning, affected_transaction_ids, resulting_metadata, resolved_by, resolved_at`,
            [
                require("crypto").randomUUID(),
                resolution.reviewItemId,
                null, // Will be fetched from review item
                resolution.chosenAction,
                resolution.reasoning,
                resolution.affectedTransactionIds || [],
                resolution.resultingMetadata ? JSON.stringify(resolution.resultingMetadata) : null,
                resolution.resolvedBy,
                resolution.resolvedAt,
            ]
        );
        return this.mapRowToResolution(result.rows[0]);
    }

    async getResolution(reviewItemId: EntityId): Promise<ReviewResolution | null> {
        const result = await query(
            `SELECT id, review_item_id, household_id, chosen_action, reasoning, affected_transaction_ids, resulting_metadata, resolved_by, resolved_at
            FROM finhouse.review_resolutions WHERE review_item_id = $1 ORDER BY resolved_at DESC LIMIT 1`,
            [reviewItemId]
        );
        if (result.rows.length === 0) return null;
        return this.mapRowToResolution(result.rows[0]);
    }

    private mapRowToReviewItem(row: DbRow): ReviewItem {
        return {
            id: row.id as EntityId,
            householdId: row.household_id as EntityId,
            statementId: row.statement_id ? (row.statement_id as EntityId) : undefined,
            type: row.type as ReviewType,
            severity: row.severity as ReviewSeverity,
            status: row.status as ReviewStatus,
            title: row.title as string,
            userMessage: row.user_message as string,
            recommendedAction: (row.recommended_action as string | null) || undefined,
            candidateValues: JSON.parse(row.candidate_values as string),
            supportingEvidence: JSON.parse(row.supporting_evidence as string),
            transactionIds: (row.transaction_ids as EntityId[]) || [],
            createdAt: new Date(row.created_at as string),
            updatedAt: new Date(row.updated_at as string),
            resolvedAt: row.resolved_at ? new Date(row.resolved_at as string) : undefined,
            resolvedBy: (row.resolved_by as string | null) || undefined,
        };
    }

    private mapRowToResolution(row: DbRow): ReviewResolution {
        return {
            reviewItemId: row.review_item_id as EntityId,
            chosenAction: row.chosen_action as string,
            reasoning: row.reasoning as string,
            resolvedBy: row.resolved_by as string,
            resolvedAt: new Date(row.resolved_at as string),
            affectedTransactionIds: (row.affected_transaction_ids as EntityId[]) || [],
            resultingMetadata: row.resulting_metadata ? JSON.parse(row.resulting_metadata as string) : undefined,
        };
    }
}

/**
 * PostgreSQL PostingRepository
 * Handles persistent storage of posted transactions, audit records, and configuration
 */
export class PgPostingRepository implements IPostingRepository {
    /**
     * Get auto-post configuration for a household
     */
    async getAutoPostConfig(householdId: EntityId): Promise<AutoPostConfig | null> {
        const result = await query(
            `SELECT id, household_id, confidence_threshold, allow_partial_posting, updated_at, updated_by, created_at
             FROM finhouse.auto_post_config WHERE household_id = $1`,
            [householdId]
        );
        if (result.rows.length === 0) return null;
        const row = result.rows[0];
        return this.mapRowToAutoPostConfig(row);
    }

    /**
     * Create or update auto-post configuration for a household
     */
    async createOrUpdateAutoPostConfig(
        config: Omit<AutoPostConfig, "id" | "createdAt">
    ): Promise<AutoPostConfig> {
        const result = await query(
            `INSERT INTO finhouse.auto_post_config 
             (household_id, confidence_threshold, allow_partial_posting, updated_by)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (household_id) DO UPDATE SET
                confidence_threshold = EXCLUDED.confidence_threshold,
                allow_partial_posting = EXCLUDED.allow_partial_posting,
                updated_by = EXCLUDED.updated_by,
                updated_at = CURRENT_TIMESTAMP
             RETURNING id, household_id, confidence_threshold, allow_partial_posting, updated_at, updated_by, created_at`,
            [
                config.householdId,
                config.confidenceThreshold,
                config.allowPartialPosting,
                config.updatedBy,
            ]
        );
        const row = result.rows[0];
        return this.mapRowToAutoPostConfig(row);
    }

    /**
     * Create a posted transaction in canonical ledger
     */
    async createPostedTransaction(
        tx: Omit<PostedTransaction, "id" | "createdAt">
    ): Promise<PostedTransaction> {
        const result = await query(
            `INSERT INTO finhouse.posted_transactions
             (household_id, account_id, posted_date, transaction_date, amount_cents, direction,
              merchant, description, confidence_score, source_document_id, source_row_number,
              source_page_number, reconciliation_state, matched_transaction_id, statement_reference,
              source_transaction_id, original_amount_string, original_date_string,
              posted_by, posting_correlation_id, calculation_version, metadata)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22)
             RETURNING id, household_id, account_id, posted_date, transaction_date, amount_cents,
              direction, merchant, description, confidence_score, source_document_id, source_row_number,
              source_page_number, reconciliation_state, matched_transaction_id, statement_reference,
              source_transaction_id, original_amount_string, original_date_string,
              posted_by, posted_at, posting_correlation_id, calculation_version, metadata, created_at`,
            [
                tx.householdId,
                tx.accountId,
                tx.postedDate,
                tx.transactionDate,
                tx.amountCents,
                tx.direction,
                tx.merchant,
                tx.description,
                tx.confidenceScore,
                tx.sourceDocumentId,
                tx.sourceRowNumber || null,
                tx.sourcePageNumber || null,
                tx.reconciliationState,
                tx.matchedTransactionId || null,
                tx.statementReference || null,
                tx.sourceTransactionId || null,
                tx.originalAmountString || null,
                tx.originalDateString || null,
                tx.postedBy,
                tx.postingCorrelationId,
                tx.calculationVersion,
                JSON.stringify(tx.metadata || {}),
            ]
        );
        const row = result.rows[0];
        return this.mapRowToPostedTransaction(row);
    }

    /**
     * Create multiple posted transactions (batch operation)
     */
    async createPostedTransactions(
        txs: Omit<PostedTransaction, "id" | "createdAt">[]
    ): Promise<PostedTransaction[]> {
        if (txs.length === 0) {
            return [];
        }

        const client = await getClient();
        try {
            // Start transaction
            await client.query("BEGIN TRANSACTION");

            const results: PostedTransaction[] = [];
            for (const tx of txs) {
                // Use client instead of pool for all queries in transaction
                const result = await client.query(
                    `INSERT INTO finhouse.posted_transactions
                     (household_id, account_id, posted_date, transaction_date, amount_cents, direction,
                      merchant, description, confidence_score, source_document_id, source_row_number,
                      source_page_number, reconciliation_state, matched_transaction_id, statement_reference,
                      source_transaction_id, original_amount_string, original_date_string,
                      posted_by, posting_correlation_id, calculation_version, metadata)
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22)
                     RETURNING id, household_id, account_id, posted_date, transaction_date, amount_cents,
                               direction, merchant, description, confidence_score, source_document_id,
                               source_row_number, source_page_number, reconciliation_state,
                               matched_transaction_id, statement_reference, source_transaction_id,
                               original_amount_string, original_date_string, posted_by, posted_at,
                               posting_correlation_id, calculation_version, metadata, created_at`,
                    [
                        tx.householdId,
                        tx.accountId,
                        tx.postedDate,
                        tx.transactionDate,
                        tx.amountCents,
                        tx.direction,
                        tx.merchant,
                        tx.description,
                        tx.confidenceScore,
                        tx.sourceDocumentId,
                        tx.sourceRowNumber || null,
                        tx.sourcePageNumber || null,
                        tx.reconciliationState,
                        tx.matchedTransactionId || null,
                        tx.statementReference || null,
                        tx.sourceTransactionId || null,
                        tx.originalAmountString || null,
                        tx.originalDateString || null,
                        tx.postedBy,
                        tx.postingCorrelationId,
                        tx.calculationVersion,
                        JSON.stringify(tx.metadata || {}),
                    ]
                );

                if (result.rows.length > 0) {
                    results.push(this.mapRowToPostedTransaction(result.rows[0]));
                }
            }

            // Commit transaction
            await client.query("COMMIT");
            return results;
        } catch (error) {
            // Rollback on any error
            try {
                await client.query("ROLLBACK");
            } catch (rollbackError) {
                console.error("Rollback failed:", rollbackError);
            }
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Get a single posted transaction by ID
     */
    async getPostedTransaction(id: EntityId): Promise<PostedTransaction | null> {
        const result = await query(
            `SELECT id, household_id, account_id, posted_date, transaction_date, amount_cents,
              direction, merchant, description, confidence_score, source_document_id, source_row_number,
              source_page_number, reconciliation_state, matched_transaction_id, statement_reference,
              source_transaction_id, original_amount_string, original_date_string,
              posted_by, posted_at, posting_correlation_id, calculation_version, metadata, created_at
             FROM finhouse.posted_transactions WHERE id = $1`,
            [id]
        );
        if (result.rows.length === 0) return null;
        return this.mapRowToPostedTransaction(result.rows[0]);
    }

    /**
     * List posted transactions with optional filtering
     */
    async listPostedTransactions(
        householdId: EntityId,
        filters?: {
            accountId?: EntityId;
            fromDate?: Date;
            toDate?: Date;
            postingCorrelationId?: EntityId;
            sourceDocumentId?: EntityId;
        }
    ): Promise<PostedTransaction[]> {
        let sql = `SELECT id, household_id, account_id, posted_date, transaction_date, amount_cents,
                   direction, merchant, description, confidence_score, source_document_id, source_row_number,
                   source_page_number, reconciliation_state, matched_transaction_id, statement_reference,
                   source_transaction_id, original_amount_string, original_date_string,
                   posted_by, posted_at, posting_correlation_id, calculation_version, metadata, created_at
                   FROM finhouse.posted_transactions WHERE household_id = $1`;
        const params: unknown[] = [householdId];
        let paramIndex = 2;

        if (filters?.accountId) {
            sql += ` AND account_id = $${paramIndex}`;
            params.push(filters.accountId);
            paramIndex++;
        }
        if (filters?.fromDate) {
            sql += ` AND posted_date >= $${paramIndex}`;
            params.push(filters.fromDate);
            paramIndex++;
        }
        if (filters?.toDate) {
            sql += ` AND posted_date <= $${paramIndex}`;
            params.push(filters.toDate);
            paramIndex++;
        }
        if (filters?.postingCorrelationId) {
            sql += ` AND posting_correlation_id = $${paramIndex}`;
            params.push(filters.postingCorrelationId);
            paramIndex++;
        }
        if (filters?.sourceDocumentId) {
            sql += ` AND source_document_id = $${paramIndex}`;
            params.push(filters.sourceDocumentId);
            paramIndex++;
        }

        sql += ` ORDER BY posted_date DESC`;

        const result = await query(sql, params);
        return result.rows.map(row => this.mapRowToPostedTransaction(row));
    }

    /**
     * Create a posting audit record
     */
    async createPostingAudit(
        audit: Omit<StatementPostingAudit, "id">
    ): Promise<StatementPostingAudit> {
        const result = await query(
            `INSERT INTO finhouse.statement_posting_audit
             (household_id, source_document_id, posting_correlation_id, posting_status,
              high_confidence_count, high_confidence_posted, low_confidence_count,
              low_confidence_skipped, total_candidates, total_posted, error_code,
              error_message_user, error_details, initiated_by, processing_duration_ms,
              idempotency_key, started_at, completed_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
             RETURNING id, household_id, source_document_id, posting_correlation_id, posting_status,
              high_confidence_count, high_confidence_posted, low_confidence_count,
              low_confidence_skipped, total_candidates, total_posted, error_code,
              error_message_user, error_details, initiated_by, processing_duration_ms,
              idempotency_key, started_at, completed_at`,
            [
                audit.householdId,
                audit.sourceDocumentId,
                audit.postingCorrelationId,
                audit.postingStatus,
                audit.highConfidenceCount,
                audit.highConfidencePosted,
                audit.lowConfidenceCount,
                audit.lowConfidenceSkipped,
                audit.totalCandidates,
                audit.totalPosted,
                audit.errorCode || null,
                audit.errorMessageUser || null,
                audit.errorDetails ? JSON.stringify(audit.errorDetails) : null,
                audit.initiatedBy,
                audit.processingDurationMs || null,
                audit.idempotencyKey,
                audit.startedAt,
                audit.completedAt || null,
            ]
        );
        const row = result.rows[0];
        return this.mapRowToPostingAudit(row);
    }

    /**
     * Update a posting audit record
     */
    async updatePostingAudit(
        id: EntityId,
        updates: Partial<StatementPostingAudit>
    ): Promise<StatementPostingAudit> {
        const updateFields: string[] = [];
        const params: unknown[] = [];
        let paramIndex = 1;

        if (updates.postingStatus !== undefined) {
            updateFields.push(`posting_status = $${paramIndex}`);
            params.push(updates.postingStatus);
            paramIndex++;
        }
        if (updates.highConfidencePosted !== undefined) {
            updateFields.push(`high_confidence_posted = $${paramIndex}`);
            params.push(updates.highConfidencePosted);
            paramIndex++;
        }
        if (updates.lowConfidenceSkipped !== undefined) {
            updateFields.push(`low_confidence_skipped = $${paramIndex}`);
            params.push(updates.lowConfidenceSkipped);
            paramIndex++;
        }
        if (updates.totalPosted !== undefined) {
            updateFields.push(`total_posted = $${paramIndex}`);
            params.push(updates.totalPosted);
            paramIndex++;
        }
        if (updates.errorCode !== undefined) {
            updateFields.push(`error_code = $${paramIndex}`);
            params.push(updates.errorCode || null);
            paramIndex++;
        }
        if (updates.completedAt !== undefined) {
            updateFields.push(`completed_at = $${paramIndex}`);
            params.push(updates.completedAt);
            paramIndex++;
        }

        params.push(id);
        const result = await query(
            `UPDATE finhouse.statement_posting_audit SET ${updateFields.join(", ")} WHERE id = $${paramIndex}
             RETURNING id, household_id, source_document_id, posting_correlation_id, posting_status,
              high_confidence_count, high_confidence_posted, low_confidence_count,
              low_confidence_skipped, total_candidates, total_posted, error_code,
              error_message_user, error_details, initiated_by, processing_duration_ms,
              idempotency_key, started_at, completed_at`,
            params
        );
        const row = result.rows[0];
        return this.mapRowToPostingAudit(row);
    }

    /**
     * Get posting audit by correlation ID
     */
    async getPostingAudit(correlationId: EntityId): Promise<StatementPostingAudit | null> {
        const result = await query(
            `SELECT id, household_id, source_document_id, posting_correlation_id, posting_status,
              high_confidence_count, high_confidence_posted, low_confidence_count,
              low_confidence_skipped, total_candidates, total_posted, error_code,
              error_message_user, error_details, initiated_by, processing_duration_ms,
              idempotency_key, started_at, completed_at
             FROM finhouse.statement_posting_audit WHERE posting_correlation_id = $1`,
            [correlationId]
        );
        if (result.rows.length === 0) return null;
        return this.mapRowToPostingAudit(result.rows[0]);
    }

    /**
     * Get posting audit by idempotency key
     */
    async getPostingAuditByIdempotencyKey(key: string): Promise<StatementPostingAudit | null> {
        const result = await query(
            `SELECT id, household_id, source_document_id, posting_correlation_id, posting_status,
              high_confidence_count, high_confidence_posted, low_confidence_count,
              low_confidence_skipped, total_candidates, total_posted, error_code,
              error_message_user, error_details, initiated_by, processing_duration_ms,
              idempotency_key, started_at, completed_at
             FROM finhouse.statement_posting_audit WHERE idempotency_key = $1`,
            [key]
        );
        if (result.rows.length === 0) return null;
        return this.mapRowToPostingAudit(result.rows[0]);
    }

    /**
     * Map database row to AutoPostConfig
     */
    private mapRowToAutoPostConfig(row: DbRow): AutoPostConfig {
        return {
            id: row.id as EntityId,
            householdId: row.household_id as EntityId,
            confidenceThreshold: Number(row.confidence_threshold),
            allowPartialPosting: row.allow_partial_posting as boolean,
            updatedAt: new Date(row.updated_at as string),
            updatedBy: row.updated_by as string,
            createdAt: new Date(row.created_at as string),
        };
    }

    /**
     * Map database row to PostedTransaction
     */
    private mapRowToPostedTransaction(row: DbRow): PostedTransaction {
        return {
            id: row.id as EntityId,
            householdId: row.household_id as EntityId,
            accountId: row.account_id as EntityId,
            postedDate: new Date(row.posted_date as string),
            transactionDate: new Date(row.transaction_date as string),
            amountCents: row.amount_cents as number,
            direction: row.direction as "DEBIT" | "CREDIT",
            merchant: row.merchant as string,
            description: row.description as string,
            confidenceScore: Number(row.confidence_score),
            sourceDocumentId: row.source_document_id as EntityId,
            sourceRowNumber: row.source_row_number ? Number(row.source_row_number) : undefined,
            sourcePageNumber: row.source_page_number ? Number(row.source_page_number) : undefined,
            reconciliationState: row.reconciliation_state as any,
            matchedTransactionId: row.matched_transaction_id ? (row.matched_transaction_id as EntityId) : undefined,
            statementReference: (row.statement_reference as string | null) || undefined,
            sourceTransactionId: (row.source_transaction_id as string | null) || undefined,
            originalAmountString: (row.original_amount_string as string | null) || undefined,
            originalDateString: (row.original_date_string as string | null) || undefined,
            postedBy: row.posted_by as string,
            postedAt: new Date(row.posted_at as string),
            postingCorrelationId: row.posting_correlation_id as EntityId,
            calculationVersion: row.calculation_version as number,
            metadata: row.metadata ? JSON.parse(row.metadata as string) : {},
            createdAt: new Date(row.created_at as string),
        };
    }

    /**
     * Map database row to StatementPostingAudit
     */
    private mapRowToPostingAudit(row: DbRow): StatementPostingAudit {
        return {
            id: row.id as EntityId,
            householdId: row.household_id as EntityId,
            sourceDocumentId: row.source_document_id as EntityId,
            postingCorrelationId: row.posting_correlation_id as EntityId,
            postingStatus: row.posting_status as any,
            highConfidenceCount: row.high_confidence_count as number,
            highConfidencePosted: row.high_confidence_posted as number,
            lowConfidenceCount: row.low_confidence_count as number,
            lowConfidenceSkipped: row.low_confidence_skipped as number,
            totalCandidates: row.total_candidates as number,
            totalPosted: row.total_posted as number,
            errorCode: (row.error_code as string | null) || undefined,
            errorMessageUser: (row.error_message_user as string | null) || undefined,
            errorDetails: row.error_details ? JSON.parse(row.error_details as string) : undefined,
            initiatedBy: row.initiated_by as string,
            processingDurationMs: row.processing_duration_ms ? Number(row.processing_duration_ms) : undefined,
            idempotencyKey: row.idempotency_key as string,
            startedAt: new Date(row.started_at as string),
            completedAt: row.completed_at ? new Date(row.completed_at as string) : undefined,
        };
    }
}

import { BudgetTransaction, CashFlowTransaction } from "@house-fin/domain";

/**
 * PostgreSQL BudgetRepository
 */
export class PgBudgetRepository implements IBudgetRepository {
    async create(
        budget: Omit<Budget, "id" | "createdAt" | "updatedAt" | "version">
    ): Promise<Budget> {
        const result = await query(
            `INSERT INTO finhouse.budgets
             (household_id, period_year, period_month, category, amount_cents, goal_id, notes)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             RETURNING *`,
            [
                budget.householdId,
                budget.periodYear,
                budget.periodMonth,
                budget.category,
                budget.amountCents,
                budget.goalId ?? null,
                budget.notes ?? null,
            ]
        );
        return this.rowToBudget(result.rows[0]);
    }

    async findById(id: EntityId): Promise<Budget | null> {
        const result = await query(
            "SELECT * FROM finhouse.budgets WHERE id = $1",
            [id]
        );
        if (result.rows.length === 0) return null;
        return this.rowToBudget(result.rows[0]);
    }

    async findByHouseholdAndPeriod(
        householdId: EntityId,
        year: number,
        month: number
    ): Promise<Budget[]> {
        const result = await query(
            `SELECT * FROM finhouse.budgets
             WHERE household_id = $1 AND period_year = $2 AND period_month = $3
             ORDER BY category`,
            [householdId, year, month]
        );
        return result.rows.map(row => this.rowToBudget(row));
    }

    async findByCategory(
        householdId: EntityId,
        year: number,
        month: number,
        category: string
    ): Promise<Budget | null> {
        const result = await query(
            `SELECT * FROM finhouse.budgets
             WHERE household_id = $1 AND period_year = $2 AND period_month = $3 AND category = $4`,
            [householdId, year, month, category]
        );
        if (result.rows.length === 0) return null;
        return this.rowToBudget(result.rows[0]);
    }

    async update(
        id: EntityId,
        updates: { amountCents?: number; notes?: string },
        expectedVersion: number
    ): Promise<Budget> {
        const setClauses: string[] = ["version = version + 1", "updated_at = CURRENT_TIMESTAMP"];
        const values: unknown[] = [];
        let i = 1;

        if (updates.amountCents !== undefined) {
            setClauses.push(`amount_cents = $${i++}`);
            values.push(updates.amountCents);
        }
        if (updates.notes !== undefined) {
            setClauses.push(`notes = $${i++}`);
            values.push(updates.notes ?? null);
        }

        values.push(id, expectedVersion);
        const result = await query(
            `UPDATE finhouse.budgets SET ${setClauses.join(", ")}
             WHERE id = $${i++} AND version = $${i}
             RETURNING *`,
            values
        );
        if (result.rows.length === 0) {
            throw new Error("Budget not found or version conflict — reload and retry");
        }
        return this.rowToBudget(result.rows[0]);
    }

    async delete(id: EntityId, householdId: EntityId): Promise<void> {
        const result = await query(
            "DELETE FROM finhouse.budgets WHERE id = $1 AND household_id = $2 RETURNING id",
            [id, householdId]
        );
        if (result.rows.length === 0) {
            throw new Error("Budget not found");
        }
    }

    async getTransactionsForPeriod(
        householdId: EntityId,
        year: number,
        month: number
    ): Promise<BudgetTransaction[]> {
        // Pad month to 2 digits for the date range
        const monthStr = String(month).padStart(2, "0");
        const fromDate = `${year}-${monthStr}-01`;
        // Last day: first day of next month minus one day
        const nextMonth = month === 12 ? 1 : month + 1;
        const nextYear = month === 12 ? year + 1 : year;
        const nextMonthStr = String(nextMonth).padStart(2, "0");
        const toDate = `${nextYear}-${nextMonthStr}-01`;

        const result = await query(
            `SELECT id, category, amount_cents, transaction_date
             FROM finhouse.posted_transactions
             WHERE household_id = $1
               AND transaction_date >= $2
               AND transaction_date < $3
             ORDER BY transaction_date`,
            [householdId, fromDate, toDate]
        );

        return result.rows.map(row => ({
            id: row.id as string,
            category: (row.category as string | null) ?? null,
            amountCents: row.amount_cents as number,
            transactionDate: new Date(row.transaction_date as string),
        }));
    }

    async categorizeTransaction(
        transactionId: string,
        householdId: EntityId,
        category: string
    ): Promise<void> {
        const result = await query(
            `UPDATE finhouse.posted_transactions
             SET category = $1
             WHERE id = $2 AND household_id = $3
             RETURNING id`,
            [category.trim() || null, transactionId, householdId]
        );
        if (result.rows.length === 0) {
            throw new Error("Transaction not found");
        }
    }

    private rowToBudget(row: DbRow): Budget {
        return {
            id: row.id as EntityId,
            householdId: row.household_id as EntityId,
            periodYear: row.period_year as number,
            periodMonth: row.period_month as number,
            category: row.category as string,
            amountCents: row.amount_cents as Money,
            goalId: row.goal_id ? (row.goal_id as EntityId) : undefined,
            notes: row.notes ? (row.notes as string) : undefined,
            version: row.version as number,
            createdAt: new Date(row.created_at as string),
            updatedAt: new Date(row.updated_at as string),
        };
    }
}

/**
 * PostgreSQL CashFlowRepository
 */
export class PgCashFlowRepository implements ICashFlowRepository {
    async getTransactionsForRange(
        householdId: EntityId,
        fromDate: Date,
        toDate: Date,
    ): Promise<CashFlowTransaction[]> {
        const result = await query(
            `SELECT id, transaction_date, amount_cents, direction, merchant, category, account_id
             FROM finhouse.posted_transactions
             WHERE household_id = $1
               AND transaction_date >= $2
               AND transaction_date < $3
             ORDER BY transaction_date`,
            [householdId, fromDate.toISOString().split("T")[0], toDate.toISOString().split("T")[0]],
        );
        return result.rows.map(row => ({
            id: row.id as string,
            transactionDate: new Date(row.transaction_date as string),
            amountCents: row.amount_cents as number,
            direction: row.direction as "DEBIT" | "CREDIT",
            merchant: row.merchant as string,
            category: (row.category as string | null) ?? null,
            accountId: row.account_id as string,
        }));
    }

    async getLiquidCashCents(householdId: EntityId): Promise<number> {
        const result = await query(
            `SELECT COALESCE(SUM(current_balance_cents), 0) AS total
             FROM finhouse.accounts
             WHERE household_id = $1
               AND status = 'ACTIVE'
               AND type IN ('CHECKING', 'SAVINGS')`,
            [householdId],
        );
        return Number(result.rows[0].total);
    }

    async getHouseholdSettings(householdId: EntityId): Promise<HouseholdSettings | null> {
        const result = await query(
            "SELECT * FROM finhouse.household_settings WHERE household_id = $1",
            [householdId],
        );
        if (result.rows.length === 0) return null;
        const row = result.rows[0];
        return {
            id: row.id as EntityId,
            householdId: row.household_id as EntityId,
            monthlyIncome: row.monthly_income_cents as Money,
            monthlyEssentialExpenses: row.monthly_essential_expenses_cents as Money,
            monthlyDiscretionaryExpenses: row.monthly_discretionary_expenses_cents as Money,
            currency: row.currency as string,
            incomeSource: row.income_source as "manual_entry" | "bank_feed" | "user_provided",
            updatedAt: new Date(row.updated_at as string),
            updatedBy: row.updated_by as EntityId,
            emergencyFundMinimumMonths: (row.emergency_fund_min_months as number) ?? 3,
            emergencyFundTargetMonths: (row.emergency_fund_target_months as number) ?? 6,
            emergencyFundStretchMonths: (row.emergency_fund_stretch_months as number) ?? 9,
        };
    }

    async getBudgetsForPeriod(
        householdId: EntityId,
        year: number,
        month: number,
    ): Promise<Budget[]> {
        const result = await query(
            `SELECT * FROM finhouse.budgets
             WHERE household_id = $1 AND period_year = $2 AND period_month = $3
             ORDER BY category`,
            [householdId, year, month],
        );
        return result.rows.map(row => ({
            id: row.id as EntityId,
            householdId: row.household_id as EntityId,
            periodYear: row.period_year as number,
            periodMonth: row.period_month as number,
            category: row.category as string,
            amountCents: row.amount_cents as Money,
            goalId: row.goal_id ? (row.goal_id as EntityId) : undefined,
            notes: row.notes ? (row.notes as string) : undefined,
            version: row.version as number,
            createdAt: new Date(row.created_at as string),
            updatedAt: new Date(row.updated_at as string),
        }));
    }
}

/**
 * PostgreSQL SavingsGoalRepository
 */
export class PgSavingsGoalRepository implements ISavingsGoalRepository {
    async create(goal: Omit<SavingsGoal, "id" | "createdAt" | "updatedAt" | "version">): Promise<SavingsGoal> {
        const result = await query(
            `INSERT INTO finhouse.savings_goals
             (household_id, name, type, target_amount_cents, current_amount_cents,
              monthly_contribution_cents, target_date, start_date, notes)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
             RETURNING *`,
            [
                goal.householdId,
                goal.name,
                goal.type,
                goal.targetAmountCents,
                goal.currentAmountCents,
                goal.monthlyContributionCents,
                goal.targetDate ? goal.targetDate.toISOString().split("T")[0] : null,
                goal.startDate.toISOString().split("T")[0],
                goal.notes ?? null,
            ],
        );
        return this.rowToGoal(result.rows[0]);
    }

    async findById(id: EntityId): Promise<SavingsGoal | null> {
        const result = await query(
            "SELECT * FROM finhouse.savings_goals WHERE id = $1",
            [id],
        );
        return result.rows.length === 0 ? null : this.rowToGoal(result.rows[0]);
    }

    async findByHouseholdId(householdId: EntityId): Promise<SavingsGoal[]> {
        const result = await query(
            "SELECT * FROM finhouse.savings_goals WHERE household_id = $1 ORDER BY created_at",
            [householdId],
        );
        return result.rows.map(r => this.rowToGoal(r));
    }

    async findEmergencyFundGoal(householdId: EntityId): Promise<SavingsGoal | null> {
        const result = await query(
            "SELECT * FROM finhouse.savings_goals WHERE household_id = $1 AND type = 'EMERGENCY_FUND' LIMIT 1",
            [householdId],
        );
        return result.rows.length === 0 ? null : this.rowToGoal(result.rows[0]);
    }

    async update(
        id: EntityId,
        updates: {
            name?: string;
            targetAmountCents?: number;
            currentAmountCents?: number;
            monthlyContributionCents?: number;
            targetDate?: Date | null;
            notes?: string | null;
        },
        expectedVersion: number,
    ): Promise<SavingsGoal> {
        const setClauses: string[] = ["version = version + 1", "updated_at = CURRENT_TIMESTAMP"];
        const values: unknown[] = [];
        let i = 1;

        if (updates.name !== undefined) { setClauses.push(`name = $${i++}`); values.push(updates.name); }
        if (updates.targetAmountCents !== undefined) { setClauses.push(`target_amount_cents = $${i++}`); values.push(updates.targetAmountCents); }
        if (updates.currentAmountCents !== undefined) { setClauses.push(`current_amount_cents = $${i++}`); values.push(updates.currentAmountCents); }
        if (updates.monthlyContributionCents !== undefined) { setClauses.push(`monthly_contribution_cents = $${i++}`); values.push(updates.monthlyContributionCents); }
        if ("targetDate" in updates) { setClauses.push(`target_date = $${i++}`); values.push(updates.targetDate ? updates.targetDate.toISOString().split("T")[0] : null); }
        if ("notes" in updates) { setClauses.push(`notes = $${i++}`); values.push(updates.notes ?? null); }

        values.push(id, expectedVersion);
        const result = await query(
            `UPDATE finhouse.savings_goals
             SET ${setClauses.join(", ")}
             WHERE id = $${i++} AND household_id IN (SELECT household_id FROM finhouse.savings_goals WHERE id = $${i - 1}) AND version = $${i}
             RETURNING *`,
            values,
        );
        if (result.rows.length === 0) {
            throw new Error("Savings goal not found or version conflict — reload and retry");
        }
        return this.rowToGoal(result.rows[0]);
    }

    async delete(id: EntityId, householdId: EntityId): Promise<void> {
        const result = await query(
            "DELETE FROM finhouse.savings_goals WHERE id = $1 AND household_id = $2 RETURNING id",
            [id, householdId],
        );
        if (result.rows.length === 0) {
            throw new Error("Savings goal not found");
        }
    }

    private rowToGoal(row: DbRow): SavingsGoal {
        return {
            id: row.id as EntityId,
            householdId: row.household_id as EntityId,
            name: row.name as string,
            type: row.type as GoalType,
            targetAmountCents: row.target_amount_cents as Money,
            currentAmountCents: row.current_amount_cents as Money,
            monthlyContributionCents: row.monthly_contribution_cents as Money,
            targetDate: row.target_date ? new Date(row.target_date as string) : null,
            startDate: new Date(row.start_date as string),
            notes: (row.notes as string | null) ?? null,
            version: row.version as number,
            createdAt: new Date(row.created_at as string),
            updatedAt: new Date(row.updated_at as string),
        };
    }
}

/**
 * PostgreSQL DebtRepository
 */
export class PgDebtRepository implements IDebtRepository {
    async findActiveAccountsByHousehold(householdId: EntityId): Promise<Account[]> {
        const result = await query(
            "SELECT * FROM finhouse.accounts WHERE household_id = $1 AND status = 'ACTIVE' ORDER BY created_at",
            [householdId],
        );
        return result.rows.map(r => this.rowToAccount(r));
    }

    async updateDebtDetails(
        accountId: EntityId,
        householdId: EntityId,
        details: {
            creditLimitCents?: number | null;
            interestRateBps?: number | null;
            minimumPaymentCents?: number | null;
            scheduledPaymentCents?: number | null;
            statementBalanceCents?: number | null;
            revolvingBalanceCents?: number | null;
        },
    ): Promise<Account> {
        // Verify ownership before update
        const check = await query(
            "SELECT id FROM finhouse.accounts WHERE id = $1 AND household_id = $2",
            [accountId, householdId],
        );
        if (check.rows.length === 0) throw new Error("Account not found");

        const cols: [keyof typeof details, string][] = [
            ["creditLimitCents", "credit_limit_cents"],
            ["interestRateBps", "interest_rate_bps"],
            ["minimumPaymentCents", "minimum_payment_cents"],
            ["scheduledPaymentCents", "scheduled_payment_cents"],
            ["statementBalanceCents", "statement_balance_cents"],
            ["revolvingBalanceCents", "revolving_balance_cents"],
        ];

        const setClauses: string[] = [];
        const values: unknown[] = [];
        let p = 1;

        for (const [key, col] of cols) {
            if (Object.prototype.hasOwnProperty.call(details, key)) {
                setClauses.push(`${col} = $${p++}`);
                values.push(details[key] ?? null);
            }
        }

        if (setClauses.length === 0) throw new Error("No fields to update");

        setClauses.push(`updated_at = CURRENT_TIMESTAMP`);
        values.push(accountId);

        const result = await query(
            `UPDATE finhouse.accounts SET ${setClauses.join(", ")} WHERE id = $${p} RETURNING *`,
            values,
        );
        return this.rowToAccount(result.rows[0]);
    }

    private rowToAccount(row: DbRow): Account {
        return {
            id: row.id as EntityId,
            householdId: row.household_id as EntityId,
            name: row.name as string,
            type: row.type as AccountType,
            ownership: row.ownership as AccountOwnership,
            currency: row.currency as string,
            currentBalance: row.current_balance_cents as Money,
            institutionName: row.institution_name as string | undefined,
            lastUpdatedAt: row.last_updated_at as Date,
            status: row.status as AccountStatus,
            createdAt: row.created_at as Date,
            updatedAt: row.updated_at as Date,
            creditLimitCents: row.credit_limit_cents as number | null ?? null,
            interestRateBps: row.interest_rate_bps as number | null ?? null,
            minimumPaymentCents: row.minimum_payment_cents as number | null ?? null,
            scheduledPaymentCents: row.scheduled_payment_cents as number | null ?? null,
            statementBalanceCents: row.statement_balance_cents as number | null ?? null,
            revolvingBalanceCents: row.revolving_balance_cents as number | null ?? null,
        };
    }
}
// Re-export advisor repositories from separate file
export {
    PgAdvisorConversationRepository,
    PgAdvisorMessageRepository,
    PgWorkflowStateRepository,
    PgToolExecutionRepository,
} from "./advisor-repositories";

// Re-export budget approval repository
export { PgBudgetApprovalRepository } from "./repositories/budget-approval";
