# House Financial Advisor - React Dashboard

Slice 1 Financial Pulse experience for household financial overview.

## Features

- **Household Overview**: Display household name and financial summary
- **Health Status**: Visual indicator of financial health (Healthy, Attention, At Risk)
- **Key Metrics**: Net worth, available cash, monthly income, expenses, surplus, and debt
- **Account Breakdown**: Organized view of accounts by category (cash, retirement, investments, debt)
- **Interactive Explanations**: "Why?" tooltips for understanding derived financial metrics
- **Responsive Design**: Works on desktop, tablet, and mobile devices
- **Plain Language**: Non-technical interface suitable for any household member
- **API Integration**: Uses existing REST API endpoints

## Architecture

### Components

- **App.tsx**: Main app component with data fetching and error handling
- **HouseholdHeader**: Displays household name and update date
- **HealthStatus**: Shows financial health status with emoji indicator
- **MetricsGrid**: Grid of key financial metrics with tooltips
- **MetricCard**: Individual metric display with "Why?" interaction
- **AccountsSection**: Categorized account display

### API Integration

Uses `/financial-pulse` endpoint which returns:
- Household information
- Financial health status
- Key metrics (net worth, cash, income, expenses, surplus, debt)
- Categorized account summary

## Setup

```bash
npm install
npm run dev      # Start dev server
npm run build    # Build for production
npm run test     # Run Playwright tests
npm run lint     # Lint code
npm run type-check # Check TypeScript
```

## Development

The app runs on `http://localhost:5173` and proxies API calls to `http://localhost:3000`.

To connect to the backend API:
1. Ensure the API server is running on port 3000
2. The app will automatically proxy `/financial-pulse` calls to the backend

## Testing

Playwright tests cover:
- Household header display
- Health status visualization
- All key metrics rendering
- Account categorization
- Interactive tooltips
- Responsive layouts (mobile, tablet, desktop)
- Error handling
- Performance (30-second load budget)
- Plain language verification
- Visual hierarchy

```bash
npm run test     # Run tests
npm run test:ui  # Run tests with Playwright UI
```

## Design Principles

- **Non-Technical**: All language is plain and accessible
- **Privacy-First**: No raw IDs or technical details exposed
- **Visual Hierarchy**: Clear emphasis on important information
- **Responsive**: Works seamlessly on all screen sizes
- **No Calculations**: All financial calculations done in backend
- **Progressive Disclosure**: Additional details available via "Why?" interactions

## Styling

CSS-only styling (no CSS-in-JS framework):
- Responsive grid layout for metrics
- Mobile-first design approach
- Accessible color contrast
- Smooth interactions and animations
- Organized by component for maintainability
