# Agent PTYs view and exited filter

Captured on Linux in a disposable Chrome profile using the actual React components and Ghostty renderer with generated PTY fixtures. No user sessions, installed services, or private memory data were used.

- `before-dark.png`: the trunk component shows all four PTYs and a count while expanded. Trunk has no dedicated Agent PTYs rail view.
- `after-dark.png` and `after-light.png`: expanded header has the filter and no count, with exited/killed PTYs hidden. The 288-pixel sidebar fits in wide and narrow browser windows.
- `collapsed-dark.png`: collapsed header has the active count and no filter.
- `view-dark.png`: restored read-only output view at 1200 pixels.
- `view-light-narrow.png`: the same view at 640 pixels in the light theme. Dedicated mobile layouts have no context rail and are unchanged.
- `filter.gif`: real button interactions show exited PTYs, hide them, collapse the section and expand it again.

The browser checks also verify saved filter choice, stopping PTY visibility, no polling while hidden, removal of old output on session changes, and a bridge-unavailable state. The production web build's app bootstrap and AgentPtyView chunk load pass separately. Native Electron packaging is verified by the fork release workflow; the published desktop is exercised with disposable data before installation.
