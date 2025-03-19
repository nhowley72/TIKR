# Fix for GitHub Actions Workflow

Follow these steps to fix the GitHub Actions workflow for TIKR:

## Step 1: Add Firebase Service Account as GitHub Secret

1. Run the `prepare_github_secret.py` script:
   ```bash
   cd my-react-app/backend
   python prepare_github_secret.py
   ```

2. This will create a file called `github-secret.txt` with properly formatted JSON.

3. Go to your GitHub repository:
   - Click on "Settings"
   - Click on "Secrets and variables" in the left sidebar
   - Click on "Actions"
   - Click on "New repository secret"
   - Name: `FIREBASE_SERVICE_ACCOUNT`
   - Value: Paste the entire contents of the `github-secret.txt` file
   - Click "Add secret"

## Step 2: Update Your GitHub Actions Workflow

The updated workflow file has already been created at:
`.github/workflows/update-predictions.yml`

It includes these improvements:
- Better error handling
- Simplified dependency installation
- Proper environment variable handling for the Firebase service account
- Better path management

## Step 3: Commit and Push the Changes

Push these changes to your GitHub repository:
```bash
git add .
git commit -m "Fix GitHub Actions workflow"
git push
```

## Step 4: Run the Workflow Manually

1. Go to the Actions tab in your GitHub repository
2. Select the "Update Stock Predictions" workflow
3. Click on "Run workflow"
4. Click the green "Run workflow" button

## Troubleshooting

If the workflow still fails, check these common issues:

1. **Firebase Service Account Secret**: Make sure the secret was added correctly. Check for any extra whitespace or formatting issues.

2. **Repository Permissions**: Ensure the workflow has permission to check out code and access secrets.

3. **Path Issues**: Make sure file paths in the workflow match your repository structure.

You can check the workflow logs for specific error messages that will help identify what's wrong. 