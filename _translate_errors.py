"""Bulk-translate remaining English HTTPException detail messages to Chinese."""
import re

FILE = r'e:\code-server-me\algo_service\routers\algorithms.py'

with open(FILE, 'r', encoding='utf-8') as f:
    content = f.read()

replacements = [
    # _save_review_draft / _delete_review_draft
    ('detail=f"Failed to save review draft: {exc}"', 'detail=f"保存审核草稿失败：{exc}"'),
    ('detail=f"Failed to delete review draft: {exc}"', 'detail=f"删除审核草稿失败：{exc}"'),
    # _ensure_callable_status
    ('detail=f"Algorithm is not callable while status is {status}"',
     'detail=f"算法在 {status} 状态下不可调用"'),
    # _validate_identifier
    ('detail=f"{field_name} must contain letters, numbers, and underscores"',
     'detail=f"{field_name} 只能包含字母、数字和下划线，且必须以字母开头"'),
    # _normalize_category
    ('detail="category must not be empty"', 'detail="分类不能为空"'),
    # _upsert_algo_meta
    ('detail=f"Function not found in source: {func_name}"',
     'detail=f"源码中未找到函数定义：{func_name}"'),
    ('detail=f"Function not found after metadata update: {func_name}"',
     'detail=f"元数据更新后源码中未找到函数：{func_name}"'),
    # _ensure_folder_kind_compatible
    ('detail=f"Folder already contains {existing_kind} entries; cannot add {module_kind}"',
     'detail=f"该目录已包含 {existing_kind} 类型的算法，无法添加 {module_kind} 类型"'),
    # _rename_function_in_source
    ('detail=f"Function not found in source: {old_name}"',
     'detail=f"源码中未找到函数：{old_name}"'),
    # _append_entry_version
    ('detail=f"Failed to write version history: {exc}"', 'detail=f"写入版本历史失败：{exc}"'),
    # _apply_review_draft
    ('detail="Review draft files must be a list"', 'detail="审核草稿的 files 字段必须是列表"'),
    ('detail=f"Invalid draft filename: {filename}"\n                ast.parse(content)',
     'detail=f"无效的草稿文件名：{filename}"\n                ast.parse(content)'),
    ('detail=f"Invalid draft filename: {filename}"\n                    target.parent.mkdir',
     'detail=f"草稿文件路径越界：{filename}"\n                    target.parent.mkdir'),
    ('detail="Invalid review draft file"', 'detail="无效的审核草稿文件格式"'),
    ('detail=f"Failed to update package manifest: {exc}"', 'detail=f"更新包清单失败：{exc}"'),
    ('detail=f"Failed to apply review draft: {exc}"', 'detail=f"应用审核草稿失败：{exc}"'),
    # _load_entry_module
    ('detail="Cannot load algorithm module"', 'detail="无法加载算法模块"'),
    ('detail=f"Module load error: {exc}"', 'detail=f"算法模块加载失败：{exc}"'),
    # _execute_entry
    ('detail=f"Function \'{entry.func_name}\' not found in module"',
     'detail=f"模块中未找到函数 \'{entry.func_name}\'"'),
    # create category
    ('detail=f"Category already exists: {name}"', 'detail=f"分类已存在：{name}"'),
    ('detail=f"Failed to create category: {exc}"', 'detail=f"创建分类失败：{exc}"'),
    # update category
    ('detail=f"Category not found: {namespace}"', 'detail=f"分类不存在：{namespace}"'),
    ('detail=f"Cannot read category config: {exc}"', 'detail=f"读取分类配置失败：{exc}"'),
    ('detail=f"Target category already exists: {new_namespace}"', 'detail=f"目标分类已存在：{new_namespace}"'),
    ('detail=f"Failed to update category: {exc}"', 'detail=f"更新分类失败：{exc}"'),
    # delete category
    ('detail="action=move requires a target namespace"', 'detail="移动操作需要指定目标命名空间（target 参数）"'),
    ('detail=f"Target category not found: {target_namespace}"', 'detail=f"目标分类不存在：{target_namespace}"'),
    ('detail=f"Failed to move category: {exc}"', 'detail=f"移动分类失败：{exc}"'),
    ('detail=f"Failed to delete category: {exc}"', 'detail=f"删除分类失败：{exc}"'),
    ('detail="action must be \'delete\' or \'move\'"', 'detail="action 参数必须为 delete 或 move"'),
    # subcategory
    ('detail=f"Parent category not found: {namespace}"', 'detail=f"父分类不存在：{namespace}"'),
    ('detail=f"Subcategory already exists: {child_namespace}"', 'detail=f"子分类已存在：{child_namespace}"'),
    ('detail=f"Failed to create subcategory: {exc}"', 'detail=f"创建子分类失败：{exc}"'),
    # algorithm get/list/versions
    ('detail=f"Algorithm not found: {algorithm_id}"', 'detail=f"算法不存在：{algorithm_id}"'),
    ('detail=f"Algorithm not found: {base_id}"', 'detail=f"算法不存在：{base_id}"'),
    # delete algorithm
    ('detail=f"Failed to restore status: {exc}"', 'detail=f"恢复状态失败：{exc}"'),
    ('detail=f"Package root not found: {package_root}"', 'detail=f"算法包目录不存在：{package_root}"'),
    ('detail="Refusing to delete package outside algorithm root"',
     'detail="不允许删除算法根目录外的算法包"'),
    ('detail=f"Failed to delete package algorithm: {exc}"', 'detail=f"删除算法包失败：{exc}"'),
    ('detail=f"Failed to delete algorithm: {exc}"', 'detail=f"删除算法失败：{exc}"'),
    # algorithm source
    ('detail=f"Source file not found: {source_path}"', 'detail=f"源文件不存在：{source_path}"'),
    # review draft save
    ('detail="Field \'files\' must be a non-empty list"', 'detail="files 字段必须是非空列表"'),
    ('detail="Each file must be an object"', 'detail="每个文件条目必须是对象"'),
    ('detail=f"Invalid Python filename: {filename}"', 'detail=f"无效的 Python 文件名：{filename}"'),
    # metadata update
    ('detail="Package category is determined by its package manifest"',
     'detail="算法包的分类由其 algopack.json 决定，不可在此修改"'),
    ('detail="Package export renaming is not supported here"',
     'detail="算法包导出函数重命名不支持此操作"'),
    ('detail="Metadata updated but algorithm could not be reloaded"',
     'detail="元数据已更新但无法重新加载算法，请刷新页面"'),
    ('detail="namespace must look like alg.<category>.<function>"',
     'detail="namespace 格式应为 alg.<分类>.<函数名>"'),
    ('detail="Category namespace is determined by the algorithm folder"',
     'detail="分类命名空间由算法所在目录决定，请直接移动目录"'),
    ('detail=f"Target algorithm file already exists: {target_file}"',
     'detail=f"目标算法文件已存在：{target_file}"'),
    ('detail=f"Failed to update metadata: {exc}"', 'detail=f"更新元数据失败：{exc}"'),
    # save source
    ('detail="Use package file APIs for package algorithms"',
     'detail="算法包请使用文件级 API 操作"'),
    ('detail=f"Failed to save source: {exc}"', 'detail=f"保存源码失败：{exc}"'),
    # namespace patch
    ('detail="Field \'new_namespace\' is required"', 'detail="new_namespace 字段不能为空"'),
    ('detail="new_namespace must start with alg."', 'detail="new_namespace 必须以 alg. 开头"'),
    ('detail="Namespace must look like alg.<category>.<function_name>"',
     'detail="命名空间格式应为 alg.<分类>.<函数名>"'),
    ('detail="Namespace updated but algorithm could not be reloaded"',
     'detail="命名空间已更新但无法重新加载算法，请刷新页面"'),
    # algorithm folder file ops
    ('detail=f"File already exists: {filename}"', 'detail=f"文件已存在：{filename}"'),
    ('detail=f"Failed to create file: {exc}"', 'detail=f"创建文件失败：{exc}"'),
    ('detail="old_name and new_name are required"', 'detail="old_name 和 new_name 字段不能为空"'),
    ('detail="new_name must be a plain .py filename"', 'detail="new_name 必须是合法的 .py 文件名"'),
    ('detail="Cannot rename to __init__.py"', 'detail="不允许重命名为 __init__.py"'),
    ('detail=f"File not found: {old_name}"', 'detail=f"文件不存在：{old_name}"'),
    ('detail=f"File already exists: {new_name}"', 'detail=f"目标文件已存在：{new_name}"'),
    ('detail=f"Rename failed: {exc}"', 'detail=f"重命名失败：{exc}"'),
    # run-source
    ('detail="Field \'content\' must not be empty"', 'detail="content 字段不能为空"'),
    ('detail="Field \'args\' must be a list"', 'detail="args 字段必须是列表"'),
    ('detail="Field \'kwargs\' must be an object"', 'detail="kwargs 字段必须是字典"'),
    ('detail=f"Run source failed: {exc}"', 'detail=f"代码执行失败：{exc}"'),
    # run registered
    ('detail="Fields \'namespace\' and \'function\' are required"',
     'detail="namespace 和 function 字段不能为空"'),
    # external invoke
    ('detail="Algorithm is not published"', 'detail="该算法未发布，无法通过外部接口调用"'),
    # upload temp
    ('detail=f"Upload failed: {exc}"', 'detail=f"文件上传失败：{exc}"'),
    # invoke docs
    ('detail=f"No published component found for: {call_namespace}"',
     'detail=f"未找到已发布的组件：{call_namespace}"'),
    # registry
    ('detail="Registry not initialized"', 'detail="注册表未初始化"'),
    # folder_config not found for namespace patch
    ('detail=f"folder_config.json not found for {entry.id}"',
     'detail=f"算法 {entry.id} 的 folder_config.json 不存在"'),
    # Algorithm not found for namespace
    ('detail=f"Algorithm not found: {namespace}.{func_name}"',
     'detail=f"算法不存在：{namespace}.{func_name}"'),
    # Algorithm not found in various endpoints
    ('detail=f"Algorithm not found: {call_namespace}"', 'detail=f"算法不存在：{call_namespace}"'),
]

original = content
for old, new in replacements:
    if old in content:
        content = content.replace(old, new)
        print(f'Replaced: {old[:60]}...')
    else:
        print(f'NOT FOUND: {old[:60]}...')

with open(FILE, 'w', encoding='utf-8') as f:
    f.write(content)

changed = content != original
print(f'\nDone. File {"changed" if changed else "unchanged"}.')
