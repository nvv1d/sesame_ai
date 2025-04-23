import os
from fastapi import FastAPI, WebSocket, HTTPException
from fastapi.staticfiles import StaticFiles
from sesame_ai import SesameAI, TokenManager, SesameWebSocket

# ─── Authenticate ─────────────────────────────────────────────────────────────
# Provide your Sesame account credentials via ENV vars on Railway
email = os.environ["SESAME_EMAIL"]
password = os.environ["SESAME_PASSWORD"]
client = SesameAI(email=email, password=password)
token_manager = TokenManager(client, token_file="token.json")
id_token = token_manager.get_valid_token()

app = FastAPI()

# Serve your static UI
app.mount("/", StaticFiles(directory="static", html=True), name="static")

# ─── WebSocket Proxy ──────────────────────────────────────────────────────────
@app.websocket("/ws/")
async def ws_proxy(ws: WebSocket):
    await ws.accept()
    # Each client turn uses its own SesameWebSocket
    s_ws = SesameWebSocket(id_token=id_token, character="Maya")
    s_ws.connect()
    try:
        while True:
            # receive raw PCM bytes from browser
            data = await ws.receive_bytes()
            s_ws.send_audio_data(data)
            # stream back AI audio chunks
            chunk = s_ws.get_next_audio_chunk(timeout=1.0)
            if chunk:
                await ws.send_bytes(chunk)
    except Exception:
        pass
    finally:
        s_ws.disconnect()
        await ws.close()
