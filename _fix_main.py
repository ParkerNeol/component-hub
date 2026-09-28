import sys
import os

filepath = '/d/Desktop/component-hub/main.js'
backup_path = '/d/Desktop/component-hub/main.js.backup'

with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()

# Create backup first
if os.path.exists(backup_path):
    os.remove(backup_path)

with open(backup_path, 'w', encoding='utf-8') as f:
    f.write(content)
print(f"Backup created: {backup_path}")

# ---- Edit 1: Fix getComponentValueText (root cause fix) ----
old1 = """                    return parsed.filter(p => p.value).map(p => p.value + (p.unit || '')).join(' | ');
                }
            } catch (e) {}
            return component.value;"""

new1 = """                    return parsed.filter(p => p.value).map(p => p.value + (p.unit || '')).join(' | ');
                }
                // 修复：当所有参数值均空时，返回空状态而非原始 JSON 字符串
                return '-';
            } catch (e) {}
            return component.value;"""

print("=== Check old1 ===")
print("old1 in content:", old1 in content)

if old1 in content:
    content = content.replace(old1, new1, 1)
    print("Edit 1: applied successfully")
else:
    print("Edit 1: FAILED - old1 not found")
    idx = content.find("return parsed.filter(p => p.value).map(p => p.value + (p.unit || '')).join")
    if idx >= 0:
        print("Context around match:")
        print(repr(content[idx-80:idx+300]))
    sys.exit(1)

# ---- Edit 2: Wrap getComponentValueText result with escapeHtml ----
old2 = '                    <span class="文本-white">${this.getComponentValueText(component)}</span>`'
new2 = '                    <span class="文本-white">${this.escapeHtml(this.getComponentValueText(component))}</span>`'

print("\n=== Check old2 ===")
print("old2 in content:", old2 in content)

if old2 in content:
    content = content.replace(old2, new2, 1)
    print("Edit 2: applied successfully")
else:
    print("Edit 2: FAILED - old2 not found")
    idx2 = content.find('getComponentValueText(component)')
    if idx2 >= 0:
        print("Context around match:")
        print(repr(content[idx2-50:idx2+200]))
    sys.exit(1)

with open(filepath, 'w', encoding='utf-8') as f:
    f.write(content)

print("\nFile written successfully")
