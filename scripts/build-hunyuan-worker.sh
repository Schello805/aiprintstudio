#!/bin/zsh
set -euo pipefail

commit="292331f4d26ddb80b9dcea6bcb5629ff82f12b82"
source_dir="${HUNYUAN_SOURCE_DIR:-}"
temporary=""
if [[ -z "$source_dir" ]]; then
  temporary="$(mktemp -d)"
  trap 'rm -rf "$temporary"' EXIT
  source_dir="$temporary/Hunyuan3D-Swift"
  git clone --filter=blob:none https://github.com/ZimengXiong/Hunyuan3D-Swift.git "$source_dir"
fi

git -C "$source_dir" checkout "$commit"
swift build --package-path "$source_dir" -c release --product hy3d
mkdir -p resources/hunyuan
cp "$source_dir/.build/release/hy3d" resources/hunyuan/hy3d
chmod 755 resources/hunyuan/hy3d
cp "$source_dir/LICENSE" resources/hunyuan/LICENSE-Hunyuan3D-Swift.txt
