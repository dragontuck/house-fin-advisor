interface HouseholdHeaderProps {
    name: string;
    asOf: string;
}

export default function HouseholdHeader({ name, asOf }: HouseholdHeaderProps) {
    const formatDate = (dateString: string) => {
        const date = new Date(dateString);
        return date.toLocaleDateString("en-US", {
            year: "numeric",
            month: "long",
            day: "numeric",
        });
    };

    return (
        <div className="household-header">
            <div className="household-name">{name}</div>
            <div className="last-updated">Updated {formatDate(asOf)}</div>
        </div>
    );
}
