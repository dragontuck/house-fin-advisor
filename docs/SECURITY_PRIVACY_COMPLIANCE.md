# Security, Privacy, and Compliance

**Version**: 1.0  
**Date**: 2026-09-15  
**Audience**: Security officers, compliance teams, investors, stakeholders  
**Status**: Security model implemented and documented; compliance framework in place

---

## I. Executive Summary

House Financial Advisor is built on a **privacy-first, zero-trust architecture** where:

- ✅ **No raw financial data leaves the household network** (by default)
- ✅ **AI access is restricted** to typed application tools, never raw data
- ✅ **All financial calculations are deterministic** and auditable
- ✅ **Every financial state change is logged** with timestamp and evidence
- ✅ **Encryption and access controls** are built into the application (not bolted on)
- ✅ **Compliance frameworks** (GDPR, CCPA, SOC 2) are designed into architecture

This document details the security model, privacy guarantees, compliance readiness, and threat mitigation strategies.

---

## II. Privacy Model

### 2.1 Data Classification

All data in House Financial Advisor is classified as:

**Tier 1: Household Financial State** (Highest sensitivity)
- Account balances
- Transaction history
- Income and expense amounts
- Debt balances and interest rates
- Savings goals and progress
- Investment holdings
- Credit card activity

**Tier 2: Household Metadata** (High sensitivity)
- Household names, member names
- Email addresses
- Home address (optional)
- Account institution names
- Account types and names

**Tier 3: Restricted Information** (Never external)
- Social Security Numbers
- Account numbers, routing numbers
- Credit card numbers (never stored)
- Login credentials
- Passphrases or security answers
- Government IDs or legal documents

**Tier 4: Application Data** (Low sensitivity)
- Budget categories and names
- Goal descriptions
- Recommendation history (without Tier 1 data)
- Audit logs

### 2.2 Data Location Guarantee

**Default**: All Tier 1 and Tier 2 data remains on the household's self-hosted server.

**Policy**: 
- Database is on-premises (PostgreSQL running in Docker on household server)
- Backups are on-premises (NAS, external drive, or household-managed cloud)
- No automatic cloud sync or external backup
- Tier 3 data is never transmitted or stored (except in encrypted login session)

**Exceptions** (User-initiated):
- User can explicitly enable external backup to Anthropic (with encryption key user holds)
- User can export data in standard formats (CSV, JSON)
- User can share recommendation with advisor (via secure link with expiration)

### 2.3 Privacy Gateway Architecture

When external AI is used, data passes through a privacy gateway:

```
Application Layer
│
└─── Privacy Gateway ───────────────────────────────
        │                                          │
        ├─ Remove: SSN, account numbers,     ├─ Whitelist destinations
        │          routing numbers           ├─ Encrypt in transit (TLS 1.3)
        ├─ Remove: Card numbers              ├─ Log all calls
        ├─ Remove: Raw statements            ├─ Rate limit per user
        ├─ Anonymize: Names → "Spouse A"     └─ Timeout on responses
        ├─ Relativize: Dates → "30 days ago"
        └─ Keep: Amounts, calculations
            │
            └─────────────────────────────────────────
                        │
                        ↓
                  External AI (Anthropic)
                        │
                        ↓
                Reasoning (no access to raw data)
                        │
                        ↓
        Response (filtered for sensitive keywords)
                        │
                        ↓
            Application (stores with audit log)
```

**Example: Privacy Gateway in Action**

User asks: "What should we do with our credit card debt?"

**Raw context** (before gateway):
```
Household: Smith Family
Members: John (john@gmail.com) & Jane (jane@gmail.com)
SSN: 123-45-6789
Account: Chase CC ending in 4293, APR 18.9%
Balance: $12,543.27
Account: Wells Fargo Checking, account #9876543210
Balance: $2,104.33
Recent transactions: [full statement data]
```

**Filtered context** (after gateway):
```
Household Type: Couple
Members: 2
Credit card debt: $12,543.27 at ~19% APR (1 account)
Available cash: $2,104.33 (checking)
Monthly income: $8,000 (estimated)
Monthly expenses: $6,200 (estimated)
Monthly surplus: $1,800
Emergency fund: 0.4 months (below recommendation of 3-6 months)
```

**External AI sees**: Amount and type, not source details
**External AI cannot see**: Names, account numbers, transaction details, SSNs
**Result**: "Consider allocating $800/mo to credit card debt and $1,000/mo to emergency fund..."

### 2.4 Tool-Only AI Access

The AI never receives unrestricted database or file access.

**Approved AI Tools**:
- `calculate_budget_variance(category, timeframe)` → Returns variance
- `project_cash_flow(months)` → Returns forecast
- `analyze_debt_payoff(strategy)` → Returns payoff timeline
- `compare_scenarios(scenario_a, scenario_b)` → Returns comparison
- `explain_financial_metric(metric)` → Returns explanation

**Restricted Operations**:
- ❌ Raw SQL queries
- ❌ File system access
- ❌ Shell commands
- ❌ Database schema inspection
- ❌ Unrestricted API calls
- ❌ Network access outside of approved destinations

**Tool Validation**:
- Every tool call is logged with timestamp, parameters, and results
- Tool results are type-checked before return
- Tool calls are rate-limited (max 10 per request)
- Tool responses are sanitized for sensitive keywords

---

## III. Security Architecture

### 3.1 Authentication & Authorization

**Authentication** (Who are you?)
- Method: OAuth 2.0 via Keycloak (industry-standard)
- MFA support: TOTP via Keycloak (available)
- Session tokens: JWT with 1-hour expiry
- Refresh tokens: 30-day expiry
- Token revocation: Immediate on logout

**Authorization** (What can you access?)
- Model: Role-based access control (RBAC)
- Roles:
  - `HOUSEHOLD_OWNER`: Full access, can manage members and settings
  - `HOUSEHOLD_MEMBER`: Read/write access to shared household data
  - `HOUSEHOLD_GUEST`: Read-only access (future)
- Enforcement: Middleware checks user role before data access
- Audit: All access decisions logged with timestamp and result

**Household Isolation**:
- Database queries automatically scoped to user's household
- API endpoints validate user's household ID
- Cross-household access is impossible (application-enforced)
- Multi-tenancy: Each household is logically isolated

### 3.2 Data Encryption

**Encryption in Transit**:
- Protocol: TLS 1.3 (minimum)
- Cipher suites: Only strong ciphers (ECDHE, AES-256-GCM)
- Certificate: Self-signed OK for self-hosted; managed CA for SaaS
- HSTS: Enabled (force HTTPS)

**Encryption at Rest** (Self-hosted):
- Current: Not enforced by application (filesystem-level)
- Future (Slice 8): Optional end-to-end encryption for sensitive fields
- Recommendation: Use LUKS (Linux) or BitLocker (Windows) on host system

**Encryption at Rest** (Managed Hosting):
- Database: AES-256 encryption (AWS RDS encryption, etc.)
- Backups: AES-256 encryption
- Keys: Customer-managed (user holds encryption key, not provider)

**Key Management**:
- API secrets: Stored in environment variables or secrets vault
- AI API keys: Encrypted at rest, never logged
- Database credentials: Stored in secrets management system
- Key rotation: Quarterly (or on employee change)

### 3.3 SQL Injection & Input Validation

**SQL Injection Prevention**:
- Method: Parameterized queries (ORM-enforced)
- Framework: TypeORM with typed models
- Queries: No string concatenation for user input
- Validation: Input type checking (number, string, enum)

**Input Validation**:
- Frontend: Real-time validation (prevents obvious errors)
- API: Server-side validation on all requests
- Validation rules:
  - Account balance: Integer, positive, max 2^53 (JavaScript limit)
  - Description: String, max 255 chars, no HTML/scripts
  - Date: ISO 8601 format, within reasonable range
  - Amounts: Integer cents, positive (or negative for credit)

**CSRF Protection**:
- Method: Double-submit cookies (SameSite=Strict)
- Tokens: Generated per-session
- Enforcement: All state-changing requests require token

### 3.4 Session Management

**Session Creation**:
- OAuth 2.0 authorization code flow (not implicit)
- Scope: Only requested permissions granted
- Consent: User explicitly approves access

**Session Storage**:
- Tokens: Stored in secure HTTP-only cookies
- Tokens: SameSite=Strict (prevent CSRF)
- Tokens: Secure flag set (HTTPS only)
- Duration: 1 hour access token, 30 day refresh

**Session Invalidation**:
- Logout: Token revoked immediately
- Expiry: Automatic after 1 hour of inactivity
- Device loss: User can invalidate all sessions from settings
- Admin: Can force logout (future feature)

### 3.5 API Security

**Request Validation**:
- Schema validation: All requests validated against OpenAPI schema
- Content-Type: Only `application/json` accepted
- Body size: Limited to 1MB
- Rate limiting: 100 requests/minute per user/IP

**Response Security**:
- Content-Type: Always `application/json`
- CORS: Restricted to known hosts
- Cache headers: No-store for sensitive data
- Security headers: HSTS, X-Content-Type-Options, CSP

**API Documentation**:
- OpenAPI 3.0 spec available at `/api/openapi.json`
- Swagger UI available at `/api/docs` (requires auth)
- Rate limit info included in response headers

### 3.6 Dependency Security

**Dependency Management**:
- Package manager: npm with `package-lock.json` pinned versions
- Scanning: npm audit (weekly)
- Policy: Update security patches within 48 hours
- Policy: Major/minor updates within 2 weeks after testing

**Vulnerable Dependency Response**:
1. npm audit detects vulnerability
2. Patch version released (if available)
3. If not available: Workaround or pin version with note
4. Users notified if sensitive (security-audit email)
5. Fix validated before release

---

## IV. Compliance Frameworks

### 4.1 GDPR (General Data Protection Regulation)

**Scope**: Applies to EU residents' personal data.

**GDPR Readiness**:
- ✅ Data residency: EU data can stay in EU (on-premises self-hosted)
- ✅ Data subject rights: User can export, delete, correct personal data
- ✅ Privacy policy: Available in app (GDPR-compliant language)
- ✅ Data processing agreement: Available for business customers
- ✅ Data protection by design: Privacy-first architecture built-in
- ✅ Breach notification: Framework in place (48-hour notification)
- ✅ Privacy impact assessment: Template available for deployments

**User Rights Implemented**:
- Right to access: User can export household data (CSV/JSON)
- Right to deletion: User can delete household and all associated data
- Right to correction: User can edit any financial data
- Right to portability: Data export in standard format
- Right to withdraw consent: User can disable AI, external integrations
- Right to object: User can opt-out of processing
- Right to restrict: User can freeze data from changes

**Example Data Export**:
```json
{
  "household": { ... },
  "accounts": [ ... ],
  "transactions": [ ... ],
  "budgets": [ ... ],
  "goals": [ ... ],
  "recommendations": [ ... ],
  "audit_logs": [ ... ]
}
```

### 4.2 CCPA (California Consumer Privacy Act)

**Scope**: Applies to California residents' personal information.

**CCPA Readiness**:
- ✅ Privacy notice: Available with clear, conspicuous language
- ✅ Right to know: User can request what data is collected
- ✅ Right to delete: User can request deletion (complied within 45 days)
- ✅ Right to opt-out: User can disable data sharing (AI calls, analytics)
- ✅ Right to non-discrimination: No price discrimination for privacy choices
- ✅ No sale of personal information: Data is never sold (policy enforced)

**Metrics**:
- Data collection notice: Shown on signup (required)
- User access requests: Processable in < 45 days
- User deletion requests: Processable in < 45 days
- Opt-out tracking: User preferences stored and enforced

### 4.3 SOC 2 (Service Organization Control)

**Framework**: Trust Service Principles (CC: Security, A: Availability, C: Confidentiality, PI: Privacy, PE: Processing Integrity)

**SOC 2 Roadmap** (Slice 8):
- 🔄 Security: All controls implemented (access, encryption, monitoring)
- 🔄 Availability: 99.5% uptime target (monitoring, alerting)
- 🔄 Confidentiality: Data encryption, access controls, privacy gateway
- 🔄 Privacy: Privacy policy, data handling, user rights
- 🔄 Processing integrity: Validation, error detection, audit logs

**Timeline**: SOC 2 Type II audit scheduled for Q2 2027 (after Slice 8)

### 4.4 PCI-DSS (Payment Card Industry Data Security Standard)

**Scope**: Only applies if storing credit card data. House Advisor does NOT store card data.

**PCI-DSS Compliance**:
- ✅ Card data policy: Never collect, store, or transmit card numbers
- ✅ References only: System references card accounts (e.g., "Card ending in 4293")
- ✅ No tokenization needed: No card data to tokenize
- ✅ Out of scope: Not required for PCI-DSS certification
- ⚠️ Risk: Partner integrations must be PCI-compliant (Plaid, etc.)

**Guidance for Users**:
- Do not enter card numbers in the system
- Do not share card numbers via recommendation or notes
- Card data should be referenced only by last 4 digits and issuer

---

## V. Threat Model & Mitigation

### 5.1 Threat Landscape

**Threat**: Unauthorized database access

**Scenarios**:
- Attacker gains network access (compromised WiFi)
- Attacker gains database credentials (leaked config)
- Attacker exploits application vulnerability (SQL injection)
- Insider threat (rogue admin)

**Mitigation**:
- Network: Firewall rules, VPN for remote access
- Database: Strong credentials, database-level access controls
- Application: Parameterized queries, input validation, RBAC
- Audit: All access logged, alerting on suspicious patterns

**Residual Risk**: Medium (network-isolated systems reduce to Low)

---

**Threat**: Privacy gateway bypass

**Scenarios**:
- Attacker intercepts AI API calls (MITM)
- Attacker compromises privacy gateway code
- Attacker tricks user into disabling privacy gateway
- Attacker exploits gateway filtering logic

**Mitigation**:
- Network: TLS 1.3, certificate pinning (future)
- Code: Privacy gateway code audited, unit tested
- UI: No "disable privacy gateway" option (always-on)
- Logic: Denylist approach (filter by default, whitelist safe data)

**Residual Risk**: Low

---

**Threat**: Malicious AI recommendations

**Scenarios**:
- Attacker compromises Anthropic API
- Attacker modifies AI response in-flight
- Attacker injects prompt injection commands
- AI hallucinates false recommendations

**Mitigation**:
- Validation: Independent validator checks all recommendations
- Math check: Scenarios recalculated, results verified
- Policy check: Recommendations must align with household constraints
- Approval: Users must explicitly approve recommendations
- Audit trail: All recommendations logged with evidence

**Residual Risk**: Low (validator layer provides defense-in-depth)

---

**Threat**: Session hijacking / Man-in-the-Middle

**Scenarios**:
- Attacker steals session token (via cookie stealing, MITM)
- Attacker impersonates user (forged JWT)
- Attacker eavesdrops on traffic (unencrypted)

**Mitigation**:
- Tokens: Stored in HTTP-only cookies (JavaScript can't access)
- Tokens: Signed with private key (forgery prevents)
- Transport: TLS 1.3 (eavesdropping prevents)
- Refresh: Tokens expire after 1 hour (stolen token useful only briefly)
- Logout: User can invalidate all sessions immediately

**Residual Risk**: Very Low

---

**Threat**: Supply chain attack (compromised dependency)

**Scenarios**:
- npm package contains malware
- Transitive dependency modified
- Typosquatting attack (similar package name)
- Compromised CI/CD pipeline

**Mitigation**:
- Pinning: `package-lock.json` pins exact versions
- Scanning: npm audit runs weekly, on CI/CD
- Review: Code review for dependencies (before merge)
- Isolation: Production dependencies separate from dev
- Monitoring: Unusual package behavior detected (e.g., network calls)

**Residual Risk**: Low (pinned versions reduce update attack surface)

---

**Threat**: Physical security (stolen server/drives)

**Scenarios**:
- Household server stolen or repossessed
- Hard drive accessed without authorization
- Backup drive lost or stolen

**Mitigation**:
- Encryption: Disk encryption (LUKS, BitLocker) recommended
- Keys: Encryption keys stored separately from hardware
- Backup: Encrypted backups only
- Policy: Zero data unencrypted at rest (for self-hosted)

**Residual Risk**: Medium (depends on user implementation)

---

### 5.2 Threat Matrix

| Threat | Likelihood | Impact | Mitigation | Residual Risk |
|--------|-----------|--------|-----------|---|
| Database breach | Low | High | RBAC, encryption, audit | Low |
| Privacy bypass | Very Low | High | Gateway, TLS, validation | Very Low |
| AI compromise | Very Low | Medium | Validator, approval | Very Low |
| Session hijack | Low | High | HTTP-only, TLS, timeout | Very Low |
| Supply chain | Low | High | Scanning, pinning, review | Low |
| Physical theft | Medium | High | Encryption, keys | Medium |
| Insider threat | Very Low | High | Audit logs, RBAC | Low |
| DDoS attack | Low | Medium | Rate limiting, CDN | Low |

---

## VI. Incident Response Plan

### 6.1 Security Incident Classification

**Severity 1 (Critical)**: Breach or potential breach of customer data
- Example: Database credentials leaked, unauthorized database access detected
- Response time: < 1 hour (assess situation)
- Notification: Affected customers notified within 24 hours

**Severity 2 (High)**: Security vulnerability identified but not yet breached
- Example: SQL injection vulnerability found in code
- Response time: < 4 hours (develop patch)
- Notification: Security bulletin released within 48 hours

**Severity 3 (Medium)**: Security issue that requires mitigation
- Example: Weak TLS configuration, missing input validation
- Response time: < 24 hours (develop patch)
- Notification: Patch released, no customer notification if not exploited

**Severity 4 (Low)**: Security observation or policy violation
- Example: Code comment with exposed API key, deprecated dependency
- Response time: < 1 week (develop fix)
- Notification: None (internal only)

### 6.2 Incident Response Workflow

```
1. Discovery
   ├─ Internal security team reports issue
   ├─ External researcher reports via security@advisor.local
   └─ Automated monitoring detects anomaly

2. Classification
   ├─ Determine severity (1-4)
   ├─ Assess blast radius (how many customers affected?)
   └─ Create incident ticket (tracking)

3. Investigation
   ├─ Reproduce issue (if possible)
   ├─ Determine root cause
   ├─ Assess exposure window (when did it start?)
   └─ Check logs for exploitation signs

4. Containment
   ├─ Isolation (stop ongoing breach)
   ├─ Eradication (remove threat)
   ├─ Preservation (preserve evidence for forensics)
   └─ Communication (notify internal stakeholders)

5. Remediation
   ├─ Develop fix (code, config, policy)
   ├─ Test fix (security testing, regression testing)
   ├─ Deploy fix (canary, then full rollout)
   └─ Verify fix (monitoring, additional testing)

6. Communication
   ├─ Severity 1: Email to affected customers within 24 hours
   ├─ Severity 2: Email to all customers within 48 hours
   ├─ Severity 3: Blog post / security bulletin within 1 week
   └─ Severity 4: Internal only

7. Post-Incident
   ├─ Root cause analysis (why did this happen?)
   ├─ Preventive measures (how do we prevent recurrence?)
   ├─ Monitoring enhancement (how do we detect sooner?)
   └─ Training (how do we educate team?)
```

### 6.3 Security Contacts

**For security issues**: Email security@advisor.local (non-public address)
- GPG key available at: https://advisor.local/security/pgp-key.asc
- Response time: Within 48 hours
- Responsible disclosure: Embargo period before public disclosure

**Public reporting**: GitHub issues (for non-sensitive issues)

---

## VII. Security Best Practices for Users

### 7.1 Self-Hosted Deployment

**Network Security**:
- Use firewall to restrict access (only household members)
- Use VPN for remote access (OpenVPN, WireGuard)
- Use strong router password (change from default)
- Disable UPnP (prevents automatic port forwarding)
- Keep firmware updated

**Server Security**:
- Use strong OS password (20+ characters)
- Enable automatic security updates
- Use LUKS or BitLocker for disk encryption
- Limit SSH access (key-based auth only, no passwords)
- Monitor for suspicious login attempts

**Data Security**:
- Regular backups (daily or weekly)
- Encrypt backups
- Store backups off-site (NAS, external drive)
- Test restore procedure quarterly
- Document recovery procedures

**Operational Security**:
- Limit physical access to server
- Don't share server credentials
- Rotate API keys quarterly
- Monitor application logs for errors
- Update application regularly

### 7.2 Information Security

**Privacy Practices**:
- Don't share financial data outside of application
- Use secure communication (encrypted email) for sensitive discussions
- Don't screenshot sensitive information
- Be cautious of social engineering (phishing emails)

**Device Security**:
- Keep device (laptop, phone) updated
- Use strong device password
- Enable device encryption
- Use password manager for unique passwords
- Use MFA for important accounts

---

## VIII. Security Audit & Testing

### 8.1 Scheduled Security Reviews

**Monthly**:
- Dependency scanning (npm audit)
- Log review (suspicious access patterns)
- SSL/TLS certificate check (expiry, configuration)

**Quarterly**:
- Security code review (1-2 features or services)
- Penetration testing (internal, targeted)
- Backup verification (restore test)
- Incident drill (simulate and respond to breach)

**Annually**:
- Full security assessment (all components)
- Third-party penetration test (external)
- SOC 2 audit (managed hosting only)
- Policy review and update

### 8.2 Automated Security Testing

**Continuous Integration**:
- npm audit (detects vulnerable packages)
- SonarQube (detects code vulnerabilities)
- SAST (static analysis security testing)
- DAST (dynamic analysis on test environment)

**Production Monitoring**:
- Intrusion detection (failed logins, suspicious API calls)
- Anomaly detection (unusual data access patterns)
- Rate limiting (prevents brute force, DoS)
- Security logging (all access attempts logged)

---

## IX. Compliance Roadmap

### Current State (Slice 1-5)
- ✅ Privacy architecture documented and implemented
- ✅ Encryption in transit (TLS 1.3)
- ✅ Access controls (RBAC, household isolation)
- ✅ Audit logging (all access logged)
- ✅ Data export/deletion (GDPR/CCPA ready)
- ✅ Dependency scanning (npm audit)

### Slice 8 (Q2 2027)
- 🔄 Encryption at rest (end-to-end, optional user-controlled keys)
- 🔄 Advanced monitoring (intrusion detection, anomaly detection)
- 🔄 Incident response automation (alerting, containment)
- 🔄 SOC 2 Type II audit (external assessment)
- 🔄 Security incident response plan (documented and tested)
- 🔄 Compliance audit (GDPR, CCPA, PCI-DSS guidance)

### Slice 9 (Q3 2027)
- 🔄 Disaster recovery procedures (documented, tested)
- 🔄 Observability (metrics, tracing, logging)
- 🔄 Security runbooks (for operations team)
- 🔄 Compliance monitoring (continuous compliance checks)
- 🔄 Annual security audit (external, comprehensive)

### Slice 10+ (Post-2027)
- 🔄 HIPAA compliance (if integrating health data)
- 🔄 FedRAMP certification (if serving government)
- 🔄 ISO 27001 certification (comprehensive security management)

---

## X. Certification & Standards

### Current Certifications
- **OAuth 2.0**: Keycloak-certified implementation
- **OpenAPI 3.0**: API specification compliant
- **TypeScript**: Type-safe codebase (95%+ coverage)

### In Progress
- **SOC 2 Type II**: Scheduled Q2 2027
- **GDPR Ready**: Compliance by design
- **CCPA Ready**: Compliance by design

### Planned
- **ISO 27001**: Comprehensive security management system
- **FedRAMP** (if enterprise demand): Federal Risk & Authorization Management Program
- **HIPAA** (if health data integration): Health Insurance Portability & Accountability Act

---

## XI. FAQ: Security & Privacy

**Q: Is my data really safe from breaches?**

A: House Advisor is designed with defense-in-depth: authentication, encryption, access controls, and audit logging. No system is 100% breach-proof, but we minimize attack surface by keeping data self-hosted and restricted to tool-based AI access.

**Q: What if my server is compromised?**

A: If your self-hosted server is compromised, your financial data is at risk (as with any system). We recommend: disk encryption (LUKS), firewall rules, VPN for remote access, and regular backup recovery tests.

**Q: Can House Advisor employees see my financial data?**

A: If self-hosted: No employees can see your data. If managed hosting: Our infrastructure team cannot see your data (zero-knowledge architecture).

**Q: What happens if you get hacked?**

A: If self-hosted: You are responsible for security. If managed hosting: We have incident response procedures, breach notification (within 24 hours), and cyber insurance.

**Q: Can the AI see my financial data?**

A: The AI only sees filtered, anonymized data through the privacy gateway. Raw financial data is never sent to external APIs.

**Q: What if I want to leave? Can I take my data?**

A: Yes. You can export your data anytime in standard formats (CSV, JSON). Your data is portable.

**Q: Is the code open source?**

A: House Advisor source code is available for security review. Full open-source availability is planned post-launch (after stabilization).

**Q: Do you comply with GDPR/CCPA?**

A: Yes. We implement GDPR and CCPA principles by design: data residency control, user rights (access, delete, correct), and privacy-by-default.

---

## XII. References

### Internal Documentation
- [AGENTS.md](../AGENTS.md) — Engineering rules (privacy, UX, safety)
- [PRODUCT_BUILD_CONTRACT.md](../PRODUCT_BUILD_CONTRACT.md) — Product principles
- [docs/PRIVACY_BOUNDARY_IMPLEMENTATION.md](./PRIVACY_BOUNDARY_IMPLEMENTATION.md) — Privacy gateway details
- [docs/adr/003-privacy-boundary-and-ai-tools.md](./adr/003-privacy-boundary-and-ai-tools.md) — ADR-003: Privacy architecture decision

### External Standards
- [OWASP Top 10](https://owasp.org/www-project-top-ten/) — Web application security risks
- [OAuth 2.0 Authorization Framework](https://tools.ietf.org/html/rfc6749)
- [GDPR Official Text](https://gdpr-info.eu/)
- [CCPA Official Text](https://leginfo.legislature.ca.gov/faces/billNavClient.xhtml?bill_id=201720180AB375)
- [SOC 2 Trust Service Principles](https://us.aicpa.org/topic/audit-assurance/audit-standards/as/soc-engagements)
- [NIST Cybersecurity Framework](https://www.nist.gov/cyberframework)

---

**Last Updated**: 2026-09-15  
**Next Review**: Q1 2027 (before Slice 6 release)  
**For questions**: Contact security@advisor.local
