#!/bin/bash

# update_predictions_wrapper.sh
# This script is a wrapper for update_predictions.py to ensure the correct environment is used

# Log file
LOG_FILE="/Users/noel_personal/Repos/TIKR/my-react-app/backend/cron_log.txt"

# Log start time
echo "===== Starting update_predictions.py at $(date) =====" >> "$LOG_FILE" 2>&1

# Install required packages if they're not already installed
pip install firebase-admin pandas numpy joblib yfinance >> "$LOG_FILE" 2>&1

# Run the update_predictions.py script
cd /Users/noel_personal/Repos/TIKR/my-react-app/backend
python update_predictions.py >> "$LOG_FILE" 2>&1

# Log end time
echo "===== Finished update_predictions.py at $(date) =====" >> "$LOG_FILE" 2>&1 