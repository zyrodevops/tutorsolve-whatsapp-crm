import pytest
from app import create_app
from app.db.database import db

@pytest.fixture
def app():
    # Create a Flask app configured for testing using an in-memory SQLite DB
    app = create_app({
        "TESTING": True,
        "SQLALCHEMY_DATABASE_URI": "sqlite:///:memory:",
        "SQLALCHEMY_TRACK_MODIFICATIONS": False
    })

    with app.app_context():
        # Create tables before each test
        db.create_all()
        yield app
        # Drop tables after each test
        db.drop_all()

@pytest.fixture
def client(app):
    return app.test_client()
