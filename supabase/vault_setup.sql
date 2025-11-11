-- ============================================
-- Supabase Vault Setup SQL Script
-- ============================================
-- Run this script in your Supabase SQL Editor
-- ============================================

-- 1. Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. Create vault_documents table
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

-- 3. Create indexes
CREATE INDEX IF NOT EXISTS idx_vault_documents_user_id 
    ON vault_documents(user_id);

CREATE INDEX IF NOT EXISTS idx_vault_documents_upload_timestamp 
    ON vault_documents(upload_timestamp DESC);

-- 4. Enable Row Level Security
ALTER TABLE vault_documents ENABLE ROW LEVEL SECURITY;

-- 5. Create RLS Policies
CREATE POLICY "Users can view own documents"
    ON vault_documents
    FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own documents"
    ON vault_documents
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own documents"
    ON vault_documents
    FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own documents"
    ON vault_documents
    FOR DELETE
    USING (auth.uid() = user_id);

-- 6. Create update trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 7. Create trigger
CREATE TRIGGER update_vault_documents_updated_at
    BEFORE UPDATE ON vault_documents
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- 8. Add table comment
COMMENT ON TABLE vault_documents IS 'Stores user uploaded documents with metadata and access control';

-- ============================================
-- Storage Bucket Policies (Run after creating bucket)
-- ============================================
-- Note: First create a bucket named 'vault-files' in Supabase Storage Dashboard
-- Then run these policies:

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

-- ============================================
-- Verification Queries
-- ============================================

-- Check if table was created successfully
SELECT EXISTS (
    SELECT FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'vault_documents'
);

-- View table structure
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'vault_documents'
ORDER BY ordinal_position;

-- Check RLS policies
SELECT policyname, tablename, cmd, qual, with_check
FROM pg_policies
WHERE tablename = 'vault_documents';

-- Check indexes
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'vault_documents';
