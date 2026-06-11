const encoder = new TextEncoder();

export function validateEmployeeInput(payload) {
  const errors = [];

  if (!payload || typeof payload !== 'object') {
    return ['Invalid JSON payload'];
  }

  const { name, email, department, position, salary } = payload;

  if (typeof name !== 'string' || !name.trim() || name.length > 80) {
    errors.push('name is required and must be 1-80 characters');
  }

  if (
    typeof email !== 'string' ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    email.length > 120
  ) {
    errors.push('email must be a valid email address');
  }

  for (const [field, value] of Object.entries({ department, position })) {
    if (typeof value !== 'string' || !value.trim() || value.length > 80) {
      errors.push(`${field} is required and must be 1-80 characters`);
    }
  }

  if (salary !== undefined && (typeof salary !== 'number' || salary < 0 || salary > 1000000000)) {
    errors.push('salary must be a number between 0 and 1000000000');
  }

  return errors;
}

export async function createToken(payload, secret) {
  const body = base64UrlEncode(JSON.stringify(payload));
  const signature = await sign(body, secret);
  return `${body}.${signature}`;
}

export async function verifyToken(token, secret) {
  if (!token || !token.includes('.')) return null;

  const [body, signature] = token.split('.');
  if (!body || !signature) return null;

  const expected = await sign(body, secret);
  if (!safeEqual(signature, expected)) return null;

  try {
    const payload = JSON.parse(base64UrlDecode(body));
    if (!payload || typeof payload !== 'object' || payload.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

function base64UrlEncode(value) {
  return btoa(value).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(value) {
  const pad = value.length % 4;
  const padded = value + (pad ? '='.repeat(4 - pad) : '');
  return atob(padded.replace(/-/g, '+').replace(/_/g, '/'));
}

async function sign(value, secret) {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(value));
  const bytes = new Uint8Array(signature);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);

  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i += 1) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}
