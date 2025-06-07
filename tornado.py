#!/usr/bin/env python3
import os
import fnmatch
import argparse

def is_binary(file_path):
    """
    Checks if a file is likely binary by looking for null bytes in the first 1KB.
    """
    try:
        with open(file_path, 'rb') as f:
            # Read a chunk of the file (e.g., the first 1024 bytes)
            chunk = f.read(1024)
            # A file is considered binary if it contains a null byte
            return b'\x00' in chunk
    except Exception:
        # If we can't even read the file, treat it as something to skip.
        return True

def load_patterns(file_path):
    """Loads patterns from a file, handling comments and empty lines."""
    patterns = []
    if not file_path or not os.path.exists(file_path):
        return patterns
    with open(file_path, 'r', encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith('#'):
                continue
            # Normalize path separators for consistent matching
            patterns.append(line.replace('\\', '/'))
    return patterns

def is_match(rel_path, patterns):
    """
    Checks if a relative path matches any of the given patterns.
    Handles file names, full paths, and directory wildcards.
    """
    norm_path = rel_path.replace(os.sep, '/')
    for pattern in patterns:
        # Direct match for files or full paths
        if fnmatch.fnmatch(norm_path, pattern):
            return True
        # Match for filename part
        if fnmatch.fnmatch(os.path.basename(norm_path), pattern):
            return True
        # Directory pattern match (e.g., 'node_modules/' or 'dist')
        if pattern.endswith('/'):
            if norm_path.startswith(pattern.rstrip('/')):
                return True
        elif norm_path.startswith(pattern + '/'): # handles patterns like 'node_modules'
            return True

    return False

def process_folder(root_folder, output_file,
                   ignore_file_path, keep_file_path=None,
                   keep_marker_filename=".mykeep"):
    
    ignore_pats = load_patterns(ignore_file_path)
    keep_pats = load_patterns(keep_file_path)
    
    # Automatically ignore the output file and the keep-marker file itself
    output_path_rel = os.path.relpath(output_file.name, root_folder)
    ignore_pats.append(output_path_rel.replace('\\', '/'))
    if keep_marker_filename:
        ignore_pats.append(keep_marker_filename)

    for current_dir, dirnames, filenames in os.walk(root_folder, topdown=True):
        rel_dir = os.path.relpath(current_dir, root_folder)
        rel_dir = '' if rel_dir == '.' else rel_dir

        # --- New Directory Pruning Logic ---
        # A directory is pruned if it's ignored AND it's not a parent
        # of something we explicitly want to keep.
        kept_dirs = []
        for d in dirnames:
            rel_path_d = os.path.join(rel_dir, d).replace(os.sep, '/')
            
            # Check if this directory is a parent of any "keep" pattern
            is_parent_of_kept = any(p.startswith(rel_path_d) for p in keep_pats)

            is_ignored = is_match(rel_path_d + '/', ignore_pats)

            if not is_ignored or is_parent_of_kept:
                kept_dirs.append(d)
        dirnames[:] = kept_dirs

        # --- Process Files with New Logic ---
        files_included_in_dir = 0
        has_keep_marker = keep_marker_filename in filenames

        for fn in filenames:
            rel_path_f = os.path.join(rel_dir, fn).replace(os.sep, '/')
            full_path = os.path.join(current_dir, fn)

            # Decision: Keep if explicitly kept, OR if not ignored.
            is_explicitly_kept = is_match(rel_path_f, keep_pats)
            is_ignored = is_match(rel_path_f, ignore_pats)

            # Skip if it's ignored AND not explicitly kept
            if is_ignored and not is_explicitly_kept:
                continue
            
            # <<< FIX: Skip binary files >>>
            if is_binary(full_path):
                continue

            if os.path.getsize(full_path) == 0:
                continue

            output_file.write(f"{rel_path_f}:\n```\n")
            try:
                # <<< FIX: Changed 'errors' from 'ignore' to 'replace' >>>
                with open(full_path, 'r', encoding='utf-8', errors='replace') as f:
                    output_file.write(f.read())
            except Exception as e:
                output_file.write(f"[Error reading file: {e}]")
            output_file.write("\n```\n\n")
            files_included_in_dir += 1

        # Handle intentionally empty directories
        if rel_dir and files_included_in_dir == 0 and has_keep_marker:
            output_file.write(f"{rel_dir}/:\n# This directory is intentionally kept.\n\n")

def main():
    p = argparse.ArgumentParser(
        description="Dump folder contents. '.mykeep' overrides '.myignore'.")
    p.add_argument("folder", help="Folder to process")
    p.add_argument("-o", "--output", default="output.txt", help="Output file")
    p.add_argument("-i", "--ignore", default=".myignore", help="Ignore file in root")
    p.add_argument("-k", "--keep", help="Keep file (overrides ignore)")
    p.add_argument("--keep-marker", default=".mykeep", help="Marker for empty dirs")
    args = p.parse_args()

    ignore_file = os.path.join(args.folder, args.ignore)
    keep_file = os.path.join(args.folder, args.keep) if args.keep else None

    with open(args.output, 'w', encoding='utf-8') as out:
        out.write("Here is the code for my decentralized voting app so far:\n\n")
        process_folder(args.folder, out, ignore_file, keep_file, args.keep_marker)
    
    print(f"Processing complete. Output written to {args.output}")

if __name__ == '__main__':
    main()
