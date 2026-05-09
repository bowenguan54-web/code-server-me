from pathlib import Path
p = Path('/home/guan/code-server-me/release/lib/vscode/extensions/simple-browser/out/InsertCodeSnippetCommand.js')
s = p.read_text(encoding='utf-8')
if "const fs = require('fs')" not in s:
    s = s.replace('const vscode = __importStar(require("vscode"));', 'const vscode = __importStar(require("vscode"));\nconst fs = require(\'fs\');\nconst path = require(\'path\');')
if 'function authHeaders()' not in s:
    marker='/**\n * Ctrl+Alt+S command: fetches code snippets from AlgoLib service and inserts'
    helper='''
function authHeaders() {
    const candidates = [
        path.join(process.cwd(), '.run', 'algolib-current-session.json'),
        '/home/guan/code-server-me/.run/algolib-current-session.json',
    ];
    for (const file of candidates) {
        try {
            const session = JSON.parse(fs.readFileSync(file, 'utf8'));
            if (session && session.token) {
                return { Authorization: `Bearer ${session.token}` };
            }
        }
        catch {
        }
    }
    return {};
}

function privacyLabel(s) {
    const owner = s.ownerId || s.owner_id || '';
    const scope = s.scope || '';
    return owner === 'system' || scope === 'team' ? '公有' : '私有';
}

'''
    s=s.replace(marker, helper+marker)
s=s.replace('const resp = await fetch(`${this.baseUrl}/api/v1/snippets`);', 'const resp = await fetch(`${this.baseUrl}/api/v1/snippets`, { headers: authHeaders() });')
old='''        const items = snippets.map(s => ({
            label: `$(code) ${s.zh_name || s.name}`,
            description: s.language ?? '',
            detail: (s.tags ?? []).join(', '),
            entry: s,
        }));'''
new='''        const items = snippets.map(s => {
            const privacy = privacyLabel(s);
            return {
                label: `$(code) [${privacy}] ${s.zh_name || s.name}`,
                description: s.language ?? '',
                detail: `[${privacy}] ${(s.tags ?? []).join(', ')}`,
                entry: s,
            };
        });'''
if old in s:
    s=s.replace(old,new)
p.write_text(s, encoding='utf-8')
