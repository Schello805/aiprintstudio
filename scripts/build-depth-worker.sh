#!/bin/zsh
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
RESOURCE_DIR="$ROOT_DIR/resources/depth"
MODEL_ZIP="$RESOURCE_DIR/DepthAnythingV2SmallF16P6.mlpackage.zip"
MODEL_PACKAGE="$RESOURCE_DIR/DepthAnythingV2SmallF16P6.mlpackage"
MODEL_COMPILED="$RESOURCE_DIR/DepthAnythingV2SmallF16P6.mlmodelc"
MODEL_URL="https://ml-assets.apple.com/coreml/models/Image/DepthEstimation/DepthAnything/DepthAnythingV2SmallF16P6.mlpackage.zip"

mkdir -p "$RESOURCE_DIR"
if [[ ! -d "$MODEL_PACKAGE" ]]; then
  curl -fL "$MODEL_URL" -o "$MODEL_ZIP"
  ditto -x -k "$MODEL_ZIP" "$RESOURCE_DIR"
fi
if [[ ! -d "$MODEL_COMPILED" ]]; then
  xcrun coremlcompiler compile "$MODEL_PACKAGE" "$RESOURCE_DIR"
fi
xcrun swiftc -O "$ROOT_DIR/native/DepthWorker.swift" \
  -framework AppKit -framework CoreML -framework Vision -framework ImageIO \
  -o "$RESOURCE_DIR/depth-worker"
chmod +x "$RESOURCE_DIR/depth-worker"
xcrun swiftc -O -parse-as-library "$ROOT_DIR/native/ObjectCaptureWorker.swift" \
  -framework RealityKit -o "$RESOURCE_DIR/object-capture-worker"
chmod +x "$RESOURCE_DIR/object-capture-worker"
