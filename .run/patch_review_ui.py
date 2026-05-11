from pathlib import Path
p = Path('src/browser/pages/algo-lib.html')
text = p.read_text(encoding='utf-8')

# 1. Insert review-specific status label helper after statusLabel.
needle = '''    function statusLabel(status) {
      const labels = {
        published: "公有",
        approved: "已通过",
        reviewing: "审核中",
        rejected: "已驳回",
        draft: "私有",
        private: "私有",
      };
      return labels[status] || status || "私有";
    }
'''
insert = needle + '''
    function reviewStatusLabel(status) {
      const labels = {
        published: "已通过",
        approved: "已通过",
        reviewing: "审核中",
        rejected: "已驳回",
        draft: "待提交",
        private: "待提交",
      };
      return labels[status] || status || "待提交";
    }
'''
if needle in text and 'function reviewStatusLabel(status)' not in text:
    text = text.replace(needle, insert)

# 2. Component cards: remove first duplicated submit block and remove admin approve button.
block = '''        if (canSubmitAlgorithm(item) || (isOwner && status === "published" && item.hasReviewDraft)) {
          btns.push(`<button class="warning" onclick="window.openSubmitModal('${esc(id)}')">${status === "rejected" ? "重新提交" : "提交审核"}</button>`);
        }
'''
text = text.replace(block, '')
text = text.replace('''        if (isAdmin && status === "reviewing") btns.push(`<button onclick="window.approveReview('${esc(id)}')">审核通过</button>`);
''', '''        if (isAdmin && status === "reviewing") btns.push(`<button class="success" onclick="window.openAdminPublishModal('${esc(id)}')">正式发布</button>`);
''')
# The same text occurs in templates; replacement above handles both occurrences.

# 3. Template duplicated delete button.
dup = '''        if (isAdmin || (canManage && status !== "published")) btns.push(`<button class="danger" onclick="window.deleteAlgorithm('${esc(id)}')">删除</button>`);
        if (isAdmin || (canManage && status !== "published")) btns.push(`<button class="danger" onclick="window.deleteAlgorithm('${esc(id)}')">删除</button>`);
'''
text = text.replace(dup, '''        if (isAdmin || (canManage && status !== "published")) btns.push(`<button class="danger" onclick="window.deleteAlgorithm('${esc(id)}')">删除</button>`);
''')

# 4. Editor top: admin always uses formal publish for algorithm/template editor, normal users submit only once.
old = '''            ${isComponentEditor && state.currentUser?.role === "admin" && !isPublicItem(e.algo) ? `<button data-status-btn="1" class="success" onclick="window.openAdminPublishModal('${esc(e.id)}')">正式发布</button>` : ""}
            ${isComponentEditor && state.currentUser?.role !== "admin" && canSubmitAlgorithm(e.algo) ? `<button data-status-btn="1" onclick="window.openSubmitModal('${esc(e.id)}')">${getStatus(e.algo) === "rejected" ? "重新提交" : "提交审核"}</button>` : ""}
            ${isComponentEditor && ownsAlgorithm(e.algo) && getStatus(e.algo) === "published" && e.algo.hasReviewDraft ? `<button data-status-btn="1" class="warning" onclick="window.openSubmitModal('${esc(e.id)}')">提交审核</button>` : ""}
'''
new = '''            ${isComponentEditor && state.currentUser?.role === "admin" ? `<button data-status-btn="1" class="success" onclick="window.openAdminPublishModal('${esc(e.id)}')">正式发布</button>` : ""}
            ${isComponentEditor && state.currentUser?.role !== "admin" && (canSubmitAlgorithm(e.algo) || (ownsAlgorithm(e.algo) && getStatus(e.algo) === "published" && e.algo.hasReviewDraft)) ? `<button data-status-btn="1" onclick="window.openSubmitModal('${esc(e.id)}')">${getStatus(e.algo) === "rejected" ? "重新提交" : "提交审核"}</button>` : ""}
'''
text = text.replace(old, new)

# 5. Dynamic editor buttons: admin formal publish only, no submit for admin.
old = '''      if (isComponentEditor && isAdminUser && !isPublicItem(e.algo)) {
        addBtn("正式发布", "success", () => window.openAdminPublishModal(id));
      } else if (isComponentEditor && canSubmitAlgorithm(e.algo)) {
        addBtn(status === "rejected" ? "重新提交" : "提交审核", "", () => window.openSubmitModal(id));
      } else if (isComponentEditor && ownsAlgorithm(e.algo) && status === "published" && e.algo.hasReviewDraft) {
        addBtn("提交审核", "warning", () => window.openSubmitModal(id));
      } else if (isComponentEditor && ownsAlgorithm(e.algo) && status === "reviewing") {
        addBtn("撤回审核", "", () => window.withdrawReview(id));
      }
'''
new = '''      if (isComponentEditor && isAdminUser) {
        addBtn("正式发布", "success", () => window.openAdminPublishModal(id));
      } else if (isComponentEditor && (canSubmitAlgorithm(e.algo) || (ownsAlgorithm(e.algo) && status === "published" && e.algo.hasReviewDraft))) {
        addBtn(status === "rejected" ? "重新提交" : "提交审核", "", () => window.openSubmitModal(id));
      } else if (isComponentEditor && ownsAlgorithm(e.algo) && status === "reviewing") {
        addBtn("撤回审核", "", () => window.withdrawReview(id));
      }
'''
text = text.replace(old, new)

# 6. Review page table headings/actions/status label.
text = text.replace('<thead><tr><th>算法</th><th>命名空间</th><th style="width:90px;white-space:nowrap">状态</th><th style="width:80px">类型</th><th style="width:240px;white-space:nowrap">操作</th></tr></thead>', '<thead><tr><th>算法</th><th>命名空间</th><th style="width:110px;white-space:nowrap">审核状态</th><th style="width:80px">类型</th><th style="width:240px;white-space:nowrap">操作</th></tr></thead>')
text = text.replace('<td style="white-space:nowrap"><span class="tag ${statusClass(rowStatus)}">${esc(statusLabel(rowStatus))}</span></td>', '<td style="white-space:nowrap"><span class="tag ${statusClass(rowStatus)}">${esc(reviewStatusLabel(rowStatus))}</span></td>')
text = text.replace('''                  ${live && rowStatus === "published" && live.hasReviewDraft ? `<button onclick="window.openSubmitModal('${esc(liveId)}')">提交审核</button>` : ""}
''', '')
text = text.replace('''                  ${live && rowStatus === "reviewing" ? `<button onclick="window.approveReview('${esc(liveId)}')">通过</button><button class="danger" onclick="window.rejectReview('${esc(liveId)}')">驳回</button>` : ""}
''', '''                  ${live && rowStatus === "reviewing" ? `<button class="success" onclick="window.openAdminPublishModal('${esc(liveId)}')">正式发布</button><button class="danger" onclick="window.rejectReview('${esc(liveId)}')">驳回</button>` : ""}
''')

# 7. Admin publish modal add keep-current option.
text = text.replace('''      const bumpOptions = [
        { type: "patch", label: "修订版本 (patch)", v: _bumpSemver(version, "patch") },
        { type: "minor", label: "小版本 (minor)", v: _bumpSemver(version, "minor") },
        { type: "major", label: "大版本 (major)", v: _bumpSemver(version, "major") },
      ];
''', '''      const bumpOptions = [
        { type: "keep", label: "保持当前版本", v: version },
        { type: "patch", label: "补丁版本 (patch)", v: _bumpSemver(version, "patch") },
        { type: "minor", label: "次版本 (minor)", v: _bumpSemver(version, "minor") },
        { type: "major", label: "主版本 (major)", v: _bumpSemver(version, "major") },
      ];
''')

p.write_text(text, encoding='utf-8')