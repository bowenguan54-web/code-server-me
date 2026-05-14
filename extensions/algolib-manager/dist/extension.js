"use strict";var Be=Object.create;var F=Object.defineProperty;var Le=Object.getOwnPropertyDescriptor;var Ne=Object.getOwnPropertyNames;var Oe=Object.getPrototypeOf,Ue=Object.prototype.hasOwnProperty;var ze=(o,e)=>{for(var t in e)F(o,t,{get:e[t],enumerable:!0})},ne=(o,e,t,s)=>{if(e&&typeof e=="object"||typeof e=="function")for(let n of Ne(e))!Ue.call(o,n)&&n!==t&&F(o,n,{get:()=>e[n],enumerable:!(s=Le(e,n))||s.enumerable});return o};var l=(o,e,t)=>(t=o!=null?Be(Oe(o)):{},ne(e||!o||!o.__esModule?F(t,"default",{value:o,enumerable:!0}):t,o)),De=o=>ne(F({},"__esModule",{value:!0}),o);var Qe={};ze(Qe,{activate:()=>Ke,deactivate:()=>Ye});module.exports=De(Qe);var m=l(require("vscode"));var j=l(require("vscode")),ie=l(require("path"));function b(){return j.workspace.getConfiguration("algolib").get("baseUrl","http://127.0.0.1:8000")}function re(){return j.workspace.getConfiguration("algolib").get("autoLogin",!0)}function Z(){let o=j.workspace.workspaceFolders;if(!(!o||o.length===0))return ie.join(o[0].uri.fsPath,".run","algolib-current-session.json")}var ae=l(require("vscode")),y=l(require("fs")),ce=l(require("path"));var de,le,ee=new ae.EventEmitter;function A(){return de}function W(){return le}function pe(o,e){de=o,le=e,ee.fire({token:o,user:e})}async function me(){let o=Z();if(!o)return!1;let e;try{let t=y.readFileSync(o,"utf8");e=JSON.parse(t)}catch{return!1}if(!e.token)return!1;try{let t=await fetch(`${b()}/api/v1/auth/me`,{headers:{Authorization:`Bearer ${e.token}`}});if(!t.ok)return!1;let s=await t.json();return pe(e.token,s),!0}catch{return!1}}async function ue(o,e){try{let t=new URLSearchParams({username:o,password:e}),s=await fetch(`${b()}/api/v1/auth/login`,{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:t.toString()});if(!s.ok)return{success:!1,message:(await s.json().catch(()=>({detail:"\u767B\u5F55\u5931\u8D25"}))).detail??"\u767B\u5F55\u5931\u8D25"};let i=(await s.json()).access_token,r=await fetch(`${b()}/api/v1/auth/me`,{headers:{Authorization:`Bearer ${i}`}}),a=r.ok?await r.json():void 0;pe(i,a);let c=Z();if(c)try{let w=ce.dirname(c);y.existsSync(w)||y.mkdirSync(w,{recursive:!0}),y.writeFileSync(c,JSON.stringify({token:i,user:a},null,2),"utf8")}catch{}return{success:!0}}catch(t){return{success:!1,message:String(t)}}}var te=class extends Error{constructor(t,s){super(s);this.status=t;this.name="ApiError"}};async function h(o,e){let t=A(),s={"Content-Type":"application/json",...e?.headers};t&&(s.Authorization=`Bearer ${t}`);let n=await fetch(`${b()}${o}`,{...e,headers:s});if(!n.ok){let r=`HTTP ${n.status}`;try{let a=await n.json();a.detail&&(r=a.detail)}catch{}throw new te(n.status,r)}if((n.headers.get("content-type")??"").includes("application/json"))return n.json()}async function x(o){let e=new URLSearchParams;o?.namespace&&e.set("namespace",o.namespace),o?.type&&e.set("type",o.type),o?.publishStatus&&e.set("publish_status",o.publishStatus),o?.search&&e.set("search",o.search),o?.ownerId&&e.set("owner_id",o.ownerId);let t=e.toString();return h(`/api/v1/algorithms${t?"?"+t:""}`)}async function L(o){return h(`/api/v1/algorithms/${encodeURIComponent(o)}`)}async function he(o){return h("/api/v1/algorithms",{method:"POST",body:JSON.stringify(o)})}async function ge(o,e){return h(`/api/v1/algorithms/${encodeURIComponent(o)}/metadata`,{method:"PATCH",body:JSON.stringify(e)})}async function ve(o){return h(`/api/v1/algorithms/${encodeURIComponent(o)}`,{method:"DELETE"})}async function N(o){return h(`/api/v1/algorithms/${encodeURIComponent(o)}/files`)}async function q(o,e,t){return h(`/api/v1/algorithms/${encodeURIComponent(o)}/files/${encodeURIComponent(e)}`,{method:"PUT",body:JSON.stringify({content:t})})}async function fe(){return h("/api/v1/algorithms/categories")}async function we(o){return h("/api/v1/algorithms/categories",{method:"POST",body:JSON.stringify(o)})}async function be(o){return h(`/api/v1/algorithms/${encodeURIComponent(o)}/submit-review`,{method:"POST"})}async function ye(){return x({publishStatus:"reviewing"})}async function O(o){return h(`/api/v1/publish/${encodeURIComponent(o)}/approve`,{method:"POST"})}async function xe(o,e){return h(`/api/v1/publish/${encodeURIComponent(o)}/reject`,{method:"POST",body:JSON.stringify({reason:e})})}async function $(o,e={},t=60){return h("/api/v1/execute-raw",{method:"POST",body:JSON.stringify({code:o,params:e,timeout:t})})}async function oe(o,e){return h(`/api/v1/algorithms/${encodeURIComponent(o)}/invoke`,{method:"POST",body:JSON.stringify({params:e})})}async function Ce(){try{return await h("/health"),!0}catch{return!1}}var p=l(require("vscode"));var M=class extends p.TreeItem{constructor(t,s,n,i){super(i??(t==="algorithm"?s?.zhName||s?.funcName||"":n?.zhName||n?.zh_name||n?.namespace||""),t==="category"?p.TreeItemCollapsibleState.Collapsed:p.TreeItemCollapsibleState.None);this.kind=t;this.algorithm=s;this.category=n;t==="algorithm"&&s?(this.contextValue="algorithm",this.description=s.namespace,this.tooltip=He(s),this.iconPath=Fe(s),this.command={command:"algolib.openAlgorithm",title:"\u6253\u5F00\u7B97\u6CD5",arguments:[s]}):t==="category"&&(this.contextValue="category",this.iconPath=new p.ThemeIcon("folder"))}};function He(o){let e=new p.MarkdownString;if(e.isTrusted=!0,e.appendMarkdown(`**${o.zhName||o.funcName}**

`),o.zhDescription&&e.appendMarkdown(`${o.zhDescription}

`),o.version&&e.appendMarkdown(`\u7248\u672C: \`${o.version}\`  `),e.appendMarkdown(`\u72B6\u6001: \`${o.publishStatus}\`

`),o.params&&o.params.length>0){e.appendMarkdown(`**\u53C2\u6570:**
`);for(let t of o.params)e.appendMarkdown(`- \`${t.name}\`${t.type?` (${t.type})`:""}${t.description?`: ${t.description}`:""}
`)}return e}function Fe(o){switch(o.publishStatus){case"published":return new p.ThemeIcon("check",new p.ThemeColor("charts.green"));case"reviewing":return new p.ThemeIcon("eye",new p.ThemeColor("charts.blue"));case"rejected":return new p.ThemeIcon("error",new p.ThemeColor("charts.red"));case"draft":return new p.ThemeIcon("circle-outline",new p.ThemeColor("charts.yellow"));case"unpublished":return new p.ThemeIcon("circle-slash");default:return new p.ThemeIcon("symbol-function")}}var U=class{constructor(e){this.mode=e;this._onDidChangeTreeData=new p.EventEmitter;this.onDidChangeTreeData=this._onDidChangeTreeData.event;this.algorithms=[];this.categories=[]}setOwnerId(e){this.filterOwnerId=e}async refresh(){try{let e=this.filterOwnerId?{ownerId:this.filterOwnerId}:{};[this.algorithms,this.categories]=await Promise.all([x(e),fe()])}catch{this.algorithms=[],this.categories=[]}this._onDidChangeTreeData.fire()}getTreeItem(e){return e}getChildren(e){if(!e){let s=this.categories.filter(r=>!r.parent_namespace).map(r=>new M("category",void 0,r)),n=new Set(this.categories.map(r=>r.namespace)),i=this.algorithms.filter(r=>!n.has(r.namespace));return s.push(...i.map(r=>new M("algorithm",r))),s}if(e.kind==="category"&&e.category){let t=e.category.namespace,n=this.categories.filter(r=>r.parent_namespace===t).map(r=>new M("category",void 0,r)),i=this.algorithms.filter(r=>r.namespace===t);return n.push(...i.map(r=>new M("algorithm",r))),n}return[]}};var k=l(require("vscode"));var _=class{constructor(){this.cache=[];this.lastFetch=0;this.cacheTtl=3e4}async ensureCache(){let e=Date.now();if(e-this.lastFetch>this.cacheTtl)try{this.cache=await x(),this.lastFetch=e}catch{}}async provideCompletionItems(e,t,s,n){if(e.lineAt(t).text.slice(0,t.character).match(/\balg\w*\.?\w*$/i)&&(await this.ensureCache(),this.cache.length!==0))return this.cache.map(r=>{let a=new k.CompletionItem(r.zhName||r.funcName,k.CompletionItemKind.Function);a.detail=`[AlgoLib] ${r.namespace}`,a.documentation=je(r);let c=We(r);return a.insertText=new k.SnippetString(c),a.filterText=`${r.funcName} ${r.zhName||""}`,a.sortText=`0_${r.funcName}`,a})}};function je(o){let e=new k.MarkdownString;if(o.zhDescription&&e.appendMarkdown(`${o.zhDescription}

`),o.params&&o.params.length>0){e.appendMarkdown(`**\u53C2\u6570:**
`);for(let t of o.params)e.appendMarkdown(`- \`${t.name}\`${t.type?` *(${t.type})*`:""}${t.description?` \u2014 ${t.description}`:""}
`)}return e}function We(o){if(!o.params||o.params.length===0)return`${o.funcName}()`;let e=o.params.map((t,s)=>`${t.name}=\${${s+1}:${t.default!==void 0?String(t.default):t.name}}`);return`${o.funcName}(${e.join(", ")})`}var T=l(require("vscode")),J=class{provideCodeLenses(e,t){let s=[],n=e.getText(),i=/@algo_meta/g,r;for(;(r=i.exec(n))!==null;){let a=e.positionAt(r.index),c=new T.Range(a,a);s.push(new T.CodeLens(c,{title:"\u25B6 \u8FD0\u884C",command:"algolib.runFile",tooltip:"\u8FD0\u884C\u5F53\u524D\u7B97\u6CD5\u6587\u4EF6"})),s.push(new T.CodeLens(c,{title:"\u{1F4DD} \u7F16\u8F91\u5143\u6570\u636E",command:"algolib.editAlgorithm",tooltip:"\u6253\u5F00\u7B97\u6CD5\u5143\u6570\u636E\u7F16\u8F91\u5668"})),s.push(new T.CodeLens(c,{title:"\u{1F9EA} \u5E26\u53C2\u6570\u6D4B\u8BD5",command:"algolib.runWithParams",tooltip:"\u8F93\u5165\u53C2\u6570\u5E76\u8FD0\u884C"})),s.push(new T.CodeLens(c,{title:"\u{1F4E4} \u63D0\u4EA4\u5BA1\u6838",command:"algolib.submitReview",tooltip:"\u5C06\u7B97\u6CD5\u63D0\u4EA4\u81F3\u5BA1\u6838\u961F\u5217"}))}return s}};var K=l(require("vscode"));var V=class{constructor(){this.cache=[];this.lastFetch=0;this.cacheTtl=6e4}async ensureCache(){let e=Date.now();if(e-this.lastFetch>this.cacheTtl)try{this.cache=await x(),this.lastFetch=e}catch{}}async provideHover(e,t,s){if(await this.ensureCache(),this.cache.length===0)return;let n=e.getWordRangeAtPosition(t,/[\w.]+/);if(!n)return;let i=e.getText(n),r=this.cache.find(c=>c.funcName===i||c.zhName===i);if(!r)return;let a=new K.MarkdownString;if(a.isTrusted=!0,a.appendMarkdown(`**$(symbol-function) ${r.zhName||r.funcName}** *(AlgoLib)*

`),r.zhDescription&&a.appendMarkdown(`${r.zhDescription}

`),r.params&&r.params.length>0){a.appendMarkdown(`| \u53C2\u6570 | \u7C7B\u578B | \u63CF\u8FF0 |
|---|---|---|
`);for(let c of r.params)a.appendMarkdown(`| \`${c.name}\` | ${c.type??"-"} | ${c.description??"-"} |
`)}return r.version&&a.appendMarkdown(`
\u7248\u672C: \`${r.version}\``),new K.Hover(a,n)}};var v=l(require("vscode")),Y=l(require("path")),Ae=l(require("os")),R=l(require("fs"));var ke=new Map;async function z(o,e){let t=o.id?o:await L(o.id).catch(()=>o),s=[];try{s=await N(t.id)}catch{v.window.showErrorMessage(`\u83B7\u53D6\u7B97\u6CD5\u6587\u4EF6\u5931\u8D25: ${t.id}`);return}if(s.length===0){v.window.showWarningMessage("\u8BE5\u7B97\u6CD5\u6682\u65E0\u6587\u4EF6");return}let n=Y.join(Ae.tmpdir(),"algolib-edit",t.id.replace(/[/\\:]/g,"_"));R.existsSync(n)||R.mkdirSync(n,{recursive:!0});for(let a of s){let c=Y.join(n,a.filename);R.writeFileSync(c,a.content,"utf8");let w=c;ke.set(w,{algorithmId:t.id,filename:a.filename,tmpPath:c,savedVersion:a.content})}let i=s.find(a=>a.filename.endsWith(".py"))??s[0],r=v.Uri.file(Y.join(n,i.filename));await v.window.showTextDocument(r,{preview:!1})}function Se(o){o.subscriptions.push(v.workspace.onWillSaveTextDocument(async e=>{let t=e.document,s=t.uri.fsPath,n=ke.get(s);if(!n)return;let i=t.getText();i!==n.savedVersion&&e.waitUntil((async()=>{try{await q(n.algorithmId,n.filename,i),n.savedVersion=i,v.window.setStatusBarMessage(`$(check) AlgoLib: ${n.filename} \u5DF2\u4FDD\u5B58`,3e3)}catch(r){v.window.showErrorMessage(`\u4FDD\u5B58\u5931\u8D25: ${String(r)}`)}return[]})())}))}var d=l(require("vscode"));var E=l(require("vscode"));var S=l(require("vscode")),I=class o{static getInstance(){return o.instance||(o.instance=new o),o.instance}show(e,t){this.panel||(this.panel=S.window.createWebviewPanel("algolib.output","AlgoLib \u8F93\u51FA",S.ViewColumn.Beside,{enableScripts:!0,retainContextWhenHidden:!0,localResourceRoots:[S.Uri.joinPath(e.extensionUri,"media")]}),this.panel.onDidDispose(()=>{this.panel=void 0})),this.panel.webview.html=this.getHtml(e,t),this.panel.reveal(S.ViewColumn.Beside,!0)}showStream(e){this.show(e)}appendOutput(e,t){this.panel?.webview.postMessage({command:"append",kind:e,text:t})}showResult(e){this.panel?.webview.postMessage({command:"result",data:e})}clear(){this.panel?.webview.postMessage({command:"clear"})}getHtml(e,t){let s=this.panel.webview.cspSource,n=this.panel.webview.asWebviewUri(S.Uri.joinPath(e.extensionUri,"media","shared.css"));return`<!DOCTYPE html>
<html lang="zh">
<head>
<meta charset="UTF-8"/>
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${s} 'unsafe-inline' https://cdn.jsdelivr.net; script-src ${s} 'unsafe-inline' https://cdn.jsdelivr.net; img-src ${s} data:; font-src ${s};" />
<link rel="stylesheet" href="${n}"/>
<title>AlgoLib \u8F93\u51FA</title>
<style>
body { padding: 10px; }
#output-area { font-family: monospace; font-size: 13px; white-space: pre-wrap; }
.out-stdout { color: var(--fg); }
.out-stderr { color: #f14c4c; }
.out-result { margin-top: 12px; padding: 10px; background: var(--card-bg); border: 1px solid var(--border); border-radius: 4px; }
.out-result.success { border-color: #4ec9b0; }
.out-result.failure { border-color: #f14c4c; }
.result-label { font-size: 11px; color: var(--text-dim); margin-bottom: 6px; }
.elapsed { font-size: 11px; color: var(--text-dim); margin-top: 6px; }
#chart-container { width: 100%; min-height: 300px; }
</style>
</head>
<body>
<div class="toolbar">
  <button onclick="clearOutput()" class="btn-secondary">\u6E05\u7A7A</button>
  <span id="status" style="font-size:11px;color:var(--text-dim);margin-left:8px;"></span>
</div>
<hr class="divider"/>
<div id="output-area"></div>
<div id="result-area"></div>
<div id="chart-container" style="display:none;"></div>
<script src="https://cdn.jsdelivr.net/npm/echarts@5.4.3/dist/echarts.min.js"></script>
<script>
const vscode = acquireVsCodeApi();
const outputArea = document.getElementById('output-area');
const resultArea = document.getElementById('result-area');
const statusEl = document.getElementById('status');
const chartContainer = document.getElementById('chart-container');

function clearOutput() {
  outputArea.textContent = '';
  resultArea.innerHTML = '';
  chartContainer.style.display = 'none';
  statusEl.textContent = '';
}

function appendText(kind, text) {
  const span = document.createElement('span');
  span.className = kind === 'stdout' ? 'out-stdout' : 'out-stderr';
  span.textContent = text;
  outputArea.appendChild(span);
  outputArea.scrollTop = outputArea.scrollHeight;
}

function renderResult(data) {
  const div = document.createElement('div');
  div.className = 'out-result ' + (data.success ? 'success' : 'failure');
  
  const label = document.createElement('div');
  label.className = 'result-label';
  label.textContent = data.success ? '\u2714 \u6267\u884C\u6210\u529F' : '\u2717 \u6267\u884C\u5931\u8D25';
  div.appendChild(label);

  if (data.result !== undefined && data.result !== null) {
    const outputType = (typeof data.result === 'object' && data.result !== null) 
      ? data.result.__output_type__ 
      : null;

    if (outputType === 'chart' && data.result.option) {
      chartContainer.style.display = 'block';
      chartContainer.innerHTML = '';
      const chartEl = document.createElement('div');
      chartEl.style.cssText = 'width:100%;height:350px;';
      chartContainer.appendChild(chartEl);
      try {
        const chart = echarts.init(chartEl);
        chart.setOption(data.result.option);
      } catch (e) {
        chartEl.textContent = '\u56FE\u8868\u6E32\u67D3\u5931\u8D25: ' + String(e);
      }
    } else if (outputType === 'table' && Array.isArray(data.result.rows)) {
      renderTable(div, data.result.columns || [], data.result.rows);
    } else if (outputType === 'image' && data.result.src) {
      const img = document.createElement('img');
      img.src = data.result.src;
      img.style.maxWidth = '100%';
      div.appendChild(img);
    } else if (outputType === 'html' && data.result.html) {
      const pre = document.createElement('div');
      pre.innerHTML = data.result.html;
      div.appendChild(pre);
    } else {
      const pre = document.createElement('pre');
      pre.textContent = typeof data.result === 'string' ? data.result : JSON.stringify(data.result, null, 2);
      div.appendChild(pre);
    }
  }

  if (typeof data.elapsed_ms === 'number') {
    const el = document.createElement('div');
    el.className = 'elapsed';
    el.textContent = '\u8017\u65F6: ' + data.elapsed_ms.toFixed(1) + ' ms';
    div.appendChild(el);
  }

  resultArea.innerHTML = '';
  resultArea.appendChild(div);
  statusEl.textContent = data.success ? '\u5B8C\u6210' : '\u5931\u8D25';
}

function renderTable(container, columns, rows) {
  const table = document.createElement('table');
  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');
  for (const col of columns) {
    const th = document.createElement('th');
    th.textContent = String(col);
    headerRow.appendChild(th);
  }
  thead.appendChild(headerRow);
  table.appendChild(thead);
  const tbody = document.createElement('tbody');
  for (const row of rows) {
    const tr = document.createElement('tr');
    const cells = Array.isArray(row) ? row : (columns.length > 0 ? columns.map(c => row[c]) : Object.values(row));
    for (const cell of cells) {
      const td = document.createElement('td');
      td.textContent = cell === null || cell === undefined ? '' : String(cell);
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  container.appendChild(table);
}

window.addEventListener('message', ev => {
  const msg = ev.data;
  if (msg.command === 'append') appendText(msg.kind, msg.text);
  else if (msg.command === 'result') renderResult(msg.data);
  else if (msg.command === 'clear') clearOutput();
  else if (msg.command === 'start') {
    clearOutput();
    statusEl.textContent = '\u8FD0\u884C\u4E2D\u2026';
  }
});

${t?`renderResult(${JSON.stringify(t)});`:""}
</script>
</body>
</html>`}};var qe=/^# --- BLOCK: (.+?) ---\s*$/m,_e=/^# --- BLOCK: .+? ---\s*\n?/gm,Q=class o{static{this.panels=new Map}constructor(e,t,s){this.panel=e,this.algorithm=t,this.context=s,e.onDidDispose(()=>o.panels.delete(t.id)),e.webview.onDidReceiveMessage(n=>this.handleMessage(n))}static async open(e,t){let s=o.panels.get(e.id);if(s){s.panel.reveal();return}let n=E.window.createWebviewPanel("algolib.blockEditor",`[\u5757] ${e.zhName||e.funcName}`,E.ViewColumn.One,{enableScripts:!0,retainContextWhenHidden:!0,localResourceRoots:[E.Uri.joinPath(t.extensionUri,"media")]}),i=new o(n,e,t);o.panels.set(e.id,i),await i.loadFiles()}async loadFiles(){let e=[];try{e=await N(this.algorithm.id)}catch{E.window.showErrorMessage("\u52A0\u8F7D\u7B97\u6CD5\u6587\u4EF6\u5931\u8D25");return}let t=e.find(n=>n.filename.endsWith(".py"))??e[0];if(!t)return;let s=Je(t.content);this.panel.webview.html=this.getHtml(s)}async handleMessage(e){switch(e.command){case"save":{let t=e.blocks,s=Ee(t);try{let n=await N(this.algorithm.id),i=n.find(r=>r.filename.endsWith(".py"))??n[0];i&&(await q(this.algorithm.id,i.filename,s),this.panel.webview.postMessage({command:"saveOk"}))}catch(n){this.panel.webview.postMessage({command:"saveError",message:String(n)})}break}case"runBlock":{let t=String(e.code??""),s=I.getInstance();s.showStream(this.context),s.clear();try{let n=await $(t);s.showResult(n)}catch(n){s.showResult({success:!1,stderr:String(n)})}break}case"runAll":{let t=e.blocks,s=Ee(t),n=I.getInstance();n.showStream(this.context),n.clear();try{let i=await $(s);n.showResult(i)}catch(i){n.showResult({success:!1,stderr:String(i)})}break}}}getHtml(e){let t=this.panel.webview.cspSource,s=this.panel.webview.asWebviewUri(E.Uri.joinPath(this.context.extensionUri,"media","shared.css")),n=JSON.stringify(e);return`<!DOCTYPE html>
<html lang="zh">
<head>
<meta charset="UTF-8"/>
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${t} 'unsafe-inline' https://cdn.jsdelivr.net; script-src ${t} 'unsafe-inline' https://cdn.jsdelivr.net; img-src ${t} data:;" />
<link rel="stylesheet" href="${s}"/>
<title>\u5206\u5757\u7F16\u8F91\u5668</title>
<style>
body { padding: 0; display: flex; flex-direction: column; height: 100vh; overflow: hidden; }
.top-bar { display: flex; align-items: center; gap: 6px; padding: 6px 10px; border-bottom: 1px solid var(--border); flex-shrink: 0; }
.blocks-container { flex: 1; overflow-y: auto; padding: 10px; display: flex; flex-direction: column; gap: 10px; }
.block-card { border: 1px solid var(--border); border-radius: 4px; background: var(--card-bg); }
.block-header { display: flex; align-items: center; gap: 6px; padding: 4px 8px; border-bottom: 1px solid var(--border); background: var(--sidebar-bg); }
.block-title-input { flex: 1; background: transparent; border: none; font-size: 12px; font-weight: 600; color: var(--fg); padding: 2px 4px; }
.block-title-input:focus { outline: 1px solid var(--accent); border-radius: 2px; }
.block-editor { width: 100%; min-height: 120px; resize: vertical; padding: 8px; font-family: monospace; font-size: 13px; background: var(--bg); color: var(--fg); border: none; outline: none; }
.drag-handle { cursor: grab; color: var(--text-dim); font-size: 14px; padding: 0 4px; }
</style>
</head>
<body>
<div class="top-bar">
  <strong style="font-size:13px;">\u5206\u5757\u7F16\u8F91\u5668</strong>
  <div class="toolbar-spacer"></div>
  <button onclick="addBlock()">+ \u6DFB\u52A0\u5757</button>
  <button onclick="runAll()">\u25B6 \u5168\u90E8\u8FD0\u884C</button>
  <button onclick="saveAll()">\u{1F4BE} \u4FDD\u5B58</button>
  <span id="status" style="font-size:11px;color:var(--text-dim);margin-left:8px;"></span>
</div>
<div class="blocks-container" id="blocksContainer"></div>
<script>
const vscode = acquireVsCodeApi();
let blocks = ${n};
let dragSrcIdx = null;

function render() {
  const container = document.getElementById('blocksContainer');
  container.innerHTML = '';
  blocks.forEach((block, i) => {
    const card = document.createElement('div');
    card.className = 'block-card';
    card.draggable = true;
    card.dataset.idx = i;
    card.innerHTML = \`
      <div class="block-header">
        <span class="drag-handle" title="\u62D6\u52A8\u6392\u5E8F">\u283F</span>
        <input class="block-title-input" value="\${escHtml(block.title)}" placeholder="\u5757\u540D\u79F0" onchange="updateTitle(\${i}, this.value)"/>
        <button class="btn-icon" onclick="runBlock(\${i})" title="\u8FD0\u884C\u6B64\u5757">\u25B6</button>
        <button class="btn-icon" onclick="deleteBlock(\${i})" title="\u5220\u9664\u6B64\u5757">\u2715</button>
      </div>
      <textarea class="block-editor" onchange="updateCode(\${i}, this.value)">\${escHtml(block.code)}</textarea>
    \`;
    card.addEventListener('dragstart', () => { dragSrcIdx = i; });
    card.addEventListener('dragover', e => { e.preventDefault(); });
    card.addEventListener('drop', () => { if (dragSrcIdx !== null && dragSrcIdx !== i) swapBlocks(dragSrcIdx, i); });
    container.appendChild(card);
  });
}

function escHtml(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function updateTitle(i, v) { blocks[i].title = v; }
function updateCode(i, v) { blocks[i].code = v; }
function addBlock() { blocks.push({ title: '\u65B0\u5757 ' + (blocks.length + 1), code: '' }); render(); }
function deleteBlock(i) { blocks.splice(i, 1); render(); }
function swapBlocks(a, b) { [blocks[a], blocks[b]] = [blocks[b], blocks[a]]; render(); }
function runBlock(i) { syncTextareas(); vscode.postMessage({ command: 'runBlock', code: blocks[i].code }); }
function runAll() { syncTextareas(); vscode.postMessage({ command: 'runAll', blocks }); }
function saveAll() { syncTextareas(); vscode.postMessage({ command: 'save', blocks }); }
function syncTextareas() {
  document.querySelectorAll('.block-editor').forEach((ta, i) => { blocks[i].code = ta.value; });
  document.querySelectorAll('.block-title-input').forEach((inp, i) => { blocks[i].title = inp.value; });
}

window.addEventListener('message', ev => {
  const msg = ev.data;
  if (msg.command === 'saveOk') document.getElementById('status').textContent = '\u5DF2\u4FDD\u5B58 \u2713';
  else if (msg.command === 'saveError') document.getElementById('status').textContent = '\u4FDD\u5B58\u5931\u8D25: ' + msg.message;
});

render();
</script>
</body>
</html>`}};function Je(o){let e=o.split(_e),t=[],s,n=new RegExp(qe.source,"gm");for(;(s=n.exec(o))!==null;)t.push(s[1]);if(t.length===0)return[{title:"\u4E3B\u4F53",code:o.trim()}];let i=[],r=e.filter((c,w)=>w>0||e[0].trim()),a=e[0].trim()?1:0;for(let c=0;c<t.length;c++)i.push({title:t[c],code:(r[a+c]??"").trimEnd()});return i}function Ee(o){return o.map(e=>`# --- BLOCK: ${e.title} ---
${e.code}`).join(`

`)}var P=l(require("vscode"));var G=class o{constructor(e){this.context=e}static async open(e){o.instance||(o.instance=new o(e)),await o.instance.show()}async show(){this.panel||(this.panel=P.window.createWebviewPanel("algolib.browse","AlgoLib \u7B97\u6CD5\u6D4F\u89C8\u5668",P.ViewColumn.One,{enableScripts:!0,retainContextWhenHidden:!0,localResourceRoots:[P.Uri.joinPath(this.context.extensionUri,"media")]}),this.panel.onDidDispose(()=>{this.panel=void 0,o.instance=void 0}),this.panel.webview.onDidReceiveMessage(t=>this.handleMessage(t)));let e=[];try{e=await x()}catch{P.window.showErrorMessage("\u52A0\u8F7D\u7B97\u6CD5\u5217\u8868\u5931\u8D25")}this.panel.webview.html=this.getHtml(e),this.panel.reveal()}async handleMessage(e){if(e.command==="open"&&e.id){let t={id:String(e.id),namespace:"",funcName:"",publishStatus:"draft"};await z(t,this.context)}else e.command==="refresh"&&await this.show()}getHtml(e){let t=this.panel.webview.cspSource,s=this.panel.webview.asWebviewUri(P.Uri.joinPath(this.context.extensionUri,"media","shared.css")),n=JSON.stringify(e);return`<!DOCTYPE html>
<html lang="zh">
<head>
<meta charset="UTF-8"/>
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${t} 'unsafe-inline'; script-src ${t} 'unsafe-inline'; img-src ${t} data:;" />
<link rel="stylesheet" href="${s}"/>
<title>\u7B97\u6CD5\u6D4F\u89C8\u5668</title>
<style>
body { padding: 10px; }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 10px; margin-top: 10px; }
.algo-card { cursor: pointer; }
.algo-card:hover { border-color: var(--accent); }
.algo-name { font-weight: 600; font-size: 13px; margin-bottom: 4px; }
.algo-ns { font-size: 11px; color: var(--text-dim); margin-bottom: 6px; }
.algo-desc { font-size: 12px; color: var(--text-dim); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.filter-bar { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
</style>
</head>
<body>
<div class="toolbar">
  <div class="filter-bar">
    <div class="search-wrap">
      <span>\u{1F50D}</span>
      <input type="text" id="search" placeholder="\u641C\u7D22\u7B97\u6CD5..." oninput="filterAlgos()"/>
    </div>
    <select id="statusFilter" onchange="filterAlgos()">
      <option value="">\u5168\u90E8\u72B6\u6001</option>
      <option value="published">\u5DF2\u53D1\u5E03</option>
      <option value="draft">\u8349\u7A3F</option>
      <option value="reviewing">\u5BA1\u6838\u4E2D</option>
    </select>
  </div>
  <div class="toolbar-spacer"></div>
  <button onclick="refresh()">\u5237\u65B0</button>
  <span id="count" style="font-size:11px;color:var(--text-dim);"></span>
</div>

<div class="grid" id="grid"></div>

<script>
const vscode = acquireVsCodeApi();
const allAlgos = ${n};
let filtered = [...allAlgos];

const statusColors = {
  published: 'badge-green',
  draft: 'badge-yellow',
  reviewing: 'badge-blue',
  rejected: 'badge-red',
  unpublished: ''
};
const statusLabels = {
  published: '\u5DF2\u53D1\u5E03', draft: '\u8349\u7A3F', reviewing: '\u5BA1\u6838\u4E2D', rejected: '\u5DF2\u62D2\u7EDD', unpublished: '\u672A\u53D1\u5E03'
};

function filterAlgos() {
  const q = document.getElementById('search').value.toLowerCase();
  const status = document.getElementById('statusFilter').value;
  filtered = allAlgos.filter(a => {
    const matchQ = !q || (a.zhName||'').toLowerCase().includes(q) || (a.funcName||'').toLowerCase().includes(q) || (a.namespace||'').toLowerCase().includes(q) || (a.zhDescription||'').toLowerCase().includes(q);
    const matchS = !status || a.publishStatus === status;
    return matchQ && matchS;
  });
  render();
}

function render() {
  const grid = document.getElementById('grid');
  document.getElementById('count').textContent = filtered.length + ' / ' + allAlgos.length + ' \u4E2A\u7B97\u6CD5';
  if (filtered.length === 0) {
    grid.innerHTML = '<div class="empty-state" style="grid-column:1/-1;">\u65E0\u5339\u914D\u7B97\u6CD5</div>';
    return;
  }
  grid.innerHTML = filtered.map(a => \`
    <div class="card algo-card" onclick="openAlgo('\${escAttr(a.id)}')">
      <div class="algo-name">
        \${escHtml(a.zhName || a.funcName)}
        <span class="badge \${statusColors[a.publishStatus]||''}" style="margin-left:6px;">\${statusLabels[a.publishStatus]||a.publishStatus}</span>
      </div>
      <div class="algo-ns">\${escHtml(a.namespace)}</div>
      <div class="algo-desc">\${escHtml(a.zhDescription || '')}</div>
    </div>
  \`).join('');
}

function escHtml(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function escAttr(s) { return String(s||'').replace(/"/g,'&quot;'); }
function openAlgo(id) { vscode.postMessage({ command: 'open', id }); }
function refresh() { vscode.postMessage({ command: 'refresh' }); }

render();
</script>
</body>
</html>`}};function Pe(o,e){o.subscriptions.push(d.commands.registerCommand("algolib.openAlgorithm",async t=>{if(!t){let s=await d.window.showInputBox({prompt:"\u8F93\u5165\u7B97\u6CD5 ID"});if(!s)return;try{t=await L(s)}catch(n){d.window.showErrorMessage(`\u627E\u4E0D\u5230\u7B97\u6CD5: ${String(n)}`);return}}await z(t,o)})),o.subscriptions.push(d.commands.registerCommand("algolib.editBlocks",async t=>{if(!t){let s=await d.window.showInputBox({prompt:"\u8F93\u5165\u7B97\u6CD5 ID"});if(!s)return;try{t=await L(s)}catch(n){d.window.showErrorMessage(`\u627E\u4E0D\u5230\u7B97\u6CD5: ${String(n)}`);return}}await Q.open(t,o)})),o.subscriptions.push(d.commands.registerCommand("algolib.browse",async()=>{await G.open(o)})),o.subscriptions.push(d.commands.registerCommand("algolib.createAlgorithm",async()=>{let t=await d.window.showInputBox({prompt:"\u547D\u540D\u7A7A\u95F4 (\u5982 my/algo)",placeHolder:"my/algo"});if(!t)return;let s=await d.window.showInputBox({prompt:"\u51FD\u6570\u540D (snake_case)",placeHolder:"my_algo"});if(!s)return;let n=await d.window.showInputBox({prompt:"\u4E2D\u6587\u540D\u79F0\uFF08\u53EF\u9009\uFF09"}),i=await d.window.showInputBox({prompt:"\u4E2D\u6587\u63CF\u8FF0\uFF08\u53EF\u9009\uFF09"}),r=["component","template","snippet"],a=await d.window.showQuickPick(r,{placeHolder:"\u6A21\u5757\u7C7B\u578B"});try{let c=await he({namespace:t,func_name:s,module_kind:a??"component",zh_name:n||void 0,zh_description:i||void 0});d.window.showInformationMessage(`\u7B97\u6CD5 "${c.funcName}" \u521B\u5EFA\u6210\u529F`),await e.refresh(),await z(c,o)}catch(c){d.window.showErrorMessage(`\u521B\u5EFA\u5931\u8D25: ${String(c)}`)}})),o.subscriptions.push(d.commands.registerCommand("algolib.deleteAlgorithm",async t=>{let s=t?.zhName||t?.funcName||t?.id||"?";if(await d.window.showWarningMessage(`\u786E\u5B9A\u5220\u9664\u7B97\u6CD5 "${s}"\uFF1F\u6B64\u64CD\u4F5C\u4E0D\u53EF\u64A4\u9500\u3002`,{modal:!0},"\u786E\u5B9A\u5220\u9664")==="\u786E\u5B9A\u5220\u9664"&&t?.id)try{await ve(t.id),d.window.showInformationMessage(`\u7B97\u6CD5 "${s}" \u5DF2\u5220\u9664`),await e.refresh()}catch(i){d.window.showErrorMessage(`\u5220\u9664\u5931\u8D25: ${String(i)}`)}})),o.subscriptions.push(d.commands.registerCommand("algolib.submitReview",async t=>{if(!t?.id){let s=await d.window.showInputBox({prompt:"\u7B97\u6CD5 ID"});if(!s)return;t={id:s}}try{await be(t.id),d.window.showInformationMessage("\u5DF2\u63D0\u4EA4\u5BA1\u6838"),await e.refresh()}catch(s){d.window.showErrorMessage(`\u63D0\u4EA4\u5931\u8D25: ${String(s)}`)}})),o.subscriptions.push(d.commands.registerCommand("algolib.editAlgorithm",async t=>{if(!t?.id)return;let s=await d.window.showInputBox({prompt:"\u4E2D\u6587\u540D\u79F0",value:t.zhName});if(s===void 0)return;let n=await d.window.showInputBox({prompt:"\u4E2D\u6587\u63CF\u8FF0",value:t.zhDescription});if(n!==void 0)try{await ge(t.id,{zh_name:s,zh_description:n}),d.window.showInformationMessage("\u5143\u6570\u636E\u5DF2\u66F4\u65B0"),await e.refresh()}catch(i){d.window.showErrorMessage(`\u66F4\u65B0\u5931\u8D25: ${String(i)}`)}})),o.subscriptions.push(d.commands.registerCommand("algolib.refresh",async()=>{await e.refresh()}))}var u=l(require("vscode"));function $e(o){let e=I.getInstance();o.subscriptions.push(u.commands.registerCommand("algolib.runFile",async t=>{if(!A()){u.window.showWarningMessage("\u8BF7\u5148\u767B\u5F55 AlgoLib");return}let s,n=u.window.activeTextEditor;if(n&&n.document.languageId==="python")s=n.document.getText();else if(t?.id){let i=await Ve(t);if(i===void 0)return;e.show(o),e.clear();try{let r=await oe(t.id,i);e.showResult({success:!0,result:r})}catch(r){e.showResult({success:!1,stderr:String(r)})}return}if(!s){u.window.showWarningMessage("\u65E0\u53EF\u8FD0\u884C\u7684 Python \u6587\u4EF6");return}e.show(o),e.clear();try{let i=await $(s);i.stdout&&e.appendOutput("stdout",i.stdout),i.stderr&&e.appendOutput("stderr",i.stderr),e.showResult(i)}catch(i){e.showResult({success:!1,stderr:String(i)})}})),o.subscriptions.push(u.commands.registerCommand("algolib.runBlock",async()=>{if(!A()){u.window.showWarningMessage("\u8BF7\u5148\u767B\u5F55 AlgoLib");return}let t=u.window.activeTextEditor;if(!t)return;let s=t.selection,n=s.isEmpty?t.document.getText():t.document.getText(s);e.show(o),e.clear();try{let i=await $(n);i.stdout&&e.appendOutput("stdout",i.stdout),i.stderr&&e.appendOutput("stderr",i.stderr),e.showResult(i)}catch(i){e.showResult({success:!1,stderr:String(i)})}})),o.subscriptions.push(u.commands.registerCommand("algolib.runWithParams",async t=>{if(!A()){u.window.showWarningMessage("\u8BF7\u5148\u767B\u5F55 AlgoLib");return}let s=await u.window.showInputBox({prompt:'\u8F93\u5165 JSON \u53C2\u6570\uFF08\u5982 {"x": 1, "y": 2}\uFF09',placeHolder:"{}",value:"{}"});if(s===void 0)return;let n={};try{n=JSON.parse(s)}catch{u.window.showErrorMessage("\u53C2\u6570\u683C\u5F0F\u9519\u8BEF\uFF0C\u8BF7\u8F93\u5165\u5408\u6CD5\u7684 JSON");return}if(e.show(o),e.clear(),t?.id)try{let i=await oe(t.id,n);e.showResult({success:!0,result:i})}catch(i){e.showResult({success:!1,stderr:String(i)})}else{let i=u.window.activeTextEditor;if(!i)return;let r=i.document.getText();try{let a=await $(r,n);a.stdout&&e.appendOutput("stdout",a.stdout),a.stderr&&e.appendOutput("stderr",a.stderr),e.showResult(a)}catch(a){e.showResult({success:!1,stderr:String(a)})}}})),o.subscriptions.push(u.commands.registerCommand("algolib.openOutput",()=>{e.show(o)}))}async function Ve(o){let e=await u.window.showInputBox({prompt:`\u8F93\u5165 "${o.zhName||o.funcName}" \u7684 JSON \u53C2\u6570`,placeHolder:"{}",value:"{}"});if(e!==void 0)try{return JSON.parse(e)}catch{u.window.showErrorMessage("\u53C2\u6570\u683C\u5F0F\u9519\u8BEF\uFF0C\u8BF7\u8F93\u5165\u5408\u6CD5\u7684 JSON");return}}var C=l(require("vscode"));var g=l(require("vscode"));var X=class o{constructor(e){this.context=e}static async open(e){let t=W();if(!t||t.role!=="admin"){g.window.showWarningMessage("\u4EC5\u7BA1\u7406\u5458\u53EF\u8BBF\u95EE\u5BA1\u6838\u9762\u677F");return}o.instance||(o.instance=new o(e)),await o.instance.show()}async show(){this.panel||(this.panel=g.window.createWebviewPanel("algolib.review","AlgoLib \u5BA1\u6838\u961F\u5217",g.ViewColumn.One,{enableScripts:!0,retainContextWhenHidden:!0,localResourceRoots:[g.Uri.joinPath(this.context.extensionUri,"media")]}),this.panel.onDidDispose(()=>{this.panel=void 0,o.instance=void 0}),this.panel.webview.onDidReceiveMessage(t=>this.handleMessage(t)));let e=[];try{e=await ye()}catch{g.window.showErrorMessage("\u52A0\u8F7D\u5BA1\u6838\u961F\u5217\u5931\u8D25")}this.panel.webview.html=this.getHtml(e),this.panel.reveal()}async handleMessage(e){switch(e.command){case"approve":{let t=String(e.id??"");try{await O(t),g.window.showInformationMessage(`\u7B97\u6CD5 ${t} \u5DF2\u6279\u51C6`),await this.show()}catch(s){g.window.showErrorMessage(`\u6279\u51C6\u5931\u8D25: ${String(s)}`)}break}case"reject":{let t=String(e.id??""),s=await g.window.showInputBox({prompt:"\u62D2\u7EDD\u539F\u56E0",placeHolder:"\u8BF7\u8F93\u5165\u62D2\u7EDD\u539F\u56E0"});if(s===void 0)return;try{await xe(t,s),g.window.showInformationMessage(`\u7B97\u6CD5 ${t} \u5DF2\u62D2\u7EDD`),await this.show()}catch(n){g.window.showErrorMessage(`\u62D2\u7EDD\u5931\u8D25: ${String(n)}`)}break}case"refresh":await this.show();break}}getHtml(e){let t=this.panel.webview.cspSource,s=this.panel.webview.asWebviewUri(g.Uri.joinPath(this.context.extensionUri,"media","shared.css")),n=JSON.stringify(e);return`<!DOCTYPE html>
<html lang="zh">
<head>
<meta charset="UTF-8"/>
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${t} 'unsafe-inline'; script-src ${t} 'unsafe-inline'; img-src ${t} data:;" />
<link rel="stylesheet" href="${s}"/>
<title>\u5BA1\u6838\u961F\u5217</title>
<style>
body { padding: 10px; }
.review-row { padding: 12px; border: 1px solid var(--border); border-radius: 4px; margin-bottom: 8px; display: flex; align-items: flex-start; gap: 12px; }
.review-info { flex: 1; }
.review-name { font-weight: 600; font-size: 13px; }
.review-ns { font-size: 11px; color: var(--text-dim); margin-top: 2px; }
.review-desc { font-size: 12px; margin-top: 6px; }
.review-actions { display: flex; gap: 6px; flex-shrink: 0; }
</style>
</head>
<body>
<div class="toolbar">
  <strong>\u5BA1\u6838\u961F\u5217</strong>
  <span id="count" style="font-size:11px;color:var(--text-dim);margin-left:8px;"></span>
  <div class="toolbar-spacer"></div>
  <button onclick="refresh()">\u5237\u65B0</button>
</div>
<div id="list" style="margin-top:10px;"></div>
<script>
const vscode = acquireVsCodeApi();
const reviews = ${n};

function render() {
  const list = document.getElementById('list');
  document.getElementById('count').textContent = reviews.length + ' \u6761\u5F85\u5BA1\u6838';
  if (reviews.length === 0) {
    list.innerHTML = '<div class="empty-state">\u6682\u65E0\u5F85\u5BA1\u6838\u7B97\u6CD5</div>';
    return;
  }
  list.innerHTML = reviews.map(r => \`
    <div class="review-row">
      <div class="review-info">
        <div class="review-name">\${escHtml(r.zhName || r.funcName)}</div>
        <div class="review-ns">\${escHtml(r.namespace)}</div>
        <div class="review-desc">\${escHtml(r.zhDescription || '')}</div>
      </div>
      <div class="review-actions">
        <button class="btn-success" onclick="approve('\${escAttr(r.id)}')">\u6279\u51C6</button>
        <button class="btn-danger" onclick="reject('\${escAttr(r.id)}')">\u62D2\u7EDD</button>
      </div>
    </div>
  \`).join('');
}

function escHtml(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function escAttr(s) { return String(s||'').replace(/"/g,'&quot;'); }
function approve(id) { vscode.postMessage({ command: 'approve', id }); }
function reject(id) { vscode.postMessage({ command: 'reject', id }); }
function refresh() { vscode.postMessage({ command: 'refresh' }); }

render();
</script>
</body>
</html>`}};function Te(o,e){o.subscriptions.push(C.commands.registerCommand("algolib.openReview",async()=>{await X.open(o)})),o.subscriptions.push(C.commands.registerCommand("algolib.approve",async t=>{let s=typeof t=="string"?t:t?.id;if(s)try{await O(s),C.window.showInformationMessage(`\u7B97\u6CD5 ${s} \u5DF2\u6279\u51C6`),await e.refresh()}catch(n){C.window.showErrorMessage(`\u6279\u51C6\u5931\u8D25: ${String(n)}`)}})),o.subscriptions.push(C.commands.registerCommand("algolib.publish",async t=>{let s=typeof t=="string"?t:t?.id;if(s)try{await O(s),C.window.showInformationMessage("\u7B97\u6CD5\u5DF2\u53D1\u5E03"),await e.refresh()}catch(n){C.window.showErrorMessage(`\u53D1\u5E03\u5931\u8D25: ${String(n)}`)}}))}var f=l(require("vscode"));function Ie(o,e){o.subscriptions.push(f.commands.registerCommand("algolib.createCategory",async()=>{let t=await f.window.showInputBox({prompt:"\u5206\u7C7B\u547D\u540D\u7A7A\u95F4 (\u5982 machine_learning)",placeHolder:"my_category"});if(!t)return;let s=await f.window.showInputBox({prompt:"\u5206\u7C7B\u4E2D\u6587\u540D",placeHolder:"\u6211\u7684\u5206\u7C7B"});if(!s)return;let n=await f.window.showInputBox({prompt:"\u7236\u5206\u7C7B\u547D\u540D\u7A7A\u95F4\uFF08\u53EF\u9009\uFF0C\u7559\u7A7A\u4E3A\u9876\u7EA7\u5206\u7C7B\uFF09",placeHolder:""});try{await we({namespace:t,zh_name:s,parent_namespace:n||void 0}),f.window.showInformationMessage(`\u5206\u7C7B "${s}" \u521B\u5EFA\u6210\u529F`),await e.refresh()}catch(i){f.window.showErrorMessage(`\u521B\u5EFA\u5206\u7C7B\u5931\u8D25: ${String(i)}`)}})),o.subscriptions.push(f.commands.registerCommand("algolib.insertSnippet",async()=>{f.window.showInformationMessage("\u63D2\u5165\u4EE3\u7801\u7247\u6BB5\u529F\u80FD\u6682\u672A\u5B9E\u73B0")}))}var B,H;async function Ke(o){console.log("[AlgoLib] Extension activating..."),B=m.window.createStatusBarItem(m.StatusBarAlignment.Left,100),B.command="algolib.browse",o.subscriptions.push(B),D(),B.show();let e=new U("all"),t=new U("mine");m.window.registerTreeDataProvider("algolib.explorer",e),m.window.registerTreeDataProvider("algolib.myAlgos",t),o.subscriptions.push(m.languages.registerCompletionItemProvider({language:"python"},new _,".")),o.subscriptions.push(m.languages.registerCodeLensProvider({language:"python"},new J)),o.subscriptions.push(m.languages.registerHoverProvider({language:"python"},new V)),Se(o),Pe(o,e),$e(o),Te(o,e),Ie(o,e),o.subscriptions.push(m.commands.registerCommand("algolib.login",async()=>{let i=await m.window.showInputBox({prompt:"\u7528\u6237\u540D",placeHolder:"username"});if(!i)return;let r=await m.window.showInputBox({prompt:"\u5BC6\u7801",password:!0});r&&m.window.withProgress({location:m.ProgressLocation.Notification,title:"\u6B63\u5728\u767B\u5F55 AlgoLib...",cancellable:!1},async()=>{let a=await ue(i,r);a.success?(m.window.showInformationMessage(`AlgoLib: \u767B\u5F55\u6210\u529F\uFF0C\u6B22\u8FCE ${i}`),await e.refresh(),await t.refresh()):m.window.showErrorMessage(`\u767B\u5F55\u5931\u8D25: ${a.message}`)})})),o.subscriptions.push(ee.event(({user:i})=>{m.commands.executeCommand("setContext","algolib.active",!!i),D(),i?(t.setOwnerId(i.id),e.refresh(),t.refresh(),Me(o,e,t)):se()}));let s=b();if(!await Ce().catch(()=>!1))console.warn(`[AlgoLib] Backend not reachable at ${s}`),D("\u79BB\u7EBF");else if(re())if(await me()){let r=W();D(r?.username),t.setOwnerId(r?.id),await e.refresh(),await t.refresh(),Me(o,e,t),m.commands.executeCommand("setContext","algolib.active",!0)}else D("\u672A\u767B\u5F55");console.log("[AlgoLib] Extension activated")}function Ye(){se(),console.log("[AlgoLib] Extension deactivated")}function D(o){let e=o?`$(beaker) AlgoLib: ${o}`:"$(beaker) AlgoLib: \u672A\u767B\u5F55";B.text=e,B.tooltip="AlgoLib \u7B97\u6CD5\u7BA1\u7406 \u2014 \u70B9\u51FB\u6253\u5F00\u6D4F\u89C8\u5668"}function Me(o,e,t){se();let s=A();if(!s)return;H=new AbortController;let n=`${b()}/api/v1/algorithms/events?token=${encodeURIComponent(s)}`;(async()=>{try{let i=await fetch(n,{signal:H.signal,headers:{Accept:"text/event-stream"}});if(!i.ok||!i.body)return;let r=i.body.getReader(),a=new TextDecoder;for(;;){let{done:c,value:w}=await r.read();if(c)break;a.decode(w).includes("algorithms:changed")&&(e.refresh(),t.refresh())}}catch{}})()}function se(){H&&(H.abort(),H=void 0)}0&&(module.exports={activate,deactivate});
//# sourceMappingURL=extension.js.map
