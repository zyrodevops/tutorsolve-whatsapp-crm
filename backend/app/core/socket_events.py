from flask_socketio import SocketIO, ConnectionRefusedError
import jwt
from flask import request
from app.db.firebase import db
from app.core.config import SECRET_KEY

# Explicit "threading" async_mode (backed by the simple-websocket package for
# real WebSocket support) rather than letting Flask-SocketIO auto-detect
# eventlet/gevent. google-cloud-firestore's gRPC client bypasses greenlet
# monkey-patching (gRPC's transport is a C-extension, not pure-Python
# sockets), so any Firestore call under an eventlet/gevent worker hangs until
# it times out. Plain OS threads don't have this problem.
socketio = SocketIO(cors_allowed_origins="*", async_mode="threading")

@socketio.on('connect')
def handle_connect():
    token = request.cookies.get('access_token')
    if not token:
        raise ConnectionRefusedError('unauthorized')
    
    try:
        # Decode the JWT token
        payload = jwt.decode(token, SECRET_KEY, algorithms=["HS256"])
        if 'sub' not in payload:
            raise ConnectionRefusedError('invalid token payload')
            
        # Verify user still exists
        user_doc = db.client.collection("users").document(payload.get('sub')).get()
        if not user_doc.exists or user_doc.to_dict().get("system_status") != "ACTIVE":
            raise ConnectionRefusedError('invalid token')
            
    except jwt.ExpiredSignatureError:
        raise ConnectionRefusedError('token expired')
    except jwt.InvalidTokenError:
        raise ConnectionRefusedError('invalid token')
