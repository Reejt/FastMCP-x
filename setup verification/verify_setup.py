"""
Setup Verification Script
Checks if all components are properly configured and ready to run
"""
import sys
import subprocess
import os
from pathlib import Path

def check_python_version():
    """Check Python version"""
    version = sys.version_info
    if version.major >= 3 and version.minor >= 9:
        print(f"✓ Python {version.major}.{version.minor}.{version.micro}")
        return True
    else:
        print(f"✗ Python {version.major}.{version.minor} (need 3.9+)")
        return False

def check_package(package_name):
    """Check if Python package is installed"""
    try:
        __import__(package_name)
        print(f"✓ {package_name}")
        return True
    except ImportError:
        print(f"✗ {package_name} (not installed)")
        return False

def check_ollama():
    """Check if Ollama is installed and running"""
    try:
        result = subprocess.run(
            ["ollama", "list"],
            capture_output=True,
            text=True,
            timeout=5
        )
        if result.returncode == 0:
            print("✓ Ollama installed and accessible")
            if "llama3.2:3b" in result.stdout:
                print("  ✓ llama3.2:3b model available")
                return True
            else:
                print("  ⚠ llama3.2:3b model not found")
                print("    Run: ollama pull llama3.2:3b")
                return False
        else:
            print("✗ Ollama not running")
            return False
    except FileNotFoundError:
        print("✗ Ollama not installed")
        print("  Install from: https://ollama.ai")
        return False
    except subprocess.TimeoutExpired:
        print("✗ Ollama command timed out")
        return False

def check_node():
    """Check if Node.js is installed"""
    try:
        result = subprocess.run(
            ["node", "--version"],
            capture_output=True,
            text=True,
            timeout=5
        )
        if result.returncode == 0:
            version = result.stdout.strip()
            print(f"✓ Node.js {version}")
            return True
        else:
            print("✗ Node.js not found")
            return False
    except FileNotFoundError:
        print("✗ Node.js not installed")
        return False

def check_npm():
    """Check if npm is installed"""
    try:
        result = subprocess.run(
            ["npm", "--version"],
            capture_output=True,
            text=True,
            timeout=5
        )
        if result.returncode == 0:
            version = result.stdout.strip()
            print(f"✓ npm {version}")
            return True
        else:
            print("✗ npm not found")
            return False
    except FileNotFoundError:
        print("✗ npm not installed")
        return False

def check_directory_structure():
    """Check if required directories exist"""
    required = [
        "server",
        "client",
        "frontend",
        "utils",
        "storage"
    ]
    all_exist = True
    for dir_name in required:
        path = Path(dir_name)
        if path.exists():
            print(f"✓ {dir_name}/")
        else:
            print(f"✗ {dir_name}/ (missing)")
            all_exist = False
    return all_exist

def check_frontend_setup():
    """Check if frontend is configured"""
    frontend_path = Path("frontend")
    
    # Check node_modules
    node_modules = frontend_path / "node_modules"
    if node_modules.exists():
        print("✓ frontend/node_modules (installed)")
    else:
        print("⚠ frontend/node_modules (not installed)")
        print("  Run: cd frontend && npm install")
    
    # Check .env.local
    env_file = frontend_path / ".env.local"
    if env_file.exists():
        print("✓ frontend/.env.local (configured)")
        return True
    else:
        print("⚠ frontend/.env.local (not configured)")
        print("  Copy frontend/.env.example to frontend/.env.local")
        print("  Add your Supabase credentials")
        return False

def main():
    """Run all checks"""
    print("=" * 60)
    print("FastMCP Setup Verification")
    print("=" * 60)
    
    checks = {
        "Python Version": check_python_version(),
        "Required Packages": all([
            check_package("fastmcp"),
            check_package("fastapi"),
            check_package("uvicorn"),
            check_package("pandas"),
            check_package("sentence_transformers"),
            check_package("requests"),
        ]),
        "Ollama": check_ollama(),
        "Node.js": check_node(),
        "npm": check_npm(),
        "Directory Structure": check_directory_structure(),
        "Frontend Setup": check_frontend_setup(),
    }
    
    print("\n" + "=" * 60)
    print("Summary")
    print("=" * 60)
    
    passed = sum(1 for result in checks.values() if result)
    total = len(checks)
    
    for check_name, result in checks.items():
        status = "✓ PASS" if result else "✗ FAIL"
        print(f"{status} - {check_name}")
    
    print(f"\nTotal: {passed}/{total} checks passed")
    print("=" * 60)
    
    if passed == total:
        print("\n✓ All checks passed! You're ready to run FastMCP.")
        print("\nNext steps:")
        print("  1. Ensure Ollama is running: ollama serve")
        print("  2. Start all servers: .\\start_servers.ps1")
        print("  3. Open http://localhost:3000")
    else:
        print(f"\n⚠ {total - passed} check(s) failed. Please fix the issues above.")
        print("\nFor help, see:")
        print("  - README.md")
        print("  - SETUP.md")
        print("  - BRIDGE_SERVER.md")

if __name__ == "__main__":
    main()
