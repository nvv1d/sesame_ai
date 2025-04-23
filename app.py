import os
import asyncio
from fastapi import FastAPI, WebSocket, HTTPException, Request
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from sesame_ai import SesameAI, TokenManager, SesameWebSocket

app = FastAPI()

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allows all origins
    allow_credentials=True,
    allow_methods=["*"],  # Allows all methods
    allow_headers=["*"],  # Allows all headers
)

# Initialize the API client and token manager
client = None
token_manager = None
id_token = None

def initialize_sesame():
    global client, token_manager, id_token
    try:
        # Initialize the API client
        client = SesameAI()  # No email or password needed
        
        # Create an anonymous account and get the ID token
        # Use existing token file if available
        token_manager = TokenManager(client, token_file="token.json")
        
        try:
            # Try to get an existing valid token first
            id_token = token_manager.get_valid_token()
            print(f"Using existing ID token")
        except Exception:
            # If that fails, create a new anonymous account
            signup_response = client.create_anonymous_account()
            id_token = signup_response.id_token
            print(f"Created new ID Token: {id_token}")
            
            # Get account info after creation
            lookup_response = client.get_account_info(id_token)
            print(f"User ID: {lookup_response.local_id}")
            
        return True
    except Exception as e:
        print(f"Failed to initialize Sesame: {e}")
        return False

# IMPORTANT: Mount static files to a non-root path
app.mount("/static", StaticFiles(directory="static"), name="static")

# Serve index.html at the root
@app.get("/")
async def read_index():
    return FileResponse("static/index.html")

# Serve client.js
@app.get("/client.js")
async def read_js():
    return FileResponse("static/client.js")

# ─── WebSocket Proxy ──────────────────────────────────────────────────────────
@app.websocket("/ws/")
async def ws_proxy(ws: WebSocket):
    global id_token
    
    # Make sure we have a valid token
    if not id_token:
        if not initialize_sesame():
            await ws.close(code=1008, reason="Failed to authenticate with Sesame")
            return
    
    await ws.accept()
    print("WebSocket connection accepted")
    
    # Create SesameWebSocket for this connection
    s_ws = None
    try:
        s_ws = SesameWebSocket(id_token=id_token, character="Maya")
        s_ws.connect()
        print("Connected to Sesame WebSocket")
        
        # Set up audio reception task from client
        audio_task = asyncio.create_task(handle_client_audio(ws, s_ws))
        # Set up audio sending task to client
        response_task = asyncio.create_task(send_sesame_responses(ws, s_ws))
        
        # Wait for either task to complete
        done, pending = await asyncio.wait(
            [audio_task, response_task],
            return_when=asyncio.FIRST_COMPLETED
        )
        
        # Cancel any pending tasks
        for task in pending:
            task.cancel()
            
    except Exception as e:
        print(f"WebSocket error: {e}")
    finally:
        if s_ws:
            s_ws.disconnect()
            print("Disconnected from Sesame WebSocket")
        await ws.close()
        print("Closed client WebSocket connection")


async def handle_client_audio(ws: WebSocket, s_ws: SesameWebSocket):
    """Handle audio data from client and send to Sesame"""
    try:
        while True:
            # Receive audio data from browser
            data = await ws.receive_bytes()
            # Send to Sesame
            s_ws.send_audio_data(data)
    except Exception as e:
        print(f"Error receiving client audio: {e}")


async def send_sesame_responses(ws: WebSocket, s_ws: SesameWebSocket):
    """Stream audio chunks from Sesame back to the client"""
    try:
        while True:
            # Get next audio chunk from Sesame (with timeout)
            chunk = s_ws.get_next_audio_chunk(timeout=0.1)
            if chunk:
                # Send to browser client
                await ws.send_bytes(chunk)
            else:
                # Small sleep to prevent CPU spin
                await asyncio.sleep(0.01)
    except Exception as e:
        print(f"Error sending Sesame responses: {e}")


@app.on_event("startup")
async def startup_event():
    """Initialize Sesame connection on app startup"""
    initialize_sesame()


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
