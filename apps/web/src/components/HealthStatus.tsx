interface HealthStatusProps {
    status: "HEALTHY" | "ATTENTION" | "AT_RISK";
    message: string;
}

export default function HealthStatus({ status, message }: HealthStatusProps) {
    const getHealthDisplay = () => {
        switch (status) {
            case "HEALTHY":
                return {
                    title: "You're in great shape",
                    emoji: "✓",
                    statusText: "Financially healthy",
                    className: "healthy",
                };
            case "ATTENTION":
                return {
                    title: "Room for improvement",
                    emoji: "→",
                    statusText: "Check your spending",
                    className: "attention",
                };
            case "AT_RISK":
                return {
                    title: "Needs attention",
                    emoji: "⚠",
                    statusText: "Review your budget",
                    className: "at-risk",
                };
        }
    };

    const display = getHealthDisplay();

    return (
        <div className="health-section">
            <div className="health-card">
                <div className={`health-indicator ${display.className}`}>
                    {display.emoji}
                </div>
                <div className="health-content">
                    <div className="health-title">{display.title}</div>
                    <div className="health-status">{display.statusText}</div>
                    <div className="health-message">{message}</div>
                </div>
            </div>
        </div>
    );
}
