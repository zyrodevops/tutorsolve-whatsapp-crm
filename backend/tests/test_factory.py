from app import create_app

def test_config():
    # Test that the app can be created with testing config
    assert not create_app().testing
    assert create_app({"TESTING": True}).testing

def test_hello(client):
    # Test a simple healthcheck endpoint to ensure routing works
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json == {"status": "healthy"}
