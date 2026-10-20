import type { State } from '@/sync/types';
import { messagesBefore } from '@/sync/message-ordering';
import type { RuntimeAPIs } from '@/lib/api/types';

export function transcriptPredictionEnabled(platform: RuntimeAPIs['runtime']['platform'], mobile: boolean, capacitor: boolean): boolean {
    return !mobile && !capacitor && (platform === 'web' || platform === 'desktop');
}

/** Recent visible prose, oldest first. Reading this snapshot never fetches history. */
export function transcriptCorpus(state: Pick<State, 'session' | 'message' | 'part'>, sessionID: string): string[] {
    const marker = state.session.find((session) => session.id === sessionID)?.revert?.messageID;
    const messages = messagesBefore(state.message[sessionID] ?? [], marker);
    const result: string[] = [];
    let remaining = 65_536;
    for (let i = messages.length - 1; i >= Math.max(0, messages.length - 80) && remaining > 0; i--) {
        const message = messages[i];
        if (message.role !== 'user' && message.role !== 'assistant') continue;
        if (message.role === 'assistant' && !message.time.completed) continue;
        const parts = state.part[message.id] ?? [];
        for (let j = parts.length - 1; j >= 0 && remaining > 0; j--) {
            const part = parts[j];
            if (part.type !== 'text' || part.metadata?.synthetic === true || part.metadata?.ignored === true) continue;
            const text = part.text.slice(-remaining);
            result.push(text);
            remaining -= text.length;
        }
    }
    return result.reverse();
}

function words(text: string) {
    return [...text.matchAll(/[\p{L}\p{N}_./:@$-]+/gu)];
}

// English-only phrase hints. Other languages still get the word/punctuation cap.
const phraseBoundaries = new Set([
    'against', 'at', 'by', 'for', 'from', 'in', 'into', 'of', 'on', 'onto', 'over',
    'through', 'to', 'under', 'with', 'without', 'within', 'between', 'during',
    'after', 'before', 'and', 'or', 'but', 'because', 'if', 'when', 'while',
    'that', 'which', 'unless', 'until', 'although',
]);
const articles = new Set(['a', 'an', 'the']);

function phraseEnd(line: string, tokens: ReturnType<typeof words>, index: number, start: number) {
    let last = index;
    while (last < Math.min(index + 2, tokens.length - 1)) {
        const current = tokens[last];
        const next = tokens[last + 1];
        if (/[.!?:]$/.test(current[0])
            || !/^[ \t]+$/.test(line.slice(current.index + current[0].length, next.index))
            || !/[\p{L}\p{N}_]/u.test(next[0])
            || phraseBoundaries.has(next[0].toLowerCase())
            || next.index + next[0].length - start > 72) break;
        last++;
    }
    // A hard word/character cap can otherwise leave "tests the" at the end.
    while (last > index && articles.has(tokens[last][0].toLowerCase())) last--;
    return tokens[last];
}

/** Return only the suffix to insert; every character comes from one observed line. */
export function predictTranscript(corpus: readonly string[], draft: string): string {
    const tail = draft.slice(-240);
    const typed = words(tail);
    const last = typed.at(-1);
    if (!last || !/^[ \t]*$/.test(tail.slice(last.index + last[0].length))) return '';
    const atBoundary = last.index + last[0].length < tail.length;
    const prefix = atBoundary ? '' : last[0];
    const context = (atBoundary ? typed : typed.slice(0, -1)).slice(-3).map((word) => word[0].toLowerCase());
    if (context.length === 0 && prefix.length < 3) return '';
    if (atBoundary && context.length < 2) return '';

    let best = '';
    let bestMatch = -1;
    // Oldest first: a more recent equal-context match replaces the older one.
    for (const text of corpus) {
        for (const line of text.split(/\r?\n/)) {
            const tokens = words(line);
            for (let i = 0; i < tokens.length; i++) {
                const token = tokens[i];
                if (!token[0].toLowerCase().startsWith(prefix.toLowerCase())) continue;
                let matched = 0;
                while (matched < context.length && i > matched
                    && tokens[i - matched - 1][0].toLowerCase() === context[context.length - matched - 1]) matched++;
                if (context.length > 0 && matched === 0) continue;
                if (matched < bestMatch) continue;
                const start = token.index + prefix.length;
                const endToken = phraseEnd(line, tokens, i, start);
                const end = endToken.index + endToken[0].length;
                const suffix = line.slice(start, end);
                if (suffix.length > 72) continue;
                if (suffix.trim().length < 2) continue;
                const trailingSpace = suffix.length < 72 && line[end] === ' ' && /^[\p{L}\p{N}]+$/u.test(endToken[0]);
                best = suffix + (trailingSpace ? ' ' : '');
                bestMatch = matched;
            }
        }
    }
    return best;
}
