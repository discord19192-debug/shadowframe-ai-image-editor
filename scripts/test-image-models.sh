#!/usr/bin/env bash
# Probe which image models on the Rork Toolkit v2 image-model endpoint accept
# base64 file input (photo editing). Writes a summary to stdout as TSV:
# model<TAB>http_status<TAB>result
set -u

KEY=$(grep '^EXPO_PUBLIC_RORK_TOOLKIT_SECRET_KEY=' "$(dirname "$0")/../expo/.env" | cut -d= -f2)
IMG=${2:-/tmp/test-input.jpg}
B64=$(base64 -w0 "$IMG")
PROMPT=${1:-"Make the image a solid bright red square"}

probe() {
  local model="$1"
  local size_field
  if [[ "$model" == openai/* ]]; then
    size_field='"size": "1024x1024",'
  else
    size_field='"aspectRatio": "16:9",'
  fi
  local body status
  body=$(printf '{"model": "%s", "prompt": "%s", "n": 1, "providerOptions": {}, %s "files": [{"type": "file", "mediaType": "image/jpeg", "data": "%s"}]}' \
    "$model" "$PROMPT" "$size_field" "$B64")
  status=$(curl -sS -o "/tmp/probe-resp-${model//\//_}.json" -w "%{http_code}" --max-time 120 \
    "https://toolkit.rork.com/v2/vercel/v3/ai/image-model" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $KEY" \
    -H "ai-gateway-protocol-version: 0.0.1" \
    -H "ai-image-model-specification-version: 4" \
    -H "ai-model-id: $model" \
    -d "$body" 2>/dev/null)
  local result
  result=$(jq -r 'if (.images | type) == "array" and (.images | length) > 0 then "EDIT_OK"
      else ("FAIL: " + ((.error.message // .error // "no image") | tostring | .[0:140])) end' "/tmp/probe-resp-${model//\//_}.json" 2>/dev/null || echo "FAIL: bad json")
  printf '%s\t%s\t%s\n' "$model" "$status" "$result"
}

MODELS=(
  "openai/gpt-image-2"
  "openai/gpt-image-1.5"
  "bfl/flux-kontext-max"
  "bfl/flux-kontext-pro"
  "bytedance/seedream-5.0-pro"
  "bytedance/seedream-4.5"
  "recraft/recraft-v4.1-pro"
  "recraft/recraft-v4"
  "bfl/flux-2-max"
  "bfl/flux-2-pro"
  "bfl/flux-3-image"
  "microsoft/mai-image-2.6"
  "spacexai/grok-imagine-image"
)

for m in "${MODELS[@]}"; do
  probe "$m" &
  # limit concurrency
  while (( $(jobs -r | wc -l) >= 5 )); do sleep 1; done
done
wait
