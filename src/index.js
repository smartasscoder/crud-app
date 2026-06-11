import { createToken, validateEmployeeInput, verifyToken } from './lib/security.js';

class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });

const toNumberOrNull = (value) => (value === null || value === undefined ? null : Number(value));

export default {
  async fetch(request, env) {
    try {
      const url = new URL(request.url);

      if (url.pathname === '/' && request.method === 'GET') {
        return new Response(getHtml(), {
          headers: { 'content-type': 'text/html; charset=utf-8' },
        });
      }

      if (url.pathname === '/api/login' && request.method === 'POST') {
        const body = await readJson(request);

        const credentials = [
          { username: env.ADMIN_USERNAME, password: env.ADMIN_PASSWORD, role: 'admin' },
          { username: env.EMPLOYEE_USERNAME, password: env.EMPLOYEE_PASSWORD, role: 'employee' },
        ];

        const match = credentials.find(
          (candidate) =>
            candidate.username &&
            candidate.password &&
            candidate.username === body.username &&
            candidate.password === body.password
        );

        if (!match) return json({ error: 'Invalid credentials' }, 401);

        const exp = Math.floor(Date.now() / 1000) + 60 * 60;
        const token = await createToken(
          { sub: match.username, role: match.role, exp },
          env.AUTH_SECRET
        );

        return json({ token, role: match.role, expiresAt: exp });
      }

      if (url.pathname.startsWith('/api/employees')) {
        const auth = await authenticate(request, env);
        if (!auth) return json({ error: 'Unauthorized' }, 401);

        if (url.pathname === '/api/employees' && request.method === 'GET') {
          const query =
            auth.role === 'admin'
              ? env.DB.prepare(
                  'SELECT id, name, email, department, position, salary, created_by, created_at, updated_at FROM employees ORDER BY id DESC'
                )
              : env.DB.prepare(
                  'SELECT id, name, email, department, position, salary, created_by, created_at, updated_at FROM employees WHERE created_by = ? ORDER BY id DESC'
                ).bind(auth.sub);

          const result = await query.all();
          return json({ records: result.results ?? [] });
        }

        if (url.pathname === '/api/employees' && request.method === 'POST') {
          const body = await readJson(request);
          const errors = validateEmployeeInput(body);
          if (errors.length) return json({ error: 'Validation failed', details: errors }, 400);

          const creator = auth.sub;
          const now = new Date().toISOString();

          const insert = await env.DB.prepare(
            'INSERT INTO employees (name, email, department, position, salary, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
          )
            .bind(
              body.name.trim(),
              body.email.trim().toLowerCase(),
              body.department.trim(),
              body.position.trim(),
              toNumberOrNull(body.salary),
              creator,
              now,
              now
            )
            .run();

          return json({ id: insert.meta?.last_row_id ?? null, createdBy: creator }, 201);
        }

        const match = url.pathname.match(/^\/api\/employees\/(\d+)$/);
        if (match) {
          const employeeId = Number(match[1]);

          if (request.method === 'PUT') {
            if (auth.role !== 'admin') return json({ error: 'Forbidden' }, 403);

            const body = await readJson(request);
            const errors = validateEmployeeInput(body);
            if (errors.length) return json({ error: 'Validation failed', details: errors }, 400);

            const update = await env.DB.prepare(
              'UPDATE employees SET name = ?, email = ?, department = ?, position = ?, salary = ?, updated_at = ? WHERE id = ?'
            )
              .bind(
                body.name.trim(),
                body.email.trim().toLowerCase(),
                body.department.trim(),
                body.position.trim(),
                toNumberOrNull(body.salary),
                new Date().toISOString(),
                employeeId
              )
              .run();

            if (!update.meta?.changes) return json({ error: 'Employee not found' }, 404);
            return json({ updated: true });
          }

          if (request.method === 'DELETE') {
            if (auth.role !== 'admin') return json({ error: 'Forbidden' }, 403);

            const deleted = await env.DB.prepare('DELETE FROM employees WHERE id = ?').bind(employeeId).run();
            if (!deleted.meta?.changes) return json({ error: 'Employee not found' }, 404);
            return json({ deleted: true });
          }
        }
      }

      return json({ error: 'Not found' }, 404);
    } catch (error) {
      if (error instanceof ApiError) {
        return json({ error: error.message }, error.status);
      }
      console.error('Unhandled error', error);
      return json({ error: 'Internal server error' }, 500);
    }
  },
};

async function readJson(request) {
  try {
    return await request.json();
  } catch {
    throw new ApiError(400, 'Invalid JSON payload');
  }
}

async function authenticate(request, env) {
  const header = request.headers.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice('Bearer '.length) : '';
  return verifyToken(token, env.AUTH_SECRET);
}

function getHtml() {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Employee Management</title>
  <style>
    body { font-family: system-ui, sans-serif; margin: 2rem; max-width: 900px; }
    form { margin-bottom: 1rem; padding: 1rem; border: 1px solid #ddd; border-radius: 8px; }
    input { margin: 0.25rem 0.5rem 0.25rem 0; padding: 0.4rem; }
    button { padding: 0.4rem 0.75rem; }
    table { border-collapse: collapse; width: 100%; margin-top: 1rem; }
    th, td { border: 1px solid #ddd; padding: 0.5rem; text-align: left; }
    .muted { color: #666; }
  </style>
</head>
<body>
  <h1>Secure Employee Management</h1>

  <form id="login-form">
    <h2>Login</h2>
    <input name="username" placeholder="Username" required />
    <input name="password" type="password" placeholder="Password" required />
    <button type="submit">Login</button>
    <div id="auth-status" class="muted"></div>
  </form>

  <form id="employee-form">
    <h2>Add Employee</h2>
    <input name="name" placeholder="Name" required />
    <input name="email" type="email" placeholder="Email" required />
    <input name="department" placeholder="Department" required />
    <input name="position" placeholder="Position" required />
    <input name="salary" type="number" min="0" step="0.01" placeholder="Salary" />
    <button type="submit">Save</button>
  </form>

  <button id="refresh">Refresh Employee List</button>
  <pre id="message" class="muted"></pre>
  <table>
    <thead>
      <tr>
        <th>ID</th><th>Name</th><th>Email</th><th>Department</th><th>Position</th><th>Salary</th><th>Created By</th>
      </tr>
    </thead>
    <tbody id="rows"></tbody>
  </table>

  <script>
    let token = '';

    async function call(path, method, body) {
      const res = await fetch(path, {
        method,
        headers: {
          'content-type': 'application/json',
          ...(token ? { authorization: 'Bearer ' + token } : {})
        },
        body: body ? JSON.stringify(body) : undefined
      });
      return { status: res.status, data: await res.json() };
    }

    async function loadEmployees() {
      const out = await call('/api/employees', 'GET');
      const rows = document.getElementById('rows');
      rows.innerHTML = '';
      if (out.status !== 200) {
        document.getElementById('message').textContent = JSON.stringify(out.data, null, 2);
        return;
      }

      for (const employee of out.data.records) {
        const tr = document.createElement('tr');
        const cells = [
          employee.id,
          employee.name,
          employee.email,
          employee.department,
          employee.position,
          employee.salary ?? '',
          employee.created_by
        ];
        for (const value of cells) {
          const td = document.createElement('td');
          td.textContent = String(value);
          tr.appendChild(td);
        }
        rows.appendChild(tr);
      }

      document.getElementById('message').textContent = 'Loaded ' + out.data.records.length + ' record(s)';
    }

    document.getElementById('login-form').addEventListener('submit', async (event) => {
      event.preventDefault();
      const form = new FormData(event.target);
      const out = await call('/api/login', 'POST', {
        username: form.get('username'),
        password: form.get('password')
      });

      if (out.status !== 200) {
        document.getElementById('auth-status').textContent = 'Login failed';
        return;
      }

      token = out.data.token;
      document.getElementById('auth-status').textContent = 'Logged in as ' + out.data.role;
      await loadEmployees();
    });

    document.getElementById('employee-form').addEventListener('submit', async (event) => {
      event.preventDefault();
      const form = new FormData(event.target);
      const out = await call('/api/employees', 'POST', {
        name: form.get('name'),
        email: form.get('email'),
        department: form.get('department'),
        position: form.get('position'),
        salary: form.get('salary') ? Number(form.get('salary')) : undefined
      });

      document.getElementById('message').textContent = JSON.stringify(out.data, null, 2);
      if (out.status === 201) {
        event.target.reset();
        await loadEmployees();
      }
    });

    document.getElementById('refresh').addEventListener('click', loadEmployees);
  </script>
</body>
</html>`;
}
