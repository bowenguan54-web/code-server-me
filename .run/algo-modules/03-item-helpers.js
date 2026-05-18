/*
 * AlgoLib module: 03-item-helpers.js
 * ?????/???????????????????????
 * ???? .run/algo-lib-check.js ??????????????????????
 */

    function pageTitle(page) {
      return {
        components: "算法",
        "components-general": "通用算法",
        "components-system": "系统算法",
        "components-domain": "领域算法",
        templates: "算法模板",
        "templates-general": "通用模板",
        "templates-system": "系统模板",
        "templates-domain": "领域模板",
        snippets: "代码片段",
        "my-algos": "我的算法",
        review: "算法审核",
        settings: "系统设置"
      }[page] || page;
    }
    function getName(item) { return item.zhName || item.zh_name || item.name || item.funcName || item.id || "未命名"; }
    function getDesc(item) { return item.zhDescription || item.zh_description || item.description || item.body || "暂无描述"; }
    function getTags(item) { return item.zhTags || item.zh_tags || item.tags || []; }
    function getStatus(item) { return item.publishStatus || item.publish_status || item.lifecycleStatus || (item.published ? "published" : "draft"); }
    function isPublicItem(item) {
      const status = getStatus(item);
      const ownerId = item?.ownerId || item?.owner_id || "";
      const scope = item?.scope || "";
      return status === "published" || (!status && ownerId === "system" && scope === "team");
    }
    function privacyLabel(item) {
      return isPublicItem(item) ? "\u516c\u6709" : "\u79c1\u6709";
    }
    function getNs(item, page) {
      if (page === "snippets") return item.name || "";
      return item.callPrefix || item.displayNamespace || "";
    }
    function namespacePrefix(item) {
      return `alg.${item.namespace || ""}.`;
    }
    function namespaceFunction(item) {
      return item.funcName || String(item.callPrefix || item.displayNamespace || "").split(".").pop() || "";
    }
    function groupKey(item, page) {
      if (page === "snippets") return (item.tags && item.tags[0]) || item.scope || "default";
      return String(item.namespace || "default").split(".")[0] || "default";
    }
    function categoryLabel(namespace, page) {
      const category = (state.categories[page] || []).find(item => item.namespace === namespace);
      return category ? (category.zh_name || category.namespace) : namespace;
    }
    function statusClass(status) {
      if (status === "published" || status === "approved") return "success";
      if (status === "reviewing") return "warning";
      if (status === "rejected" || status === "deprecated") return "danger";
      return "";
    }
    function statusLabel(status) {
      return {
        published: "公有",
        approved: "已通过",
        reviewing: "审核中",
        rejected: "审核未通过",
        draft: "私有",
        deprecated: "已下架"
      }[status] || status;
    }
    function reviewStatusLabel(status) {
      return {
        published: "已通过",
        approved: "已通过",
        reviewing: "审核中",
        rejected: "已驳回",
        draft: "待提交",
        private: "待提交"
      }[status] || status || "待提交";
    }
    function ownsAlgorithm(item) {
      const ownerId = item?.ownerId || item?.owner_id || "system";
      return !!(state.currentUser?.id && ownerId === state.currentUser.id);
    }
    function canManageAlgorithm(item) {
      if (isPublicItem(item)) return false;
      return state.currentUser?.role === "admin" || ownsAlgorithm(item);
    }
    function canSubmitAlgorithm(item) {
      return ownsAlgorithm(item) && ["draft", "rejected"].includes(getStatus(item));
    }
    function ownsSnippet(item) {
      const ownerId = item?.ownerId || item?.owner_id || "";
      return !!(state.currentUser?.id && (ownerId === state.currentUser.id || (!ownerId && item?.scope === "private")));
    }
    function canSubmitSnippet(item) {
      return ownsSnippet(item) && ["draft", "rejected"].includes(getStatus(item));
    }
    function parseVersion(value) {
      const parts = String(value || "1.0.0").split(".").map(part => Number.parseInt(part, 10) || 0);
      return [parts[0] || 0, parts[1] || 0, parts[2] || 0];
    }
    function versionUpgradeOptions(current) {
      const [major, minor, patch] = parseVersion(current);
      return [
        { value: current || "1.0.0", type: "keep", label: `保持当前版本 ${current || "1.0.0"}` },
        { value: `${major}.${minor}.${patch + 1}`, type: "patch", label: `补丁版本：${current || "1.0.0"} → ${major}.${minor}.${patch + 1}` },
        { value: `${major}.${minor + 1}.0`, type: "minor", label: `次版本：${current || "1.0.0"} → ${major}.${minor + 1}.0` },
        { value: `${major + 1}.0.0`, type: "major", label: `主版本：${current || "1.0.0"} → ${major + 1}.0.0` }
      ];
    }
    function safeId(id) { return encodeURIComponent(id); }
    function currentModuleKind(page) {
      if (page === "my-algos" || page === "components" || page.startsWith("components-")) return "component";
      if (page === "templates" || page.startsWith("templates-")) return "template";
      return "snippet";
    }

    function parentPageOf(page) {
      if (page === "components-general" || page === "components-system" || page === "components-domain") return "components";
      if (page === "templates-general" || page === "templates-system" || page === "templates-domain") return "templates";
      return page;
    }
