#!/usr/bin/env python3
"""
Photo List Generator for Static Hosting
Run this script whenever you add new photos to generate photos.json
Usage: python generate_photo_list.py
"""

import os
import json
from pathlib import Path

# Configuration
PHOTO_DIR = 'Photos'
OUTPUT_FILE = 'photos.json'
ALLOWED_EXTENSIONS = {'.jpg', '.jpeg', '.png', '.gif', '.webp', '.JPG', '.JPEG', '.PNG'}

def get_photo_list():
    """Scan the Photos directory and return a sorted list of photo filenames."""
    
    photo_dir = Path(PHOTO_DIR)
    
    # Check if directory exists
    if not photo_dir.exists():
        print(f"Warning: {PHOTO_DIR} directory not found. Creating it...")
        photo_dir.mkdir(exist_ok=True)
        return []
    
    # Get all image files with their modification times recursively
    photos = []
    
    # helper to check extension safely
    def is_image(path):
        return path.suffix in ALLOWED_EXTENSIONS
        
    for file_path in photo_dir.rglob('*'):
        if file_path.is_file() and is_image(file_path):
            # Get path relative to PHOTO_DIR and convert to forward slashes
            rel_path = file_path.relative_to(photo_dir).as_posix()
            
            photos.append({
                'filename': rel_path,
                'mtime': file_path.stat().st_mtime
            })
    
    # Sort by modification time (newest first)
    photos.sort(key=lambda x: x['mtime'], reverse=True)
    
    # Return just the relative paths
    return [photo['filename'] for photo in photos]

def main():
    """Generate the photos.json file."""
    
    print(f"Scanning {PHOTO_DIR} directory...")
    photo_list = get_photo_list()
    
    if not photo_list:
        print(f"No photos found in {PHOTO_DIR}/")
    else:
        print(f"Found {len(photo_list)} photos")
    
    # Write to JSON file
    with open(OUTPUT_FILE, 'w') as f:
        json.dump(photo_list, f, indent=2)
    
    print(f"DONE: Generated {OUTPUT_FILE}")
    
    if photo_list:
        print("\nPhotos (newest first):")
        for i, photo in enumerate(photo_list[:5], 1):
            print(f"  {i}. {photo}")
        if len(photo_list) > 5:
            print(f"  ... and {len(photo_list) - 5} more")

if __name__ == '__main__':
    main()