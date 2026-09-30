import assert from 'node:assert/strict';
import fs from 'node:fs';

// A returning user whose email was never confirmed gets a resend option on
// the login screen instead of Supabase's bare "Email not confirmed".
const { isEmailNotConfirmed } = await import('data:text/javascript;base64,' + Buffer.from(fs.readFileSync('src/lib/authErrors.js', 'utf8')).toString('base64'));
assert.equal(isEmailNotConfirmed({ code: 'email_not_confirmed', message: 'anything' }), true);
assert.equal(isEmailNotConfirmed(new Error('Email not confirmed')), true, 'older auth servers send only the message');
for (const error of [new Error('Invalid login credentials'), { code: 'invalid_credentials' }, null, undefined, {}]) {
  assert.equal(isEmailNotConfirmed(error), false, JSON.stringify(error));
}

// The client keeps Supabase's error code for the screen to use.
const client = fs.readFileSync('src/api/base44Client.js', 'utf8');
const login = client.match(/async loginViaEmailPassword\(email, password\) \{([\s\S]*?)\n  \},/)[1];
assert.match(login, /failure\.code = error\.code;/);
assert.match(login, /throw failure;/);

// The screen offers the resend for the address that failed, and only then.
const screen = fs.readFileSync('src/pages/Login.jsx', 'utf8');
assert.match(screen, /if \(isEmailNotConfirmed\(err\)\) setUnconfirmed\(true\);/);
assert.match(screen, /await base44\.auth\.resendOtp\(email\);/);
assert.match(screen, /onChange=\{\(e\) => \{ setEmail\(e\.target\.value\); setUnconfirmed\(false\);/, 'editing the address clears the offer');
console.log('PASS login: an unconfirmed account gets an explanation and a resend for that address; other errors unchanged');
