# TIKR Prediction Update Cron Job

This directory contains scripts to automatically update stock predictions in Firebase using a cron job.

## Files

- `update_predictions.py`: The main script that fetches stock data, runs predictions, and updates Firebase.
- `setup_cron.py`: A helper script to set up the cron job.
- `firebase-service-account.json`: Your Firebase service account credentials file.

## Prerequisites

1. Make sure you have a virtual environment set up with all required dependencies:

```bash
# Create a virtual environment (if not already created)
python -m venv venv

# Activate the virtual environment
source venv/bin/activate  # On Linux/Mac
# or
venv\Scripts\activate  # On Windows

# Install dependencies
pip install -r requirements.txt

# Additionally, install python-crontab for the setup script
pip install python-crontab
```

2. Ensure your Firebase service account file (`firebase-service-account.json`) is in the backend directory.

## Setting Up the Cron Job

You can set up the cron job using the `setup_cron.py` script:

```bash
# Activate your virtual environment first
source venv/bin/activate  # On Linux/Mac
# or
venv\Scripts\activate  # On Windows

# Set up a daily cron job (runs at midnight)
python setup_cron.py --frequency daily --hour 0 --minute 0

# Set up an hourly cron job
python setup_cron.py --frequency hourly --minute 0

# Set up a weekly cron job (runs on Sunday at midnight)
python setup_cron.py --frequency weekly --hour 0 --minute 0

# Set up a custom cron schedule (e.g., every 4 hours)
python setup_cron.py --frequency custom --custom "0 */4 * * *"
```

## Running the Update Script Manually

You can also run the update script manually:

```bash
# Activate your virtual environment first
source venv/bin/activate  # On Linux/Mac
# or
venv\Scripts\activate  # On Windows

# Run the script
python update_predictions.py
```

## Checking Logs

The cron job will log its output to `cron_log.txt` in the backend directory. You can check this file to see if the job is running correctly:

```bash
tail -f cron_log.txt
```

## Troubleshooting

If you encounter issues with the cron job:

1. Check if the cron job is set up correctly:
   ```bash
   crontab -l
   ```

2. Make sure the scripts are executable:
   ```bash
   chmod +x update_predictions.py setup_cron.py
   ```

3. Check the log file for errors:
   ```bash
   cat cron_log.txt
   ```

4. Verify that your Firebase service account file is correctly set up and has the necessary permissions.

5. Try running the update script manually to see if there are any errors.

## Notes

- The prediction update script will fetch data for the following tickers: AAPL, MSFT, GOOGL, AMZN, META, TSLA, NVDA.
- The script uses the models in the `live_models` directory to make predictions.
- Predictions are stored in the `predictions` collection in Firebase Firestore.
- The script logs its output to the console and to `cron_log.txt` when run via cron. 