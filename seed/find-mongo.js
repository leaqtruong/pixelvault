/* Locate mongod.exe for start-website.bat.
   Batch's for /d + call combination proved unreliable for this, so the
   probing lives here where it is testable.

   Prints two lines for the batch file to consume:
     MONGOD=<full path to mongod.exe>
     DBPATH=<full path to the data folder>
   Exit code 0 when mongod was found, 1 otherwise.

   Search order, first match wins:
     1. MONGOD_EXE environment variable
     2. PATH
     3. <root>\bin\mongod.exe                 (flat install)
     4. <root>\<versioned>\bin\mongod.exe    (mongodb-*, Server\*, current)
     5. <root>\data\db or <root>\..\data\db   (existing data folder)

   Roots scanned: %ProgramFiles%\MongoDB, %ProgramFiles(x86)%\MongoDB,
   %LOCALAPPDATA%\MongoDB, %ProgramData%\MongoDB, <repo>\mongodb,
   C:\MongoDB, D:\MongoDB, E:\MongoDB, E:\MongolDB, F:\MongoDB.
   MONGOD_DATA overrides the data folder. */
const fs = require('fs');
const path = require('path');

const HOME = process.env.SystemDrive || 'C:';
const REPO = __dirname.replace(/[\\/]seed[\\/]?$/i, '');
const roots = [
  path.join(process.env.ProgramFiles || '', 'MongoDB'),
  path.join(process.env['ProgramFiles(x86)'] || '', 'MongoDB'),
  path.join(process.env.LOCALAPPDATA || '', 'MongoDB'),
  path.join(process.env.ProgramData || '', 'MongoDB'),
  path.join(REPO, 'mongodb'),
  `${HOME}\\MongoDB`,
  `${HOME}\\MongoDB`,
  'D:\\MongoDB', 'D:\\mongodb',
  'E:\\MongoDB', 'E:\\mongodb', 'E:\\MongolDB',
  'F:\\MongoDB', 'F:\\mongodb',
].filter((p) => p && !/^\s*$/.test(p));

const isExe = (p) => { try { return fs.statSync(p).isFile(); } catch { return false; } };
const isDir = (p) => { try { return fs.statSync(p).isDirectory(); } catch { return false; } };

function fromPath() {
  const dirs = (process.env.PATH || '').split(path.delimiter);
  for (const d of dirs) {
    const p = path.join(d.trim(), 'mongod.exe');
    if (isExe(p)) return p;
  }
  return null;
}

function fromRoot(root) {
  const flat = path.join(root, 'bin', 'mongod.exe');
  if (isExe(flat)) return flat;
  // one level deep only: <root>\mongodb-*\bin, <root>\Server\*\bin
  let entries = [];
  try { entries = fs.readdirSync(root, { withFileTypes: true }); } catch { return null; }
  const versioned = [];
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    if (/^(mongodb|Server|current|latest)/i.test(e.name)) versioned.push(path.join(root, e.name));
  }
  versioned.sort((a, b) => b.localeCompare(a));      // newest-looking name first
  for (const v of versioned) {
    const p = path.join(v, 'bin', 'mongod.exe');
    if (isExe(p)) return p;
  }
  return null;
}

function dataFolderFor(mongod) {
  if (process.env.MONGOD_DATA) return path.resolve(process.env.MONGOD_DATA);
  const bin = path.dirname(path.dirname(mongod));   // strip bin\mongod.exe
  const candidates = [
    path.join(bin, 'data', 'db'),
    path.resolve(bin, '..', 'data', 'db'),
    path.resolve(bin, '..', '..', 'data', 'db'),
    path.resolve(bin, '..', '..', '..', 'data', 'db'),
  ];
  for (const c of candidates) if (isDir(c)) return c;
  return candidates[0];                              // default layout, will be created
}

let mongod = null;
if (process.env.MONGOD_EXE && isExe(process.env.MONGOD_EXE)) mongod = process.env.MONGOD_EXE;
if (!mongod) mongod = fromPath();
if (!mongod) for (const r of roots) { mongod = fromRoot(r); if (mongod) break; }

if (!mongod) {
  console.log('MONGOD=');
  console.log('DBPATH=');
  process.exit(1);
}
console.log('MONGOD=' + mongod);
console.log('DBPATH=' + dataFolderFor(mongod));
process.exit(0);