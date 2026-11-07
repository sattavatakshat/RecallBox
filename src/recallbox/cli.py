def main():
    import uvicorn
    uvicorn.run('recallbox.app:create_app', factory=True, host='127.0.0.1', port=8001,
                workers=1, access_log=False, proxy_headers=False)
