"""
Tests for utils/file_parser.py

Tests file parsing functionality for various supported formats:
- Text files (.txt)
- CSV files (.csv)
- Excel files (.xlsx, .xls)
- PDF files (.pdf)
- Word documents (.docx)
- PowerPoint presentations (.pptx)
"""

import pytest
import os
import sys

# Add project root to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


class TestTextExtraction:
    """Tests for text extraction from various file formats."""
    
    def test_extract_text_from_txt_file(self, sample_txt_path, sample_text_content):
        """Test extracting text from a plain text file."""
        from utils.file_parser import extract_text_from_file
        
        result = extract_text_from_file(sample_txt_path)
        
        assert result is not None
        assert "FastMCP" in result
        assert "Document-Aware Query Assistant" in result
    
    def test_extract_text_from_csv_file(self, sample_csv_path):
        """Test extracting text from a CSV file."""
        from utils.file_parser import extract_text_from_file
        
        result = extract_text_from_file(sample_csv_path)
        
        assert result is not None
        assert "Alice" in result or "name" in result
    
    def test_extract_text_from_nonexistent_file(self):
        """Test handling of non-existent file paths."""
        from utils.file_parser import extract_text_from_file
        
        result = extract_text_from_file("/nonexistent/path/file.txt")
        
        # Should return empty string or error message, not crash
        assert result == "" or "error" in result.lower() or result is None
    
    def test_extract_text_from_unsupported_format(self, tmp_path):
        """Test handling of unsupported file formats."""
        from utils.file_parser import extract_text_from_file
        
        unsupported_file = tmp_path / "test.xyz"
        unsupported_file.write_text("Some content")
        
        result = extract_text_from_file(str(unsupported_file))
        
        # Should handle gracefully
        assert result is not None or result == ""


class TestExcelParsing:
    """Tests for Excel file parsing."""
    
    def test_extract_text_from_excel(self, sample_excel_path):
        """Test extracting text from an Excel file."""
        from utils.file_parser import extract_text_from_file
        
        result = extract_text_from_file(sample_excel_path)
        
        assert result is not None
        # Should contain data from the Excel file
        assert "Alice" in result or "name" in result


class TestPDFParsing:
    """Tests for PDF file parsing."""
    
    def test_extract_text_from_pdf(self, sample_pdf_path):
        """Test extracting text from a PDF file (minimal PDF)."""
        from utils.file_parser import extract_text_from_file
        
        # Minimal PDF may not have extractable text, but should not crash
        result = extract_text_from_file(sample_pdf_path)
        
        # Should return something (even empty string for minimal PDF)
        assert result is not None


class TestImageOCR:
    """Tests for OCR functionality on images."""
    
    def test_extract_text_from_image_when_available(self, tmp_path):
        """Test OCR extraction from images when pytesseract is available."""
        try:
            from utils.file_parser import extract_text_from_image
            
            # Create a simple test image (white background)
            from PIL import Image
            img_path = tmp_path / "test_image.png"
            img = Image.new('RGB', (100, 100), color='white')
            img.save(str(img_path))
            
            result = extract_text_from_image(str(img_path))
            
            # Should not crash, may return empty string for blank image
            assert result is not None or result == ""
        except ImportError:
            pytest.skip("PIL or pytesseract not installed")


class TestFileValidation:
    """Tests for file validation and edge cases."""
    
    def test_empty_file_handling(self, tmp_path):
        """Test handling of empty files."""
        from utils.file_parser import extract_text_from_file
        
        empty_file = tmp_path / "empty.txt"
        empty_file.write_text("")
        
        result = extract_text_from_file(str(empty_file))
        
        assert result == ""
    
    def test_large_file_handling(self, tmp_path):
        """Test handling of larger text files."""
        from utils.file_parser import extract_text_from_file
        
        large_content = "This is a test sentence. " * 10000
        large_file = tmp_path / "large.txt"
        large_file.write_text(large_content)
        
        result = extract_text_from_file(str(large_file))
        
        assert result is not None
        assert len(result) > 0
