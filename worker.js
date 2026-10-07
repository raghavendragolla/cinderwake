const ALLOWED_ORIGINS = new Set([
  "https://cinderwake.raghavendragolla.com",
  "http://127.0.0.1:5500",
  "http://localhost:5500",
]);

function isAllowedOrigin(origin) {
  return ALLOWED_ORIGINS.has(origin);
}

function getCorsOrigin(origin) {
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    return origin;
  }
  return "https://cinderwake.raghavendragolla.com";
}

const SESSION_COOKIE = "cinderwake_session";
const SESSION_DAYS = 30;
// Cloudflare Workers production Web Crypto rejects PBKDF2 iteration counts above 100000 with NotSupportedError.
const PASSWORD_ITERATIONS = 100000;

function corsHeaders(origin) {
  return {
    "Access-Control-Allow-Origin": getCorsOrigin(origin),
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET, POST, PUT, OPTIONS",
    "Vary": "Origin",
  };
}

function json(data, status = 200, origin = "", extra = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...corsHeaders(origin),
      ...extra,
    },
  });
}

function randomBytes(length) {
  return crypto.getRandomValues(new Uint8Array(length));
}

function bytesToBase64(bytes) {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function base64ToBytes(value) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  return bytes;
}

async function sha256Hex(value) {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", data);

  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function hashPassword(password) {
  const salt = randomBytes(16);

  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );

  const derived = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt,
      iterations: PASSWORD_ITERATIONS,
      hash: "SHA-256",
    },
    keyMaterial,
    256
  );

  return [
    "v1",
    PASSWORD_ITERATIONS,
    bytesToBase64(salt),
    bytesToBase64(new Uint8Array(derived)),
  ].join("$");
}

async function verifyPassword(password, stored) {
  try {
    const parts = stored.split("$");

    if (parts.length !== 4 || parts[0] !== "v1") {
      return false;
    }

    const iterations = Number(parts[1]);
    const salt = base64ToBytes(parts[2]);
    const expected = base64ToBytes(parts[3]);

    const keyMaterial = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(password),
      "PBKDF2",
      false,
      ["deriveBits"]
    );

    const derived = new Uint8Array(
      await crypto.subtle.deriveBits(
        {
          name: "PBKDF2",
          salt,
          iterations,
          hash: "SHA-256",
        },
        keyMaterial,
        256
      )
    );

    if (derived.length !== expected.length) {
      return false;
    }

    let difference = 0;

    for (let i = 0; i < derived.length; i++) {
      difference |= derived[i] ^ expected[i];
    }

    return difference === 0;
  } catch {
    return false;
  }
}

function validateUsername(username) {
  return (
    typeof username === "string" &&
    /^[a-zA-Z0-9_]{3,32}$/.test(username)
  );
}

function validatePassword(password) {
  return typeof password === "string" && password.length >= 8;
}

async function createSession(env, playerId) {
  const tokenBytes = randomBytes(32);
  const token = bytesToBase64(tokenBytes);

  const sessionId = await sha256Hex(token);

  const expires = new Date(
    Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000
  ).toISOString();

  await env.DB.prepare(
    `INSERT INTO sessions (id, player_id, expires_at)
     VALUES (?, ?, ?)`
  )
    .bind(sessionId, playerId, expires)
    .run();

  return token;
}

async function getSession(env, request) {
  const cookie = request.headers.get("Cookie") || "";

  const match = cookie.match(
    new RegExp(`${SESSION_COOKIE}=([^;]+)`)
  );

  if (!match) {
    return null;
  }

  const token = match[1];

  const sessionId = await sha256Hex(token);

  const result = await env.DB.prepare(
    `SELECT
       sessions.id,
       sessions.player_id,
       sessions.expires_at,
       players.username
     FROM sessions
     JOIN players ON players.id = sessions.player_id
     WHERE sessions.id = ?
       AND sessions.expires_at > datetime('now')`
  )
    .bind(sessionId)
    .first();

  return result || null;
}

function sessionCookie(token) {
  return [
    `${SESSION_COOKIE}=${token}`,
    "Path=/",
    "HttpOnly",
    "Secure",
    "SameSite=None",
    `Max-Age=${SESSION_DAYS * 24 * 60 * 60}`,
  ].join("; ");
}

function clearSessionCookie() {
  return [
    `${SESSION_COOKIE}=`,
    "Path=/",
    "HttpOnly",
    "Secure",
    "SameSite=None",
    "Max-Age=0",
  ].join("; ");
}

async function handleRegister(request, env, origin) {
  let body;

  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON." }, 400, origin);
  }

  const username = String(body.username || "").trim();
  const password = String(body.password || "");

  if (!validateUsername(username)) {
    return json(
      {
        error:
          "Username must be 3-32 characters and contain only letters, numbers, or underscore.",
      },
      400,
      origin
    );
  }

  if (!validatePassword(password)) {
    return json(
      {
        error: "Password must contain at least 8 characters.",
      },
      400,
      origin
    );
  }

  const existing = await env.DB.prepare(
    "SELECT id FROM players WHERE username = ?"
  )
    .bind(username)
    .first();

  if (existing) {
    return json(
      {
        error: "Username already exists.",
      },
      409,
      origin
    );
  }

  const passwordHash = await hashPassword(password);

  const result = await env.DB.prepare(
    `INSERT INTO players (username, password_hash)
     VALUES (?, ?)`
  )
    .bind(username, passwordHash)
    .run();

  const playerId = result.meta.last_row_id;

  const token = await createSession(env, playerId);

  return json(
    {
      success: true,
      username,
    },
    201,
    origin,
    {
      "Set-Cookie": sessionCookie(token),
    }
  );
}

async function handleLogin(request, env, origin) {
  let body;

  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON." }, 400, origin);
  }

  const username = String(body.username || "").trim();
  const password = String(body.password || "");

  const player = await env.DB.prepare(
    `SELECT id, username, password_hash
     FROM players
     WHERE username = ?`
  )
    .bind(username)
    .first();

  if (!player) {
    return json(
      {
        error: "Invalid username or password.",
      },
      401,
      origin
    );
  }

  const valid = await verifyPassword(password, player.password_hash);

  if (!valid) {
    return json(
      {
        error: "Invalid username or password.",
      },
      401,
      origin
    );
  }

  const token = await createSession(env, player.id);

  return json(
    {
      success: true,
      username: player.username,
    },
    200,
    origin,
    {
      "Set-Cookie": sessionCookie(token),
    }
  );
}

async function handleLogout(request, env, origin) {
  const session = await getSession(env, request);

  if (session) {
    await env.DB.prepare(
      "DELETE FROM sessions WHERE id = ?"
    )
      .bind(session.id)
      .run();
  }

  return json(
    {
      success: true,
    },
    200,
    origin,
    {
      "Set-Cookie": clearSessionCookie(),
    }
  );
}

async function handleMe(request, env, origin) {
  const session = await getSession(env, request);

  if (!session) {
    return json(
      {
        authenticated: false,
      },
      401,
      origin
    );
  }

  return json(
    {
      authenticated: true,
      username: session.username,
    },
    200,
    origin
  );
}

async function handleGetSave(request, env, origin) {
  const session = await getSession(env, request);

  if (!session) {
    return json(
      {
        error: "Not authenticated.",
      },
      401,
      origin
    );
  }

  const player = await env.DB.prepare(
    `SELECT
       username,
       lifetime_score,
       cinders,
       selected_lantern,
       unlocked_lanterns,
       lantern_mastery,
       achievements,
       bestiary,
       synergies,
       dusk_progress,
       save_version,
       updated_at
     FROM players
     WHERE id = ?`
  )
    .bind(session.player_id)
    .first();

  if (!player) {
    return json(
      {
        error: "Player not found.",
      },
      404,
      origin
    );
  }

  return json(
    {
      username: player.username,
      lifetimeScore: player.lifetime_score,
      cinders: player.cinders,
      selectedLantern: player.selected_lantern,
      unlockedLanterns: JSON.parse(player.unlocked_lanterns),
      lanternMastery: JSON.parse(player.lantern_mastery),
      achievements: JSON.parse(player.achievements),
      bestiary: JSON.parse(player.bestiary),
      synergies: JSON.parse(player.synergies),
      duskProgress: player.dusk_progress,
      saveVersion: player.save_version,
      updatedAt: player.updated_at,
    },
    200,
    origin
  );
}

async function handleSave(request, env, origin) {
  const session = await getSession(env, request);

  if (!session) {
    return json(
      {
        error: "Not authenticated.",
      },
      401,
      origin
    );
  }

  let body;

  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON." }, 400, origin);
  }

  const lifetimeScore = Math.max(
    0,
    Math.floor(Number(body.lifetimeScore) || 0)
  );

  const cinders = Math.max(
    0,
    Math.floor(Number(body.cinders) || 0)
  );

  const selectedLantern = String(
    body.selectedLantern || "wick"
  );

  const unlockedLanterns = JSON.stringify(
    Array.isArray(body.unlockedLanterns)
      ? body.unlockedLanterns
      : ["wick"]
  );

  const lanternMastery = JSON.stringify(
    body.lanternMastery &&
      typeof body.lanternMastery === "object"
      ? body.lanternMastery
      : {}
  );

  const achievements = JSON.stringify(
    Array.isArray(body.achievements)
      ? body.achievements
      : []
  );

  const bestiary = JSON.stringify(
    Array.isArray(body.bestiary)
      ? body.bestiary
      : []
  );

  const synergies = JSON.stringify(
    Array.isArray(body.synergies)
      ? body.synergies
      : []
  );

  const duskProgress = Math.max(
    0,
    Math.floor(Number(body.duskProgress) || 0)
  );

  const saveVersion = Math.max(
    1,
    Math.floor(Number(body.saveVersion) || 1)
  );

  await env.DB.prepare(
    `UPDATE players
     SET
       lifetime_score = ?,
       cinders = ?,
       selected_lantern = ?,
       unlocked_lanterns = ?,
       lantern_mastery = ?,
       achievements = ?,
       bestiary = ?,
       synergies = ?,
       dusk_progress = ?,
       save_version = ?,
       updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`
  )
    .bind(
      lifetimeScore,
      cinders,
      selectedLantern,
      unlockedLanterns,
      lanternMastery,
      achievements,
      bestiary,
      synergies,
      duskProgress,
      saveVersion,
      session.player_id
    )
    .run();

  return json(
    {
      success: true,
    },
    200,
    origin
  );
}

async function cleanupExpiredSessions(env) {
  await env.DB.prepare(
    "DELETE FROM sessions WHERE expires_at <= datetime('now')"
  ).run();
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin") || "";

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders(origin),
      });
    }

    if (origin && !isAllowedOrigin(origin)) {
      return json(
        {
          error: "Origin not allowed.",
        },
        403,
        origin
      );
    }

    try {
      await cleanupExpiredSessions(env);

      if (url.pathname === "/api/register" && request.method === "POST") {
        return await handleRegister(request, env, origin);
      }

      if (url.pathname === "/api/login" && request.method === "POST") {
        return await handleLogin(request, env, origin);
      }

      if (url.pathname === "/api/logout" && request.method === "POST") {
        return await handleLogout(request, env, origin);
      }

      if (url.pathname === "/api/me" && request.method === "GET") {
        return await handleMe(request, env, origin);
      }

      if (url.pathname === "/api/save" && request.method === "GET") {
        return await handleGetSave(request, env, origin);
      }

      if (url.pathname === "/api/save" && request.method === "PUT") {
        return await handleSave(request, env, origin);
      }

      if (url.pathname === "/") {
        return new Response("Cinderwake Save API is running.", {
          status: 200,
          headers: corsHeaders(origin),
        });
      }

      return json(
        {
          error: "Not found.",
        },
        404,
        origin
      );
    } catch (error) {
      console.error(error);

      return json(
        {
          error: "Internal server error.",
        },
        500,
        origin
      );
    }
  },
};