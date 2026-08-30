/* ASTRA — set the sign-in password for cloud sync.
   The password itself is never written into this project folder (it is public on
   GitHub). Only a salted hash is stored, in your private data folder.

   Usage:  node server/set-password.cjs "MyPassword"        (user stays Baydoun)
           node server/set-password.cjs "MyPassword" Baydoun
*/
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const pass = process.argv[2];
const user = process.argv[3] || 'Baydoun';
if (!pass){
  console.log('Give the password, e.g.:  node server/set-password.cjs "MyPassword"');
  process.exit(1);
}

const DATA_DIR = process.env.ASTRA_DATA_DIR || path.join(os.homedir(), 'astra-data');
const salt = crypto.randomBytes(16).toString('hex');
const hash = crypto.createHash('sha256').update(salt + ':' + pass).digest('hex');

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.writeFileSync(path.join(DATA_DIR, 'auth.json'), JSON.stringify({ user, salt, hash }, null, 2));

console.log('Saved for user "' + user + '" in ' + path.join(DATA_DIR, 'auth.json'));
console.log('The password is not stored anywhere — only this hash.');
console.log('For a hosting panel, set these environment variables instead:');
console.log('  ASTRA_USER=' + user);
console.log('  ASTRA_SALT=' + salt);
console.log('  ASTRA_HASH=' + hash);
