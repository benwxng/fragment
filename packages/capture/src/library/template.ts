import { libraryLoadingLabel } from '../presentation';

// Static, trusted markup only. User content is assigned through textContent.
export const libraryTemplate = /* html */ `
<a class="skip-link" href="#main-content">Skip to references</a>

    <header class="site-header library-header">
      <a class="brand" href="./index.html" aria-label="Glance library">
        <svg class="brand-mark" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 42" width="64" height="27" fill="none" aria-hidden="true" focusable="false">
          <path d="M1.59026 20.0476C8.41761 25.6338 24.406 40.7329 49.5903 41C74.7745 40.7329 90.7629 25.6338 97.5903 20.0476C90.7157 14.5527 74.6184 1.07655 49.5903 1.00039C24.5621 1.07655 8.46478 14.5527 1.59026 20.0476Z" fill="white" stroke="white" stroke-width="2" />
          <circle cx="49.5903" cy="21" r="20" fill="#526B59" />
          <path class="brand-asterisk" d="M49.5902 10.2V31.8M38.7902 21H60.3902M41.9535 13.3633L57.227 28.6368M41.9535 28.6368L57.227 13.3633" stroke="white" stroke-width="2.4" />
        </svg>
      </a>
          <label class="search">
            <span class="visually-hidden">Search references</span>
            <svg viewBox="0 0 20 20" aria-hidden="true">
              <circle cx="8.75" cy="8.75" r="5.25" />
              <path d="m12.6 12.6 3.9 3.9" />
            </svg>
            <input id="search" type="search" name="search" placeholder="Search fonts, pages, notes…" autocomplete="off" />
          </label>
      <div class="header-actions">
        <button class="account-button" id="account-button" type="button" aria-haspopup="dialog" aria-controls="account-dialog" aria-expanded="false">
          <img class="account-avatar" id="account-avatar" alt="" hidden />
          <span class="visually-hidden" id="account-button-label">Account</span>
        </button>
      </div>
    </header>

    <main class="library-main" id="main-content" tabindex="-1">
      <h1 class="visually-hidden">Saved references</h1>

      <section class="library" aria-labelledby="references-heading">
        <h2 class="visually-hidden" id="references-heading">Saved references</h2>
        <!-- Filter bar temporarily disabled; keep the markup for its return.
        <div class="toolbar">
          <div class="filters" role="group" aria-label="Filter references">
          </div>
        </div>
        -->

        <div class="result-summary" id="result-summary" role="status" aria-live="polite"></div>
        <div id="library-loading" role="status" aria-label="${libraryLoadingLabel}">
          <span class="visually-hidden">${libraryLoadingLabel}…</span>
          <div class="library-skeleton" aria-hidden="true">
            ${[1.35, .95, 1.15, 1.5, 1, 1.4, 1.25, 1.05].map(ratio => `<div class="library-skeleton-card" style="aspect-ratio: ${ratio}"></div>`).join('')}
          </div>
        </div>
        <div class="reference-grid" id="reference-grid" aria-busy="true"></div>

        <div class="empty-state" id="empty-state" hidden>
          <h2 id="empty-title">No references yet</h2>
          <p id="empty-copy">Start the inspector on any page, then select an element you want to remember.</p>
          <button class="text-button" id="clear-filters" type="button" hidden>Clear search and filters</button>
        </div>
      </section>
    </main>

    <main class="detail-page" id="detail-page" aria-labelledby="detail-title" hidden>
      <nav class="detail-navigation" aria-label="Reference navigation">
        <a class="detail-back" data-close-detail href="./library.html" aria-label="Back to library">←</a>
      </nav>
      <div id="detail-content"></div>
      <p id="detail-feedback" role="status"></p>
    </main>

    <dialog class="confirm-dialog" id="confirm-dialog" aria-labelledby="confirm-title" aria-describedby="confirm-copy">
      <form method="dialog">
        <p class="eyebrow">Remove from library</p>
        <h2 id="confirm-title">Delete this reference?</h2>
        <p id="confirm-copy">You can undo this action until you dismiss the message.</p>
        <div class="dialog-actions">
          <button class="button button-secondary" value="cancel">Cancel</button>
          <button class="button button-danger" id="confirm-delete" value="delete">Delete reference</button>
        </div>
      </form>
    </dialog>

    <dialog class="account-dialog" id="account-dialog" tabindex="-1" aria-labelledby="account-title">
      <div class="account-shell">
        <button class="icon-button account-close" id="account-close" type="button" aria-label="Close account settings">
          <svg viewBox="0 0 20 20" aria-hidden="true"><path d="m5 5 10 10M15 5 5 15" /></svg>
        </button>
        <h2 id="account-title" class="visually-hidden">Account</h2>
        <p class="account-copy" id="account-copy">Checking your account…</p>

        <form class="sign-in-form" id="sign-in-form" hidden>
          <button class="button button-primary" id="sign-in-button" type="submit">Sign in</button>
        </form>

        <div class="signed-in-panel" id="signed-in-panel" hidden>
          <p class="sync-detail" id="sync-detail"></p>
          <div class="dialog-actions">
            <button class="button button-primary" id="import-legacy" type="button" hidden>Import older saves</button>
            <button class="button button-secondary" id="sync-now" type="button"><span>Refresh library</span><svg viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false"><path d="M4.73828 20.25V16.25H8.73828" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" /><path d="M19.25 3.75V7.75H15.25" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" /><path d="M20.186 10.9688C20.2281 11.3066 20.2498 11.6508 20.2498 12C20.2498 16.5563 16.5562 20.25 11.9998 20.25C9.32325 20.25 6.88871 18.9754 5.36768 17" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" /><path d="M3.81383 13.0312C3.7717 12.6934 3.75 12.3492 3.75 12C3.75 7.44365 7.44365 3.75 12 3.75C14.6766 3.75 17.1111 5.02463 18.6322 7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" /></svg></button>
            <button class="button button-secondary" id="sign-out" type="button"><span>Sign out</span><svg viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false"><path d="M20.25 12L9 12M20.25 12L15.75 16.5M20.25 12L15.75 7.5M11.25 20.25H5.75C4.64543 20.25 3.75 19.3546 3.75 18.25L3.75 5.75C3.75 4.64543 4.64543 3.75 5.75 3.75L11.25 3.75" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" /></svg></button>
          </div>
        </div>
        <p class="account-feedback" id="account-feedback" role="status" aria-live="polite"></p>
      </div>
    </dialog>

    <div class="toast" id="toast" role="status" aria-live="polite" hidden>
      <span id="toast-message">Reference deleted.</span>
      <button class="toast-action" id="undo-delete" type="button">Undo</button>
      <button class="toast-close" id="dismiss-toast" type="button" aria-label="Dismiss message">
        <svg viewBox="0 0 20 20" aria-hidden="true"><path d="m6 6 8 8M14 6l-8 8" /></svg>
      </button>
    </div>
`;
