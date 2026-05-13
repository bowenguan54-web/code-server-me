#!/usr/bin/env python3
import sys
sys.path.insert(0, '/home/guan/code-server-me')
from algo_service.sdk.registry import AlgorithmRegistry
r = AlgorithmRegistry()
r.scan_directory('/home/guan/code-server-me/algorithms_root/demo')
entry = r.get_by_id('demo.image_processor')
print('entry:', entry)
print('store keys:', list(r._store.keys()))
