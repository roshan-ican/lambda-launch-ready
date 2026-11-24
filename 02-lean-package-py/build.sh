#!/usr/bin/env bash
set -euo pipefail

REQS=${1:-requirements.txt}

rm -rf dist/package dist/function.zip
mkdir -p dist/package

python -m pip install \
  --platform manylinux_2_28_x86_64 \
  --target dist/package \
  --implementation cp \
  --python-version 3.12 \
  --only-binary=:all: \
  -r "$REQS" \
  --quiet

cp src/*.py dist/package/
python -c "import shutil; shutil.make_archive('dist/function', 'zip', 'dist/package')"
ls -lh dist/function.zip
