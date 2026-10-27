/* Draft controls use server-side selection, never SQL or browser database keys. */
const form = document.querySelector('#controls');
const frame = document.querySelector('#preview');
const exportLink = document.querySelector('#export');
const count = document.querySelector('#preview-count');
let timer;
let request;
async function update() {
    const params = new URLSearchParams(new FormData(form));
    const query = '?' + params;
    frame.src = '/' + query;
    exportLink.href = '/__draft/layout.json' + query;
    history.replaceState(null, '', '/__draft/' + query);
    request?.abort();
    request = new AbortController();
    try {
        const response = await fetch('/__draft/status.json' + query, { signal: request.signal });
        if (!response.ok) throw new Error('Draft status unavailable');
        const status = await response.json();
        count.textContent = status.selected.toLocaleString() + ' selected listings';
    } catch (error) {
        if (error.name !== 'AbortError') count.textContent = 'Preview count unavailable';
    }
}
form.addEventListener('submit', (event) => { event.preventDefault(); clearTimeout(timer); update(); });
form.addEventListener('change', () => { clearTimeout(timer); update(); });
form.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(update, 350); });
