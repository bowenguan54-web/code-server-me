from pathlib import Path
p=Path('src/browser/pages/algo-lib.html')
text=p.read_text(encoding='utf-8')
text=text.replace('''      if (!canSubmitAlgorithm(item) && !(ownsAlgorithm(item) && getStatus(item) === "published" && item.hasReviewDraft)) {
        showToast("只能提交您自己的私有算法");
        return;
      }
''','''      if (!canSubmitAlgorithm(item)) {
        showToast("只能提交您自己的私有草稿或被驳回算法");
        return;
      }
''')
p.write_text(text,encoding='utf-8')