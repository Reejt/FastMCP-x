# Basic test for document ingestion tool
import unittest
from server.document_ingestion import ingest_file

class TestDocumentIngestion(unittest.TestCase):
    def test_ingest_txt(self):
        result = ingest_file("sample.txt")
        self.assertIn("ingested successfully", result)

if __name__ == "__main__":
    unittest.main()
