import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { BACKGROUND_THEMES, getBackgroundTheme, applyBackgroundTheme } from '../src/lib/backgroundThemes.js';
const dom=new JSDOM('',{url:'https://fixture.test'});
globalThis.document=dom.window.document;globalThis.localStorage=dom.window.localStorage;
const token=name=>document.documentElement.style.getPropertyValue(name);
function luminance(hsl){
 const [h,s,l]=hsl.split(' ').map(parseFloat);const sat=s/100,light=l/100;
 const a=sat*Math.min(light,1-light);const f=n=>{const k=(n+h/30)%12;return light-a*Math.max(-1,Math.min(k-3,9-k,1));};
 const rgb=[f(0),f(8),f(4)].map(c=>c<=.04045?c/12.92:((c+.055)/1.055)**2.4);
 return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722;
}
function contrast(a,b){const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);}
for(const key of Object.keys(BACKGROUND_THEMES))for(const dark of [false,true]){
 applyBackgroundTheme(key,dark);assert.equal(getBackgroundTheme(),key);
 for(const name of ['--foreground','--card','--theme-heading','--theme-radius','--theme-backdrop','--chart-income','--chart-expense'])assert.ok(token(name),key+name);
 assert.ok(contrast(token('--foreground'),token('--card'))>=4.5,key+' card contrast');
 assert.ok(contrast(token('--muted-foreground'),token('--card'))>=4.5,key+' muted contrast');
 if(BACKGROUND_THEMES[key].style)assert.ok(contrast(token('--primary-foreground'),token('--primary'))>=4.5,key+' button contrast');
}
applyBackgroundTheme('editorial',false);assert.match(token('--theme-heading'),/Georgia/);
applyBackgroundTheme('aurora',true);assert.match(token('--theme-backdrop'),/radial-gradient/);
applyBackgroundTheme('slate',false);assert.equal(document.documentElement.dataset.themeStyle,'classic');assert.equal(token('--theme-backdrop'),'none');assert.doesNotMatch(token('--theme-heading'),/Georgia/);
applyBackgroundTheme('unknown',false);assert.equal(getBackgroundTheme(),'slate');
globalThis.localStorage={getItem(){throw Error('Unavailable');},setItem(){throw Error('Unavailable');}};
assert.equal(getBackgroundTheme(),'slate');assert.doesNotThrow(()=>applyBackgroundTheme('coastal',false));
console.log('PASS: every theme in light/dark, text contrast, preset reset, saved choice and unavailable storage');
