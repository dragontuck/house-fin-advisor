import { AccountBalance } from "../api";

interface AccountsSummary {
    cash: AccountBalance[];
    retirement: AccountBalance[];
    investments: AccountBalance[];
    debt: AccountBalance[];
}

interface AccountsSectionProps {
    summary: AccountsSummary;
}

export default function AccountsSection({ summary }: AccountsSectionProps) {
    const formatCurrency = (value: number) => {
        return new Intl.NumberFormat("en-US", {
            style: "currency",
            currency: "USD",
            minimumFractionDigits: 0,
            maximumFractionDigits: 0,
        }).format(value);
    };

    const renderAccountGroup = (
        title: string,
        accounts: AccountBalance[],
        showAsPositive: boolean
    ) => {
        if (accounts.length === 0) {
            return (
                <div key={title} className="account-group">
                    <div className="account-group-title">{title}</div>
                    <div className="empty-group">No accounts in this category</div>
                </div>
            );
        }

        return (
            <div key={title} className="account-group">
                <div className="account-group-title">{title}</div>
                <div className="account-list">
                    {accounts.map((account, index) => (
                        <div key={index} className="account-item">
                            <span className="account-name">{account.name}</span>
                            <span
                                className={`account-balance ${showAsPositive
                                        ? account.balance > 0
                                            ? "positive"
                                            : ""
                                        : account.balance > 0
                                            ? "negative"
                                            : ""
                                    }`}
                            >
                                {showAsPositive
                                    ? formatCurrency(Math.abs(account.balance))
                                    : formatCurrency(account.balance)}
                            </span>
                        </div>
                    ))}
                </div>
            </div>
        );
    };

    return (
        <div className="accounts-section">
            <div className="section-title">Account breakdown</div>
            {renderAccountGroup("Daily cash", summary.cash, true)}
            {renderAccountGroup("Retirement savings", summary.retirement, true)}
            {renderAccountGroup("Investments", summary.investments, true)}
            {renderAccountGroup("Debt", summary.debt, false)}
        </div>
    );
}
