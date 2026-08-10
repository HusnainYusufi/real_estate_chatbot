/** Incremental parser for Server-Sent Event frames. */
export class SseFrameParser {
  private buffer = '';

  push(text: string): { event: string; data: unknown }[] {
    this.buffer += text;
    const frames: { event: string; data: unknown }[] = [];
    let idx: number;
    while ((idx = this.buffer.indexOf('\n\n')) !== -1) {
      const raw = this.buffer.slice(0, idx);
      this.buffer = this.buffer.slice(idx + 2);
      let event = 'message';
      let data = '';
      for (const line of raw.split('\n')) {
        if (line.startsWith('event: ')) event = line.slice(7).trim();
        else if (line.startsWith('data: ')) data += line.slice(6);
      }
      if (!data) continue;
      try {
        frames.push({ event, data: JSON.parse(data) });
      } catch {
        // skip malformed frame
      }
    }
    return frames;
  }
}

/** Extract renderable text from raw Anthropic message content. */
export function extractDisplayText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .filter(
      (b): b is { type: string; text: string } =>
        typeof b === 'object' && b !== null && (b as { type?: string }).type === 'text',
    )
    .map((b) => b.text)
    .join('\n')
    .trim();
}
