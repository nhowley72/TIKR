#!/usr/bin/env python3
"""
Prepare GitHub Secret

This script formats your Firebase service account file for use as a GitHub Secret
and prints it to the console instead of writing to a file.
"""

import json
import os
import sys

def format_service_account_for_github_secret():
    """Formats the Firebase service account file for use as a GitHub Secret."""
    try:
        # Get the path to the service account file
        script_dir = os.path.dirname(os.path.abspath(__file__))
        service_account_path = os.path.join(script_dir, 'firebase-service-account.json')
        
        # Check if the file exists
        if not os.path.exists(service_account_path):
            print(f"ERROR: Firebase service account file not found at {service_account_path}")
            sys.exit(1)
        
        # Read the service account file
        with open(service_account_path, 'r') as f:
            service_account_json = json.load(f)
        
        # Convert it back to a JSON string with proper formatting
        formatted_json = json.dumps(service_account_json)
        
        print("\n==== GITHUB SECRET VALUE (COPY EVERYTHING BETWEEN THE LINES) ====")
        print(formatted_json)
        print("==== END OF GITHUB SECRET VALUE ====\n")
        
        print("Instructions:")
        print("1. Copy the ENTIRE JSON string between the lines above")
        print("2. Go to your GitHub repository Settings > Secrets and Variables > Actions")
        print("3. Create a new repository secret named 'FIREBASE_SERVICE_ACCOUNT'")
        print("4. Paste the JSON string as the value")
        print("5. Save the secret")
        
        return True
    except Exception as e:
        print(f"ERROR: Failed to format service account file: {e}")
        return False

if __name__ == "__main__":
    format_service_account_for_github_secret() 