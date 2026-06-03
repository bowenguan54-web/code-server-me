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
      const unquoted = text.replace(/^["'“”‘’]|["'“”‘’]$/g, "").trim();
      if (unquoted !== text) return parseScalarToken(unquoted);
      if (/^(true|false)$/i.test(text)) return text.toLowerCase() === "true";
      if (/^null$/i.test(text)) return null;
      if (!Number.isNaN(Number(text)) && /^[-+]?\d+(\.\d+)?$/.test(text)) return Number(text);
      return text;
    }
    function normalizeLooseValueText(value) {
      return String(value ?? "")
        .trim()
        .replace(/[，、；;]/g, ",")
        .replace(/[“”]/g, '"')
        .replace(/[‘’]/g, "'");
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
      const raw = normalizeLooseValueText(text);
      if (!raw) return [];
      let candidate = raw;
      if (/^\{[\s\S]*\}$/.test(candidate) && !/:/.test(candidate)) {
        candidate = `[${candidate.slice(1, -1)}]`;
      }
      try {
        const parsed = JSON.parse(candidate);
        return Array.isArray(parsed) ? parsed : [parsed];
      } catch (_error) {
        if (/\r?\n/.test(candidate) && candidate.includes(",")) {
          const csvRows = parseSimpleCsv(candidate);
          if (Array.isArray(csvRows) && csvRows.length && (Array.isArray(csvRows[0]) || typeof csvRows[0] === "object")) return csvRows;
        }
        const listText = /^\[[\s\S]*\]$/.test(candidate) ? candidate.slice(1, -1) : candidate;
        return listText.split(/[\r\n,]+/).map(item => item.trim()).filter(Boolean).map(parseScalarToken);
      }
    }
    function parseLooseDict(text) {
      const raw = normalizeLooseValueText(text);
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
    function withTimeout(promise, ms, message) {
      let timer;
      const timeout = new Promise((_, reject) => {
        timer = window.setTimeout(() => reject(new Error(message || "请求超时，请刷新页面重试")), ms);
      });
      return Promise.race([promise, timeout]).finally(() => {
        if (timer) window.clearTimeout(timer);
      });
    }
    async function api(path, options = {}) {
      const headers = { ...(options.headers || {}) };
      if (options.body && !headers["Content-Type"]) headers["Content-Type"] = "application/json";
      const token = localStorage.getItem("algolib_token");
      if (token) headers["Authorization"] = `Bearer ${token}`;
      let response;
      let timeoutId = null;
      const fetchOptions = { ...options, headers };
      if (!fetchOptions.signal) {
        if (typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function") {
          fetchOptions.signal = AbortSignal.timeout(30000);
        } else if (typeof AbortController !== "undefined") {
          const controller = new AbortController();
          timeoutId = window.setTimeout(() => controller.abort(), 30000);
          fetchOptions.signal = controller.signal;
        }
      }
      try {
        response = await fetch(BASE + path, fetchOptions);
      } catch (error) {
        const isTimeout = error.name === "TimeoutError" || error.name === "AbortError";
        const rawMessage = String(error.message || "");
        if (isTimeout) {
          throw new Error("\u8bf7\u6c42\u8d85\u65f6\uff0c\u8bf7\u68c0\u67e5\u670d\u52a1\u662f\u5426\u6b63\u5e38\u8fd0\u884c");
        }
        if (/failed to fetch|networkerror|load failed/i.test(rawMessage)) {
          throw new Error("\u65e0\u6cd5\u8fde\u63a5\u540e\u7aef\u670d\u52a1\uff0c\u8bf7\u786e\u8ba4\u540e\u7aef\u6b63\u5728\u8fd0\u884c\u540e\u91cd\u8bd5\u3002");
        }
        throw new Error(rawMessage || "\u7f51\u7edc\u9519\u8bef");
      } finally {
        if (timeoutId) window.clearTimeout(timeoutId);
      }
      let data = null;
      try { data = await response.json(); } catch (error) { data = { detail: response.statusText }; }
      if (response.status === 401) {
        localStorage.removeItem("algolib_token");
        localStorage.removeItem("algolib_user");
        state.currentUser = null;
        showLoginPage();
        throw new Error("\u767b\u5f55\u5df2\u8fc7\u671f\uff0c\u8bf7\u91cd\u65b0\u767b\u5f55");
      }
      if (!response.ok) throw new Error(data.detail || data.error || response.statusText);
      return data;
    }
