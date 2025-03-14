#!/usr/bin/env python3
"""
Model Copy Script

This script copies the trained models from the ML directory to the backend's live_models directory.
"""

import os
import shutil
import logging

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger('model_copy')

def copy_models():
    """Copy models from ML directory to backend's live_models directory."""
    # Define paths
    ml_models_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'ml', 'models')
    backend_models_dir = os.path.join(os.path.dirname(__file__), 'live_models')
    
    # Ensure the backend models directory exists
    os.makedirs(backend_models_dir, exist_ok=True)
    
    # Get list of model files
    try:
        model_files = [f for f in os.listdir(ml_models_dir) if f.endswith('_model.joblib')]
        logger.info(f"Found {len(model_files)} model files in ML directory")
    except Exception as e:
        logger.error(f"Error listing models in ML directory: {e}")
        return False
    
    # Copy each model file
    success_count = 0
    for model_file in model_files:
        source_path = os.path.join(ml_models_dir, model_file)
        dest_path = os.path.join(backend_models_dir, model_file)
        
        try:
            shutil.copy2(source_path, dest_path)
            logger.info(f"Copied {model_file} to backend models directory")
            success_count += 1
        except Exception as e:
            logger.error(f"Error copying {model_file}: {e}")
    
    logger.info(f"Successfully copied {success_count}/{len(model_files)} models")
    return success_count > 0

if __name__ == "__main__":
    logger.info("Starting model copy process")
    if copy_models():
        logger.info("Model copy process completed successfully")
    else:
        logger.error("Model copy process failed") 