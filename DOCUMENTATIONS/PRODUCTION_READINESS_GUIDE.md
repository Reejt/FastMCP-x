# FastMCP-x Production Readiness Guide

> **Version**: 1.0  
> **Last Updated**: January 2026  
> **Audience**: Engineering Team, DevOps, Code Reviewers

This document establishes standards and best practices for ensuring FastMCP-x is production-ready, maintainable, and extensible.

---

## Table of Contents

1. [Testing Strategy](#1-testing-strategy)
2. [Database Best Practices](#2-database-best-practices)
3. [Error Handling Standards](#3-error-handling-standards)
4. [Security Hardening](#4-security-hardening)
5. [CI/CD Pipeline](#5-cicd-pipeline)
6. [Monitoring & Observability](#6-monitoring--observability)
7. [Code Extensibility](#7-code-extensibility)
8. [Pre-Production Checklist](#8-pre-production-checklist)

---

## 1. Testing Strategy

### 1.1 Coverage Requirements

| Test Type | Target Coverage | Enforcement |
|-----------|-----------------|-------------|
| Unit Tests | 80% minimum | CI blocks merge below threshold |
| Integration Tests | Critical paths 100% | Required for bridge/API routes |
| E2E Tests | Happy paths + edge cases | Required before release |

### 1.2 Backend Testing (Python/pytest)

#### Directory Structure
```
tests/
├── unit/                    # Isolated function tests
│   ├── test_document_ingestion.py
│   ├── test_query_handler.py
│   ├── test_csv_excel_processor.py
│   └── test_file_parser.py
├── integration/             # Service interaction tests
│   ├── test_bridge_server.py
│   ├── test_supabase_integration.py
│   └── test_ollama_integration.py
├── e2e/                     # Full workflow tests
│   └── test_document_workflow.py
├── fixtures/                # Shared test data
│   ├── sample_documents/
│   └── mock_responses/
└── conftest.py              # Shared fixtures
```

#### Required Fixtures (conftest.py)
```python
import pytest
from unittest.mock import MagicMock, patch

@pytest.fixture
def mock_supabase():
    """Mock Supabase client for all database operations."""
    with patch('server.document_ingestion.supabase') as mock:
        mock.table.return_value.select.return_value.execute.return_value = MagicMock(data=[])
        yield mock

@pytest.fixture
def mock_ollama():
    """Mock Ollama LLM for deterministic responses."""
    with patch('server.query_handler.requests.post') as mock:
        mock.return_value.json.return_value = {"response": "Mock LLM response"}
        mock.return_value.status_code = 200
        yield mock

@pytest.fixture
def sample_dataframe():
    """Standard DataFrame for CSV/Excel testing."""
    import pandas as pd
    return pd.DataFrame({
        'id': [1, 2, 3],
        'name': ['Alice', 'Bob', 'Charlie'],
        'value': [100, 200, 300]
    })

@pytest.fixture
def authenticated_user():
    """Mock authenticated user context."""
    return {
        'id': 'user-uuid-123',
        'email': 'test@example.com',
        'workspace_id': 'workspace-uuid-456'
    }
```

#### Test Patterns

**Pattern 1: Mocking External Services**
```python
class TestQueryHandler:
    def test_query_with_context_success(self, mock_ollama, mock_supabase):
        """Test that query returns LLM response with document context."""
        # Arrange
        mock_supabase.table.return_value.select.return_value.execute.return_value.data = [
            {"chunk_text": "Relevant document content"}
        ]
        
        # Act
        result = answer_query("What is the document about?", workspace_id="test")
        
        # Assert
        assert "Mock LLM response" in result
        mock_ollama.assert_called_once()

    def test_query_handles_llm_timeout(self, mock_ollama):
        """Test graceful degradation when LLM times out."""
        mock_ollama.side_effect = requests.Timeout()
        
        result = answer_query("test query")
        
        assert "temporarily unavailable" in result.lower()
```

**Pattern 2: Integration Tests with Real Services**
```python
@pytest.mark.integration
class TestBridgeServerIntegration:
    """Requires running backend services."""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Ensure services are running."""
        import requests
        try:
            requests.get("http://localhost:8000/health", timeout=5)
        except requests.ConnectionError:
            pytest.skip("Backend not running")
    
    def test_bridge_forwards_chat_request(self):
        """Test bridge server correctly proxies to MCP backend."""
        response = requests.post(
            "http://localhost:3001/api/chat",
            json={"message": "Hello", "workspace_id": "test"}
        )
        assert response.status_code == 200
        assert "text/event-stream" in response.headers.get("content-type", "")
```

### 1.3 Frontend Testing (Jest + Testing Library)

#### Setup (package.json additions)
```json
{
  "devDependencies": {
    "@testing-library/react": "^14.0.0",
    "@testing-library/jest-dom": "^6.0.0",
    "jest": "^29.0.0",
    "jest-environment-jsdom": "^29.0.0"
  },
  "scripts": {
    "test": "jest",
    "test:watch": "jest --watch",
    "test:coverage": "jest --coverage"
  }
}
```

#### Component Test Example
```typescript
// __tests__/components/Chat/ChatMessage.test.tsx
import { render, screen } from '@testing-library/react';
import { ChatMessage } from '@/app/components/Chat/ChatMessage';

describe('ChatMessage', () => {
  it('renders user message with correct styling', () => {
    render(<ChatMessage role="user" content="Hello" />);
    
    expect(screen.getByText('Hello')).toBeInTheDocument();
    expect(screen.getByRole('article')).toHaveClass('bg-blue-100');
  });

  it('renders assistant message with markdown', () => {
    render(<ChatMessage role="assistant" content="**Bold text**" />);
    
    expect(screen.getByText('Bold text')).toHaveStyle('font-weight: bold');
  });
});
```

### 1.4 E2E Testing (Playwright)

#### Setup
```bash
npm init playwright@latest
```

#### Critical Path Tests
```typescript
// e2e/document-workflow.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Document Ingestion Workflow', () => {
  test.beforeEach(async ({ page }) => {
    // Login via Supabase magic link (use test account)
    await page.goto('/login');
    await page.fill('[data-testid="email-input"]', process.env.TEST_EMAIL);
    await page.click('[data-testid="login-button"]');
    // Wait for redirect after magic link verification
    await page.waitForURL('/dashboard', { timeout: 30000 });
  });

  test('user can upload and query document', async ({ page }) => {
    // Upload document
    await page.goto('/vault');
    await page.setInputFiles('input[type="file"]', 'tests/fixtures/sample.pdf');
    await expect(page.getByText('Upload successful')).toBeVisible();

    // Query document
    await page.goto('/workspaces/test-workspace');
    await page.fill('[data-testid="chat-input"]', 'Summarize the document');
    await page.click('[data-testid="send-button"]');
    
    // Verify response contains document content
    await expect(page.getByTestId('assistant-message')).toContainText(/summary/i);
  });
});
```

---

## 2. Database Best Practices

### 2.1 Migration Strategy

Use **Supabase CLI** for migrations to maintain compatibility with hosted Supabase:

```bash
# Install Supabase CLI
npm install -g supabase

# Initialize migrations
supabase init

# Create new migration
supabase migration new add_audit_columns

# Apply migrations
supabase db push
```

#### Migration Directory Structure
```
supabase/
├── migrations/
│   ├── 20260101000000_initial_schema.sql
│   ├── 20260115000000_add_audit_columns.sql
│   └── 20260120000000_add_soft_delete.sql
├── seed.sql
└── config.toml
```

#### Migration Template
```sql
-- migrations/20260120000000_add_soft_delete.sql

-- Add soft delete columns to key tables
ALTER TABLE file_upload 
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;

ALTER TABLE workspaces 
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;

ALTER TABLE chats 
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;

-- Create index for soft delete queries
CREATE INDEX IF NOT EXISTS idx_file_upload_deleted 
ON file_upload(deleted_at) WHERE deleted_at IS NULL;

-- Update RLS policies to exclude soft-deleted records
DROP POLICY IF EXISTS "Users can view own files" ON file_upload;
CREATE POLICY "Users can view own non-deleted files" ON file_upload
FOR SELECT USING (
    auth.uid() = user_id 
    AND deleted_at IS NULL
);
```

### 2.2 Indexing Strategy

| Table | Index | Type | Purpose |
|-------|-------|------|---------|
| `document_embeddings` | `embedding` | IVFFLAT (lists=100) | Vector similarity search |
| `file_upload` | `workspace_id, created_at` | B-tree | Workspace file listing |
| `chats` | `workspace_id, created_at` | B-tree | Chat history pagination |
| `workspaces` | `user_id` | B-tree | User workspace lookup |
| `document_content` | `file_id` | B-tree | Content retrieval |

```sql
-- Create missing indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_file_upload_workspace_created 
ON file_upload(workspace_id, created_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_chats_workspace_created 
ON chats(workspace_id, created_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_workspaces_user 
ON workspaces(user_id);
```

### 2.3 Connection Pooling

For production, use **Supabase's built-in connection pooler** (pgBouncer):

```python
# server/config.py
import os

DATABASE_CONFIG = {
    'development': {
        'url': os.getenv('SUPABASE_URL'),  # Direct connection
        'pool_size': 5
    },
    'production': {
        'url': os.getenv('SUPABASE_POOLER_URL'),  # pgBouncer endpoint
        'pool_size': 20,
        'pool_timeout': 30,
        'pool_recycle': 1800  # 30 minutes
    }
}
```

### 2.4 Audit Logging

Add audit columns to critical tables:

```sql
-- Add audit columns
ALTER TABLE workspaces
ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id),
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW(),
ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES auth.users(id);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER workspaces_updated_at
BEFORE UPDATE ON workspaces
FOR EACH ROW EXECUTE FUNCTION update_updated_at();
```

---

## 3. Error Handling Standards

### 3.1 Exception Hierarchy

Create a structured exception hierarchy in `server/exceptions.py`:

```python
"""Custom exceptions for FastMCP-x server."""

class FastMCPError(Exception):
    """Base exception for all FastMCP errors."""
    
    def __init__(self, message: str, code: str, details: dict = None):
        self.message = message
        self.code = code
        self.details = details or {}
        super().__init__(message)
    
    def to_dict(self) -> dict:
        return {
            "error": {
                "code": self.code,
                "message": self.message,
                "details": self.details
            }
        }


class DocumentIngestionError(FastMCPError):
    """Errors during document upload/processing."""
    pass


class QueryProcessingError(FastMCPError):
    """Errors during query handling."""
    pass


class LLMServiceError(FastMCPError):
    """Errors from LLM service (Ollama)."""
    pass


class DatabaseError(FastMCPError):
    """Database operation errors."""
    pass


class AuthenticationError(FastMCPError):
    """Authentication/authorization errors."""
    pass


class RateLimitError(FastMCPError):
    """Rate limiting errors."""
    pass


# Error codes
class ErrorCodes:
    # Document errors (1xxx)
    DOC_UPLOAD_FAILED = "DOC_1001"
    DOC_PARSE_FAILED = "DOC_1002"
    DOC_NOT_FOUND = "DOC_1003"
    DOC_TYPE_UNSUPPORTED = "DOC_1004"
    
    # Query errors (2xxx)
    QUERY_EMPTY = "QUERY_2001"
    QUERY_TOO_LONG = "QUERY_2002"
    QUERY_PROCESSING_FAILED = "QUERY_2003"
    
    # LLM errors (3xxx)
    LLM_UNAVAILABLE = "LLM_3001"
    LLM_TIMEOUT = "LLM_3002"
    LLM_INVALID_RESPONSE = "LLM_3003"
    
    # Database errors (4xxx)
    DB_CONNECTION_FAILED = "DB_4001"
    DB_QUERY_FAILED = "DB_4002"
    DB_CONSTRAINT_VIOLATION = "DB_4003"
    
    # Auth errors (5xxx)
    AUTH_INVALID_TOKEN = "AUTH_5001"
    AUTH_EXPIRED_SESSION = "AUTH_5002"
    AUTH_INSUFFICIENT_PERMISSIONS = "AUTH_5003"
    
    # Rate limit errors (6xxx)
    RATE_LIMIT_EXCEEDED = "RATE_6001"
```

### 3.2 Retry Logic with Exponential Backoff

```python
# server/utils/retry.py
import time
import functools
import random
from typing import Callable, Type, Tuple
import logging

logger = logging.getLogger(__name__)


def retry_with_backoff(
    max_retries: int = 3,
    base_delay: float = 1.0,
    max_delay: float = 60.0,
    exponential_base: float = 2.0,
    jitter: bool = True,
    retryable_exceptions: Tuple[Type[Exception], ...] = (Exception,)
):
    """
    Decorator for retrying functions with exponential backoff.
    
    Args:
        max_retries: Maximum number of retry attempts
        base_delay: Initial delay in seconds
        max_delay: Maximum delay cap
        exponential_base: Base for exponential calculation
        jitter: Add randomness to prevent thundering herd
        retryable_exceptions: Exception types that trigger retry
    """
    def decorator(func: Callable):
        @functools.wraps(func)
        def wrapper(*args, **kwargs):
            last_exception = None
            
            for attempt in range(max_retries + 1):
                try:
                    return func(*args, **kwargs)
                except retryable_exceptions as e:
                    last_exception = e
                    
                    if attempt == max_retries:
                        logger.error(
                            f"Function {func.__name__} failed after {max_retries} retries",
                            extra={"error": str(e), "attempt": attempt}
                        )
                        raise
                    
                    delay = min(base_delay * (exponential_base ** attempt), max_delay)
                    
                    if jitter:
                        delay = delay * (0.5 + random.random())
                    
                    logger.warning(
                        f"Retry {attempt + 1}/{max_retries} for {func.__name__} "
                        f"after {delay:.2f}s delay",
                        extra={"error": str(e)}
                    )
                    
                    time.sleep(delay)
            
            raise last_exception
        
        return wrapper
    return decorator


# Usage example
@retry_with_backoff(
    max_retries=3,
    base_delay=1.0,
    retryable_exceptions=(requests.Timeout, requests.ConnectionError)
)
def query_ollama(prompt: str) -> str:
    """Query Ollama with automatic retry on transient failures."""
    response = requests.post(
        "http://localhost:11434/api/generate",
        json={"model": "llama3.2:3b", "prompt": prompt},
        timeout=120
    )
    response.raise_for_status()
    return response.json()["response"]
```

### 3.3 Error Handling Pattern in API Routes

```python
# server/main.py - Updated error handling pattern

from server.exceptions import (
    FastMCPError, 
    LLMServiceError, 
    DatabaseError,
    ErrorCodes
)
import logging

logger = logging.getLogger(__name__)


@mcp.tool
def answer_query(query: str, workspace_id: str = None) -> str:
    """Answer a user query with document context."""
    
    # Input validation
    if not query or not query.strip():
        raise QueryProcessingError(
            message="Query cannot be empty",
            code=ErrorCodes.QUERY_EMPTY
        )
    
    if len(query) > 10000:
        raise QueryProcessingError(
            message="Query exceeds maximum length of 10000 characters",
            code=ErrorCodes.QUERY_TOO_LONG,
            details={"max_length": 10000, "actual_length": len(query)}
        )
    
    try:
        # Attempt to get document context
        context = get_relevant_context(query, workspace_id)
        
    except Exception as e:
        logger.warning(f"Failed to retrieve context: {e}, proceeding without context")
        context = None
    
    try:
        # Query LLM
        response = query_ollama_with_context(query, context)
        return response
        
    except requests.Timeout:
        raise LLMServiceError(
            message="LLM service timed out. Please try again.",
            code=ErrorCodes.LLM_TIMEOUT
        )
    except requests.ConnectionError:
        raise LLMServiceError(
            message="LLM service is temporarily unavailable.",
            code=ErrorCodes.LLM_UNAVAILABLE
        )
    except Exception as e:
        logger.exception(f"Unexpected error in answer_query: {e}")
        raise QueryProcessingError(
            message="An unexpected error occurred while processing your query.",
            code=ErrorCodes.QUERY_PROCESSING_FAILED,
            details={"original_error": str(e)}
        )
```

### 3.4 Error Tracking Integration (Sentry)

```python
# server/observability.py
import sentry_sdk
from sentry_sdk.integrations.fastapi import FastApiIntegration
import os


def init_error_tracking():
    """Initialize Sentry error tracking."""
    sentry_dsn = os.getenv("SENTRY_DSN")
    
    if not sentry_dsn:
        print("⚠️  SENTRY_DSN not configured, error tracking disabled")
        return
    
    sentry_sdk.init(
        dsn=sentry_dsn,
        integrations=[FastApiIntegration()],
        traces_sample_rate=0.1,  # 10% of transactions
        profiles_sample_rate=0.1,
        environment=os.getenv("ENVIRONMENT", "development"),
        release=os.getenv("APP_VERSION", "unknown"),
        
        # Filter sensitive data
        before_send=filter_sensitive_data,
    )


def filter_sensitive_data(event, hint):
    """Remove sensitive information before sending to Sentry."""
    # Remove API keys from request headers
    if "request" in event and "headers" in event["request"]:
        headers = event["request"]["headers"]
        sensitive_headers = ["authorization", "x-api-key", "cookie"]
        for header in sensitive_headers:
            if header in headers:
                headers[header] = "[FILTERED]"
    
    return event
```

---

## 4. Security Hardening

### 4.1 Rate Limiting

#### Backend Rate Limiting (FastAPI)
```python
# server/middleware/rate_limit.py
from fastapi import Request, HTTPException
from collections import defaultdict
import time
import asyncio


class RateLimiter:
    """Token bucket rate limiter."""
    
    def __init__(
        self,
        requests_per_minute: int = 60,
        burst_size: int = 10
    ):
        self.requests_per_minute = requests_per_minute
        self.burst_size = burst_size
        self.buckets = defaultdict(lambda: {"tokens": burst_size, "last_update": time.time()})
        self._lock = asyncio.Lock()
    
    async def is_allowed(self, key: str) -> bool:
        """Check if request is allowed under rate limit."""
        async with self._lock:
            bucket = self.buckets[key]
            now = time.time()
            
            # Refill tokens based on time elapsed
            time_passed = now - bucket["last_update"]
            tokens_to_add = time_passed * (self.requests_per_minute / 60)
            bucket["tokens"] = min(self.burst_size, bucket["tokens"] + tokens_to_add)
            bucket["last_update"] = now
            
            if bucket["tokens"] >= 1:
                bucket["tokens"] -= 1
                return True
            return False


# Global rate limiters
global_limiter = RateLimiter(requests_per_minute=100)
user_limiter = RateLimiter(requests_per_minute=30, burst_size=5)


async def rate_limit_middleware(request: Request, call_next):
    """Rate limiting middleware."""
    # Get client identifier
    client_ip = request.client.host
    user_id = request.state.user_id if hasattr(request.state, "user_id") else None
    
    # Check global rate limit
    if not await global_limiter.is_allowed(client_ip):
        raise HTTPException(
            status_code=429,
            detail={
                "error": "Rate limit exceeded",
                "code": "RATE_6001",
                "retry_after": 60
            }
        )
    
    # Check user-specific rate limit
    if user_id and not await user_limiter.is_allowed(user_id):
        raise HTTPException(
            status_code=429,
            detail={
                "error": "User rate limit exceeded",
                "code": "RATE_6001",
                "retry_after": 60
            }
        )
    
    response = await call_next(request)
    return response
```

#### Frontend API Route Rate Limiting (Next.js)
```typescript
// frontend/app/api/middleware/rateLimit.ts
import { NextRequest, NextResponse } from 'next/server';

interface RateLimitStore {
  [key: string]: {
    count: number;
    resetTime: number;
  };
}

const store: RateLimitStore = {};

export function rateLimit(
  request: NextRequest,
  { limit = 10, windowMs = 60000 }: { limit?: number; windowMs?: number } = {}
): { success: boolean; remaining: number } {
  const ip = request.headers.get('x-forwarded-for') || 'unknown';
  const key = `${ip}:${request.nextUrl.pathname}`;
  const now = Date.now();

  if (!store[key] || store[key].resetTime < now) {
    store[key] = { count: 1, resetTime: now + windowMs };
    return { success: true, remaining: limit - 1 };
  }

  store[key].count++;
  
  if (store[key].count > limit) {
    return { success: false, remaining: 0 };
  }

  return { success: true, remaining: limit - store[key].count };
}

// Usage in API route
export async function POST(request: NextRequest) {
  const { success, remaining } = rateLimit(request, { limit: 20 });
  
  if (!success) {
    return NextResponse.json(
      { error: 'Rate limit exceeded', code: 'RATE_6001' },
      { 
        status: 429,
        headers: { 'X-RateLimit-Remaining': '0', 'Retry-After': '60' }
      }
    );
  }

  // Process request...
}
```

### 4.2 Input Sanitization

```python
# server/utils/sanitize.py
import re
import html
from typing import Optional


def sanitize_llm_input(text: str, max_length: int = 10000) -> str:
    """
    Sanitize user input before passing to LLM.
    
    - Removes potential prompt injection patterns
    - Escapes special characters
    - Truncates to max length
    """
    if not text:
        return ""
    
    # Truncate
    text = text[:max_length]
    
    # Remove common prompt injection patterns
    injection_patterns = [
        r"ignore\s+(previous|above)\s+instructions?",
        r"disregard\s+(previous|above)\s+instructions?",
        r"forget\s+(previous|above)\s+instructions?",
        r"new\s+instructions?:",
        r"system\s*:",
        r"\[INST\]",
        r"\[/INST\]",
        r"<\|im_start\|>",
        r"<\|im_end\|>",
    ]
    
    for pattern in injection_patterns:
        text = re.sub(pattern, "[FILTERED]", text, flags=re.IGNORECASE)
    
    return text.strip()


def sanitize_filename(filename: str) -> str:
    """Sanitize filename to prevent path traversal."""
    # Remove path separators
    filename = filename.replace("/", "_").replace("\\", "_")
    
    # Remove null bytes
    filename = filename.replace("\x00", "")
    
    # Remove leading dots (hidden files)
    filename = filename.lstrip(".")
    
    # Limit length
    name, ext = filename.rsplit(".", 1) if "." in filename else (filename, "")
    name = name[:200]
    
    return f"{name}.{ext}" if ext else name


def sanitize_sql_identifier(identifier: str) -> Optional[str]:
    """Sanitize SQL identifier (table/column names)."""
    if not identifier:
        return None
    
    # Only allow alphanumeric and underscores
    if not re.match(r'^[a-zA-Z_][a-zA-Z0-9_]*$', identifier):
        return None
    
    return identifier
```

### 4.3 Safe Code Execution (CSV/Excel Processor)

```python
# server/csv_excel_processor.py - Enhanced safety

import ast
import builtins


SAFE_BUILTINS = {
    'abs', 'all', 'any', 'bool', 'dict', 'enumerate', 'filter',
    'float', 'int', 'len', 'list', 'map', 'max', 'min', 'range',
    'round', 'set', 'sorted', 'str', 'sum', 'tuple', 'zip',
    'True', 'False', 'None'
}

FORBIDDEN_PATTERNS = [
    'import ', 'exec(', 'eval(', 'compile(', 'open(',
    '__import__', 'globals(', 'locals(', 'getattr(',
    'setattr(', 'delattr(', 'hasattr(', '__builtins__',
    'subprocess', 'os.system', 'os.popen', 'os.exec',
]


def validate_generated_code(code: str) -> tuple[bool, str]:
    """
    Validate LLM-generated pandas code for safety.
    
    Returns: (is_safe, error_message)
    """
    # Check for forbidden patterns
    code_lower = code.lower()
    for pattern in FORBIDDEN_PATTERNS:
        if pattern.lower() in code_lower:
            return False, f"Forbidden pattern detected: {pattern}"
    
    # Parse AST to check for dangerous operations
    try:
        tree = ast.parse(code)
    except SyntaxError as e:
        return False, f"Syntax error: {e}"
    
    for node in ast.walk(tree):
        # Block imports
        if isinstance(node, (ast.Import, ast.ImportFrom)):
            return False, "Import statements not allowed"
        
        # Block exec/eval calls
        if isinstance(node, ast.Call):
            if isinstance(node.func, ast.Name):
                if node.func.id in ('exec', 'eval', 'compile', 'open'):
                    return False, f"Function '{node.func.id}' not allowed"
        
        # Block attribute access to dangerous modules
        if isinstance(node, ast.Attribute):
            if node.attr in ('system', 'popen', 'spawn', 'exec'):
                return False, f"Attribute '{node.attr}' not allowed"
    
    return True, ""


def execute_safe_pandas_code(code: str, df, timeout: int = 30):
    """Execute validated pandas code in restricted environment."""
    import pandas as pd
    import numpy as np
    import signal
    
    # Validate first
    is_safe, error = validate_generated_code(code)
    if not is_safe:
        raise ValueError(f"Unsafe code detected: {error}")
    
    # Create restricted globals
    safe_globals = {
        '__builtins__': {k: getattr(builtins, k) for k in SAFE_BUILTINS if hasattr(builtins, k)},
        'pd': pd,
        'np': np,
        'df': df,
    }
    
    # Timeout handler
    def timeout_handler(signum, frame):
        raise TimeoutError("Code execution timed out")
    
    # Set timeout (Unix only)
    old_handler = signal.signal(signal.SIGALRM, timeout_handler)
    signal.alarm(timeout)
    
    try:
        result = {}
        exec(code, safe_globals, result)
        return result.get('result', result)
    finally:
        signal.alarm(0)
        signal.signal(signal.SIGALRM, old_handler)
```

### 4.4 Content Security Policy

```typescript
// frontend/next.config.ts
import type { NextConfig } from 'next';

const cspHeader = `
    default-src 'self';
    script-src 'self' 'unsafe-eval' 'unsafe-inline';
    style-src 'self' 'unsafe-inline';
    img-src 'self' blob: data: https:;
    font-src 'self' data:;
    connect-src 'self' ${process.env.NEXT_PUBLIC_SUPABASE_URL} https://*.supabase.co wss://*.supabase.co http://localhost:* https://api.tavily.com;
    frame-ancestors 'none';
    form-action 'self';
    base-uri 'self';
    object-src 'none';
`.replace(/\n/g, ' ').trim();

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: cspHeader,
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
```

---

## 5. CI/CD Pipeline

### 5.1 GitHub Actions Workflow

```yaml
# .github/workflows/ci.yml
name: CI/CD Pipeline

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

env:
  PYTHON_VERSION: '3.11'
  NODE_VERSION: '20'

jobs:
  # ============================================
  # Backend Jobs
  # ============================================
  backend-lint:
    name: Backend Lint
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Set up Python
        uses: actions/setup-python@v5
        with:
          python-version: ${{ env.PYTHON_VERSION }}
          cache: 'pip'
      
      - name: Install dependencies
        run: |
          pip install ruff mypy
          pip install -r requirements.txt
      
      - name: Run Ruff linter
        run: ruff check server/ utils/ tests/
      
      - name: Run Ruff formatter check
        run: ruff format --check server/ utils/ tests/
      
      - name: Run MyPy type checker
        run: mypy server/ --ignore-missing-imports

  backend-test:
    name: Backend Tests
    runs-on: ubuntu-latest
    needs: backend-lint
    steps:
      - uses: actions/checkout@v4
      
      - name: Set up Python
        uses: actions/setup-python@v5
        with:
          python-version: ${{ env.PYTHON_VERSION }}
          cache: 'pip'
      
      - name: Install dependencies
        run: pip install -r requirements.txt
      
      - name: Run tests with coverage
        run: |
          pytest tests/ \
            --cov=server \
            --cov=utils \
            --cov-report=xml \
            --cov-report=html \
            --cov-fail-under=80
      
      - name: Upload coverage to Codecov
        uses: codecov/codecov-action@v4
        with:
          files: ./coverage.xml
          fail_ci_if_error: true

  # ============================================
  # Frontend Jobs
  # ============================================
  frontend-lint:
    name: Frontend Lint
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: frontend
    steps:
      - uses: actions/checkout@v4
      
      - name: Set up Node.js
        uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'npm'
          cache-dependency-path: frontend/package-lock.json
      
      - name: Install dependencies
        run: npm ci
      
      - name: Run ESLint
        run: npm run lint
      
      - name: Check TypeScript
        run: npx tsc --noEmit

  frontend-test:
    name: Frontend Tests
    runs-on: ubuntu-latest
    needs: frontend-lint
    defaults:
      run:
        working-directory: frontend
    steps:
      - uses: actions/checkout@v4
      
      - name: Set up Node.js
        uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'npm'
          cache-dependency-path: frontend/package-lock.json
      
      - name: Install dependencies
        run: npm ci
      
      - name: Run tests
        run: npm test -- --coverage --watchAll=false
      
      - name: Upload coverage
        uses: codecov/codecov-action@v4
        with:
          files: frontend/coverage/lcov.info

  # ============================================
  # Integration Tests
  # ============================================
  integration-test:
    name: Integration Tests
    runs-on: ubuntu-latest
    needs: [backend-test, frontend-test]
    services:
      postgres:
        image: pgvector/pgvector:pg16
        env:
          POSTGRES_PASSWORD: postgres
          POSTGRES_DB: test_db
        ports:
          - 5432:5432
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
    steps:
      - uses: actions/checkout@v4
      
      - name: Set up Python
        uses: actions/setup-python@v5
        with:
          python-version: ${{ env.PYTHON_VERSION }}
      
      - name: Install dependencies
        run: pip install -r requirements.txt
      
      - name: Run integration tests
        env:
          DATABASE_URL: postgresql://postgres:postgres@localhost:5432/test_db
        run: pytest tests/integration/ -v --tb=short

  # ============================================
  # E2E Tests
  # ============================================
  e2e-test:
    name: E2E Tests
    runs-on: ubuntu-latest
    needs: integration-test
    if: github.event_name == 'push' && github.ref == 'refs/heads/main'
    steps:
      - uses: actions/checkout@v4
      
      - name: Set up Node.js
        uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
      
      - name: Install Playwright
        working-directory: frontend
        run: |
          npm ci
          npx playwright install --with-deps
      
      - name: Start services
        run: docker compose -f docker-compose.dev.yml up -d
      
      - name: Wait for services
        run: |
          timeout 60 bash -c 'until curl -s http://localhost:3000 > /dev/null; do sleep 2; done'
      
      - name: Run E2E tests
        working-directory: frontend
        run: npx playwright test
      
      - name: Upload test results
        uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: playwright-report
          path: frontend/playwright-report/

  # ============================================
  # Build & Push
  # ============================================
  build:
    name: Build Docker Images
    runs-on: ubuntu-latest
    needs: [backend-test, frontend-test]
    if: github.event_name == 'push'
    steps:
      - uses: actions/checkout@v4
      
      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3
      
      - name: Login to Container Registry
        uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      
      - name: Build and push backend
        uses: docker/build-push-action@v5
        with:
          context: .
          file: server/Dockerfile
          push: ${{ github.ref == 'refs/heads/main' }}
          tags: ghcr.io/${{ github.repository }}/backend:${{ github.sha }}
          cache-from: type=gha
          cache-to: type=gha,mode=max
      
      - name: Build and push frontend
        uses: docker/build-push-action@v5
        with:
          context: frontend
          file: frontend/Dockerfile
          push: ${{ github.ref == 'refs/heads/main' }}
          tags: ghcr.io/${{ github.repository }}/frontend:${{ github.sha }}
          cache-from: type=gha
          cache-to: type=gha,mode=max

  # ============================================
  # Deploy (Production)
  # ============================================
  deploy:
    name: Deploy to Production
    runs-on: ubuntu-latest
    needs: [build, e2e-test]
    if: github.event_name == 'push' && github.ref == 'refs/heads/main'
    environment: production
    steps:
      - name: Deploy notification
        run: echo "Deploying ${{ github.sha }} to production"
      
      # Add your deployment steps here (e.g., kubectl, terraform, etc.)
```

### 5.2 Pre-commit Hooks

```yaml
# .pre-commit-config.yaml
repos:
  - repo: https://github.com/astral-sh/ruff-pre-commit
    rev: v0.3.0
    hooks:
      - id: ruff
        args: [--fix]
      - id: ruff-format

  - repo: https://github.com/pre-commit/pre-commit-hooks
    rev: v4.5.0
    hooks:
      - id: trailing-whitespace
      - id: end-of-file-fixer
      - id: check-yaml
      - id: check-json
      - id: check-added-large-files
        args: ['--maxkb=1000']
      - id: detect-private-key

  - repo: https://github.com/pre-commit/mirrors-mypy
    rev: v1.8.0
    hooks:
      - id: mypy
        additional_dependencies: [types-requests]
        args: [--ignore-missing-imports]

  - repo: local
    hooks:
      - id: pytest-check
        name: pytest-check
        entry: pytest tests/ -x -q
        language: system
        pass_filenames: false
        always_run: true
```

---

## 6. Monitoring & Observability

### 6.1 Structured Logging

```python
# server/logging_config.py
import logging
import json
import sys
from datetime import datetime
from typing import Any
import uuid


class StructuredFormatter(logging.Formatter):
    """JSON formatter for structured logging."""
    
    def format(self, record: logging.LogRecord) -> str:
        log_entry = {
            "timestamp": datetime.utcnow().isoformat() + "Z",
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
            "module": record.module,
            "function": record.funcName,
            "line": record.lineno,
        }
        
        # Add correlation ID if present
        if hasattr(record, "correlation_id"):
            log_entry["correlation_id"] = record.correlation_id
        
        # Add extra fields
        if hasattr(record, "extra"):
            log_entry.update(record.extra)
        
        # Add exception info if present
        if record.exc_info:
            log_entry["exception"] = self.formatException(record.exc_info)
        
        return json.dumps(log_entry)


def setup_logging(level: str = "INFO"):
    """Configure structured logging for the application."""
    
    # Create handler
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(StructuredFormatter())
    
    # Configure root logger
    root_logger = logging.getLogger()
    root_logger.setLevel(getattr(logging, level.upper()))
    root_logger.handlers = [handler]
    
    # Reduce noise from third-party libraries
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("urllib3").setLevel(logging.WARNING)


class CorrelationIdFilter(logging.Filter):
    """Add correlation ID to all log records."""
    
    def __init__(self):
        super().__init__()
        self._correlation_id = None
    
    def set_correlation_id(self, correlation_id: str):
        self._correlation_id = correlation_id
    
    def filter(self, record: logging.LogRecord) -> bool:
        record.correlation_id = self._correlation_id or str(uuid.uuid4())
        return True


# Usage
correlation_filter = CorrelationIdFilter()
logging.getLogger().addFilter(correlation_filter)
```

### 6.2 Prometheus Metrics

```python
# server/metrics.py
from prometheus_client import Counter, Histogram, Gauge, generate_latest
import time
from functools import wraps

# Request metrics
REQUEST_COUNT = Counter(
    'fastmcp_requests_total',
    'Total number of requests',
    ['method', 'endpoint', 'status']
)

REQUEST_LATENCY = Histogram(
    'fastmcp_request_latency_seconds',
    'Request latency in seconds',
    ['method', 'endpoint'],
    buckets=[.01, .025, .05, .075, .1, .25, .5, .75, 1.0, 2.5, 5.0, 7.5, 10.0]
)

# LLM metrics
LLM_REQUEST_COUNT = Counter(
    'fastmcp_llm_requests_total',
    'Total LLM requests',
    ['model', 'status']
)

LLM_LATENCY = Histogram(
    'fastmcp_llm_latency_seconds',
    'LLM request latency',
    ['model'],
    buckets=[1, 2, 5, 10, 30, 60, 120]
)

LLM_TOKEN_COUNT = Counter(
    'fastmcp_llm_tokens_total',
    'Total tokens processed',
    ['model', 'type']  # type: input/output
)

# Document metrics
DOCUMENTS_INGESTED = Counter(
    'fastmcp_documents_ingested_total',
    'Total documents ingested',
    ['file_type', 'status']
)

EMBEDDING_LATENCY = Histogram(
    'fastmcp_embedding_latency_seconds',
    'Embedding generation latency',
    buckets=[.1, .25, .5, 1, 2, 5]
)

# Active connections
ACTIVE_CONNECTIONS = Gauge(
    'fastmcp_active_connections',
    'Number of active SSE connections'
)


def track_latency(metric: Histogram, labels: dict = None):
    """Decorator to track function latency."""
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            start = time.time()
            try:
                return func(*args, **kwargs)
            finally:
                duration = time.time() - start
                if labels:
                    metric.labels(**labels).observe(duration)
                else:
                    metric.observe(duration)
        return wrapper
    return decorator


# Metrics endpoint for Prometheus scraping
def metrics_endpoint():
    """Generate Prometheus metrics output."""
    return generate_latest()
```

### 6.3 Health Check Endpoint

```python
# server/health.py
from fastapi import APIRouter
from datetime import datetime
import asyncio

router = APIRouter()


async def check_database() -> dict:
    """Check database connectivity."""
    try:
        from frontend.lib.supabase.server import create_client
        client = create_client()
        # Simple query to verify connection
        result = await asyncio.wait_for(
            asyncio.to_thread(
                lambda: client.table('workspaces').select('id').limit(1).execute()
            ),
            timeout=5.0
        )
        return {"status": "healthy", "latency_ms": 0}  # Add actual latency
    except Exception as e:
        return {"status": "unhealthy", "error": str(e)}


async def check_ollama() -> dict:
    """Check Ollama LLM service."""
    import requests
    try:
        start = datetime.now()
        response = requests.get("http://localhost:11434/api/tags", timeout=5)
        latency = (datetime.now() - start).total_seconds() * 1000
        if response.status_code == 200:
            return {"status": "healthy", "latency_ms": round(latency, 2)}
        return {"status": "degraded", "error": f"Status {response.status_code}"}
    except Exception as e:
        return {"status": "unhealthy", "error": str(e)}


async def check_embedding_model() -> dict:
    """Check embedding model availability."""
    try:
        from sentence_transformers import SentenceTransformer
        model = SentenceTransformer('all-MiniLM-L6-v2')
        # Quick embedding test
        start = datetime.now()
        _ = model.encode("test")
        latency = (datetime.now() - start).total_seconds() * 1000
        return {"status": "healthy", "latency_ms": round(latency, 2)}
    except Exception as e:
        return {"status": "unhealthy", "error": str(e)}


@router.get("/health")
async def health_check():
    """Comprehensive health check endpoint."""
    checks = await asyncio.gather(
        check_database(),
        check_ollama(),
        check_embedding_model(),
        return_exceptions=True
    )
    
    results = {
        "database": checks[0] if not isinstance(checks[0], Exception) else {"status": "error", "error": str(checks[0])},
        "ollama": checks[1] if not isinstance(checks[1], Exception) else {"status": "error", "error": str(checks[1])},
        "embedding_model": checks[2] if not isinstance(checks[2], Exception) else {"status": "error", "error": str(checks[2])},
    }
    
    # Determine overall status
    statuses = [r.get("status", "error") for r in results.values()]
    if all(s == "healthy" for s in statuses):
        overall = "healthy"
        http_status = 200
    elif any(s == "unhealthy" for s in statuses):
        overall = "unhealthy"
        http_status = 503
    else:
        overall = "degraded"
        http_status = 200
    
    return {
        "status": overall,
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "checks": results
    }, http_status


@router.get("/ready")
async def readiness_check():
    """Kubernetes readiness probe."""
    # Check if critical services are ready
    db = await check_database()
    if db["status"] == "unhealthy":
        return {"ready": False}, 503
    return {"ready": True}, 200


@router.get("/live")
async def liveness_check():
    """Kubernetes liveness probe."""
    return {"alive": True}, 200
```

---

## 7. Code Extensibility

### 7.1 Tool Registration Pattern

Current pattern in `server/main.py` using `@mcp.tool` decorator:

```python
from fastmcp import FastMCP

mcp = FastMCP("FastMCP-x")


@mcp.tool
def tool_name(param: str) -> str:
    """Tool description shown to LLM."""
    # Implementation
    return result
```

### 7.2 Abstract Base Class for Tools

Create extensible tool interfaces:

```python
# server/tools/base.py
from abc import ABC, abstractmethod
from typing import Any, Dict, Optional
from dataclasses import dataclass


@dataclass
class ToolResult:
    """Standardized tool result."""
    success: bool
    data: Any
    error: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None


class BaseTool(ABC):
    """Abstract base class for all FastMCP tools."""
    
    @property
    @abstractmethod
    def name(self) -> str:
        """Tool name for registration."""
        pass
    
    @property
    @abstractmethod
    def description(self) -> str:
        """Tool description shown to LLM."""
        pass
    
    @abstractmethod
    def execute(self, **kwargs) -> ToolResult:
        """Execute the tool with given parameters."""
        pass
    
    def validate_params(self, **kwargs) -> tuple[bool, str]:
        """Validate input parameters. Override in subclasses."""
        return True, ""
    
    def __call__(self, **kwargs) -> str:
        """Make tool callable for MCP registration."""
        valid, error = self.validate_params(**kwargs)
        if not valid:
            return f"Validation error: {error}"
        
        result = self.execute(**kwargs)
        
        if result.success:
            return str(result.data)
        return f"Error: {result.error}"


# Example implementation
class WebSearchTool(BaseTool):
    """Web search tool using Tavily API."""
    
    name = "web_search"
    description = "Search the web for information on a topic"
    
    def __init__(self, api_key: str):
        self.api_key = api_key
    
    def validate_params(self, query: str = None, **kwargs) -> tuple[bool, str]:
        if not query:
            return False, "Query is required"
        if len(query) > 1000:
            return False, "Query too long (max 1000 chars)"
        return True, ""
    
    def execute(self, query: str, max_results: int = 5) -> ToolResult:
        try:
            # Implementation
            results = self._search(query, max_results)
            return ToolResult(success=True, data=results)
        except Exception as e:
            return ToolResult(success=False, data=None, error=str(e))
```

### 7.3 Plugin System Architecture

```python
# server/plugins/__init__.py
from typing import Dict, Type
from server.tools.base import BaseTool
import importlib
import pkgutil


class PluginRegistry:
    """Registry for dynamically loaded tool plugins."""
    
    _instance = None
    _tools: Dict[str, BaseTool] = {}
    
    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance
    
    def register(self, tool: BaseTool):
        """Register a tool instance."""
        self._tools[tool.name] = tool
    
    def get(self, name: str) -> BaseTool:
        """Get tool by name."""
        return self._tools.get(name)
    
    def all(self) -> Dict[str, BaseTool]:
        """Get all registered tools."""
        return self._tools.copy()
    
    def discover_plugins(self, package_name: str = "server.plugins"):
        """Auto-discover and load plugins from package."""
        package = importlib.import_module(package_name)
        
        for _, module_name, _ in pkgutil.iter_modules(package.__path__):
            module = importlib.import_module(f"{package_name}.{module_name}")
            
            # Look for classes inheriting from BaseTool
            for attr_name in dir(module):
                attr = getattr(module, attr_name)
                if (
                    isinstance(attr, type) 
                    and issubclass(attr, BaseTool) 
                    and attr is not BaseTool
                ):
                    try:
                        tool_instance = attr()
                        self.register(tool_instance)
                    except Exception as e:
                        print(f"Failed to instantiate {attr_name}: {e}")


# Usage in main.py
registry = PluginRegistry()
registry.discover_plugins()

# Register all discovered tools with MCP
for name, tool in registry.all().items():
    mcp.tool(tool.__call__, name=name, description=tool.description)
```

### 7.4 Dependency Injection

```python
# server/container.py
from typing import TypeVar, Type, Dict, Any, Callable
from functools import wraps


T = TypeVar('T')


class Container:
    """Simple dependency injection container."""
    
    _services: Dict[Type, Any] = {}
    _factories: Dict[Type, Callable] = {}
    
    @classmethod
    def register(cls, interface: Type[T], implementation: T):
        """Register a service instance."""
        cls._services[interface] = implementation
    
    @classmethod
    def register_factory(cls, interface: Type[T], factory: Callable[[], T]):
        """Register a factory function for lazy instantiation."""
        cls._factories[interface] = factory
    
    @classmethod
    def resolve(cls, interface: Type[T]) -> T:
        """Resolve a service by interface type."""
        if interface in cls._services:
            return cls._services[interface]
        
        if interface in cls._factories:
            instance = cls._factories[interface]()
            cls._services[interface] = instance
            return instance
        
        raise KeyError(f"No service registered for {interface}")
    
    @classmethod
    def inject(cls, *dependencies: Type):
        """Decorator to inject dependencies into function."""
        def decorator(func: Callable):
            @wraps(func)
            def wrapper(*args, **kwargs):
                injected = {
                    dep.__name__.lower(): cls.resolve(dep)
                    for dep in dependencies
                }
                return func(*args, **kwargs, **injected)
            return wrapper
        return decorator


# Service interfaces
class LLMService:
    def query(self, prompt: str) -> str:
        raise NotImplementedError


class EmbeddingService:
    def encode(self, text: str) -> list:
        raise NotImplementedError


# Implementations
class OllamaLLMService(LLMService):
    def __init__(self, model: str = "llama3.2:3b"):
        self.model = model
    
    def query(self, prompt: str) -> str:
        # Implementation
        pass


class SentenceTransformerEmbedding(EmbeddingService):
    def __init__(self):
        from sentence_transformers import SentenceTransformer
        self.model = SentenceTransformer('all-MiniLM-L6-v2')
    
    def encode(self, text: str) -> list:
        return self.model.encode(text).tolist()


# Registration
Container.register(LLMService, OllamaLLMService())
Container.register_factory(EmbeddingService, SentenceTransformerEmbedding)


# Usage with injection
@Container.inject(LLMService, EmbeddingService)
def process_query(query: str, llmservice: LLMService, embeddingservice: EmbeddingService):
    embedding = embeddingservice.encode(query)
    response = llmservice.query(query)
    return response
```

---

## 8. Pre-Production Checklist

### 8.1 Code Quality

- [ ] **Test Coverage**: Backend ≥ 80%, Frontend ≥ 70%
- [ ] **Linting**: Zero Ruff/ESLint errors
- [ ] **Type Checking**: MyPy/TypeScript passes
- [ ] **Documentation**: All public APIs documented
- [ ] **Code Review**: All PRs reviewed by ≥1 engineer

### 8.2 Security

- [ ] **Authentication**: Supabase Auth configured
- [ ] **Authorization**: RLS policies on all tables
- [ ] **Rate Limiting**: API routes protected
- [ ] **Input Validation**: All user inputs sanitized
- [ ] **Secrets**: No hardcoded credentials
- [ ] **Dependencies**: No critical vulnerabilities (`npm audit`, `pip-audit`)
- [ ] **CSP Headers**: Content Security Policy enabled

### 8.3 Database

- [ ] **Migrations**: All changes in version control
- [ ] **Indexes**: Query-specific indexes created
- [ ] **Connection Pooling**: pgBouncer configured for production
- [ ] **Backups**: Automated daily backups enabled
- [ ] **RLS**: Row-Level Security on sensitive tables

### 8.4 Observability

- [ ] **Logging**: Structured JSON logging enabled
- [ ] **Metrics**: Prometheus metrics exposed
- [ ] **Health Checks**: `/health`, `/ready`, `/live` endpoints
- [ ] **Error Tracking**: Sentry (or equivalent) integrated
- [ ] **Alerting**: Critical error alerts configured

### 8.5 Infrastructure

- [ ] **CI/CD**: GitHub Actions pipeline passing
- [ ] **Docker**: Production images built and tested
- [ ] **Environment Variables**: All required vars documented
- [ ] **Resource Limits**: CPU/memory limits set
- [ ] **Scaling**: Horizontal scaling tested
- [ ] **SSL/TLS**: HTTPS enforced

### 8.6 Documentation

- [ ] **README**: Setup instructions current
- [ ] **API Docs**: OpenAPI spec generated
- [ ] **Architecture**: Diagrams updated
- [ ] **Runbooks**: Incident response documented
- [ ] **Changelog**: Version history maintained

---

## Appendix A: Quick Reference Commands

```bash
# Backend
pytest tests/ --cov=server --cov-report=html  # Run tests with coverage
ruff check server/ --fix                       # Lint and fix
ruff format server/                            # Format code
mypy server/ --ignore-missing-imports          # Type check

# Frontend
npm run lint                                   # ESLint
npm test -- --coverage                         # Jest tests
npx tsc --noEmit                              # TypeScript check
npx playwright test                            # E2E tests

# Docker
docker compose -f docker-compose.dev.yml up    # Dev environment
docker compose up --build                      # Production build

# Database
supabase migration new <name>                  # Create migration
supabase db push                               # Apply migrations
supabase db reset                              # Reset and re-apply

# Pre-commit
pre-commit install                             # Install hooks
pre-commit run --all-files                     # Run all checks
```

---

## Appendix B: Environment Variables Template

```bash
# .env.production.template

# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
SUPABASE_POOLER_URL=postgresql://postgres:password@db.xxx.supabase.co:6543/postgres

# LLM
OLLAMA_HOST=http://ollama:11434
OLLAMA_MODEL=llama3.2:3b

# External APIs
TAVILY_API_KEY=your-tavily-key

# Observability
SENTRY_DSN=https://xxx@sentry.io/xxx
ENVIRONMENT=production
APP_VERSION=1.0.0

# Security
RATE_LIMIT_REQUESTS_PER_MINUTE=60
```

---

*This document should be reviewed and updated quarterly or when significant architectural changes occur.*
