/*
 * AlgoLib module: 31-full-test-upload-inputs.js
 * ????????????????????URL????????????
 * ???? .run/algo-lib-check.js ??????????????????????
 */

    function renderImageInput(param, container) {
      let currentMode = "base64";
      const dropzone = document.createElement("div"); dropzone.className = "image-dropzone";
      const text = document.createElement("div"); text.className = "image-dropzone-text"; text.textContent = "点击选择或拖拽图片到此处";
      const hint = document.createElement("div"); hint.className = "image-dropzone-hint"; hint.textContent = "支持 JPG、PNG、GIF、WebP 格式，也可 Ctrl+V 粘贴";
      dropzone.appendChild(text); dropzone.appendChild(hint);
      const fileInput = document.createElement("input"); fileInput.type = "file"; fileInput.accept = "image/*"; fileInput.style.display = "none";
      const previewContainer = document.createElement("div"); previewContainer.className = "image-preview-container"; previewContainer.style.display = "none";
      const fileInfoEl = document.createElement("div"); fileInfoEl.className = "image-file-info";
      let selectedFile = null;

      function handleFile(file) {
        if (!file || !file.type.startsWith("image/")) { showToast("请选择图片文件"); return; }
        if (file.size > 50 * 1024 * 1024) { showToast("图片不能超过 50MB"); return; }
        selectedFile = file;
        const reader = new FileReader();
        reader.onload = async (e) => {
          const dataUrl = e.target.result;
          previewContainer.innerHTML = "";
          const item = document.createElement("div"); item.className = "image-preview-item";
          const img = document.createElement("img"); img.src = dataUrl;
          const removeBtn = document.createElement("button"); removeBtn.type = "button"; removeBtn.className = "image-preview-remove"; removeBtn.textContent = "×";
          removeBtn.onclick = () => { selectedFile = null; previewContainer.style.display = "none"; dropzone.style.display = "flex"; fileInfoEl.textContent = ""; state._testParamValues[param.name] = undefined; };
          item.appendChild(img); item.appendChild(removeBtn); previewContainer.appendChild(item);
          previewContainer.style.display = "flex"; dropzone.style.display = "none";
          fileInfoEl.textContent = file.name + " (" + (file.size / 1024).toFixed(1) + " KB)";
          if (currentMode === "base64") {
            state._testParamValues[param.name] = extractPureBase64(dataUrl);
          } else if (currentMode === "path") {
            state._testParamValues[param.name] = await uploadFullTestTempFile(file);
          }
        };
        reader.readAsDataURL(file);
      }

      dropzone.onclick = () => fileInput.click();
      fileInput.onchange = () => { if (fileInput.files[0]) handleFile(fileInput.files[0]); };
      dropzone.ondragover = (e) => { e.preventDefault(); dropzone.classList.add("drag-over"); };
      dropzone.ondragleave = () => { dropzone.classList.remove("drag-over"); };
      dropzone.ondrop = (e) => { e.preventDefault(); dropzone.classList.remove("drag-over"); if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]); };
      container.addEventListener("paste", (e) => {
        const items = e.clipboardData?.items;
        if (!items) return;
        for (const item of items) { if (item.type.startsWith("image/")) { handleFile(item.getAsFile()); break; } }
      });
      container.setAttribute("tabindex", "0");
      container.appendChild(fileInput); container.appendChild(dropzone); container.appendChild(previewContainer); container.appendChild(fileInfoEl);

      const modeSelector = document.createElement("div"); modeSelector.className = "image-mode-selector";
      ["编码", "路径", "网址"].forEach((label, i) => {
        const mode = ["base64", "path", "url"][i];
        const btn = document.createElement("button"); btn.type = "button"; btn.className = "image-mode-btn" + (i === 0 ? " active" : "");
        btn.textContent = label; btn.dataset.mode = mode;
        btn.onclick = async () => {
          modeSelector.querySelectorAll(".image-mode-btn").forEach(b => b.classList.remove("active"));
          btn.classList.add("active"); currentMode = mode;
          let urlInput = container.querySelector(".image-url-input");
          if (mode === "url") {
            dropzone.style.display = "none"; previewContainer.style.display = "none";
            if (!urlInput) {
              urlInput = document.createElement("input"); urlInput.type = "url"; urlInput.className = "input-url image-url-input";
              urlInput.placeholder = "请输入图片网址 (https://...)";
              urlInput.addEventListener("input", () => { state._testParamValues[param.name] = urlInput.value; });
              container.insertBefore(urlInput, modeSelector);
            }
            urlInput.style.display = "block";
          } else {
            if (urlInput) urlInput.style.display = "none";
            if (!previewContainer.querySelector("img")) dropzone.style.display = "flex";
            if (selectedFile && mode === "path") state._testParamValues[param.name] = await uploadFullTestTempFile(selectedFile);
          }
        };
        modeSelector.appendChild(btn);
      });
      container.appendChild(modeSelector);
    }

    function renderImagesInput(param, container) {
      const files = [];
      state._testParamValues[param.name] = [];
      const fileInput = document.createElement("input"); fileInput.type = "file"; fileInput.accept = "image/*"; fileInput.multiple = true; fileInput.style.display = "none";
      const dropzone = document.createElement("div"); dropzone.className = "image-dropzone";
      const text = document.createElement("div"); text.className = "image-dropzone-text"; text.textContent = "点击选择或拖拽多张图片到此处";
      const hint = document.createElement("div"); hint.className = "image-dropzone-hint"; hint.textContent = "可多次添加，单张最大 50MB";
      dropzone.appendChild(text); dropzone.appendChild(hint);
      const previewContainer = document.createElement("div"); previewContainer.className = "image-preview-container";
      const counter = document.createElement("div"); counter.className = "image-file-info"; counter.textContent = "已选 0 张";
      function refreshValues() {
        state._testParamValues[param.name] = [];
        previewContainer.innerHTML = "";
        files.forEach((file, index) => {
          const reader = new FileReader();
          reader.onload = (e) => {
            state._testParamValues[param.name][index] = extractPureBase64(e.target.result);
            const item = document.createElement("div"); item.className = "image-preview-item";
            const img = document.createElement("img"); img.src = e.target.result;
            const removeBtn = document.createElement("button"); removeBtn.type = "button"; removeBtn.className = "image-preview-remove"; removeBtn.textContent = "×";
            removeBtn.onclick = () => { files.splice(index, 1); refreshValues(); };
            item.appendChild(img); item.appendChild(removeBtn); previewContainer.appendChild(item);
          };
          reader.readAsDataURL(file);
        });
        counter.textContent = "已选 " + files.length + " 张";
      }
      function addFiles(list) {
        Array.from(list || []).forEach(file => {
          if (!file.type.startsWith("image/")) return;
          if (file.size <= 50 * 1024 * 1024) files.push(file);
        });
        refreshValues();
      }
      dropzone.onclick = () => fileInput.click();
      fileInput.onchange = () => addFiles(fileInput.files);
      dropzone.ondragover = (e) => { e.preventDefault(); dropzone.classList.add("drag-over"); };
      dropzone.ondragleave = () => dropzone.classList.remove("drag-over");
      dropzone.ondrop = (e) => { e.preventDefault(); dropzone.classList.remove("drag-over"); addFiles(e.dataTransfer.files); };
      container.appendChild(fileInput); container.appendChild(dropzone); container.appendChild(previewContainer); container.appendChild(counter);
    }

    function renderFileInput(param, container) {
      const uploadArea = document.createElement("div"); uploadArea.className = "file-upload-area";
      const uploadText = document.createElement("div"); uploadText.className = "image-dropzone-text"; uploadText.textContent = "点击选择或拖拽文件到此处";
      uploadArea.appendChild(uploadText);
      const fi = document.createElement("input"); fi.type = "file"; fi.style.display = "none";
      const widget = param.widget_hint || "";
      if (widget === "audio") fi.accept = "audio/*";
      if (widget === "video") fi.accept = "video/*";
      const infoEl = document.createElement("div");
      const previewEl = document.createElement("div");
      function handleFileUpload(file) {
        if (!file) return;
        if (file.size > 50 * 1024 * 1024) { showToast("文件不能超过 50MB"); return; }
        infoEl.innerHTML = "";
        const info = document.createElement("div"); info.className = "file-info";
        const nameSpan = document.createElement("span"); nameSpan.textContent = file.name;
        const sizeSpan = document.createElement("span"); sizeSpan.style.color = "var(--text-secondary)"; sizeSpan.textContent = "(" + (file.size / 1024).toFixed(1) + " KB)";
        const removeBtn = document.createElement("button"); removeBtn.type = "button"; removeBtn.className = "file-remove-btn"; removeBtn.textContent = "删除";
        removeBtn.onclick = () => { infoEl.innerHTML = ""; previewEl.innerHTML = ""; uploadArea.style.display = "flex"; state._testParamValues[param.name] = undefined; };
        info.appendChild(nameSpan); info.appendChild(sizeSpan); info.appendChild(removeBtn); infoEl.appendChild(info);
        uploadArea.style.display = "none";
        previewEl.innerHTML = "";
        if (file.type.startsWith("image/")) {
          const reader = new FileReader(); reader.onload = (e) => {
            const img = document.createElement("img"); img.src = e.target.result; img.style.maxWidth = "100px"; img.style.maxHeight = "80px"; img.style.borderRadius = "4px"; img.style.marginTop = "6px";
            previewEl.appendChild(img);
          }; reader.readAsDataURL(file);
        } else if (["text/csv", "application/json", "text/plain"].includes(file.type) || file.name.match(/\.(csv|json|txt)$/)) {
          if (file.size < 10240) {
            const reader = new FileReader(); reader.onload = (e) => {
              const allText = String(e.target.result);
              const lines = allText.split("\n").slice(0, 5).join("\n");
              const pre = document.createElement("div"); pre.className = "file-preview-text"; pre.textContent = lines + (allText.split("\n").length > 5 ? "\n..." : "");
              previewEl.appendChild(pre);
            }; reader.readAsText(file);
          }
        }
        uploadFullTestTempFile(file).then(path => { state._testParamValues[param.name] = path; }).catch(err => showToast("文件上传失败: " + err.message));
      }
      uploadArea.onclick = () => fi.click();
      fi.onchange = () => { if (fi.files[0]) handleFileUpload(fi.files[0]); };
      uploadArea.ondragover = (e) => { e.preventDefault(); uploadArea.classList.add("drag-over"); };
      uploadArea.ondragleave = () => { uploadArea.classList.remove("drag-over"); };
      uploadArea.ondrop = (e) => { e.preventDefault(); uploadArea.classList.remove("drag-over"); if (e.dataTransfer.files[0]) handleFileUpload(e.dataTransfer.files[0]); };
      container.appendChild(fi); container.appendChild(uploadArea); container.appendChild(infoEl); container.appendChild(previewEl);
    }

    function renderLiteralInput(param, container) {
      const select = document.createElement("select"); select.className = "input-select";
      const defaultOpt = document.createElement("option"); defaultOpt.value = ""; defaultOpt.textContent = "请选择..."; defaultOpt.disabled = true; defaultOpt.selected = true;
      select.appendChild(defaultOpt);
      (param.widget_options || []).forEach(opt => {
        const o = document.createElement("option"); o.value = opt; o.textContent = opt;
        if (param.default && (_cleanDefaultValue(param.default) === opt)) { o.selected = true; state._testParamValues[param.name] = opt; }
        select.appendChild(o);
      });
      select.addEventListener("change", () => { state._testParamValues[param.name] = select.value; });
      container.appendChild(select);
    }

    function renderUrlInput(param, container) {
      const input = document.createElement("input"); input.type = "url"; input.className = "input-url"; input.placeholder = "https://...";
      input.value = _cleanDefaultValue(param.default);
      input.addEventListener("input", () => { state._testParamValues[param.name] = input.value; });
      if (input.value) state._testParamValues[param.name] = input.value;
      container.appendChild(input);
    }

    function renderDatetimeInput(param, container) {
      const input = document.createElement("input"); input.type = "datetime-local"; input.className = "input-text";
      input.value = _cleanDefaultValue(param.default);
      input.addEventListener("input", () => { state._testParamValues[param.name] = input.value ? new Date(input.value).toISOString() : ""; });
      if (input.value) state._testParamValues[param.name] = new Date(input.value).toISOString();
      container.appendChild(input);
    }

    function renderColorInput(param, container) {
      const wrapper = document.createElement("div"); wrapper.style.display = "flex"; wrapper.style.alignItems = "center"; wrapper.style.gap = "8px";
      const input = document.createElement("input"); input.type = "color"; input.value = _cleanDefaultValue(param.default) || "#000000";
      const label = document.createElement("span"); label.style.fontSize = "13px"; label.style.color = "var(--text-secondary)"; label.textContent = input.value;
      input.addEventListener("input", () => { state._testParamValues[param.name] = input.value; label.textContent = input.value; });
      state._testParamValues[param.name] = input.value;
      wrapper.appendChild(input); wrapper.appendChild(label); container.appendChild(wrapper);
    }

    function renderPasswordInput(param, container) {
      const wrapper = document.createElement("div"); wrapper.style.display = "flex"; wrapper.style.gap = "8px"; wrapper.style.alignItems = "center";
      const input = document.createElement("input"); input.type = "password"; input.className = "input-text"; input.style.flex = "1"; input.placeholder = "请输入密码/密钥";
      const toggleBtn = document.createElement("button"); toggleBtn.type = "button"; toggleBtn.className = "json-toolbar-btn"; toggleBtn.textContent = "显示";
      toggleBtn.onclick = () => { input.type = input.type === "password" ? "text" : "password"; toggleBtn.textContent = input.type === "password" ? "显示" : "隐藏"; };
      input.value = _cleanDefaultValue(param.default);
      input.addEventListener("input", () => { state._testParamValues[param.name] = input.value; });
      if (input.value) state._testParamValues[param.name] = input.value;
      wrapper.appendChild(input); wrapper.appendChild(toggleBtn); container.appendChild(wrapper);
    }

    function initTestDivider() {
      const divider = document.getElementById("testDivider");
      const inputPanel = document.getElementById("testInputPanel");
      const body = document.querySelector(".test-body");
      if (!divider || !inputPanel || !body || divider.dataset.bound === "1") return;
      divider.dataset.bound = "1";
      let isDragging = false;
      divider.addEventListener("mousedown", (e) => { isDragging = true; e.preventDefault(); document.body.style.cursor = "col-resize"; document.body.style.userSelect = "none"; });
      document.addEventListener("mousemove", (e) => {
        if (!isDragging) return;
        const rect = body.getBoundingClientRect();
        let newWidth = e.clientX - rect.left;
        newWidth = Math.max(280, Math.min(newWidth, rect.width * 0.8));
        inputPanel.style.width = newWidth + "px";
      });
      document.addEventListener("mouseup", () => { if (isDragging) { isDragging = false; document.body.style.cursor = ""; document.body.style.userSelect = ""; } });
    }

    async function uploadFullTestTempFile(file) {
      const formData = new FormData();
      formData.append("file", file);
      const headers = {};
      const token = localStorage.getItem("algolib_token");
      if (token) headers.Authorization = "Bearer " + token;
      const resp = await fetch(BASE + "/api/v1/upload-temp", { method: "POST", body: formData, headers });
      const data = await resp.json();
      if (!resp.ok || !data.success) throw new Error(data.detail || data.error || "上传失败");
      return data.path;
    }

    function _csvToRows(text) {
      const lines = String(text || "").trim().split(/\r?\n/).filter(Boolean);
      if (!lines.length) return [];
      const headers = lines[0].split(",").map(x => x.trim());
      return lines.slice(1).map(line => {
        const cells = line.split(",").map(x => x.trim());
        const row = {};
        headers.forEach((h, i) => { row[h || `列${i + 1}`] = parseScalarToken(cells[i] ?? ""); });
        return row;
      });
    }

    function normalizeFullTestValue(param, value) {
      const widget = param.widget_hint || inferParamWidget(param);
      const type = String(param.type || param.annotation || "str");
      if (value === undefined || value === null || value === "") return value;
      if (["int", "float", "bool", "image", "images", "file", "audio", "video", "url", "datetime", "color", "password"].includes(widget)) return value;
      if (["list", "dict", "json", "dataframe"].includes(widget)) {
        if (typeof value !== "string") return value;
        try { return JSON.parse(value); } catch (e) {
          if (widget === "dataframe" && value.includes("\n") && value.includes(",")) return _csvToRows(value);
          if (widget === "list") return value.split(/\r?\n|,/).map(x => parseScalarToken(x)).filter(x => x !== "");
          return value;
        }
      }
      return parseParamValueByType(type, value);
    }

    function collectFullTestParams() {
      const algo = state._testAlgo;
      const payload = {};
      for (const param of (algo?.params || [])) {
        const name = param.name;
        const skip = document.querySelector(`[data-test-skip="${CSS.escape(name)}"]`);
        if (skip?.checked) continue;
        payload[name] = normalizeFullTestValue(param, state._testParamValues[name]);
      }
      return payload;
    }
