/* ASTRA Terminal — desktop shell self-repair.

   npm can install the electron package and still leave you without the program
   itself: the download lands in the cache, the extraction step fails quietly,
   and npm reports success. The result is a launcher that does nothing and says
   nothing, which is exactly what happened here.

   This checks for the actual executable and, if it is missing, extracts it from
   the zip npm already downloaded. Run automatically by START-ASTRA-DESKTOP.bat.
*/
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

const root = path.join(__dirname, '..');
const elDir = path.join(root, 'node_modules', 'electron');
const dist = path.join(elDir, 'dist');
const exe = path.join(dist, 'electron.exe');

function ok(){ return fs.existsSync(exe) && fs.statSync(exe).size > 1000000; }

/* An older desktop shell than this project asks for (an update arrived with git): bring it up to
   date now, while ASTRA is closed. If it cannot be done (no internet, a locked file), the shell
   that is there keeps working and this is tried again next time. */
try {
  const want = String((JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).devDependencies || {}).electron || '').replace(/^[^0-9]*/, '');
  const have = fs.existsSync(path.join(elDir, 'package.json')) ? JSON.parse(fs.readFileSync(path.join(elDir, 'package.json'), 'utf8')).version : '';
  const major = v => parseInt(String(v).split('.')[0], 10) || 0;
  if (want && have && major(have) < major(want)){
    console.log('Updating the desktop shell from Electron ' + have + ' to ' + want + ' (security fixes). One time only...');
    try {
      execFileSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['install', '--no-audit', '--no-fund'], { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' });
      if (!ok()) execFileSync(process.execPath, [path.join(elDir, 'install.js')], { cwd: root, stdio: 'inherit' });
      console.log(ok() ? 'Desktop shell updated.' : 'The update is not complete yet; unpacking it below...');
    } catch (e){ console.log('The update could not finish now (' + (e && e.message ? e.message.split(String.fromCharCode(10))[0] : e) + '). ASTRA starts with the shell it has.'); }
  }
} catch (e){ /* a damaged package.json: leave the shell as it is */ }

if (ok()){
  console.log('Desktop shell is ready.');
  process.exit(0);
}

console.log('The desktop shell is not unpacked. Repairing...');

/* which version does the installed package expect? */
let version = '';
try {
  version = JSON.parse(fs.readFileSync(path.join(elDir, 'package.json'), 'utf8')).version;
} catch (e) {
  console.log('The electron package is not installed at all. Run START-ASTRA-DESKTOP again '
            + 'and let the download finish.');
  process.exit(1);
}

/* the zip npm already fetched, wherever it cached it */
const caches = [
  path.join(process.env.LOCALAPPDATA || '', 'electron', 'Cache'),
  path.join(os.homedir(), 'AppData', 'Local', 'electron', 'Cache'),
  path.join(os.homedir(), '.cache', 'electron'),
];
const wanted = 'electron-v' + version + '-win32-' + (process.arch === 'ia32' ? 'ia32' : 'x64') + '.zip';

let zip = null;
for (const c of caches){
  if (!fs.existsSync(c)) continue;
  for (const entry of fs.readdirSync(c)){
    const direct = path.join(c, entry);
    if (entry === wanted){ zip = direct; break; }
    try {
      if (fs.statSync(direct).isDirectory() && fs.existsSync(path.join(direct, wanted))){
        zip = path.join(direct, wanted);
        break;
      }
    } catch (e) { /* unreadable cache entry, skip */ }
  }
  if (zip) break;
}

if (!zip){
  console.log('Could not find the downloaded file for electron ' + version + '.');
  console.log('Delete the node_modules folder and run START-ASTRA-DESKTOP again.');
  process.exit(1);
}

console.log('Unpacking ' + path.basename(zip) + ' (this takes a minute)...');
try {
  fs.rmSync(dist, { recursive: true, force: true });
  fs.mkdirSync(dist, { recursive: true });
  execFileSync('powershell', ['-NoProfile', '-NonInteractive', '-Command',
    'Expand-Archive -LiteralPath ' + JSON.stringify(zip) +
    ' -DestinationPath ' + JSON.stringify(dist) + ' -Force'], { stdio: 'inherit' });
  if (!ok()) throw new Error('the executable is still missing after unpacking');
  fs.writeFileSync(path.join(elDir, 'path.txt'), 'electron.exe');
  console.log('Repaired. Starting ASTRA...');
  process.exit(0);
} catch (e){
  console.log('Repair failed: ' + e.message);
  console.log('Delete the node_modules folder and run START-ASTRA-DESKTOP again.');
  process.exit(1);
}
