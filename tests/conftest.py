"""
Pytest configuration and fixtures for FastMCP tests.

This module provides shared fixtures and configuration for all tests.
"""

import pytest
import os
import sys
import tempfile
from unittest.mock import MagicMock, patch

# Add project root to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


@pytest.fixture
def sample_text_content():
    """Fixture providing sample text content for testing."""
    return """
    FastMCP Document-Aware Query Assistant
    
    This is a sample document for testing purposes.
    It contains multiple paragraphs and sentences.
    
    Features:
    - Document ingestion
    - Semantic search
    - LLM-powered queries
    - Web search integration
    """


@pytest.fixture
def sample_pdf_path(tmp_path):
    """Fixture providing a temporary PDF file path for testing."""
    pdf_path = tmp_path / "test_document.pdf"
    # Create a minimal PDF file for testing
    pdf_content = b"%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R>>endobj\nxref\n0 4\n0000000000 65535 f \n0000000009 00000 n \n0000000052 00000 n \n0000000101 00000 n \ntrailer<</Size 4/Root 1 0 R>>\nstartxref\n178\n%%EOF"
    pdf_path.write_bytes(pdf_content)
    return str(pdf_path)


@pytest.fixture
def sample_txt_path(tmp_path, sample_text_content):
    """Fixture providing a temporary text file for testing."""
    txt_path = tmp_path / "test_document.txt"
    txt_path.write_text(sample_text_content)
    return str(txt_path)


@pytest.fixture
def sample_csv_path(tmp_path):
    """Fixture providing a temporary CSV file for testing."""
    csv_path = tmp_path / "test_data.csv"
    csv_content = """name,age,city
Alice,30,New York
Bob,25,San Francisco
Charlie,35,Chicago
"""
    csv_path.write_text(csv_content)
    return str(csv_path)


@pytest.fixture
def sample_excel_path(tmp_path):
    """
    Fixture providing a temporary Excel file for testing.
    
    Requires openpyxl to be installed.
    """
    try:
        import pandas as pd
        excel_path = tmp_path / "test_data.xlsx"
        df = pd.DataFrame({
            'name': ['Alice', 'Bob', 'Charlie'],
            'age': [30, 25, 35],
            'city': ['New York', 'San Francisco', 'Chicago']
        })
        df.to_excel(str(excel_path), index=False)
        return str(excel_path)
    except ImportError:
        pytest.skip("pandas or openpyxl not installed")


@pytest.fixture
def mock_supabase_client():
    """Fixture providing a mock Supabase client."""
    mock_client = MagicMock()
    
    # Mock storage bucket
    mock_storage = MagicMock()
    mock_client.storage.from_.return_value = mock_storage
    
    # Mock table operations
    mock_table = MagicMock()
    mock_table.insert.return_value.execute.return_value = MagicMock(data=[{'id': 'test-id'}])
    mock_table.select.return_value.execute.return_value = MagicMock(data=[])
    mock_client.table.return_value = mock_table
    
    return mock_client


@pytest.fixture
def mock_ollama_response():
    """Fixture providing a mock Ollama API response."""
    return {
        "model": "llama3.2:3b",
        "response": "This is a test response from the LLM.",
        "done": True
    }


@pytest.fixture
def mock_embedding_model():
    """Fixture providing a mock sentence transformer model."""
    import numpy as np
    
    mock_model = MagicMock()
    # Return a 384-dimensional embedding (all-MiniLM-L6-v2 dimensions)
    mock_model.encode.return_value = np.random.rand(1, 384).astype('float32')
    
    return mock_model


@pytest.fixture
def sample_user_id():
    """Fixture providing a sample user ID for testing."""
    return "test-user-123"


@pytest.fixture
def sample_workspace_id():
    """Fixture providing a sample workspace ID for testing."""
    return "test-workspace-456"
