#!/usr/bin/env python3
"""
Remove Render Cron Jobs Script

This script helps remove any cron jobs from your Render configuration.
"""

import os
import sys
import yaml
import shutil

def backup_file(file_path):
    """Create a backup of the file."""
    backup_path = file_path + '.bak'
    try:
        shutil.copy2(file_path, backup_path)
        print(f"Created backup at {backup_path}")
        return True
    except Exception as e:
        print(f"Error creating backup: {e}")
        return False

def remove_cron_jobs(render_yaml_path):
    """Remove cron jobs from render.yaml file."""
    if not os.path.exists(render_yaml_path):
        print(f"Error: {render_yaml_path} not found.")
        return False
    
    # Create a backup
    if not backup_file(render_yaml_path):
        return False
    
    try:
        # Read the YAML file
        with open(render_yaml_path, 'r') as file:
            config = yaml.safe_load(file)
        
        if not config:
            print("Error: Empty or invalid YAML file.")
            return False
        
        # Check if there are any cron jobs
        if 'services' not in config:
            print("No services found in render.yaml.")
            return False
        
        original_services_count = len(config['services'])
        
        # Filter out any cron jobs
        config['services'] = [service for service in config['services'] if service.get('type') != 'cron']
        
        # Check if any services were removed
        new_services_count = len(config['services'])
        removed_count = original_services_count - new_services_count
        
        if removed_count > 0:
            # Write the updated YAML back to the file
            with open(render_yaml_path, 'w') as file:
                yaml.dump(config, file, default_flow_style=False)
            print(f"Successfully removed {removed_count} cron job(s) from {render_yaml_path}")
        else:
            print("No cron jobs found in render.yaml.")
        
        return True
    except Exception as e:
        print(f"Error processing render.yaml: {e}")
        return False

def main():
    """Main function."""
    script_dir = os.path.dirname(os.path.abspath(__file__))
    render_yaml_path = os.path.join(script_dir, 'render.yaml')
    
    print("===== Removing Cron Jobs from Render Configuration =====")
    
    if remove_cron_jobs(render_yaml_path):
        print("\n===== Next Steps =====")
        print("1. Push your updated code to GitHub")
        print("2. Go to your Render dashboard: https://dashboard.render.com/")
        print("3. Delete your existing service and create a new one")
        print("4. Connect to your GitHub repository")
        print("5. Select the 'my-react-app/backend' directory as the root directory")
        print("6. Render will automatically detect the updated render.yaml file")
        print("7. Click 'Create Web Service'")
        print("\nAlternatively, you can manually update your existing service in the Render dashboard.")
        print("\n===== Important Notes =====")
        print("- Render's free tier does NOT support cron jobs")
        print("- You should run the update_predictions.py script manually or set up an external cron service")
        print("- See RENDER_DEPLOYMENT.md for more information on alternatives")
    else:
        print("\nFailed to remove cron jobs. Please check the errors above.")

if __name__ == "__main__":
    main() 