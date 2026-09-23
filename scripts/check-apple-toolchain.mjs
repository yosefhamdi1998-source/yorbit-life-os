import {spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
export function appleToolchainErrors(xcode, sdk) {
  const xcodeMajor=Number(/^Xcode (\d+)(?:\.|\s|$)/m.exec(xcode || '')?.[1]);
  const sdkMajor=Number(/^(\d+)(?:\.|$)/.exec((sdk || '').trim())?.[1]);
  const errors=[];
  if (!Number.isInteger(xcodeMajor) || xcodeMajor<26) errors.push('Use Xcode 26 or later for App Store uploads.');
  if (!Number.isInteger(sdkMajor) || sdkMajor<26) errors.push('Use the iOS 26 SDK or later for App Store uploads.');
  return errors;
}
if (process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  const xcode=spawnSync('xcodebuild',['-version'],{encoding:'utf8'});
  const sdk=spawnSync('xcrun',['--sdk','iphoneos','--show-sdk-version'],{encoding:'utf8'});
  const errors=appleToolchainErrors(xcode.status===0?xcode.stdout:'',sdk.status===0?sdk.stdout:'');
  if(errors.length){console.error('Apple toolchain preflight failed. Run on the configured Mac build host.\n'+errors.join('\n'));process.exitCode=1;}
  else console.log('Apple toolchain meets the verified upload SDK minimum. Signing and device testing are separate checks.');
}
