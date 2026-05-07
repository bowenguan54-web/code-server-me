const fs = require("fs");
const html = fs.readFileSync("/home/guan/code-server-me/src/browser/pages/algo-lib.html", "utf8");
const m = html.match(/<script[^>]*>[\s\S]*?<\/script>/g) || [];
m.forEach((s, i) => {
  const code = s.replace(/<\/?script[^>]*>/g, "");
  try {
    new Function(code);
  } catch(e) {
    console.log("Block", i, "error:", e.message);
    const lines = code.split("\n");
    let lo = 0, hi = lines.length;
    while (hi - lo > 1) {
      const mid = Math.floor((lo + hi) / 2);
      try { new Function(lines.slice(0, mid).join("\n")); lo = mid; }
      catch(_) { hi = mid; }
    }
    console.log("  First bad line ~", hi, ":", lines[hi - 1]?.trim().slice(0, 120));
  }
});
