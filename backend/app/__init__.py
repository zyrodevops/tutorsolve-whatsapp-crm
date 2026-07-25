import os
from flask import Flask, jsonify

from app.db.database import db
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

    if test_config is None:
        # load the instance config, if it exists, when not testing
        app.config.from_pyfile('config.py', silent=True)
        # default to sqlite if no env variable is set
        app.config.setdefault('SQLALCHEMY_DATABASE_URI', os.environ.get('DATABASE_URL', 'sqlite:///app.db'))
    else:
        # load the test config if passed in
        app.config.from_mapping(test_config)

    db.init_app(app)

    # Initialize SocketIO
    from app.core.socket_events import socketio
    socketio.init_app(app)

    # Register blueprints
    from app.api.auth import bp as auth_bp
    from app.api.users import bp as users_bp
    from app.api.whatsapp import bp as whatsapp_bp
    from app.api.conversations import bp as conv_bp
    
    app.register_blueprint(auth_bp)
    app.register_blueprint(users_bp)
    app.register_blueprint(whatsapp_bp)
    app.register_blueprint(conv_bp)

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
