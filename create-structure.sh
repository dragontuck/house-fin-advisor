#!/bin/bash

# Create monorepo folder structure for house-fin-advisor

echo "Creating folder structure..."

# Apps
mkdir -p apps/{web,api,worker}

# Packages
mkdir -p packages/{domain,contracts,db,financial,ai,security,ui}

# Infrastructure
mkdir -p infra/{docker,keycloak,postgres}

# Fixtures
mkdir -p fixtures/{statements,transactions,households,scenarios}

# Tests
mkdir -p tests/{integration,e2e,financial,privacy}

# Docs
mkdir -p docs/{architecture,adr,product,decisions}

echo "✓ Folder structure created successfully!"
