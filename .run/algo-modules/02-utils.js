/*
 * AlgoLib module: 02-utils.js
 * ???DOM????API?Toast?????????????
 * ???? .run/algo-lib-check.js ??????????????????????
 */

    function qs(selector, root = document) { return root.querySelector(selector); }
    function qsa(selector, root = document) { return Array.from(root.querySelectorAll(selector)); }
    function esc(value) {
      return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
    }
    function normalizeListPayload(data, key) {
      if (Array.isArray(data)) return data;
      if (Array.isArray(data[key])) return data[key];
      if (Array.isArray(data.items)) return data.items;
      return [];
    }
    function parseScalarToken(token) {
      const text = String(token ?? "").trim();
      if (!text) return "";
      if (/^(true|false)$/i.test(text)) return text.toLowerCase() === "true";
      if (/^null$/i.test(text)) return null;
      if (!Number.isNaN(Number(text)) && /^[-+]?\d+(\.\d+)?$/.test(text)) return Number(text);
      return text;
    }
    function parseSimpleCsv(text) {
      const lines = String(text || "").split(/\r?\n/).map(line => line.trim()).filter(Boolean);
      if (!lines.length) return [];
      const rows = lines.map(line => line.split(",").map(cell => cell.trim()));
      if (rows.length >= 2 && rows[0].every(cell => cell && Number.isNaN(Number(cell)))) {
        const headers = rows[0];
        return rows.slice(1).map(row => {
          const obj = {};
          headers.forEach((header, index) => { obj[header] = parseScalarToken(row[index] ?? ""); });
          return obj;
        });
      }
      return rows.map(row => row.map(parseScalarToken));
    }
    function parseLooseList(text) {
      const raw = String(text ?? "").trim();
      if (!raw) return [];
      try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [parsed];
      } catch (_error) {
        if (/\r?\n/.test(raw) && raw.includes(",")) {
          const csvRows = parseSimpleCsv(raw);
          if (Array.isArray(csvRows) && csvRows.length && (Array.isArray(csvRows[0]) || typeof csvRows[0] === "object")) return csvRows;
        }
        return raw.split(/[\r\n,]+/).map(item => item.trim()).filter(Boolean).map(parseScalarToken);
      }
    }
    function parseLooseDict(text) {
      const raw = String(text ?? "").trim();
      if (!raw) return {};
      try {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object") return parsed;
      } catch (_error) {
        const obj = {};
        const lines = raw.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
        for (const line of lines) {
          const separator = line.includes("=") ? "=" : (line.includes(":") ? ":" : "");
          if (!separator) return raw;
          const index = line.indexOf(separator);
          const key = line.slice(0, index).trim();
          const value = line.slice(index + 1).trim();
          if (!key) return raw;
          obj[key] = parseScalarToken(value);
        }
        return obj;
      }
      return raw;
    }
    function parseParamValueByType(type, rawValue) {
      const kind = String(type || "");
      const text = String(rawValue ?? "");
      if (/bool/i.test(kind)) return text === "true";
      if (/DataFrame|dataframe/i.test(kind)) {
        const trimmed = text.trim();
        if (!trimmed) return [];
        try { return JSON.parse(trimmed); } catch (_error) { return parseSimpleCsv(trimmed); }
      }
      if (/list/i.test(kind)) return parseLooseList(text);
      if (/dict/i.test(kind)) return parseLooseDict(text);
      if (/int/i.test(kind)) return text === "" ? null : parseInt(text, 10);
      if (/float|number/i.test(kind)) return text === "" ? null : Number(text);
      return rawValue;
    }
    function showToast(message) {
      const el = qs("#toast");
      el.textContent = message;
      el.classList.remove("hidden");
      window.clearTimeout(showToast._timer);
      showToast._timer = window.setTimeout(() => el.classList.add("hidden"), 2600);
    }

    function showConfirm(message, onOk) {
      const modal = qs("#modalRoot");
      modal.classList.remove("hidden");
      modal.innerHTML = `
        <div class="modal" style="max-width:420px">
          <p style="margin:0 0 20px;font-size:14px;line-height:1.6;color:var(--text)">${esc(message)}</p>
          <div class="modal-actions">
            <button id="_confirmCancelBtn">取消</button>
            <button class="danger" id="_confirmOkBtn">确定</button>
          </div>
        </div>
      `;
      const close = () => { modal.innerHTML = ""; modal.classList.add("hidden"); };
      qs("#_confirmCancelBtn").addEventListener("click", close);
      qs("#_confirmOkBtn").addEventListener("click", () => { close(); onOk(); });
    }
    async function api(path, options = {}) {
      const headers = { ...(options.headers || {}) };
      if (options.body && !headers["Content-Type"]) headers["Content-Type"] = "application/json";
      const token = localStorage.getItem("algolib_token");
      if (token) headers["Authorization"] = `Bearer ${token}`;
      let response;
      try {
        response = await fetch(BASE + path, { ...options, headers, signal: AbortSignal.timeout(30000) });
      } catch (error) {
        throw new Error(error.name === "TimeoutError" ? "请求超时，请检查服务是否正常运行" : (error.message || "网络错误"));
      }
      let data = null;
      try { data = await response.json(); } catch (error) { data = { detail: response.statusText }; }
      if (response.status === 401) {
        localStorage.removeItem("algolib_token");
        localStorage.removeItem("algolib_user");
        state.currentUser = null;
        showLoginPage();
        throw new Error("登录已过期，请重新登录");
      }
      if (!response.ok) throw new Error(data.detail || data.error || response.statusText);
      return data;
    }
