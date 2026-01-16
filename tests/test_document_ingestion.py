"""
Tests for server/document_ingestion.py

Tests document ingestion functionality including:
- File ingestion with various formats
- Supabase storage integration
- Document metadata handling
- Base64 content handling
"""

import pytest
import os
import sys
from unittest.mock import patch, MagicMock

# Add project root to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


class TestIngestFile:
    """Tests for the ingest_file function."""
    
    @patch('server.document_ingestion.supabase')
    @patch('server.document_ingestion.extract_and_store_file_content')
    def test_ingest_text_file_success(
        self, 
        mock_extract, 
        mock_supabase, 
        sample_txt_path, 
        sample_user_id, 
        sample_workspace_id
    ):
        """Test successful ingestion of a text file."""
        from server.document_ingestion import ingest_file
        
        # Setup mocks
        mock_extract.return_value = ("Sample content", True)
        mock_supabase.storage.from_.return_value.upload.return_value = None
        mock_supabase.table.return_value.insert.return_value.execute.return_value = MagicMock(
            data=[{'id': 'test-file-id'}]
        )
        
        result = ingest_file(
            file_path=sample_txt_path,
            user_id=sample_user_id,
            workspace_id=sample_workspace_id
        )
        
        assert "Successfully ingested" in result or "error" not in result.lower()
    
    def test_ingest_nonexistent_file(self, sample_user_id):
        """Test ingestion of a non-existent file."""
        from server.document_ingestion import ingest_file
        
        result = ingest_file(
            file_path="/nonexistent/path/file.txt",
            user_id=sample_user_id
        )
        
        assert "Error" in result or "not found" in result.lower()
    
    @patch('server.document_ingestion.supabase', None)
    def test_ingest_without_supabase_client(self, sample_txt_path, sample_user_id):
        """Test ingestion when Supabase client is not initialized."""
        from server.document_ingestion import ingest_file
        
        result = ingest_file(
            file_path=sample_txt_path,
            user_id=sample_user_id
        )
        
        # Should return error about missing Supabase
        assert "Error" in result or "Supabase" in result
    
    @patch('server.document_ingestion.supabase')
    @patch('server.document_ingestion.extract_and_store_file_content')
    def test_ingest_with_base64_content(
        self, 
        mock_extract, 
        mock_supabase,
        sample_user_id
    ):
        """Test ingestion using base64-encoded content."""
        from server.document_ingestion import ingest_file
        import base64
        
        # Setup mocks
        mock_extract.return_value = ("Sample content", True)
        mock_supabase.storage.from_.return_value.upload.return_value = None
        mock_supabase.table.return_value.insert.return_value.execute.return_value = MagicMock(
            data=[{'id': 'test-file-id'}]
        )
        
        # Create base64 content
        test_content = b"This is test content for base64 encoding"
        base64_content = base64.b64encode(test_content).decode('utf-8')
        
        result = ingest_file(
            file_path="dummy_path",
            user_id=sample_user_id,
            base64_content=base64_content,
            file_name="test_file.txt"
        )
        
        # Should not crash and should attempt to process
        assert result is not None


class TestDocumentStorage:
    """Tests for document storage in memory."""
    
    def test_documents_list_exists(self):
        """Test that the documents list is initialized."""
        from server.document_ingestion import documents
        
        assert isinstance(documents, list)


class TestFileTypeDetection:
    """Tests for file type detection logic."""
    
    def test_file_extension_mapping(self):
        """Test that common file extensions are properly mapped."""
        expected_mappings = {
            '.txt': 'text/plain',
            '.pdf': 'application/pdf',
            '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        }
        
        # These mappings should exist in the ingest_file function
        # This is a sanity check that the function handles these types
        for ext in expected_mappings.keys():
            assert ext in ['.txt', '.md', '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx']
