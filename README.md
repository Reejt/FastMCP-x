# FastMCP Document-Aware Query Assistant

## Overview
A model-agnostic assistant that ingests documents (CSV, XLS/XLSX, PPTX, DOC/DOCX, PDF, TXT) and answers queries using document context or general knowledge via configurable LLMs (Gemini CLI, open-source models, etc.).

## Directory Structure
```
FastMCP/
├── server/
│   ├── __init__.py
│   ├── main.py
│   ├── document_ingestion.py
│   ├── query_handler.py
│   └── model_manager.py
├── client/
│   ├── __init__.py
│   └── main.py
├── utils/
│   ├── __init__.py
│   └── file_parser.py
├── config/
│   └── settings.py
├── tests/
│   └── test_document_ingestion.py
├── requirements.txt
├── README.md
```

## Setup
- Install Python 3.9+
- Install dependencies from `requirements.txt`
- Start the server: `python server/main.py`
- Use the client to interact with the server

## Features
- Document ingestion for multiple file types
- Contextual and general query answering
- Model switching (Gemini, open-source, etc.)
- Modular, clean codebase

## License
MIT
