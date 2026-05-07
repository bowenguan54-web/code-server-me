#!/usr/bin/env bash
cd /home/guan/code-server-me
printf 'processes:\n'
ps -ef | grep -E 'python -m uvicorn algo_service.main:app|/home/guan/code-server-me/release/lib/node /home/guan/code-server-me/release' | grep -v grep || true
printf 'ports:\n'
ss -ltnp | grep -E ':8000|:8080' || true