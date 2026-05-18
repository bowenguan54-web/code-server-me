/*
 * AlgoLib module: 34-component-test-widgets.js
 * ??????????????????????????
 * ???? .run/algo-lib-check.js ??????????????????????
 */

    // ── Image upload widget ───────────────────────────────────────
    function _renderImageWidget(name, st) {
      const mode = st.mode || "base64";
      const modeSelector = `<div class="image-mode-selector">
        <label><input type="radio" name="img-mode-${esc(name)}" value="base64" ${mode==="base64"?"checked":""} onchange="window._setImageMode('${esc(name)}','base64')"> base64</label>
        <label><input type="radio" name="img-mode-${esc(name)}" value="path" ${mode==="path"?"checked":""} onchange="window._setImageMode('${esc(name)}','path')"> 服务器路径</label>
        <label><input type="radio" name="img-mode-${esc(name)}" value="url" ${mode==="url"?"checked":""} onchange="window._setImageMode('${esc(name)}','url')"> URL</label>
      </div>`;
      let contentHtml = "";
      if (st.preview) {
        contentHtml = `<div class="image-preview">
          <img class="preview-thumb" src="${esc(st.preview)}" alt="preview">
          <div class="preview-info">
            <span title="${esc(st.filename||"")}">${esc(st.filename||"")}</span>
            <span>${st.width && st.height ? `${st.width}×${st.height}` : ""} ${st.size ? (_fmtBytes(st.size)) : ""}</span>
          </div>
          <button type="button" class="preview-remove" onclick="window._removeImageParam('${esc(name)}')">✕</button>
        </div>`;
      } else if (mode === "url") {
        contentHtml = `<input class="image-url-input" data-tp-param="${esc(name)}" data-tp-type="str"
          placeholder="https://..." value="${esc(st.url||"")}"
          oninput="window._setImageUrl('${esc(name)}',this.value)">`;
      } else if (mode === "path") {
        contentHtml = st.path
          ? `<div class="image-preview"><div class="preview-info"><span>${esc(st.path)}</span></div>
              <button type="button" class="preview-remove" onclick="window._removeImageParam('${esc(name)}')">✕</button></div>`
          : `<div style="font-size:11px;color:var(--text-dim)">上传后将显示路径</div>`;
      }
      const dz = `<div class="image-dropzone" id="img-dz-${esc(name)}"
        onclick="qs('#img-file-${esc(name)}').click()"
        ondragover="event.preventDefault();this.classList.add('drag-over')"
        ondragleave="this.classList.remove('drag-over')"
        ondrop="event.preventDefault();this.classList.remove('drag-over');window._onImageDrop(event,'${esc(name)}')"
        tabindex="0" onpaste="window._onImagePasteInDz(event,'${esc(name)}')">
        <svg viewBox="0 0 24 24" width="36" height="36" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M12 16V4m0 0L8 8m4-4l4 4"/>
          <path d="M2 17l.621 2.485A2 2 0 004.561 21h14.878a2 2 0 001.94-1.515L22 17"/>
        </svg>
        <div class="dropzone-text">拖拽图片到此处，或 <span style="color:var(--primary);text-decoration:underline">点击选择文件</span></div>
        <div class="dropzone-hint">支持 PNG / JPG / BMP / GIF / WebP，最大 10MB。也可直接 Ctrl+V 粘贴</div>
        <input id="img-file-${esc(name)}" type="file" accept="image/*" style="display:none"
          onchange="window._onImageFileChange(event,'${esc(name)}')">
      </div>`;
      return (st.preview || (mode==="path" && st.path) || (mode==="url" && st.url)) ? `${modeSelector}${contentHtml}` : `${modeSelector}${dz}`;
    }

    function _renderMultiImageWidget(name, st) {
      const previews = st.previews || [];
      const gridItems = previews.map((src, i) =>
        `<div class="image-grid-item"><img src="${esc(src)}"><button type="button" class="grid-item-remove" onclick="window._removeImageAt('${esc(name)}',${i})">✕</button></div>`
      ).join("");
      return `<div class="image-grid" id="img-grid-${esc(name)}">
        ${gridItems}
        <div class="image-grid-add" onclick="qs('#imgs-file-${esc(name)}').click()">+
          <input id="imgs-file-${esc(name)}" type="file" accept="image/*" multiple style="display:none"
            onchange="window._onMultiImageFileChange(event,'${esc(name)}')">
        </div>
      </div>
      <div class="multi-image-info">${previews.length ? `${previews.length} 张图片` : "点击 + 添加图片，或拖入"}</div>`;
    }

    function _renderFileWidget(name, st, accept, widgetType) {
      const icons = { audio:"🎵", video:"🎬", file:"📄" };
      const labels = { audio:"音频文件", video:"视频文件", file:"文件" };
      const icon = icons[widgetType]||"📄";
      const label = labels[widgetType]||"文件";
      const modeSelector = `<div class="image-mode-selector">
        <label><input type="radio" name="file-mode-${esc(name)}" value="base64" ${(st.mode||"base64")==="base64"?"checked":""} onchange="window._setFileMode('${esc(name)}','base64')"> base64</label>
        <label><input type="radio" name="file-mode-${esc(name)}" value="path" ${st.mode==="path"?"checked":""} onchange="window._setFileMode('${esc(name)}','path')"> 服务器路径</label>
      </div>`;
      if (st.preview || st.path) {
        let playerHtml = "";
        if (st.preview) {
          if (widgetType === "audio") playerHtml = `<audio class="audio-preview" controls src="${esc(st.preview)}"></audio>`;
          else if (widgetType === "video") playerHtml = `<video class="video-preview" controls src="${esc(st.preview)}"></video>`;
        }
        return `${modeSelector}<div class="image-preview">
          <div class="preview-info"><span>${esc(st.filename||"")}</span><span>${_fmtBytes(st.size||0)}</span></div>
          <button type="button" class="preview-remove" onclick="window._removeFileParam('${esc(name)}')">✕</button>
        </div>${playerHtml}`;
      }
      return `${modeSelector}<div class="image-dropzone" onclick="qs('#file-input-${esc(name)}').click()"
        ondragover="event.preventDefault();this.classList.add('drag-over')"
        ondragleave="this.classList.remove('drag-over')"
        ondrop="event.preventDefault();this.classList.remove('drag-over');window._onFileDrop(event,'${esc(name)}')">
        <div><p>${icon} 点击或拖入${label}</p></div>
        <input id="file-input-${esc(name)}" type="file" accept="${esc(accept)}" style="display:none"
          onchange="window._onFileChange(event,'${esc(name)}')">
      </div>`;
    }

    function _fmtBytes(n) {
      if (!n) return "";
      if (n < 1024) return `${n} B`;
      if (n < 1048576) return `${(n/1024).toFixed(1)} KB`;
      return `${(n/1048576).toFixed(1)} MB`;
    }

    // ── Param card renderer (upgraded) ───────────────────────────
    function _renderTPParamCard(p, rawVal) {
      const name = p.name;
      const type = String(p.type || p.annotation || "str");
      const valStr = rawVal !== undefined && rawVal !== null
        ? (typeof rawVal === "object" ? JSON.stringify(rawVal, null, 2) : String(rawVal)) : "";
      const widget = p.widget_hint || inferParamWidget(p, rawVal);

      // Init file state if needed
      state._tpFileState = state._tpFileState || {};
      if (!state._tpFileState[name]) state._tpFileState[name] = { mode: "base64" };
      const st = state._tpFileState[name];

      let inputHtml = "";

      if (widget === "image") {
        inputHtml = _renderImageWidget(name, st);
      } else if (widget === "images") {
        inputHtml = _renderMultiImageWidget(name, st);
      } else if (widget === "audio") {
        inputHtml = _renderFileWidget(name, st, "audio/*", "audio");
      } else if (widget === "video") {
        inputHtml = _renderFileWidget(name, st, "video/*", "video");
      } else if (widget === "file") {
        inputHtml = _renderFileWidget(name, st, "*", "file");
      } else if (widget === "bool") {
        const isTrue = rawVal === true || rawVal === "true" || rawVal === 1;
        inputHtml = `<div style="display:flex;gap:12px;margin-top:2px">
          <label style="display:flex;align-items:center;gap:4px;cursor:pointer">
            <input type="radio" name="tp-bool-${esc(name)}" data-tp-param="${esc(name)}" data-tp-type="${esc(type)}" value="true" ${isTrue ? "checked" : ""}>true
          </label>
          <label style="display:flex;align-items:center;gap:4px;cursor:pointer">
            <input type="radio" name="tp-bool-${esc(name)}" data-tp-param="${esc(name)}" data-tp-type="${esc(type)}" value="false" ${!isTrue ? "checked" : ""}>false
          </label>
        </div>`;
      } else if (widget === "int") {
        inputHtml = `<input type="number" step="1" data-tp-param="${esc(name)}" data-tp-type="${esc(type)}" value="${esc(valStr)}" style="width:100%;box-sizing:border-box">`;
      } else if (widget === "float") {
        inputHtml = `<input type="number" step="any" data-tp-param="${esc(name)}" data-tp-type="${esc(type)}" value="${esc(valStr)}" style="width:100%;box-sizing:border-box">`;
      } else if (widget === "color") {
        inputHtml = `<div style="display:flex;align-items:center;gap:6px">
          <input type="color" class="tp-color-input" data-tp-param="${esc(name)}" data-tp-type="${esc(type)}" value="${esc(valStr||"#000000")}">
          <input type="text" data-tp-param="${esc(name)}-hex" placeholder="#rrggbb" value="${esc(valStr)}" style="width:80px;font-size:11px" oninput="qs('[data-tp-param=\\'${esc(name)}\\']').value=this.value">
        </div>`;
      } else if (widget === "password") {
        inputHtml = `<input type="password" data-tp-param="${esc(name)}" data-tp-type="${esc(type)}" value="${esc(valStr)}" style="width:100%;box-sizing:border-box">`;
      } else if (widget === "url") {
        inputHtml = `<input type="url" data-tp-param="${esc(name)}" data-tp-type="${esc(type)}" value="${esc(valStr)}" placeholder="https://..." style="width:100%;box-sizing:border-box">`;
      } else if (widget === "literal") {
        const opts = p.widget_options || [];
        if (opts.length) {
          const optHtml = opts.map(o => `<option value="${esc(o)}" ${valStr === o ? "selected" : ""}>${esc(o)}</option>`).join("");
          inputHtml = `<select data-tp-param="${esc(name)}" data-tp-type="${esc(type)}" style="width:100%">${optHtml}</select>`;
        } else {
          inputHtml = `<input data-tp-param="${esc(name)}" data-tp-type="${esc(type)}" value="${esc(valStr)}" style="width:100%;box-sizing:border-box">`;
        }
      } else if (widget === "datetime") {
        inputHtml = `<input type="datetime-local" data-tp-param="${esc(name)}" data-tp-type="${esc(type)}" value="${esc(valStr)}" style="width:100%;box-sizing:border-box">`;
      } else if (widget === "dataframe" || widget === "list" || widget === "dict" || widget === "json") {
        let parsed = null;
        try { if (rawVal !== undefined) parsed = (typeof rawVal === "object") ? rawVal : JSON.parse(valStr); } catch {}
        const isListOfDicts = Array.isArray(parsed) && parsed.length > 0 && typeof parsed[0] === "object" && !Array.isArray(parsed[0]);
        const placeholder = widget === "dataframe" ? "粘贴 CSV 或 JSON" : "JSON";
        const fileRow = `<div style="display:flex;gap:4px;margin-top:4px">
          <label title="单文件" style="cursor:pointer;padding:1px 6px;font-size:11px;border:1px solid var(--border);border-radius:4px">📄<input type="file" style="display:none" onchange="window.onCtFileUpload(event,'${esc(name)}','single')"/></label>
          <label title="多文件" style="cursor:pointer;padding:1px 6px;font-size:11px;border:1px solid var(--border);border-radius:4px">📚<input type="file" multiple style="display:none" onchange="window.onCtFileUpload(event,'${esc(name)}','multi')"/></label>
          <label title="文件夹" style="cursor:pointer;padding:1px 6px;font-size:11px;border:1px solid var(--border);border-radius:4px">📁<input type="file" webkitdirectory style="display:none" onchange="window.onCtFileUpload(event,'${esc(name)}','folder')"/></label>
        </div>`;
        if (isListOfDicts) {
          state._tpTableData = state._tpTableData || {};
          state._tpTableData[name] = JSON.parse(JSON.stringify(parsed));
          inputHtml = `<div class="tp-tab-bar" id="tp-tab-bar-${esc(name)}">
            <button class="active" onclick="window.switchTPParamTab('${esc(name)}','table',this)">表格</button>
            <button onclick="window.switchTPParamTab('${esc(name)}','json',this)">JSON</button>
            <button onclick="window.switchTPParamTab('${esc(name)}','file',this)">文件</button>
          </div>
          <div id="tp-param-pane-${esc(name)}">${_renderTPEditableTable(name, parsed)}</div>`;
        } else {
          inputHtml = `<div class="tp-tab-bar" id="tp-tab-bar-${esc(name)}">
            <button class="active" onclick="window.switchTPParamTab('${esc(name)}','json',this)">JSON</button>
            <button onclick="window.switchTPParamTab('${esc(name)}','file',this)">文件</button>
          </div>
          <div id="tp-param-pane-${esc(name)}">
            <textarea rows="3" data-tp-param="${esc(name)}" data-tp-type="${esc(type)}"
              style="width:100%;box-sizing:border-box;font-size:11px;resize:vertical"
              placeholder="${esc(placeholder)}">${esc(valStr)}</textarea>
          </div>`;
        }
        inputHtml += fileRow;
      } else {
        // str / generic
        const isLong = valStr.includes("\n") || valStr.length > 60;
        if (isLong) {
          inputHtml = `<textarea rows="3" data-tp-param="${esc(name)}" data-tp-type="${esc(type)}"
            style="width:100%;box-sizing:border-box;font-size:12px;resize:vertical">${esc(valStr)}</textarea>`;
        } else {
          inputHtml = `<input data-tp-param="${esc(name)}" data-tp-type="${esc(type)}" value="${esc(valStr)}" style="width:100%;box-sizing:border-box">`;
        }
      }
      return `<div class="tp-param-card" id="tp-card-${esc(name)}">
        <div class="tp-param-head">
          <span>
            <span class="tp-param-name">${esc(name)}</span>
            <span class="tp-param-type">${esc(type)}</span>
            <span class="tp-type-hint">${esc(widget)}</span>
          </span>
          <label class="tp-skip-wrap">
            <input type="checkbox" data-tp-skip="${esc(name)}" onchange="window.toggleTPParamSkip('${esc(name)}', this.checked)" style="margin:0">
            <span>跳过</span>
          </label>
        </div>
        <div class="tp-param-input-area" id="tp-input-${esc(name)}">${inputHtml}</div>
      </div>`;
    }

    // ── Image/file interaction handlers ──────────────────────────
    function _getFileState(name) {
      state._tpFileState = state._tpFileState || {};
      if (!state._tpFileState[name]) state._tpFileState[name] = { mode: "base64" };
      return state._tpFileState[name];
    }

    function _rerenderParamCard(name) {
      const algo = state._compTestAlgo;
      if (!algo) return;
      const p = (algo.params || []).find(x => x.name === name);
      if (!p) return;
      const card = qs(`#tp-input-${name}`);
      if (!card) return;
      const widget = p.widget_hint || inferParamWidget(p);
      const st = _getFileState(name);
      let html = "";
      if (widget === "image") html = _renderImageWidget(name, st);
      else if (widget === "images") html = _renderMultiImageWidget(name, st);
      else if (["audio","video","file"].includes(widget)) {
        const accepts = { audio:"audio/*", video:"video/*", file:"*" };
        html = _renderFileWidget(name, st, accepts[widget], widget);
      } else return;
      card.innerHTML = html;
    }

    function _setImageMode(name, mode) {
      const st = _getFileState(name);
      st.mode = mode;
      _rerenderParamCard(name);
    }

    function _setFileMode(name, mode) {
      const st = _getFileState(name);
      st.mode = mode;
      _rerenderParamCard(name);
    }

    function _setImageUrl(name, url) {
      const st = _getFileState(name);
      st.url = url;
    }
