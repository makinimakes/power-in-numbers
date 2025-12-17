import os
import re

def read_file(path):
    with open(path, 'r') as f:
        return f.read()

def main():
    base_dir = '/Users/Jumatatu/.gemini/antigravity/scratch/power_in_numbers'
    js_dir = os.path.join(base_dir, 'js')
    
    # Use project.html as template (cleaner)
    html_content = read_file(os.path.join(base_dir, 'project.html'))
    
    # Remove existing script tags (standard ones)
    clean_html = re.sub(r'<script src="js/.*?".*?></script>', '', html_content)
    
    # Also remove any trailing <script> blocks we might have
    clean_html = re.sub(r'<script>\s+console\.log\("PROJECT\.JS INLINE LOADED"\)[\s\S]*?</script>', '', clean_html)
    
    if '</body>' in clean_html:
        base_html = clean_html.split('</body>')[0] + '</body>'
    else:
        base_html = clean_html

    # Files to inline in order
    js_files = [
        'supabase_client.js',
        'utils.js',
        'budget_engine.js',
        'store.js',
        'project.js' # Using fixed project.js
    ]
    
    injected_scripts = ""
    for js_file in js_files:
        path = os.path.join(js_dir, js_file)
        if os.path.exists(path):
            content = read_file(path)
            # Wrap in try-catch block for runtime errors?
            # Syntax errors won't be caught by try-catch inside the same block easily.
            # But separate script tags allow window.onerror to catch them!
            injected_scripts += f"\n<!-- {js_file} -->\n<script>\n{content}\n</script>\n"
        else:
            print(f"WARNING: {js_file} not found!")
            
    # Inject Debug Console
    debug_console_html = """
    <!-- DEBUG CONSOLE -->
    <div id="debug-console" style="background:#000; color:#0f0; padding:10px; margin:10px; border:2px solid red; max-height:200px; overflow:auto; font-family:monospace; font-size:12px; z-index:9999; position:fixed; top:0; left:0; right:0;">
        <strong>DEBUG LOG (Please provide screenshot or text if stuck):</strong><br>
    </div>
    <div style="height: 220px;"></div> <!-- Spacer -->
    <script>
        (function() {
            var oldLog = console.log;
            var oldErr = console.error;
            var debugBox = document.getElementById('debug-console');
            
            function print(type, msg) {
                if (!debugBox) return;
                var d = document.createElement('div');
                d.textContent = '[' + type + '] ' + msg;
                if (type === 'ERROR') d.style.color = 'red';
                debugBox.appendChild(d);
            }

            console.log = function() {
                var msg = Array.from(arguments).join(' ');
                oldLog.apply(console, arguments);
                print('LOG', msg);
            };

            console.error = function() {
                var msg = Array.from(arguments).join(' ');
                oldErr.apply(console, arguments);
                print('ERROR', msg);
            };

            window.onerror = function(msg, url, lineNo, columnNo, error) {
                print('ERROR', msg + ' at line ' + lineNo + ':' + columnNo);
                return false;
            };
            
            console.log("Debug Console Initialized.");
        })();
    </script>
    """
    
    # Insert after <body>
    base_html = base_html.replace('<body>', '<body>' + debug_console_html)
    
    final_html = base_html + injected_scripts + '\n</html>'
    
    out_path = os.path.join(base_dir, 'project_debug_split.html')
    with open(out_path, 'w') as f:
        f.write(final_html)
        
    print(f"Created {out_path}")

if __name__ == "__main__":
    main()
