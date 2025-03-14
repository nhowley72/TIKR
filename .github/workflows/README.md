# GitHub Actions Workflow for TIKR

This directory contains GitHub Actions workflows for the TIKR project.

## Update Predictions Workflow

The `update-predictions.yml` workflow is designed to run the stock prediction update script on a schedule, replacing the need for cron jobs on Render.

### Schedule

The workflow is configured to run at 5:30 PM on weekdays (Monday through Friday), which is after the stock market closes.

### Manual Trigger

You can also manually trigger the workflow from the GitHub Actions tab in your repository.

### Setting Up the Firebase Service Account Secret

For the workflow to access your Firebase database, you need to set up a GitHub secret:

1. Go to your GitHub repository
2. Click on "Settings"
3. Click on "Secrets and variables" in the left sidebar
4. Click on "Actions"
5. Click on "New repository secret"
6. Name: `FIREBASE_SERVICE_ACCOUNT`
7. Value: Paste the entire contents of your `firebase-service-account.json` file
8. Click "Add secret"

### How It Works

1. The workflow checks out your code
2. Sets up Python 3.9
3. Installs the required dependencies
4. Creates the Firebase service account file from the GitHub secret
5. Runs the update_predictions.py script
6. Logs the completion

### Troubleshooting

If the workflow fails, check the following:

1. Make sure the `FIREBASE_SERVICE_ACCOUNT` secret is set up correctly
2. Verify that the `requirements.txt` file in the backend directory contains all necessary dependencies
3. Check the workflow logs for any error messages

### Benefits Over Render Cron Jobs

- Runs reliably even when your Render service is in the free tier
- Doesn't require your Render service to be running 24/7
- Doesn't consume Render resources
- Can be manually triggered for testing
- Provides detailed logs for troubleshooting
