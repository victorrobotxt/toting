#!/usr/bin/env python3
import os
import re
import ast
import argparse
import fnmatch
from pathlib import Path
from collections import deque

# (Helpers: is_binary, load_patterns, is_match - no changes)
def is_binary(file_path: Path) -> bool:
    try:
        with open(file_path, 'rb') as f:
            return b'\x00' in f.read(1024)
    except Exception:
        return True

def load_patterns(file_path: Path) -> list[str]:
    patterns: list[str] = []
    if not file_path or not file_path.exists():
        return patterns
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith('#'):
                    continue
                patterns.append(line.replace('\\', '/'))
    except Exception:
        return []
    return patterns

def is_match(rel_path: str, patterns: list[str]) -> bool:
    norm_path = rel_path.replace(os.sep, '/')
    for pattern in patterns:
        if fnmatch.fnmatch(norm_path, pattern) or fnmatch.fnmatch(os.path.basename(norm_path), pattern):
            return True
        if pattern.endswith('/'):
            if norm_path.startswith(pattern):
                return True
        elif os.path.isdir(pattern) and norm_path.startswith(pattern + '/'):
             return True
    return False

# ---------- NEW: Symbol Extractor ----------
# This class is responsible for extracting specific functions/classes from a file.

class SymbolExtractor:
    def __init__(self, file_path: Path, language: str):
        self.path = file_path
        self.language = language
        try:
            self.source = file_path.read_text(encoding='utf-8', errors='ignore')
            self.lines = self.source.splitlines()
        except Exception:
            self.source = ""
            self.lines = []

    def extract(self, symbols: set[str]) -> str:
        if not self.source or symbols == {"*"}:
            return self.source

        if self.language == 'python':
            return self._extract_python(symbols)
        elif self.language in ('javascript', 'typescript'):
            return self._extract_js_ts(symbols)
        else:
            return self.source # Fallback for other languages

    def _extract_python(self, symbols: set[str]) -> str:
        try:
            tree = ast.parse(self.source)
        except SyntaxError:
            return self.source # Fallback if parsing fails

        visitor = PythonNodeVisitor(symbols)
        visitor.visit(tree)

        node_lines = set()
        for node in visitor.extracted_nodes:
            start = node.lineno -1
            end = getattr(node, 'end_lineno', start)
            for i in range(start, end):
                node_lines.add(i)

        # Include all imports and module-level docstrings
        for node in tree.body:
            if isinstance(node, (ast.Import, ast.ImportFrom)) or \
               (isinstance(node, ast.Expr) and isinstance(node.value, ast.Str)):
                start = node.lineno -1
                end = getattr(node, 'end_lineno', start)
                for i in range(start, end):
                    node_lines.add(i)

        return "\n".join(self.lines[i] for i in sorted(list(node_lines)))

    def _extract_js_ts(self, symbols: set[str]) -> str:
        # Heuristic-based extraction for JS/TS without a full parser
        # 1. Keep all import/export lines
        # 2. Keep lines that define one of the requested symbols
        
        # Regex to find function/const/class/type definitions
        defs_regex = re.compile(
            r'^(?:export\s+)?(?:(?:const|let|var|function|class|type|interface)\s+([a-zA-Z0-9_]+))'
        )
        
        extracted_code = []
        # Always include imports
        for line in self.lines:
            if line.strip().startswith(('import ', 'export ')):
                extracted_code.append(line)

        # Find definitions for the symbols we need
        for symbol in symbols:
            for i, line in enumerate(self.lines):
                match = defs_regex.match(line)
                if match and match.group(1) == symbol:
                    # Very simple block extraction: find matching braces
                    block_start = i
                    while block_start > 0 and not self.lines[block_start-1].strip():
                         block_start -= 1 # include preceding whitespace
                    
                    open_braces = 0
                    in_block = False
                    block_end = i
                    for j in range(i, len(self.lines)):
                        line_to_scan = self.lines[j]
                        if '{' in line_to_scan:
                            in_block = True
                            open_braces += line_to_scan.count('{')
                        if '}' in line_to_scan:
                            open_braces -= line_to_scan.count('}')
                        if in_block and open_braces == 0:
                            block_end = j
                            break
                    else: # If no block found, just take the line
                        block_end = i
                    
                    for k in range(block_start, block_end + 1):
                         extracted_code.append(self.lines[k])

        # If we couldn't find specific symbols, return the whole file as a fallback
        return "\n".join(extracted_code) if extracted_code else self.source

class PythonNodeVisitor(ast.NodeVisitor):
    def __init__(self, symbols: set[str]):
        self.symbols_to_find = symbols
        self.symbols_found = set()
        self.extracted_nodes = set()
        self.current_dependencies = set()

    def visit(self, node):
        # First pass to find all top-level definitions
        top_level_defs = {}
        for item in node.body:
            if isinstance(item, (ast.FunctionDef, ast.ClassDef, ast.AsyncFunctionDef)):
                top_level_defs[item.name] = item
            elif isinstance(item, ast.Assign):
                for target in item.targets:
                    if isinstance(target, ast.Name):
                        top_level_defs[target.id] = item
        
        # Iteratively find dependencies
        processing_queue = deque(list(self.symbols_to_find))
        while processing_queue:
            symbol = processing_queue.popleft()
            if symbol in self.symbols_found or symbol not in top_level_defs:
                continue

            self.symbols_found.add(symbol)
            node_to_add = top_level_defs[symbol]
            self.extracted_nodes.add(node_to_add)

            # Find dependencies within this new node
            dep_visitor = NameVisitor()
            dep_visitor.visit(node_to_add)
            for dep in dep_visitor.names:
                if dep not in self.symbols_found:
                    processing_queue.append(dep)

class NameVisitor(ast.NodeVisitor):
    def __init__(self):
        self.names = set()
    def visit_Name(self, node):
        self.names.add(node.id)

# ---------- Parsers (Updated) ----------
# Parsers now return Dict[Path, Set[str]] where the set contains imported symbol names.
# A special symbol "*" means "import the whole file".

TS_EXTS = ['.ts', '.tsx', '.js', '.jsx', '.json']
def resolve_relative(cur_file: Path, target: str, exts=TS_EXTS) -> Path | None:
    if not target.startswith(('.', '/')): return None
    base = cur_file.parent
    candidate = (base / target).resolve()
    if candidate.is_file(): return candidate
    for ext in exts:
        if candidate.with_suffix(ext).is_file(): return candidate.with_suffix(ext)
    if candidate.is_dir():
        for ext in exts:
            if (candidate / f'index{ext}').is_file(): return candidate / f'index{ext}'
    return None

# JS/TS/etc. Regex for imports: `import { a, b } from './c'` or `import d from './d'`
JS_IMPORT_PAT = re.compile(
    r"""import\s+(?:
        (?P<symbols>\{[^}]+\}) |      # Named imports: { a, b }
        (?P<default>[\w*]+(?:\s+as\s+\w+)?)  # Default import: a or * as a
    )?\s*from\s*['"](?P<module>[^'"]+)['"]""",
    re.VERBOSE
)
JS_REQUIRE_PAT = re.compile(r"""require\(['"](?P<module>[^'"]+)['"]\)""")

def parse_js_like(path: Path) -> dict[Path, set[str]]:
    deps = {}
    try:
        text = path.read_text('utf-8', 'ignore')
        # Handle `import ... from '...'`
        for match in JS_IMPORT_PAT.finditer(text):
            target = match.group('module')
            p = resolve_relative(path, target)
            if not p: continue
            
            symbols = set()
            if named := match.group('symbols'):
                symbols.update(re.findall(r'(\w+)', named))
            elif default := match.group('default'):
                symbols.add('default')
            else: # e.g. import './style.css'
                symbols.add("*")

            if p not in deps: deps[p] = set()
            deps[p].update(symbols)

        # Handle `require('...')`
        for match in JS_REQUIRE_PAT.finditer(text):
            target = match.group('module')
            p = resolve_relative(path, target)
            if p:
                if p not in deps: deps[p] = set()
                deps[p].add("*") # For require, assume we need the whole module

    except Exception: pass
    return deps

def parse_python(path: Path, root: Path) -> dict[Path, set[str]]:
    deps = {}
    try:
        tree = ast.parse(path.read_text(encoding='utf-8', errors='ignore'))
    except SyntaxError: return {}
    
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for n in node.names:
                p = _py_module_to_path(path, n.name, root)
                if p:
                    if p not in deps: deps[p] = set()
                    deps[p].add("*") # For `import x`, we treat it as needing everything
        elif isinstance(node, ast.ImportFrom) and node.module:
            module_str = ('.' * node.level) + node.module
            p = _py_module_to_path(path, module_str, root)
            if p:
                if p not in deps: deps[p] = set()
                symbols = {n.name for n in node.names}
                if not symbols: symbols.add("*")
                deps[p].update(symbols)
    return deps

def _py_module_to_path(cur_file: Path, module: str, root: Path) -> Path | None:
    # (implementation unchanged)
    if module.startswith('.'):
        base, dots = cur_file.parent, len(module) - len(module.lstrip('.'))
        if dots > 1: base = base.parents[dots - 2]
        module = module.lstrip('.')
    else: base = root
    parts = module.split('.')
    cand = base.joinpath(*parts)
    for p in (cand.with_suffix('.py'), cand / '__init__.py'):
        if p.is_file(): return p.resolve()
    return None

# ---------- build context (replaces build_graph) ----------
def build_context(seeds: list[Path], root: Path, ignore_pats: list[str], keep_pats: list[str], debug: bool) -> dict[Path, str]:
    root = root.resolve()
    todo = deque([(p.resolve(), {"*"}) for p in seeds]) # Queue of (path, symbols_to_extract)
    
    processed: dict[Path, set[str]] = {} # Path -> symbols already processed
    final_code: dict[Path, str] = {} # Path -> extracted source code

    parsers = {
        '.py': lambda p, r: parse_python(p, r),
        '.ts': lambda p, r: parse_js_like(p), '.tsx': lambda p, r: parse_js_like(p),
        '.js': lambda p, r: parse_js_like(p), '.jsx': lambda p, r: parse_js_like(p),
        '.sol': lambda p, r: {dep: {"*"} for dep in parse_generic(p, SOL_PAT)},
        '.circom': lambda p, r: {dep: {"*"} for dep in parse_generic(p, CIR_PAT)},
        '.sh': lambda p, r: {dep: {"*"} for dep in parse_generic(p, SH_PAT)},
    }
    # Helper for old parsers that don't return symbols
    SOL_PAT = re.compile(r'import\s+"([^"]+\.sol)"')
    CIR_PAT = re.compile(r'include\s+"([^"]+\.circom)"')
    SH_PAT  = re.compile(r'\bsource\s+([^\s]+)')
    def parse_generic(path: Path, pattern: re.Pattern) -> set[Path]:
        deps: set[Path] = set()
        try:
            text = path.read_text('utf-8', 'ignore')
            for target in pattern.findall(text):
                if p := resolve_relative(path, target):
                    if p.is_file(): deps.add(p)
        except Exception: pass
        return deps

    while todo:
        cur_path, symbols_needed = todo.popleft()
        if debug: print(f"\n[DEBUG] Processing: {cur_path.relative_to(root)} (Symbols: {symbols_needed})")

        # Skip if we have already processed this file for these (or more) symbols
        if cur_path in processed and symbols_needed.issubset(processed[cur_path]):
            if debug: print("[DEBUG] SKIP: Already processed for these symbols.")
            continue
        
        # Standard file checks
        if not cur_path.is_file() or is_binary(cur_path) or cur_path.stat().st_size == 0: continue
        try:
            rel = cur_path.relative_to(root).as_posix()
        except ValueError: continue # Skip files outside root

        if is_match(rel, ignore_pats) and not is_match(rel, keep_pats): continue

        # Update processed symbols for this path
        if cur_path not in processed: processed[cur_path] = set()
        processed[cur_path].update(symbols_needed)

        # Extract code and add to final context
        lang_map = {'.py': 'python', '.ts': 'typescript', '.tsx': 'typescript', '.js': 'javascript', '.jsx': 'javascript'}
        lang = lang_map.get(cur_path.suffix.lower(), 'text')
        extractor = SymbolExtractor(cur_path, lang)
        final_code[cur_path] = extractor.extract(symbols_needed)

        # Find new dependencies and add them to the queue
        parser = parsers.get(cur_path.suffix.lower())
        if not parser: continue
        
        new_deps = parser(cur_path, root)
        for dep_path, dep_symbols in new_deps.items():
            try:
                dep_path.relative_to(root) # Ensure it's in project
                # Only add to queue if it's a new file or has new symbols
                if dep_path not in processed or not dep_symbols.issubset(processed[dep_path]):
                    todo.append((dep_path, dep_symbols))
            except ValueError: continue
            
    return final_code

# ---------- dumping (Updated) ----------
def dump_context(context: dict[Path, str], root: Path, out_fp):
    sorted_paths = sorted(context.keys())
    for path in sorted_paths:
        code = context[path]
        if not code.strip(): continue

        rel = path.relative_to(root).as_posix()
        out_fp.write(f"// Path: {rel}\n")
        out_fp.write("```" + (path.suffix.lstrip('.') or 'text') + "\n")
        out_fp.write(code.strip())
        out_fp.write("\n```\n\n")

# ---------- CLI (Updated) ----------
def main():
    ap = argparse.ArgumentParser(description="Torch-dump project dependencies.", formatter_class=argparse.RawTextHelpFormatter)
    ap.add_argument("folder")
    ap.add_argument("--seed", nargs='+', required=True)
    ap.add_argument("-o", "--output", default="torch_output.txt")
    ap.add_argument("-i", "--ignore", default=".myignore")
    ap.add_argument("-k", "--keep")
    ap.add_argument("--debug", action="store_true", help="Print detailed debugging info.")
    args = ap.parse_args()

    root = Path(args.folder).resolve()
    seeds = [root / s for s in args.seed]
    
    if args.debug:
        print(f"[DEBUG] Root path: {root}")
        print(f"[DEBUG] Raw seed args: {args.seed}")
        print(f"[DEBUG] Initial seed paths: {seeds}")

    existing_seeds = [s for s in seeds if s.exists()]
    if not existing_seeds:
        print(f"Error: All seed files not found. Searched for:")
        for s in seeds:
            print(f"- {s} (Exists: {s.exists()})")
        return

    ignore_pats = load_patterns(root / args.ignore)
    keep_pats = load_patterns(Path(args.keep)) if args.keep else []

    if args.debug:
        print(f"[DEBUG] Ignore patterns loaded: {ignore_pats}")
        print(f"[DEBUG] Keep patterns loaded: {keep_pats}")

    final_context = build_context(existing_seeds, root, ignore_pats, keep_pats, args.debug)

    with open(args.output, 'w', encoding='utf-8') as out:
        dump_context(final_context, root, out)

    print(f"\nSuccess! Traced and extracted from {len(final_context)} files into {args.output}")

if __name__ == "__main__":
    main()
