import os
import glob

files = glob.glob("src/app/(app)/**/page.tsx", recursive=True)

for file in files:
    with open(file, 'r') as f:
        lines = f.readlines()
    if len(lines) >= 2 and "'use client';" in lines[1]:
        lines[1], lines[0] = lines[0], lines[1]
        with open(file, 'w') as f:
            f.writelines(lines)
