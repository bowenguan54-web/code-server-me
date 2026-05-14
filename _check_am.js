const fs = require('fs');
const html = fs.readFileSync('/mnt/e/code-server-me/algo_management.html', 'utf8');
const m = html.match(/<script[^>]*>[\s\S]*?<\/script>/g) || [];
let ok = true;
m.forEach((s, i) => {
  const code = s.replace(/<\/?script[^>]*>/g, '');
  try { new Function(code); }
  catch(e) {
    ok = false;
    console.log('Block', i, 'error:', e.message);
    const lines = code.split('\n');
    let lo = 0, hi = lines.length;
    while (hi - lo > 1) {
      const mid = Math.floor((lo + hi) / 2);
      try { new Function(lines.slice(0, mid).join('\n')); lo = mid; }
      catch(_) { hi = mid; }
    }
    console.log('  First bad line ~', hi, ':', lines[hi - 1]?.trim().slice(0, 120));
  }
});
if (ok) console.log('All script blocks OK');
