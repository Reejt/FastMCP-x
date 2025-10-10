# File parsing utilities for supported formats
import os
import pandas as pd
import docx
import pptx

# Use pypdf instead of deprecated PyPDF2
try:
    from pypdf import PdfReader
    PDF_LIBRARY = "pypdf"
except ImportError:
    try:
        import PyPDF2
        PDF_LIBRARY = "PyPDF2"
        print("Warning: Using deprecated PyPDF2. Consider upgrading to pypdf: pip install pypdf")
    except ImportError:
        PDF_LIBRARY = None
        print("Warning: No PDF library available. Install pypdf: pip install pypdf")

def extract_text_from_file(file_path: str) -> str:
    """Extract text from various file formats"""
    print(f"Attempting to parse file: {file_path}")
    
    # Get file extension (handle cases like .pptx.pptx)
    ext = os.path.splitext(file_path)[1].lower()
    
    # If file has double extension, use the real extension
    if ext == '.pptx' or file_path.lower().endswith('.pptx.pptx'):
        ext = '.pptx'
    
    print(f"Detected file extension: {ext}")
    
    try:
        if ext == ".csv":
            df = pd.read_csv(file_path)
            return df.to_string()
        elif ext in [".xls", ".xlsx"]:
            df = pd.read_excel(file_path)
            return df.to_string()
        elif ext == ".docx":
            doc = docx.Document(file_path)
            return "\n".join([para.text for para in doc.paragraphs])
        elif ext == ".pptx":
            prs = pptx.Presentation(file_path)
            text = []
            
            def extract_text_from_shape(shape):
                """Recursively extract text from a shape and its sub-shapes"""
                shape_texts = []
                
                try:
                    # Method 1: Direct text access
                    if hasattr(shape, 'text') and shape.text and shape.text.strip():
                        shape_texts.append(shape.text.strip())
                    
                    # Method 2: Text frame access with paragraphs and runs
                    if hasattr(shape, 'text_frame') and shape.text_frame:
                        if hasattr(shape.text_frame, 'paragraphs'):
                            for para in shape.text_frame.paragraphs:
                                if hasattr(para, 'text') and para.text and para.text.strip():
                                    para_text = para.text.strip()
                                    if para_text not in shape_texts:
                                        shape_texts.append(para_text)
                                
                                # Extract from runs within paragraphs
                                if hasattr(para, 'runs'):
                                    for run in para.runs:
                                        if hasattr(run, 'text') and run.text and run.text.strip():
                                            run_text = run.text.strip()
                                            if run_text not in shape_texts:
                                                shape_texts.append(run_text)
                    
                    # Method 3: Handle GROUP shapes recursively
                    if hasattr(shape, 'shapes'):  # This is a group
                        for sub_shape in shape.shapes:
                            sub_texts = extract_text_from_shape(sub_shape)
                            shape_texts.extend(sub_texts)
                    
                    # Method 4: Handle tables
                    if hasattr(shape, 'has_table') and shape.has_table:
                        for row in shape.table.rows:
                            for cell in row.cells:
                                if cell.text and cell.text.strip():
                                    cell_text = cell.text.strip()
                                    if cell_text not in shape_texts:
                                        shape_texts.append(cell_text)
                
                except Exception as e:
                    print(f"Warning: Error extracting text from shape: {e}")
                
                return shape_texts
            
            for slide in prs.slides:
                # Extract text from all shapes using improved method
                for shape in slide.shapes:
                    shape_texts = extract_text_from_shape(shape)
                    text.extend(shape_texts)
                
                # Extract notes
                try:
                    if slide.has_notes_slide:
                        notes_text = slide.notes_slide.notes_text_frame.text
                        if notes_text and notes_text.strip():
                            text.append(notes_text.strip())
                except Exception as e:
                    print(f"Warning: Error extracting notes from slide: {e}")
            
            content = "\n".join(text)
            print(f"Extracted {len(content)} characters from PowerPoint")
            return content
        elif ext == ".pdf":
            if PDF_LIBRARY == "pypdf":
                with open(file_path, "rb") as f:
                    reader = PdfReader(f)
                    text = []
                    for page in reader.pages:
                        text.append(page.extract_text())
                return "\n".join(text)
            elif PDF_LIBRARY == "PyPDF2":
                with open(file_path, "rb") as f:
                    reader = PyPDF2.PdfReader(f)
                    text = []
                    for page in reader.pages:
                        text.append(page.extract_text())
                return "\n".join(text)
            else:
                raise ValueError("No PDF library available. Install pypdf: pip install pypdf")
        elif ext == ".txt":
            with open(file_path, "r", encoding="utf-8") as f:
                return f.read()
        else:
            raise ValueError(f"Unsupported file type: {ext}")
    except Exception as e:
        print(f"Error parsing file {file_path}: {str(e)}")
        raise
