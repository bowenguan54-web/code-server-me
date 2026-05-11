from pathlib import Path
p=Path('src/browser/pages/algo-lib.html')
text=p.read_text(encoding='utf-8')
needle='''    function statusLabel(status) {
      return {
        published: "公有",
        approved: "已通过",
        reviewing: "审核中",
        rejected: "审核未通过",
        draft: "私有",
        deprecated: "已下架"
      }[status] || status;
    }
'''
insert=needle+'''    function reviewStatusLabel(status) {
      return {
        published: "已通过",
        approved: "已通过",
        reviewing: "审核中",
        rejected: "已驳回",
        draft: "待提交",
        private: "待提交"
      }[status] || status || "待提交";
    }
'''
if 'function reviewStatusLabel(status)' not in text:
    text=text.replace(needle, insert)
text=text.replace('''        if (isAdmin && status === "reviewing") btns.push(`<button class="success" onclick="window.openAdminPublishModal('${esc(id)}')">正式发布</button>`);
''','')
text=text.replace('''          btns.push(`<button onclick="window.approveSnippetReview('${esc(id)}')">审核通过</button>`);
          btns.push(`<button class="danger" onclick="window.rejectSnippetReview('${esc(id)}')">驳回</button>`);
''','''          btns.push(`<button class="success" onclick="window.publishSnippet('${esc(id)}')">正式发布</button>`);
          btns.push(`<button class="danger" onclick="window.rejectSnippetReview('${esc(id)}')">驳回</button>`);
''')
text=text.replace('''        if (isAdmin && status === "approved") btns.push(`<button class="success" onclick="window.publishSnippet('${esc(id)}')">正式发布</button>`);
''','')
p.write_text(text,encoding='utf-8')