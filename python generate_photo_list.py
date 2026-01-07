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
    
    # Data structure for output
    data = {
        'home': [],
        'collections': {}
    }
    
    # helper to check extension safely
    def is_image(path):
        return path.suffix in ALLOWED_EXTENSIONS
        
    for file_path in photo_dir.rglob('*'):
        if file_path.is_file() and is_image(file_path):
            # Get path relative to PHOTO_DIR and convert to forward slashes
            rel_path = file_path.relative_to(photo_dir).as_posix()
            
            # Determine if it's a root photo or in a collection
            parent = file_path.parent
            
            photo_data = {
                'filename': rel_path,
                'mtime': file_path.stat().st_mtime
            }
            
            if parent == photo_dir:
                # Root photo -> Home
                data['home'].append(photo_data)
            else:
                # Subfolder -> Collection
                # Use the name of the immediate subdirectory inside Photos
                # This handles nested folders by grouping them under the top-level subfolder
                relative_parent = parent.relative_to(photo_dir)
                collection_name = relative_parent.parts[0]
                
                if collection_name not in data['collections']:
                    data['collections'][collection_name] = []
                data['collections'][collection_name].append(photo_data)
    
    # Sort everything by modification time
    data['home'].sort(key=lambda x: x['mtime'], reverse=True)
    # Convert to just filenames
    data['home'] = [p['filename'] for p in data['home']]
    
    for name in data['collections']:
        data['collections'][name].sort(key=lambda x: x['mtime'], reverse=True)
        # Convert to just filenames
        data['collections'][name] = [p['filename'] for p in data['collections'][name]]
    
    return data

def main():
    """Generate the photos.json file."""
    
    print(f"Scanning {PHOTO_DIR} directory...")
    photo_list = get_photo_list()
    
    if not photo_list:
        print(f"No photos found in {PHOTO_DIR}/")
    else:
        # Write to JSON file
        with open(OUTPUT_FILE, 'w') as f:
            json.dump(photo_list, f, indent=2)
            
        print(f"DONE: Generated {OUTPUT_FILE}")
        
        home_count = len(photo_list.get('home', []))
        coll_count = len(photo_list.get('collections', {}))
        
        print(f"\nStats:")
        print(f"  Home Photos: {home_count}")
        print(f"  Collections: {coll_count}")
        
        if coll_count > 0:
            for name, photos in photo_list['collections'].items():
                print(f"    - {name}: {len(photos)} photos")

if __name__ == '__main__':
    main()