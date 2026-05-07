"""
In-memory algorithm registry with support for:

- single-file component folders (folder_config.json)
- multi-file algorithm packages (algopack.json)
"""

from __future__ import annotations

import json
import logging
import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

MODULE_KINDS = {"component", "template", "snippet"}


def normalize_module_kind(value: Any) -> str:
    """Return a supported module kind, defaulting to component."""

    normalized = str(value or "component").strip().lower()
    if normalized not in MODULE_KINDS:
        logger.warning("Unsupported module_kind '%s'; falling back to component", value)
        return "component"
    return normalized


@dataclass
class PackageFile:
    filename: str
    relative_path: str
    content: str
    is_entry: bool = False
    functions: list[dict[str, Any]] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
      return {
          "filename": self.filename,
          "relative_path": self.relative_path,
          "content": self.content,
          "is_entry": self.is_entry,
          "functions": self.functions,
      }


@dataclass
class AlgorithmPackage:
    package_id: str
    name: str
    zh_name: str
    namespace: str
    version: str
    entry_file: str
    exports: list[str]
    files: list[PackageFile]
    dependencies: dict[str, Any]
    root_path: str
    zh_description: str = ""
    zh_tags: list[str] = field(default_factory=list)
    published: bool = True
    module_kind: str = "component"
    is_package: bool = True

    def to_dict(self) -> dict[str, Any]:
        return {
            "package_id": self.package_id,
            "name": self.name,
            "zh_name": self.zh_name,
            "namespace": self.namespace,
            "version": self.version,
            "entry_file": self.entry_file,
            "entry": self.entry_file,
            "exports": self.exports,
            "files": [file.to_dict() for file in self.files],
            "dependencies": self.dependencies,
            "root_path": self.root_path,
            "zh_description": self.zh_description,
            "zh_tags": self.zh_tags,
            "published": self.published,
            "module_kind": self.module_kind,
            "is_package": self.is_package,
        }


@dataclass
class AlgorithmEntry:
    id: str
    call_prefix: str
    namespace: str
    func_name: str
    type: str  # "component" | "template" | "snippet"
    source_file: str
    zh_name: str
    zh_description: str
    zh_tags: list[str]
    en_description: str
    params: list[dict]
    return_type: str
    snippet_body: str
    call_snippet: str
    version: str
    folder_path: str
    input_example: str = ""
    owner_id: str = "system"
    package_id: str | None = None
    package_root: str | None = None


class AlgorithmRegistry:
    def __init__(self) -> None:
        self._store: dict[str, AlgorithmEntry] = {}
        self._packages: dict[str, AlgorithmPackage] = {}
        self._watch_roots: list[str] = []

    # ------------------------------------------------------------------
    # Scanning
    # ------------------------------------------------------------------

    def scan_directory(self, root_dir: str) -> None:
        from .ast_parser import AstParser

        root_dir = os.path.abspath(root_dir)
        if root_dir not in self._watch_roots:
            self._watch_roots.append(root_dir)

        for dirpath, _dirnames, filenames in os.walk(root_dir):
            if "algopack.json" in filenames:
                try:
                    self._scan_package_dir(dirpath, root_dir, AstParser)
                except Exception as exc:
                    logger.error("Failed to scan package %s: %s", dirpath, exc)
                continue

            if "folder_config.json" in filenames:
                try:
                    self._scan_single_dir(dirpath, filenames, root_dir, AstParser)
                except Exception as exc:
                    logger.error("Failed to scan folder %s: %s", dirpath, exc)

    def rescan_file(self, file_path: str) -> None:
        from .ast_parser import AstParser

        abs_path = os.path.abspath(file_path)
        package = self._find_package_by_path(abs_path)
        if package is not None:
            self._rescan_package_root(package.root_path, AstParser)
            return

        self.unregister_by_file(abs_path)
        dirpath = os.path.dirname(abs_path)
        config_path = os.path.join(dirpath, "folder_config.json")
        if not os.path.exists(config_path):
            return
        with open(config_path, "r", encoding="utf-8") as fh:
            config: dict[str, Any] = json.load(fh)
        namespace = str(config.get("namespace", "")).strip()
        folder_type = normalize_module_kind(config.get("module_kind", config.get("type", "component")))
        owner_id = str(config.get("owner_id", "system")).strip() or "system"
        if not namespace:
            return
        root = self._find_watch_root(dirpath) or dirpath
        functions = AstParser.extract_functions(abs_path)
        for func_info in functions:
            entry = self._build_entry(
                func_info=func_info,
                namespace=namespace,
                folder_type=folder_type,
                file_path=abs_path,
                dirpath=dirpath,
                root_dir=root,
                owner_id=owner_id,
            )
            self.register(entry)

    def _scan_single_dir(self, dirpath: str, filenames: list[str], root_dir: str, ast_parser: Any) -> None:
        config_path = os.path.join(dirpath, "folder_config.json")
        with open(config_path, "r", encoding="utf-8") as fh:
            config: dict[str, Any] = json.load(fh)

        namespace = str(config.get("namespace", "")).strip()
        folder_type = normalize_module_kind(config.get("module_kind", config.get("type", "component")))
        owner_id = str(config.get("owner_id", "system")).strip() or "system"
        if not namespace:
            return

        for filename in filenames:
            if not filename.endswith(".py") or filename == "__init__.py":
                continue
            file_path = os.path.join(dirpath, filename)
            functions = ast_parser.extract_functions(file_path)
            for func_info in functions:
                entry = self._build_entry(
                    func_info=func_info,
                    namespace=namespace,
                    folder_type=folder_type,
                    file_path=file_path,
                    dirpath=dirpath,
                    root_dir=root_dir,
                    owner_id=owner_id,
                )
                self.register(entry)

    def _scan_package_dir(self, dirpath: str, root_dir: str, ast_parser: Any) -> AlgorithmPackage:
        manifest_path = os.path.join(dirpath, "algopack.json")
        with open(manifest_path, "r", encoding="utf-8") as fh:
            manifest: dict[str, Any] = json.load(fh)

        namespace = str(manifest.get("namespace", "")).strip()
        name = str(manifest.get("name", "")).strip()
        if not namespace or not name:
            raise ValueError("algopack.json requires namespace and name")

        package_id = f"{namespace}.{name}"
        entry_file = str(manifest.get("entry", "main.py")).strip() or "main.py"
        entry_path = os.path.join(dirpath, entry_file)
        if not os.path.exists(entry_path):
            raise FileNotFoundError(f"Entry file not found: {entry_path}")

        files: list[PackageFile] = []
        for root, _dirs, filenames in os.walk(dirpath):
            for filename in sorted(filenames):
                if not (filename.endswith(".py") or filename == "algopack.json"):
                    continue
                abs_file = os.path.join(root, filename)
                rel_file = os.path.relpath(abs_file, dirpath).replace("\\", "/")
                with open(abs_file, "r", encoding="utf-8") as fh:
                    content = fh.read()
                functions = ast_parser.extract_functions(abs_file) if filename.endswith(".py") else []
                files.append(
                    PackageFile(
                        filename=filename,
                        relative_path=rel_file,
                        content=content,
                        is_entry=rel_file == entry_file,
                        functions=functions,
                    ),
                )

        exports_raw = manifest.get("exports", [])
        exports: list[str] = []
        if isinstance(exports_raw, list):
            for item in exports_raw:
                if isinstance(item, str) and item.strip():
                    exports.append(item.strip())
                elif isinstance(item, dict) and str(item.get("name", "")).strip():
                    exports.append(str(item.get("name")).strip())

        package = AlgorithmPackage(
            package_id=package_id,
            name=name,
            zh_name=str(manifest.get("zh_name", "")).strip() or name,
            namespace=namespace,
            version=str(manifest.get("version", "1.0.0")).strip() or "1.0.0",
            entry_file=entry_file,
            exports=exports,
            files=files,
            dependencies=dict(manifest.get("dependencies", {}) or {}),
            root_path=os.path.abspath(dirpath),
            zh_description=str(manifest.get("zh_description", "")).strip(),
            zh_tags=[str(tag).strip() for tag in manifest.get("zh_tags", []) if str(tag).strip()],
            published=bool(manifest.get("published", True)),
            module_kind=normalize_module_kind(manifest.get("module_kind", manifest.get("type", "component"))),
        )
        pkg_owner_id = str(manifest.get("owner_id", "system")).strip() or "system"

        self._replace_package_entries(package.package_id)
        self._packages[package.package_id] = package
        self._register_package_entries(package, ast_parser, owner_id=pkg_owner_id)
        return package

    def _register_package_entries(self, package: AlgorithmPackage, ast_parser: Any, owner_id: str = "system") -> None:
        entry_path = os.path.join(package.root_path, package.entry_file)
        functions = ast_parser.extract_functions(entry_path)
        info_by_name = {item["func_name"]: item for item in functions}
        for export_name in package.exports:
            func_info = info_by_name.get(export_name) or {
                "func_name": export_name,
                "en_description": package.zh_description or export_name,
                "snippet_body": "",
                "params": [],
                "return_type": "Any",
                "zh_name": export_name,
                "zh_description": package.zh_description or export_name,
                "zh_tags": package.zh_tags,
                "version": package.version,
            }
            entry = self._build_entry(
                func_info=func_info,
                namespace=package.namespace,
                folder_type=package.module_kind,
                file_path=entry_path,
                dirpath=package.root_path,
                root_dir=self._find_watch_root(package.root_path) or package.root_path,
                owner_id=owner_id,
                package_id=package.package_id,
                package_root=package.root_path,
                version_override=package.version,
            )
            self.register(entry)

    def _rescan_package_root(self, package_root: str, ast_parser: Any) -> AlgorithmPackage | None:
        package = self._find_package_by_path(package_root)
        root = self._find_watch_root(package_root) or package_root
        if package is not None:
            self._replace_package_entries(package.package_id)
        manifest_path = os.path.join(package_root, "algopack.json")
        if not os.path.exists(manifest_path):
            if package is not None:
                self._packages.pop(package.package_id, None)
            return None
        return self._scan_package_dir(package_root, root, ast_parser)

    def _replace_package_entries(self, package_id: str) -> None:
        keys = [key for key, value in self._store.items() if value.package_id == package_id]
        for key in keys:
            self._store.pop(key, None)

    def _find_watch_root(self, path_value: str) -> str | None:
        abs_path = os.path.abspath(path_value)
        for root in self._watch_roots:
            try:
                rel = os.path.relpath(abs_path, root)
            except ValueError:
                continue
            if not rel.startswith(".."):
                return root
        return None

    def _find_package_by_path(self, path_value: str) -> AlgorithmPackage | None:
        abs_path = os.path.abspath(path_value)
        for package in self._packages.values():
            try:
                rel = os.path.relpath(abs_path, package.root_path)
            except ValueError:
                continue
            if rel == "." or not rel.startswith(".."):
                return package
        return None

    # ------------------------------------------------------------------
    # Build
    # ------------------------------------------------------------------

    def _build_entry(
        self,
        func_info: dict[str, Any],
        namespace: str,
        folder_type: str,
        file_path: str,
        dirpath: str,
        root_dir: str,
        owner_id: str = "system",
        package_id: str | None = None,
        package_root: str | None = None,
        version_override: str | None = None,
    ) -> AlgorithmEntry:
        func_name: str = func_info["func_name"]
        params: list[dict[str, Any]] = [p for p in func_info.get("params", []) if p["name"] != "self"]
        param_placeholders = ", ".join(f"${{{i + 1}:{p['name']}}}" for i, p in enumerate(params))
        call_snippet = f"alg.{namespace}.{func_name}({param_placeholders})"
        folder_path = os.path.relpath(dirpath, root_dir)

        return AlgorithmEntry(
            id=f"{namespace}.{func_name}",
            call_prefix=f"alg.{namespace}.{func_name}",
            namespace=namespace,
            func_name=func_name,
            type=folder_type,
            source_file=os.path.abspath(file_path),
            zh_name=func_info.get("zh_name") or func_name,
            zh_description=func_info.get("zh_description") or func_info.get("en_description") or "",
            zh_tags=func_info.get("zh_tags") or [],
            en_description=func_info.get("en_description") or "",
            params=params,
            return_type=func_info.get("return_type") or "Any",
            snippet_body=func_info.get("snippet_body") or "",
            call_snippet=call_snippet,
            version=version_override or func_info.get("version") or "1.0.0",
            input_example=func_info.get("input_example") or "",
            folder_path=folder_path,
            owner_id=owner_id,
            package_id=package_id,
            package_root=package_root,
        )

    # ------------------------------------------------------------------
    # Package mutation
    # ------------------------------------------------------------------

    def get_packages(self) -> list[AlgorithmPackage]:
        return sorted(self._packages.values(), key=lambda item: item.package_id)

    def get_package(self, package_id: str) -> AlgorithmPackage | None:
        return self._packages.get(package_id)

    def create_package(self, manifest: dict[str, Any], files: list[dict[str, Any]], root_dir: str) -> AlgorithmPackage:
        from .ast_parser import AstParser

        namespace = str(manifest.get("namespace", "")).strip()
        name = str(manifest.get("name", "")).strip()
        if not namespace or not name:
            raise ValueError("Package manifest requires namespace and name")

        package_root = Path(root_dir).resolve().joinpath(*namespace.split("."), name)
        if package_root.exists():
            raise ValueError(f"Package already exists: {package_root}")
        package_root.mkdir(parents=True, exist_ok=False)

        manifest_payload = {
            "name": name,
            "zh_name": str(manifest.get("zh_name", "")).strip() or name,
            "version": str(manifest.get("version", "1.0.0")).strip() or "1.0.0",
            "namespace": namespace,
            "entry": str(manifest.get("entry", "main.py")).strip() or "main.py",
            "exports": manifest.get("exports", []),
            "zh_description": str(manifest.get("zh_description", "")).strip(),
            "zh_tags": manifest.get("zh_tags", []),
            "dependencies": manifest.get("dependencies", {}),
            "published": bool(manifest.get("published", False)),
            "publish_status": str(manifest.get("publish_status", "draft")).strip() or "draft",
            "module_kind": normalize_module_kind(manifest.get("module_kind", manifest.get("type", "component"))),
        }
        if manifest.get("owner_id") and manifest["owner_id"] != "system":
            manifest_payload["owner_id"] = manifest["owner_id"]
        (package_root / "algopack.json").write_text(
            json.dumps(manifest_payload, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )

        for file_item in files:
            relative_path = str(file_item.get("relative_path") or file_item.get("filename") or "").strip().replace("\\", "/")
            if not relative_path:
                continue
            target = package_root / relative_path
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(str(file_item.get("content", "")), encoding="utf-8")

        return self._scan_package_dir(str(package_root), str(Path(root_dir).resolve()), AstParser)

    def save_package_file(self, package_id: str, filename: str, content: str) -> list[str]:
        from .ast_parser import AstParser

        package = self.get_package(package_id)
        if package is None:
            raise FileNotFoundError(f"Package not found: {package_id}")
        target = Path(package.root_path, filename)
        if not target.exists():
            raise FileNotFoundError(f"File not found: {filename}")
        target.write_text(content, encoding="utf-8")
        refreshed = self._rescan_package_root(package.root_path, AstParser)
        if refreshed is None:
            return []
        return refreshed.exports

    def update_package_manifest(self, package_id: str, payload: dict[str, Any]) -> AlgorithmPackage:
        from .ast_parser import AstParser

        package = self.get_package(package_id)
        if package is None:
            raise FileNotFoundError(f"Package not found: {package_id}")

        manifest_path = Path(package.root_path, "algopack.json")
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        for key, value in payload.items():
            manifest[key] = value
        manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")

        new_namespace = str(manifest.get("namespace", package.namespace)).strip() or package.namespace
        new_name = str(manifest.get("name", package.name)).strip() or package.name
        target_root = Path(self._find_watch_root(package.root_path) or package.root_path).resolve().joinpath(*new_namespace.split("."), new_name)
        current_root = Path(package.root_path).resolve()
        if current_root != target_root:
            target_root.parent.mkdir(parents=True, exist_ok=True)
            if target_root.exists():
                raise ValueError(f"Package target already exists: {target_root}")
            current_root.rename(target_root)
            package_root = str(target_root)
        else:
            package_root = str(current_root)
        refreshed = self._rescan_package_root(package_root, AstParser)
        if refreshed is None:
            raise FileNotFoundError(f"Package not found after manifest update: {package_id}")
        return refreshed

    def delete_package_file(self, package_id: str, filename: str) -> list[str]:
        from .ast_parser import AstParser

        package = self.get_package(package_id)
        if package is None:
            raise FileNotFoundError(f"Package not found: {package_id}")
        normalized = filename.replace("\\", "/")
        if normalized == "algopack.json":
            raise PermissionError("algopack.json cannot be deleted")
        if normalized == package.entry_file:
            raise PermissionError("Entry file cannot be deleted")
        target = Path(package.root_path, normalized)
        if not target.exists():
            raise FileNotFoundError(f"File not found: {filename}")
        if target.is_dir():
            raise ValueError("Only files can be deleted")
        target.unlink()
        refreshed = self._rescan_package_root(package.root_path, AstParser)
        if refreshed is None:
            return []
        return refreshed.exports

    # ------------------------------------------------------------------
    # Mutation
    # ------------------------------------------------------------------

    def register(self, entry: AlgorithmEntry) -> None:
        self._store[entry.id] = entry
        logger.debug("Registered: %s", entry.id)

    def unregister_by_file(self, file_path: str) -> None:
        abs_path = os.path.abspath(file_path)
        keys = [key for key, value in self._store.items() if value.source_file == abs_path]
        for key in keys:
            del self._store[key]

    # ------------------------------------------------------------------
    # Queries
    # ------------------------------------------------------------------

    def search_by_prefix(self, prefix: str) -> list[AlgorithmEntry]:
        keyword = prefix.lower()
        return sorted(
            (entry for entry in self._store.values() if entry.call_prefix.lower().startswith(keyword)),
            key=lambda entry: entry.call_prefix,
        )

    def search_by_chinese(self, keyword: str) -> list[AlgorithmEntry]:
        needle = keyword.lower()
        scored: list[tuple[int, AlgorithmEntry]] = []
        for entry in self._store.values():
            score = 0
            if needle in entry.zh_name.lower():
                score += 3
            if needle in entry.zh_description.lower():
                score += 2
            if any(needle in tag.lower() for tag in entry.zh_tags):
                score += 2
            if needle in entry.en_description.lower():
                score += 1
            if score:
                scored.append((score, entry))
        scored.sort(key=lambda item: (-item[0], item[1].call_prefix))
        return [entry for _, entry in scored]

    def get_all(self) -> list[AlgorithmEntry]:
        return sorted(self._store.values(), key=lambda entry: entry.call_prefix)

    def get_by_id(self, algorithm_id: str) -> AlgorithmEntry | None:
        return self._store.get(algorithm_id)

    def get_by_namespace(self, namespace: str) -> list[AlgorithmEntry]:
        return [entry for entry in self._store.values() if entry.namespace == namespace]

    def get_by_type(self, type_filter: str) -> list[AlgorithmEntry]:
        return [entry for entry in self._store.values() if entry.type == type_filter]

    def to_completion_json(self) -> list[dict[str, Any]]:
        return [
            {
                "id": entry.id,
                "callPrefix": entry.call_prefix,
                "callSnippet": entry.call_snippet,
                "snippetBody": entry.snippet_body,
                "type": entry.type,
                "moduleKind": entry.type,
                "zhName": entry.zh_name,
                "zhDescription": entry.zh_description,
                "zhTags": entry.zh_tags,
                "enDescription": entry.en_description,
                "params": entry.params,
                "namespace": entry.namespace,
                "version": entry.version,
            }
            for entry in self.get_all()
        ]

    # ------------------------------------------------------------------
    # Properties
    # ------------------------------------------------------------------

    @property
    def count(self) -> int:
        return len(self._store)

    @property
    def package_count(self) -> int:
        return len(self._packages)

    @property
    def watch_roots(self) -> list[str]:
        return list(self._watch_roots)
