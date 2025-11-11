# Vault Supabase Integration Setup

## Overview
The vault feature now integrates with Supabase for persistent document storage. When users upload documents, they are:
1. Stored in Supabase Storage (`vault-files` bucket)
2. Metadata saved in `vault_documents` table
3. Processed by the FastMCP backend for document ingestion

## Database Setup

### 1. Create the vault_documents table

Run the following SQL in your Supabase SQL Editor:

```sql
-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create vault_documents table
CREATE TABLE IF NOT EXISTS vault_documents (
    document_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    file_name TEXT NOT NULL,
    file_path TEXT NOT NULL,
    file_size BIGINT,
    file_type TEXT,
    upload_timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create index on user_id for faster queries
CREATE INDEX IF NOT EXISTS idx_vault_documents_user_id ON vault_documents(user_id);

-- Create index on upload_timestamp for sorting
CREATE INDEX IF NOT EXISTS idx_vault_documents_upload_timestamp ON vault_documents(upload_timestamp DESC);

-- Enable Row Level Security (RLS)
ALTER TABLE vault_documents ENABLE ROW LEVEL SECURITY;

-- Create policy: Users can only see their own documents
CREATE POLICY "Users can view own documents"
    ON vault_documents
    FOR SELECT
    USING (auth.uid() = user_id);

-- Create policy: Users can insert their own documents
CREATE POLICY "Users can insert own documents"
    ON vault_documents
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- Create policy: Users can update their own documents
CREATE POLICY "Users can update own documents"
    ON vault_documents
    FOR UPDATE
    USING (auth.uid() = user_id);

-- Create policy: Users can delete their own documents
CREATE POLICY "Users can delete own documents"
    ON vault_documents
    FOR DELETE
    USING (auth.uid() = user_id);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically update updated_at
CREATE TRIGGER update_vault_documents_updated_at
    BEFORE UPDATE ON vault_documents
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Add comment to table
COMMENT ON TABLE vault_documents IS 'Stores user uploaded documents with metadata and access control';
```

### 2. Create Supabase Storage Bucket

In your Supabase dashboard:

1. Go to **Storage** section
2. Click **New bucket**
3. Bucket name: `vault-files`
4. Set as **Private** (not public)
5. Click **Create bucket**

### 3. Set up Storage Policies

After creating the bucket, add these policies in the Storage section:

```sql
-- Policy: Users can upload files to their own folder
CREATE POLICY "Users can upload own files"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
    bucket_id = 'vault-files' AND
    (storage.foldername(name))[1] = auth.uid()::text
);

-- Policy: Users can view their own files
CREATE POLICY "Users can view own files"
ON storage.objects FOR SELECT
TO authenticated
USING (
    bucket_id = 'vault-files' AND
    (storage.foldername(name))[1] = auth.uid()::text
);

-- Policy: Users can delete their own files
CREATE POLICY "Users can delete own files"
ON storage.objects FOR DELETE
TO authenticated
USING (
    bucket_id = 'vault-files' AND
    (storage.foldername(name))[1] = auth.uid()::text
);
```

## Implementation Details

### Upload Flow
1. User selects file in `/vault` page
2. File sent to `/api/vault/upload` endpoint
3. API authenticates user via Supabase Auth
4. File validated (type, size)
5. File sent to bridge server for FastMCP processing
6. File stored in Supabase Storage (`vault-files` bucket)
7. Document metadata inserted into `vault_documents` table
8. Success response returned with document details

### File Organization
Files are organized by user in the storage bucket:
```
vault-files/
├── <user_id>/
│   ├── <timestamp>_<filename>
│   ├── <timestamp>_<filename>
│   └── ...
```

### Database Schema

**vault_documents Table:**
- `document_id`: UUID (Primary Key)
- `user_id`: UUID (Foreign Key to auth.users)
- `file_name`: Original filename
- `file_path`: Path in Supabase Storage
- `file_size`: Size in bytes
- `file_type`: MIME type
- `upload_timestamp`: When uploaded (default: NOW())
- `metadata`: JSONB field for additional data
- `created_at`: Record creation timestamp
- `updated_at`: Last update timestamp

### Security Features
- **Row Level Security (RLS)**: Users can only access their own documents
- **Authentication Required**: All endpoints require valid Supabase auth token
- **Private Storage**: Files stored in private bucket with user-specific policies
- **CASCADE DELETE**: Documents deleted when user deleted

## API Endpoints

### POST /api/vault/upload
Upload a new document to the vault.

**Request:** `multipart/form-data` with `file` field

**Response:**
```json
{
  "success": true,
  "message": "File uploaded and processed successfully",
  "document": {
    "document_id": "uuid",
    "user_id": "uuid",
    "file_name": "example.pdf",
    "file_path": "user_id/timestamp_example.pdf",
    "file_size": 12345,
    "file_type": "application/pdf",
    "upload_timestamp": "2025-11-12T10:30:00Z"
  }
}
```

### GET /api/vault/upload
List all documents for the authenticated user.

**Response:**
```json
{
  "success": true,
  "documents": [
    {
      "document_id": "uuid",
      "file_name": "example.pdf",
      "file_size": 12345,
      "file_type": "application/pdf",
      "upload_timestamp": "2025-11-12T10:30:00Z"
    }
  ],
  "count": 1
}
```

## Frontend Integration

The vault page (`/vault/page.tsx`) now:
- Loads existing documents from Supabase on mount
- Refreshes document list after successful upload
- Displays documents from the database with proper metadata

## Next Steps

To complete the vault implementation:

1. **Delete Functionality**: Add DELETE endpoint at `/api/vault/[documentId]`
2. **Download Functionality**: Add endpoint to generate signed URLs for downloads
3. **View Functionality**: Implement document preview/viewer
4. **Search/Filter**: Add search and filter capabilities
5. **Pagination**: Implement pagination for large document lists
6. **File Validation**: Add more robust file validation (virus scanning, etc.)

## Testing

To verify the setup:

1. Run the SQL migration in Supabase SQL Editor
2. Create the `vault-files` storage bucket
3. Add storage policies
4. Upload a test document via the `/vault` page
5. Check Supabase dashboard:
   - Storage: File should appear in `vault-files/<user_id>/`
   - Database: Record should appear in `vault_documents` table
6. Refresh the page - document should persist
