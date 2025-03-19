# Creating a Clean Repository

Follow these steps to create a clean repository without any sensitive files:

## Step 1: Get Firebase Secret Ready

1. Run the script to get the properly formatted Firebase secret:
   ```bash
   cd my-react-app/backend
   python prepare_github_secret.py
   ```

2. Copy the output (between the delimiter lines) for use in GitHub later.

## Step 2: Create a New Directory

```bash
mkdir -p ~/TIKR_clean
```

## Step 3: Copy Files (Excluding Sensitive Ones)

```bash
cd /Users/noel_personal/Repos/TIKR
rsync -av --exclude='.git/' --exclude='firebase-service-account.json' --exclude='github-secret.txt' --exclude='*secret*' --exclude='*credential*' --exclude='*.env*' . ~/TIKR_clean/
```

## Step 4: Initialize a New Git Repository

```bash
cd ~/TIKR_clean
git init
git add .
git commit -m "Initial commit with clean repository (no sensitive files)"
```

## Step 5: Add Remote and Push

Option A: Push to the same repository (after removing old branch)
```bash
git remote add origin https://github.com/nhowley72/TIKR.git
git push -u origin main --force
```

Option B: Create a new GitHub repository
1. Go to GitHub and create a new repository
2. Follow the instructions to push an existing repository

## Step 6: Add the GitHub Secret

1. Go to your GitHub repository Settings > Secrets and Variables > Actions
2. Add a new repository secret named `FIREBASE_SERVICE_ACCOUNT`
3. Paste the JSON string you copied in Step 1
4. Save the secret

## Step 7: Run the GitHub Action

1. Go to the Actions tab
2. Select "Update Stock Predictions"
3. Click "Run workflow"

## Alternative: Use GitHub's Bypass URL

If creating a new repository is too much work, you can:
1. Visit: https://github.com/nhowley72/TIKR/security/secret-scanning/unblock-secret/2uYNBTK53CUjjOuMWOy6a8lk42Y
2. Confirm that the secret is no longer in use or has been properly rotated
3. After approval, you'll be able to push your changes 