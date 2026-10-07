"""Convenience wrapper around the ONE canonical build step: node tools/bundle.js.

The previous tools/build.py was a second, subtly different implementation of
the same bundle (it appended an extra newline before </style>, had no guard
against a stray </script> inside the JavaScript, and wrote whatever line
endings the platform used). Any of those differences could make a rebuild
look like a content change. This wrapper now always delegates, so
`python tools/build.py` and `node tools/bundle.js` produce byte-identical
output, and dist/cinderwake.html has exactly one definition.
"""
import os
import subprocess
import sys

root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.exit(subprocess.call(["node", os.path.join(root, "tools", "bundle.js")]))
