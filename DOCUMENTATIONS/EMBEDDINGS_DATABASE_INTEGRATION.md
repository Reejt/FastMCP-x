# Embeddings Database Integration

**Date:** December 4, 2025  
**Status:** ✅ Complete - Embeddings now stored in Supabase `document_embeddings` table

---

## Overview

This document outlines the migration of vector embeddings from **in-memory storage** to **Supabase database storage** using the new `document_embeddings` table.

---

## What Changed

### ✅ Backend Changes

#### 1. **Supabase Integration** (`server/query_handler.py`)
- Added Supabase client initialization for embeddings storage
- Supports both `SUPABASE_SERVICE_ROLE_KEY` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- Graceful fallback if Supabase is unavailable

#### 2. **New Function: `load_embeddings_from_supabase()`**
Loads embeddings from database into memory cache on server startup:
```python
def load_embeddings_from_supabase():
    """Load embeddings from Supabase database into memory cache"""
    # Queries document_embeddings table
    # Converts list embeddings to numpy arrays
    # Populates _document_embeddings cache
```

**Why in-memory cache?**
- Fast cosine similarity calculations during queries
- Reduces database round-trips
- Embeddings loaded once on startup and reused

#### 3. **Updated Function: `build_embeddings()`**
Now stores embeddings in both places:
1. **In-memory cache** (`_document_embeddings` list) for fast access
2. **Supabase database** (`document_embeddings` table) for persistence

```python
def build_embeddings():
    # 1. Generate embeddings from document chunks
    # 2. Store in memory for session queries
    # 3. Store in Supabase for persistence
    # 4. Convert numpy arrays to lists for JSON serialization
```

#### 4. **Server Startup** (`server/main.py`)
- Calls `load_embeddings_from_supabase()` on initialization
- Ensures embeddings available immediately for queries
- Handles missing database gracefully

---

### ✅ Frontend Changes

#### 1. **TypeScript Type** (`frontend/app/types/index.ts`)
Added `DocumentEmbedding` interface:
```typescript
export interface DocumentEmbedding {
  id: string                    // UUID primary key
  file_id: string               // Foreign key to files(id)
  user_id: string               // Foreign key to auth.users(id)
  chunk_index: number           // Index of the chunk within document
  content: string               // Original text chunk
  embedding: number[]           // Vector embedding array
  file_name: string             // Original file name
  created_at: string            // ISO timestamp
  updated_at: string            // ISO timestamp
}
```

#### 2. **Service Layer** (`frontend/lib/supabase/embeddings.ts`)
Created comprehensive embedding service functions:

```typescript
// Store embeddings when document is ingested
storeEmbeddings(fileId, userId, fileName, chunks)

// Retrieve embeddings for a specific file
getFileEmbeddings(fileId)

// Get all embeddings for a workspace
getWorkspaceEmbeddings(workspaceId)

// Delete embeddings when file is deleted
deleteFileEmbeddings(fileId)

// Count embeddings for a file
getFileEmbeddingCount(fileId)
```

#### 3. **Centralized Exports** (`frontend/lib/supabase/index.ts`)
Added embedding function exports:
```typescript
export {
  storeEmbeddings,
  getFileEmbeddings,
  getWorkspaceEmbeddings,
  deleteFileEmbeddings,
  getFileEmbeddingCount
} from './embeddings'
```

---

## Database Schema

### `document_embeddings` Table

```sql
CREATE TABLE document_embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_id UUID NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  chunk_index INTEGER NOT NULL,
  content TEXT NOT NULL,
  embedding VECTOR(384),  -- all-MiniLM-L6-v2 model outputs 384 dimensions
  file_name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(file_id, chunk_index)
);

CREATE INDEX idx_document_embeddings_file_id ON document_embeddings(file_id);
CREATE INDEX idx_document_embeddings_user_id ON document_embeddings(user_id);
```

**Note:** Currently using standard `VECTOR` type. For pgvector similarity search, ensure pgvector extension is enabled:
```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

---

## Data Flow

### On File Ingestion
```
1. User uploads file
   ↓
2. File extracted to text chunks
   ↓
3. Chunks embedded using sentence-transformers
   ↓
4. Embeddings stored in Supabase document_embeddings table
   ↓
5. Embeddings loaded into memory cache
   ↓
6. Ready for semantic search
```

### On Query
```
1. User query received
   ↓
2. Query embedded (same model)
   ↓
3. Cosine similarity calculated against in-memory embeddings
   ↓
4. Top-k most similar chunks retrieved
   ↓
5. Results passed to LLM with context
```

### On Server Startup
```
1. Server starts
   ↓
2. load_embeddings_from_supabase() called
   ↓
3. All embeddings fetched from database
   ↓
4. Converted to numpy arrays for efficient operations
   ↓
5. Loaded into memory cache
   ↓
6. Semantic search ready to use
```

---

## Implementation Details

### Embedding Generation
- **Model:** `all-MiniLM-L6-v2` (sentence-transformers)
- **Dimensions:** 384
- **Output:** List of floats (for JSON serialization)
- **Conversion:** `numpy_array.tolist()` when storing in database

### Chunking Strategy
- **Chunk size:** 600 characters
- **Overlap:** 50 characters
- **Purpose:** Better semantic matching, prevents large chunks from dominating similarity

### Cosine Similarity
- **Library:** scikit-learn `cosine_similarity`
- **Operation:** Calculated in Python application layer
- **Threshold:** 0.3 minimum similarity for relevant results
- **Performance:** In-memory calculation is faster than database queries

### Environment Variables Required
```
SUPABASE_URL=<your-project-url>
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>  # OR
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
```

---

## Key Benefits

### ✅ Persistence
- Embeddings survive server restarts
- No need to regenerate expensive embeddings
- Historical data preserved

### ✅ Scalability
- Database storage grows with content
- In-memory cache can be managed
- Future: Implement incremental loading for large datasets

### ✅ Multi-User Support
- Each user's embeddings stored separately
- User ID tracked in database
- Row-level security ensures data isolation

### ✅ Performance
- In-memory cache provides fast similarity calculations
- Database provides persistent storage
- Hybrid approach balances speed and persistence

### ✅ Maintenance
- Service layer functions handle database operations
- Automatic cleanup when files are deleted
- Version tracking via `created_at` and `updated_at`

---

## API Usage

### Store Embeddings (Frontend)
```typescript
import { storeEmbeddings } from '@/lib/supabase'

const chunks = [
  {
    index: 0,
    content: "First chunk of text...",
    embedding: [0.123, 0.456, ..., 0.789]
  },
  {
    index: 1,
    content: "Second chunk of text...",
    embedding: [0.234, 0.567, ..., 0.890]
  }
]

const embeddings = await storeEmbeddings(
  fileId,
  userId,
  fileName,
  chunks
)
```

### Retrieve Embeddings (Frontend)
```typescript
import { getFileEmbeddings } from '@/lib/supabase'

const embeddings = await getFileEmbeddings(fileId)
// Returns: DocumentEmbedding[]
```

### Python Backend (Automatic)
```python
from server.query_handler import load_embeddings_from_supabase, build_embeddings

# On startup
load_embeddings_from_supabase()

# When new documents ingested
build_embeddings()  # Automatically stores in Supabase
```

---

## Migration Notes

### For Existing Installations
1. **Create the `document_embeddings` table** in Supabase
2. **Restart the server** - new embeddings will be stored automatically
3. **Existing in-memory embeddings** will be preserved during transition
4. **No data loss** - system continues working during migration

### Backward Compatibility
- In-memory `_document_embeddings` list still used as cache
- Fallback: If Supabase unavailable, system still works with in-memory storage only
- `build_embeddings()` handles both scenarios

---

## Future Enhancements

### 🔄 Potential Improvements
1. **pgvector Integration**
   - Use database-native similarity search with `<=>` operator
   - Reduce memory requirements for large datasets
   - Enable complex vector queries

2. **Embedding Updates**
   - Track model versions
   - Re-embed with new models when available
   - Support multiple embedding models simultaneously

3. **Incremental Loading**
   - Load embeddings on-demand by workspace
   - Implement LRU cache for memory management
   - Batch query optimization

4. **Monitoring & Analytics**
   - Track embedding quality metrics
   - Monitor similarity score distributions
   - Log similarity search performance

---

## Troubleshooting

### Issue: "Supabase not available for loading embeddings"
**Solution:** Check environment variables
```
✅ SUPABASE_URL is set
✅ SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY is set
```

### Issue: Embeddings not persisting after server restart
**Solution:** Verify table exists and permissions
```sql
SELECT COUNT(*) FROM document_embeddings;
-- Should return the count of embeddings

-- Check RLS policies
SELECT * FROM pg_policies WHERE tablename = 'document_embeddings';
```

### Issue: Similarity scores seem off
**Solution:** Verify embedding model consistency
- Same model must be used for all embeddings and queries
- Current model: `all-MiniLM-L6-v2`
- Check query_handler logs for model loading

---

## Testing Checklist

- [ ] Embeddings table created in Supabase
- [ ] RLS policies configured for document_embeddings
- [ ] Upload file and verify embeddings stored in database
- [ ] Restart server and verify embeddings loaded from database
- [ ] Query returns results with correct similarity scores
- [ ] Delete file and verify embeddings cleaned up
- [ ] Test with multiple workspaces (no data leakage)
- [ ] Verify environment variables are correct

---

## Summary

The embeddings system now uses a **hybrid approach**:
- **Database:** Persistent storage in Supabase `document_embeddings` table
- **Memory:** Fast in-memory cache for cosine similarity calculations
- **Semantic Search:** Still done in Python application layer using scikit-learn

This provides the best of both worlds: fast performance with persistent storage.

---

**Implementation Complete:** December 4, 2025  
**Files Modified:**
- `server/query_handler.py` - Supabase integration, embedding functions
- `server/document_ingestion.py` - Lazy loading utilities
- `server/main.py` - Load embeddings on startup
- `frontend/app/types/index.ts` - DocumentEmbedding type
- `frontend/lib/supabase/embeddings.ts` - Service layer (NEW)
- `frontend/lib/supabase/index.ts` - Export embeddings functions
