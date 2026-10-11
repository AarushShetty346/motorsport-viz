// Sign in with Google (OAuth 2.0 authorization code flow), with no extra packages.
// Signed-in users are kept in the "users" collection and their sessions in
// "sessions", which a TTL index empties automatically when they expire.
const crypto = require('crypto');
const express = require('express');

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';
const PUBLIC_URL = (process.env.PUBLIC_URL || `http://localhost:${Number(process.env.PORT) || 3000}`).replace(/\/+$/, '');
const REDIRECT_URI = `${PUBLIC_URL}/api/auth/google/callback`;
const SECURE = PUBLIC_URL.startsWith('https://');
const SESSION_DAYS = 30;
const SESSION_COOKIE = 'lbl_session';
const STATE_COOKIE = 'lbl_oauth_state';

const configured = () => Boolean(CLIENT_ID && CLIENT_SECRET);

function readCookies(req) {
  const out = {};
  for (const part of (req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function setCookie(res, name, value, maxAgeSeconds) {
  const parts = [`${name}=${encodeURIComponent(value)}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${maxAgeSeconds}`];
  if (SECURE) parts.push('Secure');
  res.append('Set-Cookie', parts.join('; '));
}

// Only the hash of a session token is stored, so a database dump can't be used to sign in.
const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

async function setupAuthCollections(db) {
  await db.collection('users').createIndex({ googleId: 1 }, { name: 'googleId_1', unique: true });
  await db.collection('sessions').createIndex({ expiresAt: 1 }, { name: 'expiresAt_ttl', expireAfterSeconds: 0 });
}

// The signed-in user for this request (from the session cookie), or null.
async function currentUser(getDb, req) {
  const token = readCookies(req)[SESSION_COOKIE];
  if (!token) return null;
  const session = await getDb().collection('sessions').findOne({ _id: hashToken(token), expiresAt: { $gt: new Date() } });
  if (!session) return null;
  return getDb().collection('users').findOne({ _id: session.userId }, { projection: { googleId: 0 } });
}

async function startSession(getDb, res, userId) {
  const now = new Date();
  const token = crypto.randomBytes(32).toString('hex');
  await getDb().collection('sessions').insertOne({ _id: hashToken(token), userId, createdAt: now, expiresAt: new Date(now.getTime() + SESSION_DAYS * 86400000) });
  setCookie(res, SESSION_COOKIE, token, SESSION_DAYS * 86400);
}

function authRouter(getDb) {
  const router = express.Router();
  const users = () => getDb().collection('users');
  const sessions = () => getDb().collection('sessions');

  // Who is signed in (null if nobody), and whether Google sign-in is set up at all.
  router.get('/me', async (req, res) => {
    res.json({ configured: configured(), user: configured() ? await currentUser(getDb, req) : null });
  });

  // Step 1: send the browser to Google's sign-in page.
  router.get('/google', (req, res) => {
    if (!configured()) {
      return res.status(503).type('text').send('Google sign-in is not set up yet. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET (see the README).');
    }
    const state = crypto.randomBytes(24).toString('hex');
    setCookie(res, STATE_COOKIE, state, 600);
    const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    url.search = new URLSearchParams({
      client_id: CLIENT_ID,
      redirect_uri: REDIRECT_URI,
      response_type: 'code',
      scope: 'openid email profile',
      state,
      prompt: 'select_account',
    }).toString();
    res.redirect(url.toString());
  });

  // Step 2: Google sends the browser back here with a one-time code.
  router.get('/google/callback', async (req, res) => {
    const { code, state, error } = req.query;
    const expected = readCookies(req)[STATE_COOKIE];
    setCookie(res, STATE_COOKIE, '', 0);
    if (error) return res.redirect('/?signin=cancelled');
    if (!configured() || !code || !state || state !== expected) return res.redirect('/?signin=failed');

    // Swap the code for tokens, then ask Google who the user is.
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ code, client_id: CLIENT_ID, client_secret: CLIENT_SECRET, redirect_uri: REDIRECT_URI, grant_type: 'authorization_code' }),
    });
    if (!tokenRes.ok) {
      console.error('[auth] Google token exchange failed:', tokenRes.status, await tokenRes.text());
      return res.redirect('/?signin=failed');
    }
    const { access_token } = await tokenRes.json();
    const profileRes = await fetch('https://openidconnect.googleapis.com/v1/userinfo', { headers: { Authorization: `Bearer ${access_token}` } });
    if (!profileRes.ok) return res.redirect('/?signin=failed');
    const profile = await profileRes.json();
    if (!profile.sub || !profile.email_verified) return res.redirect('/?signin=failed');

    const now = new Date();
    const user = await users().findOneAndUpdate(
      { googleId: profile.sub },
      {
        $set: { email: profile.email, name: profile.name || profile.email, picture: profile.picture || null, lastSignInAt: now },
        $setOnInsert: { createdAt: now },
      },
      { upsert: true, returnDocument: 'after' }
    );

    await startSession(getDb, res, user._id);
    console.log(`[auth] ${profile.email} signed in`);
    res.redirect('/');
  });

  router.post('/logout', async (req, res) => {
    const token = readCookies(req)[SESSION_COOKIE];
    if (token) await sessions().deleteOne({ _id: hashToken(token) });
    setCookie(res, SESSION_COOKIE, '', 0);
    res.json({ ok: true });
  });

  // Tests only (NODE_ENV=test): sign in as a made-up user without going through Google.
  if (process.env.NODE_ENV === 'test') {
    router.post('/test-login', async (req, res) => {
      const name = String(req.body?.name || 'Test User').slice(0, 40);
      const user = await users().findOneAndUpdate(
        { googleId: 'test:' + name },
        { $set: { email: `${name.toLowerCase().replace(/[^a-z0-9]+/g, '.')}@example.com`, name, picture: null, lastSignInAt: new Date() }, $setOnInsert: { createdAt: new Date() } },
        { upsert: true, returnDocument: 'after' }
      );
      await startSession(getDb, res, user._id);
      res.json({ user: { _id: user._id, name: user.name } });
    });
  }

  return router;
}

module.exports = { authRouter, setupAuthCollections, currentUser, REDIRECT_URI, configured };
