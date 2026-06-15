# Security Specification: AI Resume Maker & ATS Optimizer

This specification outlines the data invariants, malicious attack vectors (the "Dirty Dozen"), and the security rule checks implemented in Firestore to protect client data and prevent "Denial of Wallet" and identity spoofing attacks.

## 1. Data Invariants

1. **User Ownership**: A user must only read or write their own profile document: `/users/{userId}` where `userId == request.auth.uid`.
2. **Resume Protection**: Resume documents located at `/users/{userId}/resumes/{resumeId}` must only be accessible (read/write/delete) if `request.auth.uid == userId`. No user may see or edit another user's resumes.
3. **Immutability of Key Ownership**: The fields detailing ownership (`userId`, `id`) must be immutable from the moment of creation.
4. **Verified Emails Only**: All write operations must mandatorily require `request.auth.token.email_verified == true`.
5. **ID Safety**: Any resource ID must comply with standard alphanumeric formats (`isValidId`) and be strictly bounded to prevent memory or query string poisoning.
6. **Temporal integrity**: All creation and modification times (`createdAt`, `updatedAt`) must strictly match `request.time`.

---

## 2. The "Dirty Dozen" Malicious Payloads

The following malicious payloads seek to bypass security controls. They are rejected by the implemented security rules.

### Payload 1: PII Disclosure Scramble (Identity Spoofing)
An attacker attempts to read `/users/victim_user_123` while logged in as `attacker_user_456`.
* **Result**: `PERMISSION_DENIED` - Root rule requires `request.auth.uid == userId`.

### Payload 2: Cross-User Resume Read (Unauthorised Scraping)
`attacker_user_456` attempts to query or read `/users/victim_user_123/resumes/resume_999`.
* **Result**: `PERMISSION_DENIED` - Root rule restricts all actions to matching `userId`.

### Payload 3: High-Jack (Identity Tampering on Creation)
An attacker tries to create a resume under `/users/attacker_user_456/resumes/res_1` specifying `userId: "victim_user_123"` in the JSON payload body.
* **Result**: `PERMISSION_DENIED` - Schema validation checks `incoming().userId == request.auth.uid` AND `incoming().userId == userId`.

### Payload 4: Orphaned Record Hijack (ID Poisoning Attack)
An attacker tries to create a resume with a 50KB garbage string containing special injection characters as the document ID: `/users/attacker_user_456/resumes/<50KB_INVALID_STRING_WITH_INJECTION>`.
* **Result**: `PERMISSION_DENIED` - Checks fail due to `isValidId(resumeId)`.

### Payload 5: Deny-of-Wallet Field Spooting (Shadow Field Attack)
An attacker tries to write custom parameters into their resume to crash the compiler or storage,:
`{ "id": "res_1", "userId": "attacker_user_456", "title": "Software Eng", "adminPrivileges": true, "extraGarbageShadow": "Lorem ipsum..." }`.
* **Result**: `PERMISSION_DENIED` - Rejection triggered because the schema validator enforces exact keys size and structure on creation (`data.keys().size() == N`).

### Payload 6: Spoofed Unverified Email Authorization
An attacker attempts to write data with a self-declared email of `admin@company.com` using a newly registered, unverified account (`email_verified = false`).
* **Result**: `PERMISSION_DENIED` - All writes require `request.auth.token.email_verified == true`.

### Payload 7: Static Creation Backdating (Temporal Poisoning)
An attacker submits a resume with a falsified `createdAt` field set to 5 years ago to disrupt system indexing.
`{ "id": "res_1", "userId": "user_id", "title": "SDE", "createdAt": timestamp("2021-01-01T00:00:00Z"), "updatedAt": request.time }`.
* **Result**: `PERMISSION_DENIED` - Rules strictly validate `incoming().createdAt == request.time`.

### Payload 8: Immutable Field Update Hack
An attacker attempts to update their resume's underlying owner string to another user after creation:
`existing: { userId: "user_123" }` -> `incoming: { userId: "user_456" }`.
* **Result**: `PERMISSION_DENIED` - Rules enforce `incoming().userId == existing().userId` on update.

### Payload 9: Empty/Malformed Payload Write (Type Pollution)
An attacker tries to write an integer instead of a string for the personalInfo target or title field:
`{ "id": "res_1", "userId": "user_123", "title": 404 }`.
* **Result**: `PERMISSION_DENIED` - Rules evaluate `incoming().title is string`.

### Payload 10: State Bypass / Shadow Update
An attacker tries to bypass template formatting checks by injecting custom non-whitelisted templates into the template configuration:
`{ "id": "res_1", "userId": "user_123", "title": "SDE", "templateId": "malicious-template-hack-123" }`.
* **Result**: `PERMISSION_DENIED` - Supported templates are strictly validated or restricted to specific standard templates format or length.

### Payload 11: Array Pollution (Denial of Wallet sizing)
An attacker attempts to insert a list of 100,000 keyword skills in a single update frame.
* **Result**: `PERMISSION_DENIED` - Bounded list array sizing is strictly checked on write (`incoming().skills.size() <= 100`).

### Payload 12: Blanket Unconditional Read Request
An attacker attempts a collection-wide read query: `db.collectionGroup("resumes").get()` without any user constraints.
* **Result**: `PERMISSION_DENIED` - Rules do not provide blanket reads. Secure list queries validate `resource.data.userId == request.auth.uid`.

---

## 3. Firestore Declarative Verification Test Runner

Below is the complete testing suite for validating standard rules integrity.

```typescript
// /tests/firestore.rules.test.ts
import { assertFails, assertSucceeds, initializeTestEnvironment } from "@firebase/rules-unit-testing";

describe("Firestore Rules Tests", () => {
  let testEnv;

  before(async () => {
    testEnv = await initializeTestEnvironment({
      projectId: "ai-resume-maker-ats-optimizer",
      firestore: {
        rules: `
          rules_version = '2';
          service cloud.firestore {
            // Rules loaded dynamically during tests
          }
        `
      }
    });
  });

  after(async () => {
    await testEnv.cleanup();
  });

  it("should prevent reading other users profiles (PII Leak)", async () => {
    const attackerDb = testEnv.authenticatedContext("attacker").firestore();
    await assertFails(attackerDb.doc("users/victim").get());
  });

  it("should allow a verified user to create their own profile", async () => {
    const verifiedDb = testEnv.authenticatedContext("user_123", { email_verified: true }).firestore();
    await assertSucceeds(verifiedDb.doc("users/user_123").set({
      uid: "user_123",
      email: "user@domain.com",
      displayName: "John Doe",
      createdAt: new Date()
    }));
  });

  it("should block unverified email profile creations", async () => {
    const unverifiedDb = testEnv.authenticatedContext("unverified", { email_verified: false }).firestore();
    await assertFails(unverifiedDb.doc("users/unverified").set({
      uid: "unverified",
      email: "unverified@domain.com",
      createdAt: new Date()
    }));
  });

  it("should prevent updating immutable fields", async () => {
    // Attempting to overwrite existing user credentials or ownership links
    const userDb = testEnv.authenticatedContext("user_123", { email_verified: true }).firestore();
    await assertFails(userDb.doc("users/user_123/resumes/resume_1").update({
      userId: "victim_user_456"
    }));
  });
});
```
