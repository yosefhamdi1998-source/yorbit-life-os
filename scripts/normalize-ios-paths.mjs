import fs from 'node:fs';
const path='ios/App/CapApp-SPM/Package.swift';
const source=fs.readFileSync(path,'utf8');
// Capacitor's Windows generator uses OS separators inside Swift literals.
// Keep only package paths portable; do not rewrite URLs or arbitrary strings.
const portable=source.replace(/path: "([^"]+)"/g, (_match,value) => 'path: "'+value.replace(/\\/g,'/')+'"');
if (portable!==source) fs.writeFileSync(path,portable);
console.log('iOS Swift package paths use portable separators.');
