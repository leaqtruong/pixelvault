/* Parse the Steam Store's system-requirement HTML into structured data.
   The API returns markup like
     <h2 class="bb_tag"><strong>REQUIRED</strong></h2>
     <ul class="bb_ul"><li><strong>OS:</strong> Windows 10</li>...</ul>
   and the catalog was previously filling in an invented "GTX 1060 / 8 GB"
   for every title. These helpers turn the real text into clean label/value
   pairs plus one readable summary line per platform. */

const ENTITIES = {
  '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#039;': "'",
  '&nbsp;': ' ', '&reg;': '®', '&trade;': '™', '&copy;': '©',
};

function decode(s) {
  return String(s)
    .replace(/&(?:amp|lt|gt|quot|#039|nbsp|reg|trade|copy);/g, (m) => ENTITIES[m] || m)
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&[a-z]+;/gi, '');
}

/** Split requirement HTML into trimmed spec lines. */
function reqLines(html) {
  if (!html) return [];
  const items = String(html).match(/<li[^>]*>[\s\S]*?<\/li>/gi);
  if (!items) return [];
  const out = [];
  for (const li of items) {
    const text = decode(li.replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]*>/g, ' '))
      .replace(/\s+/g, ' ')
      .replace(/^(REQUIRED|RECOMMENDED|MINIMUM|MAXIMUM)\s*/i, '')
      .trim();
    if (text && !/^(LINUX|MAC|PC)$/i.test(text)) out.push(text);
  }
  return out;
}

const FIELDS = [
  [/\b(os|operating system)\s*:/i, 'os'],
  [/\b(processor|cpu)\s*:/i, 'cpu'],
  [/\b(memory|ram)\s*:/i, 'ram'],
  [/\b(video card|graphics|gpu)\s*:/i, 'gpu'],
  // "Hard Disk Space" must be tried before "Disk Space", otherwise the regex
  // latches onto the second word and leaves a dangling "Hard " in the summary.
  [/\b(hard ?disk ?space|storage|disk ?space)\s*:/i, 'storage'],
  [/\b(directx|direct3d|vulkan|opengl)\s*:/i, 'api'],
  [/\bsound card\s*:/i, 'sound'],
];

/** Pull {os,cpu,ram,gpu,storage,api,sound} out of parsed lines. */
function reqFields(lines) {
  const f = {};
  for (const line of lines) {
    for (const [re, key] of FIELDS) {
      if (re.test(line) && !f[key]) f[key] = line.replace(re, '').trim() || line;
    }
  }
  return f;
}

/** One compact line: "Windows 10 · i5-750 · 8 GB · 1 GB VRAM · 85 GB". */
function summarise(fields, fallback = '') {
  const parts = [fields.os, fields.cpu, fields.ram, fields.gpu, fields.api, fields.storage]
    .filter(Boolean)
    .map((s) => String(s).replace(/\s*\(.*?\)\s*/g, ' ').trim());
  const uniq = [...new Set(parts.filter(Boolean))].slice(0, 5);
  return uniq.length ? uniq.join(' · ') : fallback;
}

module.exports = { reqLines, reqFields, summarise, decode };