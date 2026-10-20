import { describe, expect, test } from 'bun:test';
import type { Message, Part, Session } from '@/lib/opencode/model';
import type { State } from '@/sync/types';
import { predictTranscript, transcriptCorpus, transcriptPredictionEnabled } from './transcript';

test('normal web and Electron builds enable completion by default on desktop-sized composers', () => {
    expect(transcriptPredictionEnabled('web', false, false)).toBe(true);
    expect(transcriptPredictionEnabled('desktop', false, false)).toBe(true);
});

test('VS Code, hosted mobile and Capacitor remain excluded regardless of viewport', () => {
    expect(transcriptPredictionEnabled('vscode', false, false)).toBe(false);
    for (const platform of ['web', 'desktop', 'vscode'] as const) {
        expect(transcriptPredictionEnabled(platform, true, false)).toBe(false);
        expect(transcriptPredictionEnabled(platform, false, true)).toBe(false);
        expect(transcriptPredictionEnabled(platform, true, true)).toBe(false);
    }
});

function message(id: string, role: 'user' | 'assistant'): Message {
    const common = { id, sessionID: 's', time: { created: 1, completed: 2 } };
    return role === 'user' ? { ...common, role } : { ...common, role, agent: 'build', providerID: 'test', modelID: 'test' };
}

function part(messageID: string, text: string): Part {
    return { id: `p-${messageID}`, sessionID: 's', messageID, type: 'text', text };
}

function state(messages: Message[], parts: Part[], session: Session[] = []): Pick<State, 'message' | 'part' | 'session'> {
    const byMessage: State['part'] = {};
    for (const value of parts) (byMessage[value.messageID] ??= []).push(value);
    return { session, message: { s: messages }, part: byMessage };
}

describe('transcript corpus', () => {
    test('includes prose from both roles, in transcript order', () => {
        expect(transcriptCorpus(state([message('u', 'user'), message('a', 'assistant')], [part('u', 'User wording'), part('a', 'Assistant wording')]), 's'))
            .toEqual(['User wording', 'Assistant wording']);
    });

    test('excludes reasoning, synthetic records, ignored metadata and unfinished replies', () => {
        const synthetic: Message = { id: 'x', role: 'synthetic', sessionID: 's', time: { created: 1 }, text: 'hidden' };
        const streaming: Message = { ...message('a', 'assistant'), role: 'assistant', agent: 'build', providerID: 'test', modelID: 'test', time: { created: 1 } };
        const ignored: Part = { ...part('u', 'ignored'), type: 'text', text: 'ignored', metadata: { ignored: true } };
        const reasoning: Part = { id: 'r', sessionID: 's', messageID: 'u', type: 'reasoning', text: 'private', time: { start: 1 } };
        expect(transcriptCorpus(state([synthetic, streaming, message('u', 'user')], [part('x', 'hidden'), part('a', 'streaming'), ignored, reasoning]), 's')).toEqual([]);
    });

    test('does not read another session', () => {
        expect(transcriptCorpus(state([message('u', 'user')], [part('u', 'source')]), 'other')).toEqual([]);
    });

    test('excludes the reverted range by position rather than sortable IDs', () => {
        const session: Session = {
            id: 's', projectID: 'p', directory: '/project', title: 'test', cost: 0,
            tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
            time: { created: 1, updated: 1 }, revert: { messageID: 'a' },
        };
        expect(transcriptCorpus(state([message('z', 'user'), message('a', 'assistant')], [part('z', 'kept'), part('a', 'reverted')], [session]), 's'))
            .toEqual(['kept']);
    });

    test('bounds recent records and total characters', () => {
        const messages = Array.from({ length: 100 }, (_, i) => message(`u${i}`, 'user'));
        const corpus = transcriptCorpus(state(messages, messages.map((value, i) => part(value.id, `text ${i}`))), 's');
        expect(corpus).toHaveLength(80);
        expect(corpus[0]).toBe('text 20');
        expect(transcriptCorpus(state([message('u', 'user')], [part('u', 'x'.repeat(100_000))]), 's').join('').length).toBe(65_536);
    });
});

describe('local phrase matching', () => {
    test('finishes a partial word and a short phrase', () => {
        expect(predictTranscript(['Run the integration tests against the development server.'], 'Run the integ'))
            .toBe('ration tests ');
    });

    test('uses previous words at a word boundary', () => {
        expect(predictTranscript(['Run the integration tests'], 'Run the ')).toBe('integration tests');
    });

    test('prefers longer context over a newer unrelated phrase', () => {
        expect(predictTranscript(['Run the integration tests', 'Skip the integration setup'], 'Run the integ')).toBe('ration tests');
    });

    test('uses recency to break equal context ties without weighting speaker verbosity', () => {
        expect(predictTranscript(['Run the old tests', 'Run the new checks'], 'Run the ')).toBe('new checks');
    });

    test('can complete a project term without prior words', () => {
        expect(predictTranscript(['openchamber-stage'], 'opench')).toBe('amber-stage');
    });

    test('stays quiet with weak context or novel wording', () => {
        for (const input of ['', 'a', 'th', 'the ', 'Something brand new', 'Run the.']) {
            expect(predictTranscript(['Run the integration tests'], input)).toBe('');
        }
    });

    test('never joins separate lines or separate messages into one continuation', () => {
        expect(predictTranscript(['Run the\nintegration tests'], 'Run the ')).toBe('');
        expect(predictTranscript(['Run the', 'integration tests'], 'Run the ')).toBe('');
    });

    test('preserves observed spelling, punctuation and Unicode', () => {
        expect(predictTranscript(['Check résumé-parser.ts with Bun'], 'check rés')).toBe('umé-parser.ts');
    });

    test('caps both partial-word and word-boundary suggestions at three words', () => {
        const corpus = ['Run the comprehensive integration test suite locally'];
        expect(predictTranscript(corpus, 'Run the comp')).toBe('rehensive integration test ');
        expect(predictTranscript(corpus, 'Run the ')).toBe('comprehensive integration test ');
    });

    test('stops before common prepositions and clause boundaries', () => {
        for (const boundary of ['against', 'with', 'in', 'for', 'and', 'because', 'which', 'WHEN']) {
            expect(predictTranscript([`Run the integration tests ${boundary} the server`], 'Run the integ')).toBe('ration tests ');
        }
        expect(predictTranscript(['Run the tests against the server tomorrow'], 'Run the tests ag'))
            .toBe('ainst the server ');
    });

    test('does not cross punctuation even when more words fit', () => {
        for (const separator of [', ', '; ']) {
            expect(predictTranscript([`Run the integration tests${separator}inspect results`], 'Run the integ')).toBe('ration tests');
        }
        for (const separator of [' (', ' / ', ' - ', ' \u2014 ']) {
            expect(predictTranscript([`Run the integration tests${separator}inspect results`], 'Run the integ')).toBe('ration tests ');
        }
        expect(predictTranscript(['Run the integration tests. Inspect results'], 'Run the integ')).toBe('ration tests.');
        expect(predictTranscript(['Run the integration tests! Inspect results'], 'Run the integ')).toBe('ration tests');
    });

    test('keeps compound identifiers together and does not apply English hints inside words', () => {
        expect(predictTranscript(['Check résumé-parser.ts integration-test results now'], 'Check rés'))
            .toBe('umé-parser.ts integration-test results ');
        expect(predictTranscript(['Run the within-range checks locally'], 'Run the ')).toBe('within-range checks locally');
        expect(predictTranscript(['Check the serveur local disponible maintenant'], 'Check the ')).toBe('serveur local disponible ');
    });

    test('backs off a trailing article at the hard cap', () => {
        expect(predictTranscript(['Run the tests using the server'], 'Run the ')).toBe('tests using ');
        expect(predictTranscript(['Run the integration tests a second time'], 'Run the integ')).toBe('ration tests ');
    });

    test('includes exactly one observed space after a prose phrase', () => {
        for (const spacing of [' ', '   ']) {
            expect(predictTranscript([`Run the integration tests${spacing}against the server`], 'Run the integ')).toBe('ration tests ');
        }
        expect(predictTranscript(['Run the integration tests against the server'], 'Run the integration tests '))
            .toBe('against the server');
    });

    test('never invents spacing at punctuation, line ends, tabs or identifier boundaries', () => {
        for (const ending of ['', '\nagainst the server', '\tagainst the server', ', against the server', ') against the server']) {
            expect(predictTranscript([`Run the integration tests${ending}`], 'Run the integ')).toBe('ration tests');
        }
        expect(predictTranscript(['Run the integration tests. Against the server'], 'Run the integ')).toBe('ration tests.');
        for (const term of ['source_file.ts', 'source-file', '/source/path', 'localhost:3038']) {
            expect(predictTranscript([`Check the ${term} with Bun`], `Check the ${term.slice(0, 3)}`)).toBe(term.slice(3));
        }
    });

    test('caps the continuation without splitting a word', () => {
        const output = predictTranscript(['Run the ' + 'long-word '.repeat(20)], 'Run the ');
        expect(output.length).toBeLessThanOrEqual(72);
        expect(output.endsWith('long-word')).toBe(true);
        expect(output).toBe('long-word long-word long-word');
        expect(predictTranscript(['Run the ' + 'x'.repeat(70) + ' more words'], 'Run the ')).toBe('x'.repeat(70) + ' ');
        expect(predictTranscript(['Run the ' + 'x'.repeat(72) + ' more words'], 'Run the ')).toBe('x'.repeat(72));
        expect(predictTranscript(['Run the ' + 'x'.repeat(73)], 'Run the ')).toBe('');
    });
});
