"""Collect every Russian UI string that needs a Kazakh translation: keys of the English dictionary + static strings used with L('ru','en') in more.js."""
import json, re
s = open('js/i18n-en.js', encoding='utf-8').read()
keys = re.findall(r'^\s*("(?:[^"\\]|\\.)*")\s*:', s, re.M)
keys = [json.loads(k) for k in keys]
m = open('js/more.js', encoding='utf-8').read()
for a, b in re.findall(r"L\('((?:[^'\\]|\\.)*)',\s*'((?:[^'\\]|\\.)*)'\)", m):
    a = a.replace("\\'", "'")
    if re.search(r'[А-Яа-я]', a) and a not in keys: keys.append(a)
json.dump(keys, open('scripts/_keys.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=0)
print(len(keys))
for i in range(0, len(keys), 1):
    pass
