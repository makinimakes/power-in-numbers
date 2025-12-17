import re

def check_syntax(file_path):
    with open(file_path, 'r') as f:
        content = f.read()

    errors = []
    
    # Check braces balance
    stack = []
    lines = content.split('\n')
    
    in_template_string = False
    in_single_quote = False
    in_double_quote = False
    
    for line_num, line in enumerate(lines, 1):
        # Naive state machine
        i = 0
        while i < len(line):
            char = line[i]
            
            # Handle escapes
            if char == '\\':
                i += 2
                continue
                
            # Handle Quotes
            if char == '`' and not in_single_quote and not in_double_quote:
                in_template_string = not in_template_string
            elif char == "'" and not in_template_string and not in_double_quote:
                in_single_quote = not in_single_quote
            elif char == '"' and not in_template_string and not in_single_quote:
                in_double_quote = not in_double_quote
            
            if not (in_template_string or in_single_quote or in_double_quote):
                # Check Comments
                if char == '/' and i+1 < len(line) and line[i+1] == '/':
                    break # Line comment
                
                # Braces
                if char in '{[(':
                    stack.append((char, line_num))
                elif char in '}])':
                    if not stack:
                        errors.append(f"Line {line_num}: Unexpected closing '{char}'")
                    else:
                        last, last_line = stack.pop()
                        expected = {'{':'}', '[':']', '(':')'}[last]
                        if char != expected:
                            errors.append(f"Line {line_num}: Mismatched '{char}', expected '{expected}' (opened line {last_line})")
            
            i += 1
            
        if in_single_quote or in_double_quote:
             # Multiline strings are not allowed for ' or " (usually)
             # But let's assume valid JS might have line continuations.
             # Checks for unclosed string at end of file strictly.
             pass

    if stack:
        for char, line_num in stack:
            errors.append(f"Line {line_num}: Unclosed '{char}'")
            
    if in_template_string:
        errors.append("Error: Unclosed template literal (backtick)")
        
    if not errors:
        print("Syntax seems OK (Balanced Braces/Quotes)")
    else:
        print("Syntax Errors Found:")
        for e in errors[:10]:
            print(e)

if __name__ == "__main__":
    check_syntax('js/project_repaired.js')
