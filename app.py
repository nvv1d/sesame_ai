import os
from fastapi import FastAPI, WebSocket, HTTPException
from fastapi.staticfiles import StaticFiles
from sesame_ai import SesameAI, TokenManager, SesameWebSocket

# ─── Authenticate ─────────────────────────────────────────────────────────────
# Initialize the API client
client = SesameAI()  # No email or password needed

# Create an anonymous account and get the ID token
signup_response = client.create_anonymous_account()
print(f"ID Token: {signup_response.id_token}")

# You can also get account info after creation
lookup_response = client.get_account_info(signup_response.id_token)
print(f"User ID: {lookup_response.local_id}")

# Manage tokens with TokenManager
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
