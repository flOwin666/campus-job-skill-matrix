// extract-data.js (ES Module)
// 从 v6-backup.html 提取 jobsData 并保存为 JSON
import { readFileSync, writeFileSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const htmlPath = join(__dirname, '..', 'v6-backup.html');
const outPath = join(__dirname, 'src', 'jobsData.json');

console.log('Reading:', htmlPath);
const html = readFileSync(htmlPath, 'utf8');

// 找到 jobsData = 的起始位置
const startIdx = html.indexOf('jobsData = ');
if (startIdx === -1) {
    console.error('jobsData not found in HTML');
    process.exit(1);
}

// 从 = 后面开始找匹配的 JSON 对象
let jsonStart = html.indexOf('{', startIdx);
if (jsonStart === -1) {
    console.error('JSON object start not found');
    process.exit(1);
}

// 智能匹配大括号（处理嵌套）
let braceCount = 0;
let inString = false;
let escapeNext = false;
let jsonEnd = -1;

for (let i = jsonStart; i < html.length; i++) {
    const ch = html[i];
    
    if (escapeNext) {
        escapeNext = false;
        continue;
    }
    
    if (ch === '\\' && inString) {
        escapeNext = true;
        continue;
    }
    
    if (ch === '"' && !escapeNext) {
        inString = !inString;
        continue;
    }
    
    if (!inString) {
        if (ch === '{') braceCount++;
        if (ch === '}') {
            braceCount--;
            if (braceCount === 0) {
                jsonEnd = i;
                break;
            }
        }
    }
}

if (jsonEnd === -1) {
    console.error('Could not find matching closing brace');
    process.exit(1);
}

const jsonStr = html.substring(jsonStart, jsonEnd + 1);
console.log('Extracted JSON length:', jsonStr.length);

// 验证是合法 JSON
try {
    const parsed = JSON.parse(jsonStr);
    writeFileSync(outPath, JSON.stringify(parsed, null, 2), 'utf8');
    console.log('Successfully wrote to:', outPath);
    console.log('File size:', statSync(outPath).size, 'bytes');
    console.log('Jobs count:', parsed.results?.length || 0);
} catch (e) {
    console.error('JSON parse error:', e.message);
    console.error('First 300 chars:', jsonStr.substring(0, 300));
    console.error('Last 100 chars:', jsonStr.substring(jsonStr.length - 100));
}
