import os
from fastapi import FastAPI, WebSocket, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse
from sesame_ai import SesameAI, TokenManager, SesameWebSocket

# ─── Authenticate ─────────────────────────────────────────────────────────────
# Make sure SESAME_EMAIL and SESAME_PASSWORD are set in Railway ENV vars
email = os.environ["SESAME_EMAIL"]
password = os.environ["SESAME_PASSWORD"]
client = SesameAI(email=email, password=password)
token_manager = TokenManager(client, token_file="token.json")
id_token = token_manager.get_valid_token()

# ─── FastAPI App ──────────────────────────────────────────────────────────────
app = FastAPI()

# Serve your frontend UI from the "static" directory
app.mount("/", StaticFiles(directory="static", html=True), name="static")

# ─── WebSocket Proxy ──────────────────────────────────────────────────────────
@app.websocket("/ws/")
async def ws_proxy(ws: WebSocket):
    await ws.accept()
    s_ws = SesameWebSocket(id_token=id_token, character="Maya")
    s_ws.connect()
    try:
        while True:
            data = await ws.receive_bytes()
            s_ws.send_audio_data(data)
            chunk = s_ws.get_next_audio_chunk(timeout=1.0)
            if chunk:
                await ws.send_bytes(chunk)
    except Exception:
        pass
    finally:
        s_ws.disconnect()
        await ws.close()

# ─── Token Endpoint ───────────────────────────────────────────────────────────
@app.get("/get-token")
async def get_token():
    try:
        id_token = token_manager.get_valid_token()
        return JSONResponse(content={"id_token": id_token})
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
