import os
from flask import Flask, jsonify

from app.db.firebase import db
from flask_cors import CORS

def create_app(test_config=None):
    # create and configure the app
    app = Flask(__name__, instance_relative_config=True)

    frontend_url = os.environ.get("FRONTEND_URL", "http://localhost:3000")
    CORS(app, supports_credentials=True, origins=[frontend_url])

    if not os.environ.get("ENCRYPTION_KEY"):
        app.logger.warning(
            "ENCRYPTION_KEY is not set -- falling back to the publicly-committed dev key. "
            "Customer phone number encryption is NOT secure until this is overridden."
        )

    if not os.environ.get("SECRET_KEY"):
        app.logger.warning(
            "SECRET_KEY is not set -- falling back to the publicly-committed dev key. "
            "JWTs can be forged (including ADMIN role) until this is overridden."
        )

    from app.core.config import MAX_UPLOAD_SIZE_BYTES
    app.config['MAX_CONTENT_LENGTH'] = MAX_UPLOAD_SIZE_BYTES

    if test_config is None:
        # load the instance config, if it exists, when not testing
        app.config.from_pyfile('config.py', silent=True)
    else:
        # load the test config if passed in
        app.config.from_mapping(test_config)

    @app.errorhandler(413)
    def handle_request_entity_too_large(e):
        return jsonify({"status": "error", "message": "Upload exceeds the maximum allowed size", "code": "PAYLOAD_TOO_LARGE"}), 413

    db.init_app(app)

    # Initialize SocketIO
    from app.core.socket_events import socketio
    socketio.init_app(app)

    # Register blueprints
    from app.api import auth, whatsapp, users, conversations, media, admin
    
    app.register_blueprint(auth.bp)
    app.register_blueprint(whatsapp.bp)
    app.register_blueprint(users.bp)
    app.register_blueprint(conversations.bp)
    app.register_blueprint(media.bp)
    app.register_blueprint(admin.bp)

    # ensure the instance folder exists
    try:
        os.makedirs(app.instance_path)
    except OSError:
        pass

    # A simple health check route
    @app.route('/health')
    def health():
        return jsonify({"status": "healthy"})

    return app
