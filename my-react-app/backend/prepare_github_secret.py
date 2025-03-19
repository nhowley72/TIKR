#!/usr/bin/env python3
"""
Prepare GitHub Secret

This script formats your Firebase service account file for use as a GitHub Secret.
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
        
        # Output the formatted JSON string to a file
        output_path = os.path.join(script_dir, 'github-secret.txt')
        with open(output_path, 'w') as f:
            f.write(formatted_json)
        
        print(f"SUCCESS: GitHub Secret formatted and saved to {output_path}")
        print("Instructions:")
        print("1. Copy the ENTIRE contents of this file")
        print("2. Go to your GitHub repository Settings > Secrets and Variables > Actions")
        print("3. Create a new repository secret named 'FIREBASE_SERVICE_ACCOUNT'")
        print("4. Paste the contents as the value")
        print("5. Save the secret")
        
        return True
    except Exception as e:
        print(f"ERROR: Failed to format service account file: {e}")
        return False

if __name__ == "__main__":
    format_service_account_for_github_secret() 