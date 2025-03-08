#!/usr/bin/env python3
"""
Cron Job Setup Script

This script helps set up a cron job to automatically update stock predictions.
"""

import os
import sys
import subprocess
import argparse
import platform
import getpass

def get_current_username():
    """Get the current username."""
    try:
        return getpass.getuser()
    except:
        try:
            return os.environ.get('USER') or os.environ.get('USERNAME')
        except:
            return None

def setup_cron(frequency='daily', hour=0, minute=0, user=None):
    """
    Set up a cron job to run the update_predictions.py script.
    
    Args:
        frequency: 'hourly', 'daily', 'weekly', or a custom cron schedule
        hour: Hour to run (0-23) for daily/weekly schedules
        minute: Minute to run (0-59)
        user: User to set up cron for (default: current user)
    """
    # Try to import crontab again to ensure it's available
    try:
        from crontab import CronTab
    except ImportError:
        print("Error: python-crontab is required to set up cron jobs.")
        print("Please install it with: pip install python-crontab")
        sys.exit(1)
        
    # Get the absolute path to the update_predictions.py script
    script_dir = os.path.dirname(os.path.abspath(__file__))
    update_script = os.path.join(script_dir, 'update_predictions.py')
    
    # Make sure the script is executable
    try:
        os.chmod(update_script, 0o755)
    except Exception as e:
        print(f"Warning: Could not make script executable: {e}")
        print("You may need to run: chmod +x update_predictions.py")
    
    # Create a virtual environment path
    venv_path = os.path.join(script_dir, 'venv')
    python_path = os.path.join(venv_path, 'bin', 'python')
    
    # Check if virtual environment exists
    if not os.path.exists(python_path):
        venv_path = os.path.join(script_dir, 'venv_py310')
        python_path = os.path.join(venv_path, 'bin', 'python')
        
        if not os.path.exists(python_path):
            # Try using the system Python
            python_path = sys.executable
            print(f"Warning: Virtual environment not found. Using system Python: {python_path}")
    
    # Create the command to run
    command = f"{python_path} {update_script} >> {script_dir}/cron_log.txt 2>&1"
    
    # Set up the cron job
    try:
        # On macOS, we need to specify the user
        if user is None and platform.system() == 'Darwin':
            user = get_current_username()
            if user:
                print(f"Detected macOS, using current user: {user}")
            else:
                print("Could not determine current user. Please specify with --user.")
                sys.exit(1)
        
        print(f"Setting up cron job with user: {user or 'current user'}")
        
        # Create the crontab object
        if user:
            try:
                cron = CronTab(user=user)
            except Exception as e:
                print(f"Error creating crontab for user {user}: {e}")
                print("Trying with current user...")
                cron = CronTab(user=True)
        else:
            # For Linux/Unix systems where the current user's crontab is used by default
            cron = CronTab(user=True)
        
        # Remove any existing jobs for this script
        for job in cron.find_comment('TIKR Stock Prediction Update'):
            cron.remove(job)
            print("Removed existing cron job")
        
        # Create a new job
        job = cron.new(command=command, comment='TIKR Stock Prediction Update')
        
        # Set the schedule based on frequency
        if frequency == 'hourly':
            job.minute.on(minute)
        elif frequency == 'daily':
            job.minute.on(minute)
            job.hour.on(hour)
        elif frequency == 'weekly':
            job.minute.on(minute)
            job.hour.on(hour)
            job.dow.on(0)  # Sunday
        else:
            # Custom schedule
            job.setall(frequency)
        
        # Write the crontab
        cron.write()
        
        print(f"Cron job set up to run {frequency}")
        print(f"Command: {command}")
        
        # Show the current crontab
        print("\nCurrent crontab:")
        for job in cron:
            print(job)
    except Exception as e:
        print(f"Error setting up cron job: {e}")
        sys.exit(1)

def check_dependencies():
    """Check if required dependencies are installed."""
    try:
        import firebase_admin
        import pandas
        import numpy
        import joblib
        import yfinance
        from crontab import CronTab
        return True
    except ImportError as e:
        print(f"Missing dependency: {e}")
        print("Please install required packages:")
        print("pip install python-crontab firebase-admin pandas numpy joblib yfinance")
        return False

def main():
    """Main function to set up the cron job."""
    parser = argparse.ArgumentParser(description='Set up a cron job for stock prediction updates')
    parser.add_argument('--frequency', choices=['hourly', 'daily', 'weekly', 'custom'], default='daily',
                        help='Frequency to run the job')
    parser.add_argument('--hour', type=int, default=0, help='Hour to run (0-23) for daily/weekly schedules')
    parser.add_argument('--minute', type=int, default=0, help='Minute to run (0-59)')
    parser.add_argument('--custom', type=str, help='Custom cron schedule (e.g., "0 */4 * * *" for every 4 hours)')
    parser.add_argument('--user', type=str, help='User to set up cron for (default: current user)')
    
    args = parser.parse_args()
    
    if not check_dependencies():
        sys.exit(1)
    
    frequency = args.frequency
    if frequency == 'custom' and args.custom:
        frequency = args.custom
    
    setup_cron(frequency, args.hour, args.minute, args.user)

if __name__ == "__main__":
    main() 