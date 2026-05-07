const fs = require('fs');
const h = fs.readFileSync('/home/guan/code-server-me/src/browser/pages/algo-lib.html', 'utf8');
const scripts = [];
let re = /<script\b[^>]*>([\s\S]*?)<\/script>/g;
let m;
let idx = 0;
while ((m = re.exec(h)) !== null) {
  scripts.push(m[1]);
  idx++;
}
// take the largest (main) script block
scripts.sort((a,b) => b.length - a.length);
fs.writeFileSync('/tmp/algo_main.js', scripts[0]);
console.log('Extracted', scripts[0].length, 'chars');
