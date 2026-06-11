# Secure Cloud-Based Employee Management System

This repository contains a Cloudflare Worker + D1 based employee management system with:

- Employee record CRUD APIs
- Browser web interface for login, create, and listing records
- Authentication and role-based access control (`admin` and `employee`)
- Input validation on server-side
- Automated deployment workflow on push to `main`
- Operational logging guidance for Cloudflare

## Architecture

- **Frontend**: Static HTML served by the Worker at `/`
- **Backend API**: Worker routes under `/api/*`
- **Database**: Cloudflare D1 (SQLite)
- **Auth**: Signed bearer tokens using `AUTH_SECRET` and role checks
- **CI/CD**: GitHub Actions deploy workflow (`.github/workflows/deploy.yml`)

## Features implemented

1. Add employee records (`POST /api/employees`)
2. View employee records (`GET /api/employees`)
3. Update employee records (`PUT /api/employees/:id`, admin only)
4. Delete employee records (`DELETE /api/employees/:id`, admin only)
5. Cloud database storage in D1
6. Authentication and access control
7. Server-side APIs for all operations
8. Input validation for employee payloads
9. Automated deployment workflow (tests + migration + deploy)
10. Execution/log monitoring via `wrangler tail`
11. Auto-deploy demonstration steps after pushing code changes
12. Security threat analysis and controls (see below)

---

## Prerequisites

- Node.js 20+
- Cloudflare account
- `wrangler` (installed as dev dependency)

## 1) Create Cloudflare D1 database

```bash
npx wrangler d1 create crud-app-db
```

Copy the generated `database_id` and update `/home/runner/work/crud-app/crud-app/smartasscoder/crud-app/wrangler.toml`:

```toml
[[d1_databases]]
binding = "DB"
database_name = "crud-app-db"
database_id = "<your-d1-database-id>"
```

## 2) Configure Worker secrets

Set these in Cloudflare (for local dev and remote deploy):

```bash
npx wrangler secret put AUTH_SECRET
npx wrangler secret put ADMIN_USERNAME
npx wrangler secret put ADMIN_PASSWORD
npx wrangler secret put EMPLOYEE_USERNAME
npx wrangler secret put EMPLOYEE_PASSWORD
```

Recommended: use a long random value for `AUTH_SECRET`.

## 3) Apply migration

```bash
npx wrangler d1 migrations apply crud-app-db --local
npx wrangler d1 migrations apply crud-app-db --remote
```

Migration file: `/home/runner/work/crud-app/crud-app/smartasscoder/crud-app/migrations/0001_create_employees.sql`

## 4) Run locally

```bash
npm install
npm run dev
```

Open the printed local URL, then:

1. Login with admin or employee credentials.
2. Add employees via the form.
3. Use API endpoints for full CRUD.

## 5) API reference

### Login

```http
POST /api/login
Content-Type: application/json

{
  "username": "...",
  "password": "..."
}
```

Response:

```json
{
  "token": "<bearer-token>",
  "role": "admin",
  "expiresAt": 1718111111
}
```

### Create employee

```http
POST /api/employees
Authorization: ******
Content-Type: application/json

{
  "name": "Alice Example",
  "email": "alice@example.com",
  "department": "Engineering",
  "position": "Developer",
  "salary": 90000
}
```

### List employees

```http
GET /api/employees
Authorization: ******
```

- Admin sees all records.
- Employee sees records they created.

### Update employee (admin)

```http
PUT /api/employees/1
Authorization: ******
Content-Type: application/json

{
  "name": "Alice Updated",
  "email": "alice.updated@example.com",
  "department": "Platform",
  "position": "Senior Developer",
  "salary": 100000
}
```

### Delete employee (admin)

```http
DELETE /api/employees/1
Authorization: ******
```

## 6) D1 commands and SQL queries you can run

### Execute SQL directly

```bash
npx wrangler d1 execute crud-app-db --remote --command "SELECT * FROM employees ORDER BY id DESC LIMIT 20"
```

### Useful queries

```sql
-- View all employees
SELECT id, name, email, department, position, salary, created_by, created_at, updated_at
FROM employees
ORDER BY id DESC;

-- Find one employee by email
SELECT * FROM employees WHERE email = 'alice@example.com';

-- Count employees by department
SELECT department, COUNT(*) AS total
FROM employees
GROUP BY department
ORDER BY total DESC;

-- Update only salary
UPDATE employees
SET salary = 120000, updated_at = datetime('now')
WHERE id = 1;

-- Delete a record
DELETE FROM employees WHERE id = 1;
```

## 7) Automated deployment workflow

Workflow file: `/home/runner/work/crud-app/crud-app/smartasscoder/crud-app/.github/workflows/deploy.yml`

On push to `main`, GitHub Actions will:

1. Install dependencies
2. Run tests
3. Apply D1 migration remotely
4. Deploy Worker to Cloudflare

### Required GitHub repository secrets

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

## 8) Monitoring application execution and logs

Stream logs in real time:

```bash
npx wrangler tail
```

View workflow execution logs in GitHub Actions for deployment verification.

## 9) Demonstrating auto-deploy after code changes

1. Make a small code change and commit.
2. Push to `main`.
3. Open GitHub Actions and confirm `Deploy to Cloudflare` ran successfully.
4. Verify the updated behavior in the deployed Worker URL.

## 10) Security threats and implemented controls

### Threats

- Unauthorized access to sensitive employee data
- Token tampering or credential misuse
- Injection via malformed user input
- Data exposure from weak access control
- Deployment pipeline compromise

### Controls implemented

- Authenticated API access with signed bearer tokens
- Role-based authorization (`admin` vs `employee`)
- Server-side validation before DB writes
- Parameterized D1 queries to prevent SQL injection
- Short token expiry
- Secret-based configuration (`wrangler secret put ...`)
- CI/CD deploy through GitHub Actions with tokenized Cloudflare auth

## Local test command

```bash
npm test
```
