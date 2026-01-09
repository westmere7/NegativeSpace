#!/usr/bin/env python3
"""
Photo List Generator for Static Hosting
Run this script whenever you add new photos to generate photos.json
Usage: python generate_photo_list.py
"""

import os
import json
from pathlib import Path
from PIL import Image, ImageOps, ExifTags
import re

# Configuration
PHOTO_DIR = 'Photos'
THUMBNAIL_DIR = os.path.join(PHOTO_DIR, 'thumbnails')
OUTPUT_FILE = 'photos.json'
ALLOWED_EXTENSIONS = {'.jpg', '.jpeg', '.png', '.gif', '.webp', '.JPG', '.JPEG', '.PNG'}
THUMBNAIL_SIZE = (800, 800)  # Max width/height 800px

def get_date_taken(path):
    """
    Attempt to extract the earliest date string (likely Date Taken) from the file header.
    Falls back to mtime if no date pattern is found.
    """
    try:
        with open(path, 'rb') as f:
            header = f.read(8192)
            matches = re.findall(b'\\d{4}:\\d{2}:\\d{2} \\d{2}:\\d{2}:\\d{2}', header)
            if matches:
                dates = [d.decode('utf-8') for d in matches]
                valid_dates = [d for d in dates if not d.startswith('0000')]
                if valid_dates:
                    return min(valid_dates)
    except Exception:
        pass
    
    import datetime
    mtime = path.stat().st_mtime
    return datetime.datetime.fromtimestamp(mtime).strftime('%Y:%m:%d %H:%M:%S')

def extract_metadata(img):
    """Extract standard EXIF data using Pillow."""
    meta = {
        'make': '',
        'model': '',
        'lens': '',
        'f_number': '',
        'iso': '',
        'exposure_time': '',
        'focal_length': '',
        'ev': '',
        'date': '' 
    }
    
    try:
        exif = img._getexif()
        if not exif:
            return meta
            
        # Map indices to names for easier lookup
        exif_data = {ExifTags.TAGS.get(k, k): v for k, v in exif.items()}
        
        meta['make'] = str(exif_data.get('Make', '')).strip()
        meta['model'] = str(exif_data.get('Model', '')).strip()
        meta['lens'] = str(exif_data.get('LensModel', '')).strip()
        meta['date'] = str(exif_data.get('DateTimeOriginal', '')).strip()
        
        # Numeric values handling
        if 'FNumber' in exif_data:
            val = exif_data['FNumber']
            # Pillow often returns IFDRational or tuple
            if hasattr(val, 'numerator') and hasattr(val, 'denominator') and val.denominator != 0:
                meta['f_number'] = round(val.numerator / val.denominator, 1)
            elif isinstance(val, tuple) and len(val) == 2 and val[1] != 0:
                 meta['f_number'] = round(val[0] / val[1], 1)
            else:
                 meta['f_number'] = val

        if 'ISOSpeedRatings' in exif_data:
            iso = exif_data['ISOSpeedRatings']
            # Sometimes it's a tuple for multiple sensors?
            if isinstance(iso, tuple):
                meta['iso'] = iso[0]
            else:
                meta['iso'] = iso

        if 'ExposureTime' in exif_data:
            val = exif_data['ExposureTime']
            # We want "1/100" format usually, but let's store decimal or rational
            if hasattr(val, 'numerator') and hasattr(val, 'denominator'):
                 if val.numerator == 1:
                     meta['exposure_time'] = f"1/{val.denominator}"
                 else:
                     meta['exposure_time'] = str(float(val))
            else:
                meta['exposure_time'] = str(val)

        if 'FocalLength' in exif_data:
            val = exif_data['FocalLength']
             # e.g. 50.0
            if hasattr(val, 'numerator') and hasattr(val, 'denominator') and val.denominator != 0:
                 meta['focal_length'] = int(val.numerator / val.denominator)
            else:
                 meta['focal_length'] = int(val) if val else ''

        if 'ExposureBiasValue' in exif_data:
             val = exif_data['ExposureBiasValue']
             if hasattr(val, 'numerator') and hasattr(val, 'denominator'):
                 if val.denominator == 0:
                     meta['ev'] = 0
                 else:
                     meta['ev'] = round(val.numerator / val.denominator, 1)
             else:
                 meta['ev'] = val
                 
    except Exception as e:
        # print(f"Metadata extraction error: {e}") 
        pass
        
    return meta

def generate_thumbnail(original_path, thumbnail_path):
    """Generate a thumbnail if it doesn't exist."""
    try:
        # We assume thumbnail exists, but we need to open the image ANYWAY
        # to extract metadata for consistent JSON (unless we cache metadata).
        # For this script run, we'll re-open to get metadata.
        
        generated = False
        img = None
        
        # Optimization: verify if needs generation logic
        needs_gen = not thumbnail_path.exists()
        
        with Image.open(original_path) as img_ref:
            # Extract Metadata from ORIGINAL image
            metadata = extract_metadata(img_ref)
            
            if needs_gen:
                # Fix orientation based on EXIF
                img = ImageOps.exif_transpose(img_ref)
                
                # Convert to RGB (in case of RGBA/P palette)
                if img.mode in ('RGBA', 'P'):
                    img = img.convert('RGB')
                    
                img.thumbnail(THUMBNAIL_SIZE, Image.Resampling.LANCZOS)
                
                # Ensure parent dir exists
                thumbnail_path.parent.mkdir(parents=True, exist_ok=True)
                
                img.save(thumbnail_path, quality=80, optimize=True)
                print(f"Generated thumbnail: {thumbnail_path.name}")
            
            return metadata
            
    except Exception as e:
        print(f"Error processing {original_path.name}: {e}")
        return {} # Return empty meta on error

def get_photo_list():
    """Scan the Photos directory and return a sorted list of photo filenames."""
    
    photo_dir = Path(PHOTO_DIR)
    thumbs_dir = Path(THUMBNAIL_DIR)
    
    # Check if directory exists
    if not photo_dir.exists():
        print(f"Warning: {PHOTO_DIR} directory not found. Creating it...")
        photo_dir.mkdir(exist_ok=True)
        return []
        
    if not thumbs_dir.exists():
        thumbs_dir.mkdir(exist_ok=True)
    
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
            # Skip if file is inside the thumbnails folder
            if 'thumbnails' in file_path.parts:
                continue

            # Get path relative to PHOTO_DIR and convert to forward slashes
            rel_path = file_path.relative_to(photo_dir).as_posix()
            
            # Determine if it's a root photo or in a collection
            parent = file_path.parent
            
            # Calculate thumbnail path
            # Structure: Photos/thumbnails/filename.jpg OR Photos/thumbnails/collection/filename.jpg
            if parent == photo_dir:
                 thumb_rel_path = f"thumbnails/{file_path.name}"
                 thumb_file = photo_dir / "thumbnails" / file_path.name
            else:
                 # Collection
                 relative_parent = parent.relative_to(photo_dir)
                 collection_name = relative_parent.parts[0]
                 thumb_rel_path = f"thumbnails/{collection_name}/{file_path.name}"
                 thumb_file = photo_dir / "thumbnails" / collection_name / file_path.name
            
            # Generate Thumbnail & Extract Metadata
            meta = generate_thumbnail(file_path, thumb_file)
            
            # Date Taken Source:
            # 1. First choice: EXIF Date from extract_metadata (parsed from tags)
            # 2. Second choice: get_date_taken (regex scan of header - fallback)
            # 3. Third choice: blank string
            
            date_final = meta.get('date', '')
            if not date_final or date_final == 'None':
                # Try the regex/mtime fallback
                date_final = get_date_taken(file_path)
            
            # Normalize date format if it contains 0000 etc
            if date_final and date_final.startswith('0000'):
                 date_final = get_date_taken(file_path)

            photo_data = {
                'filename': rel_path,
                'thumbnail': thumb_rel_path,
                'date': date_final,
                'exif': meta
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
    data['home'].sort(key=lambda x: str(x['date']), reverse=True)
    
    for name in data['collections']:
        data['collections'][name].sort(key=lambda x: str(x['date']), reverse=True)
    
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