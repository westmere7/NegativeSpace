#!/usr/bin/env python3
"""
Photo List Generator for Static Hosting
Run this script whenever you add new photos to generate photos.json
Usage: python generate_photo_list.py
"""

import os
import json
from pathlib import Path
import re

# Configuration
PHOTO_DIR = 'Photos'
OUTPUT_FILE = 'photos.json'
ALLOWED_EXTENSIONS = {'.jpg', '.jpeg', '.png', '.gif', '.webp', '.JPG', '.JPEG', '.PNG'}

def get_date_taken(path):
    """
    Attempt to extract the earliest date string (likely Date Taken) from the file header.
    Falls back to mtime if no date pattern is found.
    """
    try:
        with open(path, 'rb') as f:
            # Read first 8KB which should contain the EXIF header
            header = f.read(8192)
            # Match YYYY:MM:DD HH:MM:SS format
            # We use distinct patterns to avoid capturing garbage, though \d{4} is fairly safe
            matches = re.findall(b'\\d{4}:\\d{2}:\\d{2} \\d{2}:\\d{2}:\\d{2}', header)
            if matches:
                # Convert bytes to strings
                dates = [d.decode('utf-8') for d in matches]
                # Mod date usually >= Creation date, so min() is likely the creation date
                # We filter out obviously invalid years if necessary, but lexicographical min works well for ISO format
                # Filter out dates starting with '0000' (empty EXIF)
                valid_dates = [d for d in dates if not d.startswith('0000')]
                if valid_dates:
                    return min(valid_dates)
    except Exception:
        pass
    
    # Fallback to modification time (formatted to be comparable string or just use timestamp)
    # Since we want to mix them, let's just return a generic comparable value. 
    # But wait, date string is "YYYY...", mtime is float.
    # Let's convert mtime to an ISO string for consistent comparison? 
    # Or just return the mtime timestamp if no date found, but that breaks sort if mixed types.
    # Actually, easy way: return mtime as float for fallback, convert date string to approximate timestamp?
    # No, simple string comparison is safer if we stick to strings, but headers are more precise.
    # Let's stringify mtime to "YYYY:MM:DD..." format? 
    # Simplest: Just use mtime as the sort key if EXIF missing? No, inconsistent.
    # Let's rely on sorted() capability to handle consistent types. 
    # We'll just use the string for EXIF. If missing, we format mtime.
    import datetime
    mtime = path.stat().st_mtime
    return datetime.datetime.fromtimestamp(mtime).strftime('%Y:%m:%d %H:%M:%S')

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
            
            # Extract date
            date_taken = get_date_taken(file_path)
            
            photo_data = {
                'filename': rel_path,
                'date': date_taken
            }
            
            if parent == photo_dir:
                # Root photo -> Home
                data['home'].append(photo_data)
            else:
                # Subfolder -> Collection
                relative_parent = parent.relative_to(photo_dir)
                collection_name = relative_parent.parts[0]
                
                if collection_name not in data['collections']:
                    data['collections'][collection_name] = []
                data['collections'][collection_name].append(photo_data)
    
    # Sort everything by date taken (Newest First -> Descending)
    data['home'].sort(key=lambda x: x['date'], reverse=True)
    # Convert to just filenames
    data['home'] = [p['filename'] for p in data['home']]
    
    for name in data['collections']:
        data['collections'][name].sort(key=lambda x: x['date'], reverse=True)
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