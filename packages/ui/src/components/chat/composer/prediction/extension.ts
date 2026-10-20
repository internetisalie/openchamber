import { Facet, StateEffect, Transaction, type Extension } from '@codemirror/state';
import { isolateHistory } from '@codemirror/commands';
import { Decoration, EditorView, ViewPlugin, WidgetType, type DecorationSet, type ViewUpdate } from '@codemirror/view';
import { replaceWithCaret } from '../editor/documentEdits';
import { predictTranscript } from './transcript';

export interface TranscriptPrediction {
    scope: string;
    readCorpus(): readonly string[];
}

const setGhost = StateEffect.define<string>();

class GhostText extends WidgetType {
    constructor(readonly text: string) { super(); }
    eq(other: GhostText) { return this.text === other.text; }
    toDOM() {
        const span = document.createElement('span');
        span.className = 'cm-transcript-prediction';
        span.setAttribute('aria-hidden', 'true');
        span.textContent = this.text;
        return span;
    }
    ignoreEvent() { return true; }
}

function eligible(view: EditorView): boolean {
    const selection = view.state.selection;
    return view.hasFocus && !view.composing && !view.compositionStarted
        && selection.ranges.length === 1 && selection.main.empty
        && selection.main.head === view.state.doc.length;
}

function report(view: EditorView, action: 'shown' | 'accepted' | 'dismissed', characters: number) {
    view.dom.dispatchEvent(new CustomEvent('openchamber:transcript-completion', {
        bubbles: true, detail: { action, characters },
    }));
}

const predictionPlugin = ViewPlugin.fromClass(class {
    decorations: DecorationSet = Decoration.none;
    text = '';
    timer: ReturnType<typeof setTimeout> | undefined;

    constructor(readonly view: EditorView) {}

    cancel() {
        clearTimeout(this.timer);
        this.timer = undefined;
    }

    clear() {
        this.cancel();
        this.text = '';
        this.decorations = Decoration.none;
    }

    schedule() {
        this.cancel();
        if (!eligible(this.view)) return;
        this.timer = setTimeout(() => {
            this.timer = undefined;
            if (!eligible(this.view)) return;
            const config = this.view.state.facet(predictionConfig);
            if (!config) return;
            const text = predictTranscript(config.readCorpus(), this.view.state.doc.toString());
            this.view.dispatch({ effects: setGhost.of(text) });
            if (text) report(this.view, 'shown', text.length);
        }, 150);
    }

    update(update: ViewUpdate) {
        if (update.docChanged || update.selectionSet || update.focusChanged || update.transactions.some((transaction) => transaction.reconfigured)) this.clear();
        for (const transaction of update.transactions) {
            for (const effect of transaction.effects) {
                if (!effect.is(setGhost)) continue;
                this.text = eligible(this.view) ? effect.value : '';
                this.decorations = this.text ? Decoration.set([
                    Decoration.widget({ widget: new GhostText(this.text), side: 1 }).range(update.state.doc.length),
                ]) : Decoration.none;
            }
        }
        if (update.docChanged && update.transactions.some((transaction) =>
            transaction.isUserEvent('input') && !transaction.isUserEvent('input.complete'))) this.schedule();
    }

    destroy() { this.cancel(); }
}, {
    decorations: (plugin) => plugin.decorations,
    eventHandlers: {
        compositionstart() {
            this.clear();
            this.view.dispatch({ effects: setGhost.of('') });
        },
        compositionend() { this.schedule(); },
    },
});

const predictionConfig = Facet.define<TranscriptPrediction, TranscriptPrediction | null>({
    combine: (values) => values[0] ?? null,
});

export function transcriptPrediction(config: TranscriptPrediction): Extension {
    return [
        predictionConfig.of(config), predictionPlugin,
        EditorView.baseTheme({
            '.cm-transcript-prediction': {
                color: 'var(--surface-muted-foreground)',
                pointerEvents: 'none',
                userSelect: 'none',
            },
        }),
    ];
}

export function dismissTranscriptPrediction(view: EditorView): boolean {
    const plugin = view.plugin(predictionPlugin);
    plugin?.cancel();
    if (!plugin?.text) return false;
    report(view, 'dismissed', plugin.text.length);
    view.dispatch({ effects: setGhost.of('') });
    return true;
}

export function acceptTranscriptPrediction(view: EditorView): boolean {
    const plugin = view.plugin(predictionPlugin);
    const config = view.state.facet(predictionConfig);
    if (!plugin?.text || !config || !eligible(view)) return false;
    const text = plugin.text;
    // Re-read cached transcript state: a revert or deletion must not accept an obsolete phrase.
    if (predictTranscript(config.readCorpus(), view.state.doc.toString()) !== text) {
        view.dispatch({ effects: setGhost.of('') });
        return true;
    }
    view.dispatch({
        ...replaceWithCaret(view.state, view.state.doc.length, view.state.doc.length, text),
        annotations: [Transaction.userEvent.of('input.complete'), isolateHistory.of('full')],
    });
    view.plugin(predictionPlugin)?.schedule();
    report(view, 'accepted', text.length);
    return true;
}
