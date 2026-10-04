# Agent PTY visibility icons

Generated PTY fixtures in disposable Chrome, using the actual shared sidebar component and Remix Icon sprite. No user sessions or installed services were used.

`before-dark.png` shows the released .3 text control. `hidden-dark.png` and `hidden-light.png` show the compact eye-off button. `shown-dark.png` and `shown-light.png` show the eye button and exited PTYs. Both button states retain translated action tooltips, accessible labels, and `aria-pressed`. The same shared toggle is used in the terminal view.

The browser run also verified tooltip hover, native Enter activation, and absence of the icon toggle when collapsed, with no browser exceptions.
