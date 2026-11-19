#!/bin/bash
# 用本机 Chrome 无头模式把设计稿渲染成 2x PNG。
# 用法：./render.sh [baseline a a-install b b-install c]
set -u
cd "$(dirname "$0")"
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
mkdir -p screens
VARIANTS=${*:-"baseline a a-install b c c-install c2 c2-install c3 c3-install c4 c4-mid c4-install c5 c5-mid c5-install c6 c6-install c6-added c6-hover"}
for v in $VARIANTS; do
  case "$v" in
    a-install) page="a.html?state=install" ;;
    b-install) page="b.html?state=install" ;;
    c-install) page="c.html?state=install" ;;
    c2) page="c2.html?x=1" ;;
    c3) page="c3.html?x=1" ;;
    c4) page="c4.html?x=1" ;;
    c5) page="c5.html?x=1" ;;
    c6) page="c6.html?x=1" ;;
    c6-install) page="c6.html?state=install" ;;
    c6-added) page="c6-added.html?x=1" ;;
    c6-hover) page="c6-hover.html?x=1" ;;
    c5-mid) page="c5.html?at=0.45" ;;
    c5-install) page="c5.html?state=install" ;;
    c4-mid) page="c4.html?at=0.45" ;;
    c4-install) page="c4.html?state=install" ;;
    c3-install) page="c3.html?state=install" ;;
    c2-install) page="c2.html?state=install" ;;
    *) page="$v.html?x=1" ;;
  esac
  for theme in light dark; do
    out="screens/$v-$theme.png"
    for attempt in 1 2 3; do
      HOME=/tmp/chromehome "$CHROME" \
        --headless=new --disable-gpu --no-sandbox --disable-breakpad \
        --use-mock-keychain --password-store=basic \
        --disable-sync --disable-background-networking --disable-component-update \
        --disable-domain-reliability --disable-default-apps \
        --user-data-dir="/tmp/chrome-dsh-$v-$theme-$attempt" --no-first-run --no-default-browser-check \
        --hide-scrollbars --force-device-scale-factor=2 --window-size=1240,820 \
        --screenshot="$out" "file://$PWD/mockups/$page&theme=$theme" >/tmp/chrome-render.log 2>&1
      if [ -s "$out" ]; then break; fi
      sleep 1
    done
    if [ -s "$out" ]; then echo "rendered $out"; else echo "FAILED $out"; tail -3 /tmp/chrome-render.log; fi
  done
done
