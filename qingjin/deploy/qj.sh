#!/bin/sh
set -eu
cd "$(dirname "$0")"
exec docker compose -p qingjin -f docker-compose.yml -f docker-compose.tencent.yml -f docker-compose.new-edge.yml "$@"
