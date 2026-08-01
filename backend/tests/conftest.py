import pytest
from app import create_app
from mockfirestore import MockFirestore

@pytest.fixture(autouse=True)
def mock_db_client(mocker):
    mock_db = MockFirestore()
    mocker.patch('app.db.firebase.db.client', mock_db)
    return mock_db

@pytest.fixture
def app(mock_db_client):
    app = create_app({
        "TESTING": True,
    })
    with app.app_context():
        yield app

@pytest.fixture
def client(app):
    return app.test_client()
