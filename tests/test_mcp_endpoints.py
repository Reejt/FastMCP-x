import requests

def test_mcp_health():
    resp = requests.get("http://localhost:8000/mcp")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "ok"
    print("GET /mcp health check passed.")

def test_mcp_query():
    payload = {"tool_name": "query", "params": {"query": "test"}}
    resp = requests.post("http://localhost:8000/mcp", json=payload)
    assert resp.status_code == 200
    data = resp.json()
    assert "content" in data
    print("POST /mcp query passed.")

def test_mcp_ingest():
    payload = {"tool_name": "ingest", "params": {"file_content": "hello", "filename": "test.txt"}}
    resp = requests.post("http://localhost:8000/mcp", json=payload)
    assert resp.status_code == 200
    data = resp.json()
    assert "content" in data
    print("POST /mcp ingest passed.")

if __name__ == "__main__":
    test_mcp_health()
    test_mcp_query()
    test_mcp_ingest()
