from pathlib import Path

root = Path('/home/guan/code-server-me')

p = root / 'release/lib/vscode/extensions/simple-browser/out/RegistryClient.js'
s = p.read_text(encoding='utf-8')
if "const fs = require('fs')" not in s:
    s = s.replace('const vscode = __importStar(require("vscode"));', 'const vscode = __importStar(require("vscode"));\nconst fs = require(\'fs\');\nconst path = require(\'path\');')
if 'function authHeaders()' not in s:
    marker = '/**\n * HTTP + SSE client for the local AlgoLib FastAPI service.'
    helper = '''
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

'''
    s = s.replace(marker, helper + marker)
s = s.replace("headers: { Accept: 'application/json' },", "headers: { Accept: 'application/json', ...authHeaders() },")
s = s.replace("headers: { Accept: 'text/event-stream', 'Cache-Control': 'no-cache' },", "headers: { Accept: 'text/event-stream', 'Cache-Control': 'no-cache', ...authHeaders() },")
p.write_text(s, encoding='utf-8')

p = root / 'release/lib/vscode/extensions/simple-browser/out/AlgCompletionProvider.js'
s = p.read_text(encoding='utf-8')
if 'function privacyLabel(e)' not in s:
    marker = '/**\n * Completion provider for Python / R files.'
    helper = '''
function privacyLabel(e) {
    const owner = e.ownerId || e.owner_id || '';
    const scope = e.scope || '';
    const status = e.publishStatus || e.publish_status || '';
    return owner === 'system' || scope === 'team' || status === 'published' || (!owner && scope !== 'private') ? '公有' : '私有';
}

'''
    s = s.replace(marker, helper + marker)
s = s.replace("const item = new vscode.CompletionItem(e.callPrefix, e.type === 'snippet'", "const privacy = privacyLabel(e);\n        const item = new vscode.CompletionItem(`[${privacy}] ${e.callPrefix}`, e.type === 'snippet'")
s = s.replace("item.detail = `${e.zhName}  |  ${e.namespace}`;", "item.filterText = e.callPrefix;\n        item.detail = `[${privacy}] ${e.zhName}  |  ${e.namespace}`;")
s = s.replace("item.sortText = e.callPrefix;", "item.sortText = `${privacy === '私有' ? '0' : '1'}_${e.callPrefix}`;")
p.write_text(s, encoding='utf-8')

p = root / 'release/lib/vscode/extensions/simple-browser/out/InsertAlgorithmCommand.js'
s = p.read_text(encoding='utf-8')
if 'function privacyLabel(e)' not in s:
    marker = '/**\n * Ctrl+Alt+I command: opens a live-search QuickPick backed by the AlgoLib FastAPI service.'
    helper = '''
function privacyLabel(e) {
    const owner = e.ownerId || e.owner_id || '';
    const scope = e.scope || '';
    const status = e.publishStatus || e.publish_status || '';
    return owner === 'system' || scope === 'team' || status === 'published' || (!owner && scope !== 'private') ? '公有' : '私有';
}

'''
    s = s.replace(marker, helper + marker)
old = '''    _toItems(entries) {
        return entries.map((e) => ({
            label: `$(symbol-function) ${e.zhName}`,
            description: e.callPrefix,
            detail: (e.zhDescription || e.enDescription).slice(0, 80),
            entry: e,
        }));
    }'''
new = '''    _toItems(entries) {
        return entries.map((e) => {
            const privacy = privacyLabel(e);
            return {
                label: `$(symbol-function) [${privacy}] ${e.zhName}`,
                description: e.callPrefix,
                detail: `[${privacy}] ${(e.zhDescription || e.enDescription).slice(0, 80)}`,
                entry: e,
            };
        });
    }'''
if old in s:
    s = s.replace(old, new)
p.write_text(s, encoding='utf-8')
