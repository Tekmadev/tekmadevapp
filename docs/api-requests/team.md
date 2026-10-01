# API requests: team (owner)

Contract section 11 lists `GET /team`, `POST /team` and `DELETE /team/:email` without shapes or validation (only the `owner` code). The mock implements the rules below (`src/api/mock/routes/team.ts`). Please confirm or tell us what differs.

## `GET /team` → `TeamMember[]`

```ts
type TeamMember = {
  email: string;
  name: string | null;
  role: "owner" | "manager";
  lastSignInAt: string | null;   // null = never signed in
  addedAt: string;               // ISO instant
  envOwner: boolean;             // set by the server environment: locked, cannot be removed
};
```

- Order: env owners, then other owners, then managers; oldest first inside each group.
- `GET /meta` gets `teamRoles: { value, label, help, tone }[]` with the brief's role copy: Manager (neutral) "Works on Overview, Inbox, Analytics, Leads, Free tools, Clients and Subscriptions", Owner (gold) "Full access, can manage the team".

## `POST /team` `{ name?, email, tempPassword, role }` (Idempotency-Key) → `201 TeamMember`

- Email is trimmed and lowercased; name is trimmed (empty means `null`).
- Every bad field is reported in `fields`; `code` and `message` are the first problem in this order:

| Status | code | message | field |
|---|---|---|---|
| 400 | `name` | Keep the name to 80 characters or fewer. | `name` |
| 400 | `email` | Enter a valid email. | `email` |
| 400 | `password` | The temporary password must be at least 8 characters. | `tempPassword` |
| 400 | `role` | Pick Owner or Manager. | `role` |
| 409 | `dupe` | That email is already on the team. | `email` |

- The new member can sign in with the temporary password right away (they change it in Profile).

## `DELETE /team/:email` → `{ email, deleted: true }`

- The email is URL-encoded in the path (it may contain `+`).
- `422 owner` "The owner cannot be removed." for owners set by the server environment. We picked 422 (business rule) rather than 403, because a 403 makes the app show "That section is owner only." and leave the screen.
- New: `422 self` "You cannot remove yourself. Ask another owner." when an owner tries to remove their own account.
- `404 not_found` when the email is not on the team.
- Removing someone also removes their client portal access, if any (server side). Their next request answers 401.
