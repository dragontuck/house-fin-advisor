/**
 * PostgreSQL implementation of domain repositories
 */

import { query } from "./connection";
import {
    Household,
    HouseholdMember,
    Account,
    FinancialSnapshot,
    HouseholdSettings,
    EntityId,
    Money,
    CreateHouseholdRequest,
    CreateAccountRequest,
    HouseholdMemberRole,
    HouseholdMemberVisibility,
    AccountType,
    AccountOwnership,
    AccountStatus,
    FinancialHealthStatus,
} from "@house-fin/contracts";
import {
    HouseholdRepository,
    HouseholdMemberRepository,
    AccountRepository,
    FinancialSnapshotRepository,
    HouseholdSettingsRepository,
} from "@house-fin/domain";

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
        };
    }
}
