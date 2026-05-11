from pathlib import Path
p=Path('src/browser/pages/algo-lib.html')
text=p.read_text(encoding='utf-8')
text=text.replace('canSubmitAlgorithm(item) || (isOwner && status === "published" && item.hasReviewDraft)', 'canSubmitAlgorithm(item)')
text=text.replace('canSubmitAlgorithm(e.algo) || (ownsAlgorithm(e.algo) && getStatus(e.algo) === "published" && e.algo.hasReviewDraft)', 'canSubmitAlgorithm(e.algo)')
text=text.replace('''      } else if (isComponentEditor && (canSubmitAlgorithm(e.algo) || (ownsAlgorithm(e.algo) && status === "published" && e.algo.hasReviewDraft))) {
''','''      } else if (isComponentEditor && canSubmitAlgorithm(e.algo)) {
''')
# Remove now-unreachable old special branch if any remains.
text=text.replace('''      } else if (isComponentEditor && ownsAlgorithm(e.algo) && status === "published" && e.algo.hasReviewDraft) {
        addBtn("提交审核", "warning", () => window.openSubmitModal(id));
''','')
p.write_text(text,encoding='utf-8')