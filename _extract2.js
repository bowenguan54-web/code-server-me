const fs = require('fs');
const h = fs.readFileSync('/home/guan/code-server-me/src/browser/pages/algo-lib.html', 'utf8');

// Extract the main script (the one after line 647)
const startTag = '<script>';
const endTag = '</script>';
// Find the main script block (not the external one)
let start = h.indexOf(startTag, h.indexOf('monaco'));
// Actually, find it differently: the script that doesn't have src attribute
const mainScriptMatch = h.match(/<script>(?![\s\S]*?src=)([\s\S]*?)<\/script>\s*<\/body>/);
if (!mainScriptMatch) {
  // fallback: find script without src
  const allScripts = [];
  let re = /<script([^>]*)>([\s\S]*?)<\/script>/g;
  let m;
  while ((m = re.exec(h)) !== null) {
    if (!m[1].includes('src=')) {
      allScripts.push({ attrs: m[1], content: m[2] });
    }
  }
  if (allScripts.length > 0) {
    const largest = allScripts.sort((a,b) => b.content.length - a.content.length)[0];
    fs.writeFileSync('/tmp/algo_main2.js', largest.content);
    console.log('Extracted (fallback):', largest.content.length, 'chars');
  } else {
    console.log('No inline script found!');
  }
} else {
  fs.writeFileSync('/tmp/algo_main2.js', mainScriptMatch[1]);
  console.log('Extracted:', mainScriptMatch[1].length, 'chars');
}
