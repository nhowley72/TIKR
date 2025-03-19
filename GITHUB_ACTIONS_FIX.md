# Fix for GitHub Actions Workflow

Follow these steps to fix the GitHub Actions workflow for TIKR:

## Step 1: Add Firebase Service Account as GitHub Secret

1. Run the `prepare_github_secret.py` script:
   ```bash
   cd my-react-app/backend
   python prepare_github_secret.py
   ```

2. This will print the formatted JSON to the console.

3. Go to your GitHub repository:
   - Click on "Settings"
   - Click on "Secrets and variables" in the left sidebar
   - Click on "Actions"
   - Click on "New repository secret"
   - Name: `FIREBASE_SERVICE_ACCOUNT`
   - Value: Paste the JSON string between the delimiter lines
   - Click "Add secret"

## Step 2: Your GitHub Actions Workflow is Ready

The updated workflow file is already in your repository at:
`.github/workflows/update-predictions.yml`

It includes these improvements:
- Better error handling
- Simplified dependency installation
- Proper environment variable handling for the Firebase service account
- Better path management

## Step 3: Run the Workflow Manually

1. Go to the Actions tab in your GitHub repository
2. Select the "Update Stock Predictions" workflow
3. Click on "Run workflow"
4. Click the green "Run workflow" button

## Troubleshooting

If the workflow still fails, check these common issues:

1. **Firebase Service Account Secret**: Make sure the secret was added correctly. Check for any extra whitespace or formatting issues.

2. **Repository Permissions**: Ensure the workflow has permission to check out code and access secrets.

3. **Path Issues**: Make sure file paths in the workflow match your repository structure.

4. **Logs**: Check the workflow logs for specific error messages that will help identify what's wrong.

## IMPORTANT: Security Note

NEVER commit sensitive credentials to your repository:
- Don't commit files like `github-secret.txt` or `firebase-service-account.json`
- Always use GitHub Secrets for sensitive information
- Check that your `.gitignore` file excludes sensitive files 