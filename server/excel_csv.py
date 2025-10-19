import pandas as pd
import logging

logger = logging.getLogger(__name__)

class ExcelQueryEngine:
    """Query Excel files directly using pandas - no database needed."""
    
    def __init__(self, file_path: str):
        self.file_path = file_path
        self.data = {}  # Cache loaded sheets
    
    def _find_header_row(self, sheet_name: str = None):
        """Find the row index that contains the actual column headers."""
        # Try reading first 20 rows to find headers
        for header_row in range(20):
            try:
                df = pd.read_excel(
                    self.file_path,
                    sheet_name=sheet_name if sheet_name else 0,
                    header=header_row,
                    engine='openpyxl',
                    nrows=5  # Just read a few rows to check
                )
                # Check if we have meaningful column names (not all "Unnamed")
                unnamed_count = sum(1 for col in df.columns if str(col).startswith('Unnamed'))
                if unnamed_count < len(df.columns) * 0.5:  # Less than 50% unnamed
                    return header_row
            except:
                continue
        return 0  # Default to first row if nothing found
    
    def load_sheet(self, sheet_name: str = None):
        """Load and cache a sheet."""
        if sheet_name not in self.data:
            try:
                # Find the correct header row
                header_row = self._find_header_row(sheet_name)
                
                if sheet_name is None:
                    # When sheet_name is None, read the first sheet only
                    self.data[sheet_name] = pd.read_excel(
                        self.file_path, 
                        sheet_name=0,
                        header=header_row,
                        engine='openpyxl'
                    )
                    logger.info(f"Loaded first sheet from {self.file_path} with header at row {header_row}")
                else:
                    # Load specific sheet
                    self.data[sheet_name] = pd.read_excel(
                        self.file_path, 
                        sheet_name=sheet_name,
                        header=header_row,
                        engine='openpyxl'
                    )
                    logger.info(f"Loaded sheet '{sheet_name}' from {self.file_path} with header at row {header_row}")
            except Exception as e:
                logger.error(f"Error loading sheet '{sheet_name}': {str(e)}")
                raise
        return self.data[sheet_name]
    
    def query(self, sheet_name: str = None, **filters):
        """Query the Excel data with filters."""
        df = self.load_sheet(sheet_name).copy()
        
        # Apply filters
        for column, value in filters.items():
            if column in df.columns:
                if isinstance(value, list):
                    df = df[df[column].isin(value)]
                else:
                    df = df[df[column] == value]
        
        return df
    
    def sql_like_query(self, query: str, sheet_name: str = None):
        """Execute SQL-like queries using pandasql."""
        df = self.load_sheet(sheet_name).copy()
        
        try:
            import pandasql as psql
            return psql.sqldf(query, {'df': df})
        except ImportError:
            logger.warning("pandasql not available, falling back to basic filtering")
            return df


class CSVQueryEngine:
    """Query CSV files using pandas."""
    
    def __init__(self, file_path: str):
        self.file_path = file_path
        self.data = None
    
    def load_data(self):
        """Load and cache CSV data."""
        if self.data is None:
            try:
                self.data = pd.read_csv(self.file_path)
                logger.info(f"Loaded CSV from {self.file_path}")
            except Exception as e:
                logger.error(f"Error loading CSV: {str(e)}")
                raise
        return self.data
    
    def query(self, **filters):
        """Query the CSV data with filters."""
        df = self.load_data().copy()
        
        # Apply filters
        for column, value in filters.items():
            if column in df.columns:
                if isinstance(value, list):
                    df = df[df[column].isin(value)]
                else:
                    df = df[df[column] == value]
        
        return df