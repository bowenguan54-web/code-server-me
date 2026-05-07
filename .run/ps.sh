pgrep -af 'uvicorn algo_service.main:app|code-server|node .*out/node' | head -20

