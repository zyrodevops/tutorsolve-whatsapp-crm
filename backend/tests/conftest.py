import pytest
from app import create_app

@pytest.fixture
def app():
    # Create a Flask app configured for testing
    app = create_app({"TESTING": True})
    yield app

@pytest.fixture
def client(app):
    return app.test_client()
