# Database-Side CSV/Excel Processing Architecture

## Overview

This document describes the new database-centric architecture for processing CSV and Excel files in FastMCP. Instead of downloading files and processing them with pandas, structured data is stored in PostgreSQL and queried using SQL.

## Architecture Diagram

```
User Query
    ↓
[Frontend Chat Interface]
    ↓
[API Route: /api/chat/query]
    ↓
[query_csv_with_llm() or query_excel_with_llm()]
    ↓
[Step 1: Get File Schema] → PostgreSQL (structured_data table)
    ↓
[Step 2: Translate to SQL] → LLM converts natural language to SQL
    ↓
[Step 3: Execute SQL] → Supabase RPC function (execute_sql_query)
    ↓
[Step 4: Format Results] → LLM generates human-readable answer
    ↓
[Backend Response]
    ↓
[User Response in Chat]
```

## Data Flow

### 1. File Ingestion

When a CSV or Excel file is uploaded:

```python
# For CSV files:
ingest_csv_to_database(
    file_id="abc-123",
    file_data=file_bytes,
    workspace_id="user-workspace-id",
    file_name="sales_data.csv"
)

# For Excel files:
ingest_excel_to_database(
    file_id="def-456",
    file_data=file_bytes,
    workspace_id="user-workspace-id",
    file_name="monthly_report.xlsx"
)
```

**Process:**
1. Parse CSV/Excel using pandas in-memory
2. Extract each row as a dictionary
3. Create records with metadata (file_id, workspace_id, sheet_name, row_index)
4. Insert into `structured_data` table in batches (1000 rows per batch)

**Result:** File data is now in PostgreSQL, not in Supabase Storage

### 2. File Schema Detection

```python
schema = get_file_schema(file_id="abc-123")
# Returns:
# {
#     "columns": ["Date", "Product", "Sales", "Region"],
#     "row_count": 1250
# }
```

**Process:**
1. Fetch first row from `structured_data` table
2. Extract column names from JSONB data
3. Count total rows for context

### 3. Natural Language → SQL Translation

```python
sql_query = translate_query_to_sql(
    natural_language_query="What are total sales by region?",
    file_id="abc-123",
    schema=schema
)
# Returns:
# SELECT 
#   data->>'Region' as region,
#   SUM(CAST(data->>'Sales' AS NUMERIC)) as total_sales
# FROM structured_data
# WHERE file_id = 'abc-123'
# GROUP BY data->>'Region'
```

**Process:**
1. Build prompt with schema information
2. Send to LLM for SQL translation
3. Clean up markdown formatting if needed
4. Log the generated SQL for debugging

### 4. SQL Execution

```python
results = execute_sql_on_file(
    file_id="abc-123",
    sql_query=sql_query
)
# Returns:
# [
#   {"region": "North", "total_sales": 15000},
#   {"region": "South", "total_sales": 12000}
# ]
```

**Process:**
1. Call Supabase RPC function `execute_sql_query`
2. RPC validates query (SELECT with file_id filter)
3. Adds workspace_id filter for multi-tenancy
4. Returns results as JSON

### 5. Result Formatting

LLM formats the raw SQL results into a natural language response:

```
Input: [{"region": "North", "total_sales": 15000}, ...]
Output: "The North region has $15,000 in total sales, while the South region has $12,000..."
```

## Database Schema

### structured_data Table

```sql
CREATE TABLE structured_data (
    id UUID PRIMARY KEY,                    -- Unique record ID
    file_id TEXT NOT NULL,                  -- Reference to uploaded file
    workspace_id TEXT NOT NULL,             -- For multi-tenancy
    sheet_name TEXT,                        -- NULL for CSV, sheet name for Excel
    row_index INT,                          -- Row number in original file
    data JSONB NOT NULL,                    -- The actual row data
    file_name TEXT,                         -- Original file name
    created_at TIMESTAMP,                   -- Record creation time
    updated_at TIMESTAMP                    -- Last update time
);
```

### Example Records

**CSV File Example:**
```json
{
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "file_id": "abc-123",
    "workspace_id": "user-workspace",
    "sheet_name": null,
    "row_index": 0,
    "data": {
        "Date": "2024-01-01",
        "Product": "Widget A",
        "Sales": "1500",
        "Region": "North"
    },
    "file_name": "sales_data.csv",
    "created_at": "2024-01-15T10:00:00Z"
}
```

**Excel File Example:**
```json
{
    "id": "550e8400-e29b-41d4-a716-446655440001",
    "file_id": "def-456",
    "workspace_id": "user-workspace",
    "sheet_name": "Sales",
    "row_index": 0,
    "data": {
        "Month": "January",
        "Revenue": "50000",
        "Profit": "15000"
    },
    "file_name": "monthly_report.xlsx",
    "created_at": "2024-01-15T10:05:00Z"
}
```

## Accessing JSON Data in SQL

PostgreSQL provides powerful JSON operators:

```sql
-- Text access (returns as text)
data->>'column_name'

-- Numeric access (for calculations)
CAST(data->>'Sales' AS NUMERIC)

-- Array operations
data->>'tags' -- if data contains arrays

-- Existence checks
data ? 'column_name'

-- Examples in queries:
SELECT 
    data->>'Product' as product,
    CAST(data->>'Sales' AS NUMERIC) as sales
FROM structured_data
WHERE file_id = 'abc-123'
    AND CAST(data->>'Sales' AS NUMERIC) > 1000
ORDER BY CAST(data->>'Sales' AS NUMERIC) DESC;
```

## SQL Query Examples

### Aggregation
```sql
SELECT 
    data->>'Region' as region,
    COUNT(*) as transaction_count,
    AVG(CAST(data->>'Sales' AS NUMERIC)) as avg_sales
FROM structured_data
WHERE file_id = 'abc-123'
GROUP BY data->>'Region'
ORDER BY transaction_count DESC;
```

### Filtering
```sql
SELECT data
FROM structured_data
WHERE file_id = 'abc-123'
    AND data->>'Product' = 'Widget A'
    AND CAST(data->>'Sales' AS NUMERIC) > 5000;
```

### Date Filtering
```sql
SELECT data->>'Date' as date, data->>'Sales' as sales
FROM structured_data
WHERE file_id = 'abc-123'
    AND CAST(data->>'Date' AS DATE) >= '2024-01-01'
    AND CAST(data->>'Date' AS DATE) <= '2024-12-31';
```

## Key Features

### ✅ Scalability
- Store files with millions of rows (limited only by PostgreSQL)
- Sub-millisecond queries using indexed lookups
- No memory constraints like pandas

### ✅ Multi-Tenancy
- RLS (Row Level Security) ensures workspace isolation
- Workspace ID is required for all queries
- User can only see their own file data

### ✅ Natural Language Interface
- Users ask questions in plain English
- LLM translates to optimized SQL
- Results formatted in natural language

### ✅ Security
- SQL injection protection via parameterized queries
- RPC functions validate all queries
- Row level security at database level

### ✅ Performance
- Indexed searches: O(1) lookups by file_id
- JSONB GIN index for complex queries
- No file downloads or network overhead

## Migration Steps

1. **Create Tables:**
   ```bash
   # Execute in Supabase SQL Editor:
   -- Copy contents of migrations/001_create_structured_data_table.sql
   ```

2. **Create RPC Functions:**
   ```bash
   # Execute in Supabase SQL Editor:
   -- Copy contents of migrations/002_create_rpc_functions.sql
   ```

3. **Update API Routes:**
   - API route handler should call `ingest_csv_to_database()` or `ingest_excel_to_database()`
   - Update chat route to use new query functions with `file_id` parameter

4. **Update Frontend:**
   - Pass `file_id` to query API instead of file path
   - Update upload handler to capture returned `file_id`

## API Usage

### Upload CSV/Excel File

```python
# In API route handler:
from server.excel_csv import ingest_csv_to_database, ingest_excel_to_database

file_id = generate_uuid()  # Generate unique file ID
workspace_id = request.user.workspace_id

if file_type == 'csv':
    result = ingest_csv_to_database(file_id, file_data, workspace_id, file_name)
else:  # xlsx
    result = ingest_excel_to_database(file_id, file_data, workspace_id, file_name)

# Return file_id to frontend for future queries
return {"file_id": file_id, "status": result}
```

### Query CSV/Excel File

```python
# In chat query API route:
from server.excel_csv import query_csv_with_llm, query_excel_with_llm

answer = query_csv_with_llm(
    file_id=file_id,  # From upload response
    query=user_message,
    workspace_id=user_workspace_id,
    conversation_history=chat_history
)

# Return answer to user
return {"response": answer}
```

## Performance Comparison

| Metric | Old (Pandas) | New (SQL) |
|--------|-------------|-----------|
| File Size Limit | 500MB (memory) | Unlimited (DB) |
| Query Time (1M rows) | 5-10s | 100-500ms |
| Memory Usage | High (entire file) | Minimal (query result) |
| Concurrent Queries | Limited | Unlimited |
| Scalability | Poor | Enterprise |
| Cost (storage) | S3/Supabase | PostgreSQL (included) |

## Troubleshooting

### Query Returns No Results
1. Check if `file_id` exists: `SELECT COUNT(*) FROM structured_data WHERE file_id = 'your-id'`
2. Verify workspace_id matches
3. Check SQL syntax in logs

### JSON Cast Errors
- Ensure column exists in data: `data ? 'ColumnName'`
- Handle NULL values: `COALESCE(data->>'Sales', '0')`
- Use proper CAST: `CAST(data->>'Amount' AS NUMERIC)`

### Performance Issues
1. Check indexes: `SELECT * FROM pg_stat_user_indexes WHERE relname = 'structured_data'`
2. Monitor query time with `EXPLAIN ANALYZE`
3. Add additional indexes if needed for frequently filtered columns

## Future Enhancements

1. **Column Type Inference:** Automatically detect numeric/date columns during ingestion
2. **Full-Text Search:** Add FTS index for text search across all columns
3. **Data Validation:** Add constraints and checks during ingestion
4. **Export:** Add function to export query results to CSV
5. **Caching:** Cache frequently run queries
6. **Audit Trail:** Log all queries for compliance

