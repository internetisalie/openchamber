import { afterAll, afterEach, describe, expect, test } from 'bun:test';
import { Window } from 'happy-dom';

const dom = new Window();
Object.assign(globalThis, {
    window: dom, document: dom.document, MutationObserver: dom.MutationObserver,
    Node: dom.Node, HTMLElement: dom.HTMLElement, CustomEvent: dom.CustomEvent, CompositionEvent: dom.CompositionEvent,
    getComputedStyle: dom.getComputedStyle.bind(dom),
});
const { EditorState, Compartment } = await import('@codemirror/state');
const { EditorView } = await import('@codemirror/view');
const { history, undo } = await import('@codemirror/commands');
const { transcriptPrediction, acceptTranscriptPrediction, dismissTranscriptPrediction } = await import('./extension');
const views: InstanceType<typeof EditorView>[] = [];
const pause = () => new Promise((resolve) => setTimeout(resolve, 190));

afterEach(() => {
    for (const view of views.splice(0)) view.destroy();
    document.body.replaceChildren();
});
afterAll(() => dom.happyDOM.close());

function editor(readCorpus = () => ['Run the integration tests']) {
    const compartment = new Compartment();
    const view = new EditorView({
        state: EditorState.create({ extensions: [history(), compartment.of(transcriptPrediction({ scope: 'a', readCorpus }))] }),
        parent: document.body,
    });
    views.push(view);
    view.focus();
    return { view, compartment };
}

function type(view: InstanceType<typeof EditorView>, text = 'Run the integ') {
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text }, selection: { anchor: text.length }, userEvent: 'input.type' });
}

describe('transcript ghost text lifecycle', () => {
    test('ghost is not in the document; explicit acceptance is one undoable edit', async () => {
        const { view } = editor();
        type(view);
        await pause();
        expect(view.state.doc.toString()).toBe('Run the integ');
        expect(view.dom.querySelector('.cm-transcript-prediction')?.textContent).toBe('ration tests');
        expect(acceptTranscriptPrediction(view)).toBe(true);
        expect(view.state.doc.toString()).toBe('Run the integration tests');
        expect(undo(view)).toBe(true);
        expect(view.state.doc.toString()).toBe('Run the integ');
    });

    test('Escape-style dismissal does not edit the prompt or reappear without typing', async () => {
        const { view } = editor();
        type(view);
        await pause();
        expect(dismissTranscriptPrediction(view)).toBe(true);
        await pause();
        expect(view.dom.querySelector('.cm-transcript-prediction')).toBeNull();
        expect(view.state.doc.toString()).toBe('Run the integ');
    });

    test('moving selection cancels pending and displayed predictions', async () => {
        const { view } = editor();
        type(view);
        view.dispatch({ selection: { anchor: 0 } });
        await pause();
        expect(acceptTranscriptPrediction(view)).toBe(false);
        type(view);
        await pause();
        view.dispatch({ selection: { anchor: 0, head: 2 } });
        expect(view.dom.querySelector('.cm-transcript-prediction')).toBeNull();
    });

    test('scope reconfiguration cancels a pending callback', async () => {
        const { view, compartment } = editor();
        type(view);
        view.dispatch({ effects: compartment.reconfigure(transcriptPrediction({ scope: 'b', readCorpus: () => ['Run the internet checks'] })) });
        await pause();
        expect(view.dom.querySelector('.cm-transcript-prediction')).toBeNull();
        expect(acceptTranscriptPrediction(view)).toBe(false);
    });

    test('revalidates transcript at acceptance after a revert or deletion', async () => {
        let corpus = ['Run the integration tests'];
        const { view } = editor(() => corpus);
        type(view);
        await pause();
        corpus = [];
        expect(acceptTranscriptPrediction(view)).toBe(true);
        expect(view.state.doc.toString()).toBe('Run the integ');
    });

    test('blur cancels prediction; external draft replacement does not trigger prediction', async () => {
        const { view } = editor();
        type(view);
        view.contentDOM.blur();
        await pause();
        expect(acceptTranscriptPrediction(view)).toBe(false);
        view.focus();
        view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: 'Run the inte' }, selection: { anchor: 12 } });
        await pause();
        expect(view.dom.querySelector('.cm-transcript-prediction')).toBeNull();
    });

    test('composition hides the ghost and prevents acceptance', async () => {
        const { view } = editor();
        type(view);
        await pause();
        view.contentDOM.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
        expect(view.dom.querySelector('.cm-transcript-prediction')).toBeNull();
        expect(acceptTranscriptPrediction(view)).toBe(false);
        type(view);
        await pause();
        expect(view.dom.querySelector('.cm-transcript-prediction')).toBeNull();
    });

    test('stops before transcript markup without creating elements', async () => {
        const { view } = editor(() => ['Run the integration <img src=x onerror=alert(1)>']);
        type(view);
        await pause();
        expect(view.dom.querySelector('.cm-transcript-prediction')?.textContent).toBe('ration ');
        expect(view.dom.querySelector('img[src="x"]') === null).toBe(true);
        expect(view.state.doc.toString()).toBe('Run the integ');
    });

    test('accepts the observed space and offers the next phrase only after the delay', async () => {
        let reads = 0;
        const { view } = editor(() => { reads++; return ['Run the integration tests against the server']; });
        type(view);
        await pause();
        expect(view.dom.querySelector('.cm-transcript-prediction')?.textContent).toBe('ration tests ');
        expect(acceptTranscriptPrediction(view)).toBe(true);
        expect(view.state.doc.toString()).toBe('Run the integration tests ');
        expect(view.dom.querySelector('.cm-transcript-prediction')).toBeNull();
        expect(reads).toBe(2);
        await new Promise((resolve) => setTimeout(resolve, 50));
        expect(view.dom.querySelector('.cm-transcript-prediction')).toBeNull();
        await pause();
        expect(view.dom.querySelector('.cm-transcript-prediction')?.textContent).toBe('against the server');
        await pause();
        expect(reads).toBe(3);
        expect(view.state.doc.toString()).toBe('Run the integration tests ');
        expect(acceptTranscriptPrediction(view)).toBe(true);
        expect(view.state.doc.toString()).toBe('Run the integration tests against the server');
        await pause();
        expect(view.dom.querySelector('.cm-transcript-prediction')).toBeNull();
        expect(undo(view)).toBe(true);
        expect(view.state.doc.toString()).toBe('Run the integration tests ');
        expect(undo(view)).toBe(true);
        expect(view.state.doc.toString()).toBe('Run the integ');
    });

    test('Escape cancels both a pending and a visible follow-up until typing resumes', async () => {
        const { view } = editor(() => ['Run the integration tests against the server']);
        for (const pending of [true, false]) {
            type(view);
            await pause();
            expect(acceptTranscriptPrediction(view)).toBe(true);
            if (!pending) await pause();
            expect(dismissTranscriptPrediction(view)).toBe(!pending);
            await pause();
            expect(view.dom.querySelector('.cm-transcript-prediction')).toBeNull();
            expect(view.state.doc.toString()).toBe('Run the integration tests ');
            type(view, 'Run the integration tests ag');
            await pause();
            expect(view.dom.querySelector('.cm-transcript-prediction')?.textContent).toBe('ainst the server');
        }
    });

    test('Undo cancels pending or visible follow-ups and removes the phrase and space together', async () => {
        for (const visible of [false, true]) {
            const { view } = editor(() => ['Run the integration tests against the server']);
            type(view);
            await pause();
            expect(acceptTranscriptPrediction(view)).toBe(true);
            if (visible) await pause();
            expect(undo(view)).toBe(true);
            await pause();
            expect(view.state.doc.toString()).toBe('Run the integ');
            expect(view.dom.querySelector('.cm-transcript-prediction')).toBeNull();
        }
    });

    test('does not accept or chain a trailing space that disappeared from the corpus', async () => {
        let corpus = ['Run the integration tests against the server'];
        const { view } = editor(() => corpus);
        type(view);
        await pause();
        expect(view.dom.querySelector('.cm-transcript-prediction')?.textContent).toBe('ration tests ');
        corpus = ['Run the integration tests'];
        expect(acceptTranscriptPrediction(view)).toBe(true);
        await pause();
        expect(view.state.doc.toString()).toBe('Run the integ');
        expect(view.dom.querySelector('.cm-transcript-prediction')).toBeNull();
    });

    test('follow-up reads the current corpus instead of retaining the accepted match', async () => {
        let corpus = ['Run the integration tests against the server'];
        const { view } = editor(() => corpus);
        type(view);
        await pause();
        expect(acceptTranscriptPrediction(view)).toBe(true);
        corpus = ['Run the integration tests with Bun'];
        await pause();
        expect(view.dom.querySelector('.cm-transcript-prediction')?.textContent).toBe('with Bun');
        corpus = [];
        expect(acceptTranscriptPrediction(view)).toBe(true);
        expect(view.state.doc.toString()).toBe('Run the integration tests ');
        await pause();
        expect(view.dom.querySelector('.cm-transcript-prediction')).toBeNull();
    });

    test('follow-ups cancel on caret, blur, composition and scope changes', async () => {
        for (const cancellation of ['caret', 'blur', 'composition', 'scope']) {
            const { view, compartment } = editor(() => ['Run the integration tests against the server']);
            type(view);
            await pause();
            expect(acceptTranscriptPrediction(view)).toBe(true);
            if (cancellation === 'caret') view.dispatch({ selection: { anchor: 0 } });
            if (cancellation === 'blur') view.contentDOM.blur();
            if (cancellation === 'composition') view.contentDOM.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
            if (cancellation === 'scope') view.dispatch({ effects: compartment.reconfigure(transcriptPrediction({ scope: 'b', readCorpus: () => ['Run the integration tests with Bun'] })) });
            await pause();
            expect(view.dom.querySelector('.cm-transcript-prediction')).toBeNull();
            expect(view.state.doc.toString()).toBe('Run the integration tests ');
        }
    });
});
