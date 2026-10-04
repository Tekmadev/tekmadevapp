# API requests: team

Contract section 11 lists `GET /team`, `POST /team` and `DELETE /team/:email` without shapes or validation (only the `owner` code). The mock implements the rules below (`src/api/mock/routes/team.ts`). Please confirm or tell us what differs.

## Roles and who may change the team (owner decision 2026-10-03)

- Three roles: `owner`, `manager` and `staff` (NEW).
- `team.view` and `team.write` (owners and managers): see the team and add members. **Managers may only add managers and staff**; an owner may add any role.
- `team.remove` (NEW, owners only): remove members.
- `team.owners` (NEW, owners only): create an owner or promote someone to owner.
- Env owners (tekmadev@gmail.com, shajeed@tekmadev.com) can never be removed by anyone: the server reports them `envOwner: true` (the app shows a lock) and refuses removal.
- A missing capability answers 403 (see session.md): `owner_only` "That section is owner only." for `team.remove` and `team.owners`, `forbidden` "Your role cannot do that." otherwise.
- Role copy for `GET /meta` `teamRoles` (badge tone, and the help line under each choice in the add sheet):

| value | label | tone | help |
|---|---|---|---|
| `owner` | Owner | gold | Full access, can manage the team. |
| `manager` | Manager | neutral | Everything except removing team members or making owners. |
| `staff` | Staff | muted | Leads and outreach, analytics and onboarding help. Marketing, pricing and coupons are view only. No money. |

## `GET /team` → `TeamMember[]`

```ts
type TeamMember = {
  email: string;
  name: string | null;
  role: "owner" | "manager" | "staff";
  lastSignInAt: string | null;   // null = never signed in
  addedAt: string;               // ISO instant
  envOwner: boolean;             // set by the server environment: locked, cannot be removed
};
```

- Needs `team.view`.
- Order: env owners, then other owners, then everyone else (managers and staff); oldest first inside each group.
- `GET /meta` gets `teamRoles: { value, label, help, tone }[]` with the role copy in the table above (Staff first is fine: the narrowest role is the default in the add sheet).

## `POST /team` `{ name?, email, tempPassword, role }` (Idempotency-Key) → `201 TeamMember`

- Needs `team.write`; `role: "owner"` also needs `team.owners` (a manager gets the 403 `owner_only`).

- Email is trimmed and lowercased; name is trimmed (empty means `null`).
- Every bad field is reported in `fields`; `code` and `message` are the first problem in this order:

| Status | code | message | field |
|---|---|---|---|
| 400 | `name` | Keep the name to 80 characters or fewer. | `name` |
| 400 | `email` | Enter a valid email. | `email` |
| 400 | `password` | The temporary password must be at least 8 characters. | `tempPassword` |
| 400 | `role` | Pick Owner, Manager or Staff. | `role` |
| 409 | `dupe` | That email is already on the team. | `email` |

- The new member can sign in with the temporary password right away (they change it in Profile).

## `DELETE /team/:email` → `{ email, deleted: true }`

- Needs `team.remove` (owners only; a manager gets the 403 `owner_only`).

- The email is URL-encoded in the path (it may contain `+`).
- `422 owner` "The owner cannot be removed." for owners set by the server environment. We picked 422 (business rule) rather than 403, because a 403 makes the app show "That section is owner only." and leave the screen.
- New: `422 self` "You cannot remove yourself. Ask another owner." when an owner tries to remove their own account.
- `404 not_found` when the email is not on the team.
- Removing someone also removes their client portal access, if any (server side). Their next request answers 401.
