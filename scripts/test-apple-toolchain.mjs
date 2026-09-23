import assert from 'node:assert/strict';
import fs from 'node:fs';
import {appleToolchainErrors} from './check-apple-toolchain.mjs';
assert.deepEqual(appleToolchainErrors('Xcode 26.1\nBuild version 17B','26.1'),[]);
assert.deepEqual(appleToolchainErrors('Xcode 27.0','27.0'),[]);
for(const [x,s] of [['Xcode 16.4','18.5'],['Xcode 26.0','18.5'],['Xcode 16.4','26.0'],['',''],['unknown','26.0']])assert.ok(appleToolchainErrors(x,s).length);
const pkg=JSON.parse(fs.readFileSync('package.json','utf8'));
const swift=fs.readFileSync('ios/App/CapApp-SPM/Package.swift','utf8');
for(const [plugin,product] of [['keyboard','CapacitorKeyboard'],['splash-screen','CapacitorSplashScreen'],['status-bar','CapacitorStatusBar']]){
 assert.match(pkg.dependencies['@capacitor/'+plugin],/^8\./);assert.ok(swift.includes('.product(name: "'+product+'"'));
}
const pipeline=fs.readFileSync('codemagic.yaml','utf8');assert.ok(pipeline.includes('node scripts/check-apple-toolchain.mjs'));
console.log('PASS: Apple SDK preflight rejects old/unverifiable toolchains; configured native plugins are installed and included in Swift package');
