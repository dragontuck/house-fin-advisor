# Keycloak User Sync Integration

## Overview

The Keycloak User Sync system automatically synchronizes authenticated Keycloak users with household member records in the database. When a user authenticates, their Keycloak identity is linked to a household member account, enabling role-based access control and household-scoped data access.

## Architecture

### Flow Diagram

```
HTTP Request
    ↓
keycloakOptionalAuth Middleware
    ├─ Validates JWT token (if present)
    └─ Sets req.keycloakToken
    ↓
householdContextMiddleware
    ├─ Extracts household ID from token claim or header
    └─ Sets req.context.householdId
    ↓
keycloakSyncMiddleware
    ├─ Checks if user is authenticated
    ├─ Calls KeycloakUserSyncService
    ├─ Syncs user to household member
    └─ Sets req.keycloakUserSync (result)
    ↓
Route Handlers
```

## Components

### 1. KeycloakUserSyncService (`auth/keycloak-sync.ts`)

**Responsibility:** Sync Keycloak user identities with household member records

**Key Methods:**
- `syncUser(token, householdId)` - Main sync method
  - Takes Keycloak token and household ID
  - Looks up existing household member by identity_id (Keycloak user ID)
  - Creates new member if not found
  - Returns sync result with member ID

**Display Name Resolution:**
Priority order:
1. `token.name` - Full name from Keycloak
2. `token.preferred_username` - Username 
3. `token.email` - Email (uses prefix before @)
4. `token.sub` - User ID (fallback)

**Error Handling:**
- Logs errors to console but doesn't fail the request
- Returns `UserSyncResult` with error details
- Handles UNIQUE constraint violations gracefully (existing members)

### 2. Keycloak Sync Middleware (`auth/keycloak-sync-middleware.ts`)

**Responsibility:** Middleware to call the sync service during request processing

**Features:**
- Only syncs authenticated users (checks `req.keycloakToken`)
- Only syncs if household context is available
- Continues regardless of sync success/failure (non-blocking)
- Stores sync result in `req.keycloakUserSync` for potential logging/auditing

**Integration Point:**
Added to middleware chain after `householdContextMiddleware`:

```typescript
app.use(keycloakOptionalAuth);
app.use(householdContextMiddleware);
app.use(createKeycloakSyncMiddleware(keycloakUserSyncService));
```

## Data Model

### HouseholdMember Table

```sql
CREATE TABLE household_members (
  id UUID PRIMARY KEY,
  household_id UUID NOT NULL REFERENCES households(id),
  identity_id VARCHAR(255) NOT NULL,      -- Keycloak user ID (sub claim)
  display_name VARCHAR(255) NOT NULL,
  role household_member_role NOT NULL,
  visibility household_member_visibility NOT NULL,
  created_at TIMESTAMP NOT NULL,
  UNIQUE(household_id, identity_id)
);
```

**Unique Constraint:** `(household_id, identity_id)` ensures one user identity per household

### Keycloak Token → HouseholdMember Mapping

```
Token Claim          →  HouseholdMember Field
─────────────────────────────────────────────
sub                  →  identity_id (Keycloak user ID)
name                 →  display_name
preferred_username   →  display_name (fallback)
email                →  display_name (fallback)
```

## Usage Examples

### Automatic Sync on Authentication

```typescript
// User logs in via Keycloak
// Browser sends: Authorization: Bearer <jwt-token>

// On API request:
// 1. keycloakOptionalAuth validates token
// 2. householdContextMiddleware extracts household ID
// 3. keycloakSyncMiddleware syncs user automatically

// User is automatically created as household member
const member = await memberRepo.findByIdentityId(householdId, userId);
// Returns new or existing household member
```

### Access Sync Result in Route Handlers

```typescript
app.get('/my-profile', (req: Request, res: Response) => {
    if (req.keycloakUserSync?.isNew) {
        console.log('New household member created:', req.keycloakUserSync.memberId);
    }
    
    // Use synced member ID for data access
    const memberId = req.keycloakUserSync?.memberId;
});
```

### Household Member Information

```typescript
// After sync, retrieve full member info
const member = await memberRepo.findByIdentityId(householdId, req.keycloakToken!.sub);

if (member) {
    console.log({
        memberId: member.id,
        displayName: member.displayName,
        role: member.role,              // MEMBER, ADMIN, etc.
        visibility: member.visibility,  // VISIBLE, HIDDEN
        keycloakUserId: member.identityId,
    });
}
```

## Security Considerations

### 1. Identity Mapping

- **Identity ID (identity_id):** The Keycloak `sub` (subject) claim uniquely identifies the user
- **Unique Constraint:** Prevents duplicate identity entries per household
- **Immutable:** Once synced, identity_id never changes

### 2. Role Mapping

Keycloak roles → Household member roles:
- Initially created with `MEMBER` role
- Can be upgraded to `ADMIN`, `ADVISOR`, etc. via application
- Stored in database, not just token claims

### 3. Household Isolation

- Sync only creates member in the household specified by `householdId`
- One Keycloak user can have different roles in different households
- Each household has its own set of members

### 4. Error Handling

- Sync failures don't block requests (non-blocking)
- Duplicate members handled gracefully (UNIQUE constraint)
- Errors logged but not exposed to client

## Configuration

### Environment Variables

No additional environment variables needed. Uses existing:
- `KEYCLOAK_REALM_URL` - For token validation
- `KEYCLOAK_REALM` - For issuer verification
- `KEYCLOAK_CLIENT_ID` - For audience validation

### Keycloak Token Custom Claims

To include custom household information in tokens:

1. **In Keycloak Admin Console:**
   - Go to Realm Roles → Create role `household-{household-id}`
   - Go to Users → User Details → Role Mapping
   - Add the household role

2. **Configure Mapper to include household_id claim:**
   ```
   Mapper Type: User Attribute
   Attribute Name: household_id
   Token Claim Name: household_id
   Add to ID Token: ON
   Add to Access Token: ON
   ```

3. **Token will now include:**
   ```json
   {
     "sub": "keycloak-user-id",
     "household_id": "household-uuid",
     "name": "User Name",
     "email": "user@example.com"
   }
   ```

## Monitoring & Debugging

### Sync Success Log

```
[KEYCLOAK_SYNC_SUCCESS] {
  householdId: "...",
  userId: "...",
  memberId: "...",
  displayName: "...",
  timestamp: "2026-09-13T..."
}
```

### Sync Failure Log

```
[KEYCLOAK_SYNC_FAILED] {
  householdId: "...",
  userId: "...",
  error: "...",
  timestamp: "2026-09-13T..."
}
```

### Check Sync Result in Request

```typescript
console.log({
    wasSynced: !!req.keycloakUserSync?.success,
    isNewMember: req.keycloakUserSync?.isNew,
    memberId: req.keycloakUserSync?.memberId,
    error: req.keycloakUserSync?.error,
});
```

## Testing

### Unit Test Example

```typescript
import { createKeycloakUserSyncService } from './auth/keycloak-sync';

const mockMemberRepo = {
    findByIdentityId: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockResolvedValue({
        id: 'member-123',
        householdId: 'household-456',
        identityId: 'keycloak-789',
        displayName: 'Test User',
        role: 'MEMBER',
        visibility: 'VISIBLE',
        createdAt: new Date(),
    }),
};

const syncService = createKeycloakUserSyncService(mockMemberRepo);

const token = {
    sub: 'keycloak-789',
    name: 'Test User',
    preferred_username: 'testuser',
    email: 'test@example.com',
};

const result = await syncService.syncUser(token as any, 'household-456');

expect(result.success).toBe(true);
expect(result.isNew).toBe(true);
expect(result.memberId).toBe('member-123');
expect(mockMemberRepo.create).toHaveBeenCalled();
```

### Integration Test Example

```typescript
// Simulate authenticated request
const token = await getKeycloakToken(testUser);

const response = await request(app)
    .get('/api/financial-pulse')
    .set('Authorization', `Bearer ${token}`)
    .set('x-household-id', householdId)
    .expect(200);

// Verify member was synced
const member = await memberRepo.findByIdentityId(
    householdId,
    testUser.sub
);
expect(member).toBeDefined();
expect(member!.displayName).toBe(testUser.name);
```

## File Structure

```
apps/api/src/auth/
├── keycloak-config.ts              # Configuration
├── jwt-verifier.ts                 # JWT validation
├── keycloak-middleware.ts          # Auth middleware
├── keycloak-sync.ts                # User sync service ✨ NEW
└── keycloak-sync-middleware.ts     # Sync middleware ✨ NEW
```

## Troubleshooting

### Issue: Member not created on login

**Check:**
1. Is Keycloak authentication enabled? (`Authorization` header present)
2. Is `householdId` being extracted? (`req.context.householdId` set)
3. Check console for `[KEYCLOAK_SYNC_FAILED]` logs
4. Verify `identity_id` is not NULL in token

### Issue: Duplicate member errors in database

**Solution:**
- The UNIQUE constraint on `(household_id, identity_id)` prevents duplicates
- Existing members are returned on subsequent syncs
- Check `req.keycloakUserSync.isNew` to differentiate new vs. existing

### Issue: Display name always shows as user ID

**Check:**
1. Verify token includes `name` claim: `token.name`
2. If not present, check `preferred_username`
3. Verify Keycloak mapper configuration includes these claims

### Issue: Users have different roles in different households

**This is expected behavior:**
- Each household can assign different roles to same Keycloak user
- Roles are stored in `household_members.role`, not in Keycloak token
- Query database for user's role in specific household

## Next Steps

1. **Test end-to-end:** Authenticate and verify member is created
2. **Configure Keycloak claims:** Add `household_id` claim if using multi-household
3. **Implement role-based views:** Use `member.role` for UI/API access control
4. **Add audit logging:** Log who accessed what data when
5. **Set up monitoring:** Watch for `KEYCLOAK_SYNC_FAILED` logs in production

## References

- [KEYCLOAK_INTEGRATION.md](./KEYCLOAK_INTEGRATION.md) - Full Keycloak setup guide
- [Keycloak User Federation](https://www.keycloak.org/docs/latest/server_admin/#_user-storage-federation)
- [Keycloak Token Claims](https://www.keycloak.org/docs/latest/server_admin/#_token-claims)
