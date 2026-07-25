from flask_socketio import SocketIO, ConnectionRefusedError
import jwt
from flask import request
from app.db.database import db
from app.models.user import User
from app.core.config import SECRET_KEY

socketio = SocketIO(cors_allowed_origins="*")

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
        user = db.session.get(User, payload.get('sub'))
        if not user or user.system_status != "ACTIVE":
            raise ConnectionRefusedError('invalid token')
            
    except jwt.ExpiredSignatureError:
        raise ConnectionRefusedError('token expired')
    except jwt.InvalidTokenError:
        raise ConnectionRefusedError('invalid token')
