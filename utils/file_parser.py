# File parsing utilities for supported formats
# Supported file types:
# - .txt (plain text)
# - .csv (comma-separated values)
# - .xls, .xlsx (Excel spreadsheets)
# - .docx (Word documents)
# - .pptx (PowerPoint presentations, modern format)
# - .ppt (PowerPoint presentations, legacy format - requires pywin32 on Windows)
# - .pdf (Portable Document Format)

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

def extract_text_from_shape(shape):
    """Recursively extract text from a shape and its sub-shapes (for PPTX files)"""
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

def extract_text_from_file(file_path: str) -> str:
    """Extract text from various file formats"""
    print(f"Attempting to parse file: {file_path}")
    
    # Get file extension (handle cases like .pptx.pptx)
    ext = os.path.splitext(file_path)[1].lower()
    
    # If file has double extension, use the real extension
    if ext == '.pptx' or file_path.lower().endswith('.pptx.pptx'):
        ext = '.pptx'
    elif ext == '.ppt' or file_path.lower().endswith('.ppt.ppt'):
        ext = '.ppt'
    
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
        elif ext == ".ppt":
            # Handle older .ppt format (binary PowerPoint files)
            # Try multiple approaches for better compatibility
            
            # Approach 1: Try LibreOffice conversion (if available)
            try:
                import subprocess
                import tempfile
                
                # Create a temporary directory for conversion
                with tempfile.TemporaryDirectory() as temp_dir:
                    # Try to convert using LibreOffice
                    output_file = os.path.join(temp_dir, "converted.pptx")
                    
                    # Try common LibreOffice paths
                    libreoffice_paths = [
                        r"C:\Program Files\LibreOffice\program\soffice.exe",
                        r"C:\Program Files (x86)\LibreOffice\program\soffice.exe",
                        "soffice",  # If in PATH
                        "libreoffice",  # Alternative command
                    ]
                    
                    conversion_successful = False
                    for lo_path in libreoffice_paths:
                        try:
                            result = subprocess.run(
                                [lo_path, "--headless", "--convert-to", "pptx", 
                                 "--outdir", temp_dir, file_path],
                                capture_output=True,
                                text=True,
                                timeout=30
                            )
                            
                            # Check if conversion created a .pptx file
                            converted_files = [f for f in os.listdir(temp_dir) if f.endswith('.pptx')]
                            if converted_files:
                                converted_path = os.path.join(temp_dir, converted_files[0])
                                # Now parse the converted .pptx file
                                prs = pptx.Presentation(converted_path)
                                text = []
                                
                                for slide in prs.slides:
                                    for shape in slide.shapes:
                                        shape_texts = extract_text_from_shape(shape)
                                        text.extend(shape_texts)
                                
                                content = "\n".join(text)
                                print(f"Extracted {len(content)} characters from .ppt file (via LibreOffice conversion)")
                                return content
                        except (subprocess.TimeoutExpired, subprocess.CalledProcessError, FileNotFoundError):
                            continue
                    
                    # If we get here, LibreOffice conversion didn't work
                    print("LibreOffice conversion not available or failed")
                    
            except Exception as e:
                print(f"LibreOffice approach failed: {str(e)}")
            
            # Approach 2: Try pywin32 COM automation (Windows only)
            try:
                import win32com.client
                import pythoncom
                
                pythoncom.CoInitialize()
                try:
                    powerpoint = win32com.client.Dispatch("PowerPoint.Application")
                    # Don't set Visible property - let PowerPoint decide
                    # Some versions don't allow hiding the application
                    try:
                        powerpoint.DisplayAlerts = 0  # Use 0 instead of False for COM
                    except:
                        pass  # Some versions don't support this
                    
                    # Convert to absolute path with proper formatting
                    abs_path = os.path.abspath(file_path)
                    
                    # Open with more permissive settings
                    # Use integer constants instead of boolean for COM compatibility
                    presentation = powerpoint.Presentations.Open(
                        abs_path, 
                        ReadOnly=1,  # Use 1 for True in COM
                        Untitled=0,  # Use 0 for False in COM
                        WithWindow=0  # Use 0 for False in COM
                    )
                    
                    text = []
                    skipped_shapes = 0
                    try:
                        for slide_idx in range(1, presentation.Slides.Count + 1):
                            slide = presentation.Slides(slide_idx)
                            for shape_idx in range(1, slide.Shapes.Count + 1):
                                try:
                                    shape = slide.Shapes(shape_idx)
                                    if hasattr(shape, "TextFrame") and hasattr(shape.TextFrame, "TextRange"):
                                        shape_text = shape.TextFrame.TextRange.Text
                                        if shape_text and shape_text.strip():
                                            text.append(shape_text.strip())
                                except Exception as shape_error:
                                    # Common errors for non-text shapes (images, charts, grouped objects)
                                    # These are expected and can be safely ignored
                                    skipped_shapes += 1
                                    continue
                    finally:
                        presentation.Close()
                        powerpoint.Quit()
                    
                    content = "\n".join(text)
                    if skipped_shapes > 0:
                        print(f"Extracted {len(content)} characters from .ppt file (via COM). Skipped {skipped_shapes} non-text shapes (images/charts/groups).")
                    else:
                        print(f"Extracted {len(content)} characters from .ppt file (via COM)")
                    return content
                    
                finally:
                    pythoncom.CoUninitialize()
                
            except ImportError:
                raise ValueError(
                    ".ppt files require either:\n"
                    "1. LibreOffice installed (recommended, cross-platform)\n"
                    "   Download from: https://www.libreoffice.org/download/\n"
                    "2. pywin32 on Windows: pip install pywin32\n"
                    "3. Or convert .ppt to .pptx format manually using PowerPoint"
                )
            except Exception as e:
                raise ValueError(
                    f"Error reading .ppt file: {str(e)}\n\n"
                    "Solutions:\n"
                    "1. Install LibreOffice from https://www.libreoffice.org/download/\n"
                    "2. Convert the file to .pptx format using PowerPoint or online converter\n"
                    "3. Ensure PowerPoint is properly installed (for Windows COM approach)"
                )
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
