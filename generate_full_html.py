import os
import re

def read_file(path):
    with open(path, 'r') as f:
        return f.read()

def main():
    base_dir = '/Users/Jumatatu/.gemini/antigravity/scratch/power_in_numbers'
    js_dir = os.path.join(base_dir, 'js')
    
    # Read project.html
    html_content = read_file(os.path.join(base_dir, 'project.html'))
    
    # Files to inline in order
    js_files = [
        'supabase_client.js',
        'utils.js',
        'budget_engine.js',
        'store.js',
        'project_repaired.js'
    ]
    
    full_js = ""
    for js_file in js_files:
        path = os.path.join(js_dir, js_file)
        if os.path.exists(path):
            print(f"Reading {js_file}...")
            content = read_file(path)
            full_js += f"\n// --- {js_file} ---\n{content}\n"
        else:
            print(f"WARNING: {js_file} not found!")

    # Regex to find the block of scripts at the end of body
    # We look for the block containing supabase_client and replace it all
    
    # We will replace everything from the first <script src="js/project_simple.js"> (current top) 
    # down to the last script tag before </body>
    
    # Updated pattern to match the current project.html structure
    # It has project_simple.js at top now.
    
    pattern = r'<script src="js/project_simple.js\?v=TEST_TOP"></script>.*?<script src="js/store.js\?v=6.1"></script>'
    
    # Actually, we have an inline script after store.js in project.html (the old inline one)
    # Let's just find the closing </body> and insert before it, removing old scripts if possible.
    # But removing is cleaner.
    
    # Let's replace the Specific Block we know exists.
    # <script src="js/project_simple.js?v=TEST_TOP"></script>
    # ...
    # <script src="js/store.js?v=6.1"></script>
    # <script>
    # ... console.log("PROJECT.JS INLINE LOADED"); ...
    
    # Just replace the whole tail end scripts.
    start_marker = '<script src="js/project_simple.js?v=TEST_TOP"></script>'
    
    if start_marker not in html_content:
        print("Could not find start marker, checking for original...")
        start_marker = '<script src="js/project_simple.js?v=TEST_1"></script>'
    
    if start_marker not in html_content:
        print("CRITICAL: Could not find script block to replace.")
        # Fallback: Just append to body? No, we want to remove the broken refs.
        # Let's try to find "js/utils.js"
        start_marker = '<script src="js/utils.js?v=6.1"></script>'
        
    s_idx = html_content.find(start_marker)
    if s_idx == -1:
         # Try finding based on regex
         pass 

    # Robust replacement: Remove all <script src="js/..."> tags
    clean_html = re.sub(r'<script src="js/.*?".*?></script>', '', html_content)
    
    # Remove the inline script block that failed (the console.log("PROJECT.JS INLINE LOADED") one)
    # It starts with <script> and contains PROJECT.JS INLINE LOADED
    clean_html = re.sub(r'<script>\s+console\.log\("PROJECT\.JS INLINE LOADED"\);[\s\S]*?</script>', '', clean_html)
    
    # Check if we have </body>
    if '</body>' in clean_html:
        final_html = clean_html.replace('</body>', f'<script>\n{full_js}\n</script>\n</body>')
    else:
        final_html = clean_html + f'<script>\n{full_js}\n</script>'
        
    out_path = os.path.join(base_dir, 'project_full.html')
    with open(out_path, 'w') as f:
        f.write(final_html)
        
    print(f"Successfully created {out_path} with {len(full_js)} bytes of JS.")

if __name__ == "__main__":
    main()
