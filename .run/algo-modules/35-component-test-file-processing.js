/*
 * AlgoLib module: 35-component-test-file-processing.js
 * ????????????/?????????????????
 * ???? .run/algo-lib-check.js ??????????????????????
 */

    function _removeImageParam(name) {
      const st = _getFileState(name);
      if (st.preview) { URL.revokeObjectURL(st.preview); }
      state._tpFileState[name] = { mode: st.mode || "base64" };
      _rerenderParamCard(name);
    }

    function _removeFileParam(name) { _removeImageParam(name); }

    function _removeImageAt(name, idx) {
      const st = _getFileState(name);
      if (st.previews?.[idx]) URL.revokeObjectURL(st.previews[idx]);
      st.files = (st.files || []).filter((_, i) => i !== idx);
      st.previews = (st.previews || []).filter((_, i) => i !== idx);
      _rerenderParamCard(name);
    }

    function _onImageDrop(event, name) {
      const file = event.dataTransfer?.files?.[0];
      if (file && file.type.startsWith("image/")) _processImageFile(name, file);
    }

    function _onImageFileChange(event, name) {
      const file = event.target.files?.[0];
      if (file) _processImageFile(name, file);
    }

    function _onMultiImageFileChange(event, name) {
      const files = Array.from(event.target.files || []);
      if (!files.length) return;
      const st = _getFileState(name);
      st.files = st.files || [];
      st.previews = st.previews || [];
      files.forEach(f => {
        const url = URL.createObjectURL(f);
        st.files.push(f);
        st.previews.push(url);
      });
      _rerenderParamCard(name);
    }

    function _onFileDrop(event, name) {
      const file = event.dataTransfer?.files?.[0];
      if (file) _processGenericFile(name, file);
    }

    function _onFileChange(event, name) {
      const file = event.target.files?.[0];
      if (file) _processGenericFile(name, file);
    }

    function _processImageFile(name, file) {
      const st = _getFileState(name);
      if (st.preview) URL.revokeObjectURL(st.preview);
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        st.width = img.naturalWidth;
        st.height = img.naturalHeight;
        _rerenderParamCard(name);
      };
      img.src = url;
      st.file = file;
      st.preview = url;
      st.filename = file.name;
      st.size = file.size;
      st.base64 = null; // will be lazily computed at run time
      if (st.mode === "path") {
        _uploadTempFileAndSetPath(name, file);
      }
      _rerenderParamCard(name);
    }

    function _processGenericFile(name, file) {
      const st = _getFileState(name);
      if (st.preview) URL.revokeObjectURL(st.preview);
      const url = URL.createObjectURL(file);
      st.file = file;
      st.preview = url;
      st.filename = file.name;
      st.size = file.size;
      st.base64 = null;
      if (st.mode === "path") {
        _uploadTempFileAndSetPath(name, file);
      }
      _rerenderParamCard(name);
    }

    async function _uploadTempFileAndSetPath(name, file) {
      const bar = qs(`#tp-input-${name} .bar`);
      if (bar) bar.style.width = "30%";
      try {
        const fd = new FormData();
        fd.append("file", file);
        const resp = await fetch("/api/v1/upload-temp", { method: "POST", body: fd });
        const data = await resp.json();
        const st = _getFileState(name);
        st.path = data.path;
        if (bar) bar.style.width = "100%";
        _rerenderParamCard(name);
      } catch (e) {
        showToast("文件上传失败: " + e.message);
      }
    }

    /**
     * 从 FileReader.readAsDataURL 的结果中提取纯 base64 字符串（去除 data:...;base64, 前缀）
     * 并修复 padding，确保长度是 4 的倍数。
     */
    function extractPureBase64(dataUrl) {
      if (!dataUrl || typeof dataUrl !== "string") return "";
      let b64 = dataUrl;
      const commaIdx = dataUrl.indexOf(",");
      if (commaIdx !== -1 && dataUrl.startsWith("data:")) {
        b64 = dataUrl.substring(commaIdx + 1);
      }
      b64 = b64.replace(/\s/g, "");
      const rem = b64.length % 4;
      if (rem === 1) b64 += "===";       // 理论上不应出现，容错处理
      else if (rem === 2) b64 += "==";
      else if (rem === 3) b64 += "=";
      return b64;
    }

    async function _readFileAsBase64(file) {
      return new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(extractPureBase64(r.result)); // 纯 base64，不含前缀
        r.onerror = reject;
        r.readAsDataURL(file);
      });
    }
