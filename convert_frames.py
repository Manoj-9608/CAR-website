import os
import re
import time
from PIL import Image
from concurrent.futures import ProcessPoolExecutor

def natural_key(text):
    return [int(c) if c.isdigit() else c.lower() for c in re.split(r'(\d+)', text)]

def process_single_frame(task):
    src_path, out_desktop_path, out_mobile_path = task
    
    with Image.open(src_path) as im:
        if im.mode != 'RGB':
            im = im.convert('RGB')
        
        orig_w, orig_h = im.size
        
        # Desktop version (1600px wide)
        desk_w = 1600
        desk_h = int(round(orig_h * (desk_w / orig_w)))
        # mobile version (960px wide)
        mob_w = 960
        mob_h = int(round(orig_h * (mob_w / orig_w)))
        
        im_desk = im.resize((desk_w, desk_h), Image.Resampling.LANCZOS)
        im_desk.save(out_desktop_path, 'WEBP', quality=78, method=4)
        
        im_mob = im.resize((mob_w, mob_h), Image.Resampling.LANCZOS)
        im_mob.save(out_mobile_path, 'WEBP', quality=72, method=4)

def get_folder_size(path):
    total = 0
    count = 0
    for f in os.listdir(path):
        fp = os.path.join(path, f)
        if os.path.isfile(fp):
            total += os.path.getsize(fp)
            count += 1
    return count, total

def main():
    start_time = time.time()
    
    # Target directories
    dirs = [
        'assets/frames/hero',
        'assets/frames/hero-mobile',
        'assets/frames/dismantle',
        'assets/frames/dismantle-mobile',
        'assets/cars'
    ]
    for d in dirs:
        os.makedirs(d, exist_ok=True)
        
    # Gather Hero frames
    # Clip 1
    c1_files = sorted(os.listdir('CLIP 1 FRAMES'), key=natural_key)
    c1_paths = [os.path.join('CLIP 1 FRAMES', f) for f in c1_files if f.lower().endswith(('.jpg', '.jpeg', '.png'))]
    
    # Clip 2 (skip frame 1)
    c2_files = sorted(os.listdir('CLIP 2 FRAMES'), key=natural_key)
    c2_paths = [os.path.join('CLIP 2 FRAMES', f) for f in c2_files if f.lower().endswith(('.jpg', '.jpeg', '.png'))]
    c2_paths = c2_paths[1:] # skip 1st frame to eliminate stutter
    
    # Clip 3 (skip frame 1)
    c3_files = sorted(os.listdir('CLIP 3 FRAMES'), key=natural_key)
    c3_paths = [os.path.join('CLIP 3 FRAMES', f) for f in c3_files if f.lower().endswith(('.jpg', '.jpeg', '.png'))]
    c3_paths = c3_paths[1:] # skip 1st frame to eliminate stutter
    
    hero_src = c1_paths + c2_paths + c3_paths
    print(f"Total hero source frames: {len(hero_src)} (Clip 1: {len(c1_paths)}, Clip 2: {len(c2_paths)}, Clip 3: {len(c3_paths)})")
    
    # Gather Dismantle frames
    d_files = sorted(os.listdir('E CLIP FRAMES'), key=natural_key)
    dismantle_src = [os.path.join('E CLIP FRAMES', f) for f in d_files if f.lower().endswith(('.jpg', '.jpeg', '.png'))]
    print(f"Total dismantle source frames: {len(dismantle_src)}")
    
    tasks = []
    
    # Hero tasks
    for idx, src in enumerate(hero_src, 1):
        desk_out = f'assets/frames/hero/frame_{idx:04d}.webp'
        mob_out = f'assets/frames/hero-mobile/frame_{idx:04d}.webp'
        tasks.append((src, desk_out, mob_out))
        
    # Dismantle tasks
    for idx, src in enumerate(dismantle_src, 1):
        desk_out = f'assets/frames/dismantle/frame_{idx:04d}.webp'
        mob_out = f'assets/frames/dismantle-mobile/frame_{idx:04d}.webp'
        tasks.append((src, desk_out, mob_out))
        
    print(f"Total frame processing tasks: {len(tasks)}")
    
    # Run in parallel using ProcessPoolExecutor
    workers = os.cpu_count() or 4
    print(f"Processing with {workers} parallel workers...")
    with ProcessPoolExecutor(max_workers=workers) as executor:
        list(executor.map(process_single_frame, tasks, chunksize=10))
        
    # Create placeholders in assets/cars if they don't exist yet
    first_dismantle = 'assets/frames/dismantle/frame_0001.webp'
    cars = ['gt-e.webp', 's.webp', 'x.webp', 'r.webp', 'one.webp']
    if os.path.exists(first_dismantle):
        with open(first_dismantle, 'rb') as f_in:
            data = f_in.read()
        for car in cars:
            car_path = os.path.join('assets/cars', car)
            if not os.path.exists(car_path):
                with open(car_path, 'wb') as f_out:
                    f_out.write(data)
                print(f"Created placeholder: {car_path}")

    elapsed = time.time() - start_time
    print(f"All processing completed in {elapsed:.2f} seconds.")
    
    # Print report
    print("\n--- OUTPUT FOLDER SUMMARY ---")
    for d in ['assets/frames/hero', 'assets/frames/hero-mobile', 'assets/frames/dismantle', 'assets/frames/dismantle-mobile', 'assets/cars']:
        cnt, sz = get_folder_size(d)
        mb = sz / (1024 * 1024)
        print(f"{d}: {cnt} files, {sz:,} bytes ({mb:.2f} MB)")

if __name__ == '__main__':
    main()
