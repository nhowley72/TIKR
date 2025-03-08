#!/usr/bin/env python3
"""
Test script to verify python-crontab is working
"""

import sys
print(f"Python version: {sys.version}")
print(f"Python executable: {sys.executable}")
print(f"Python path: {sys.path}")

try:
    from crontab import CronTab
    print("Successfully imported python-crontab!")
    
    # Try to create a CronTab object
    cron = CronTab(user=True)
    print("Successfully created CronTab object!")
    
    # List current cron jobs
    print("\nCurrent cron jobs:")
    for job in cron:
        print(job)
        
except ImportError as e:
    print(f"Failed to import python-crontab: {e}")
    print("Please check your installation.")
except Exception as e:
    print(f"Error when using python-crontab: {e}") 