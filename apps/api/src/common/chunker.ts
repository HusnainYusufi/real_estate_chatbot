export interface Chunk {
  heading: string;
  content: string;
  position: number;
}

/**
 * Split a markdown/plain-text document into retrieval chunks: one chunk per
 * heading section, oversized sections split on paragraph boundaries.
 */
export function chunkDocument(text: string, maxChars = 1800): Chunk[] {
  const lines = text.split('\n');
  const sections: { heading: string; body: string[] }[] = [];
  let current = { heading: '', body: [] as string[] };

  for (const line of lines) {
    const match = /^#{1,4}\s+(.*)/.exec(line);
    if (match) {
      if (current.body.join('').trim() || current.heading) sections.push(current);
      current = { heading: match[1].trim(), body: [] };
    } else {
      current.body.push(line);
    }
  }
  if (current.body.join('').trim() || current.heading) sections.push(current);

  const chunks: Chunk[] = [];
  const push = (heading: string, content: string) =>
    chunks.push({ heading, content, position: chunks.length });

  for (const section of sections) {
    const body = section.body.join('\n').trim();
    if (!body) continue;
    if (body.length <= maxChars) {
      push(section.heading, body);
      continue;
    }
    let buffer = '';
    for (const para of body.split(/\n\s*\n/)) {
      if (buffer && buffer.length + para.length + 2 > maxChars) {
        push(section.heading, buffer.trim());
        buffer = '';
      }
      buffer += (buffer ? '\n\n' : '') + para;
    }
    if (buffer.trim()) push(section.heading, buffer.trim());
  }
  return chunks;
}
