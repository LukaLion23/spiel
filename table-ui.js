/* Viewport-sized table layout: fan every card without hiding its value. */
const hand = document.getElementById('handArea');
const trick = document.getElementById('trickArea');
function layoutFan(area, stacked = false) {
    if (!area) return;
    const items = Array.from(area.children).filter(el => el.matches('.card, .blind-player, .played-card-wrap'));
    area.classList.toggle('fan-layout', items.length > 0);
    if (!items.length) return;
    const width = area.clientWidth;
    const cardWidth = Math.min(stacked ? 76 : 82, Math.max(56, width * .19));
    const perRow = Math.max(1, Math.floor((width - cardWidth - 16) / (stacked ? 26 : 23)) + 1);
    const rows = Math.ceil(items.length / perRow);
    const maxHeight = Math.max(100, window.innerHeight * (stacked ? .31 : .42) - (stacked ? 20 : 30));
    const rowStep = rows > 1 ? Math.max(24, Math.min(stacked ? 55 : 49,
        (maxHeight - cardWidth * 1.42 - 20) / (rows - 1))) : 0;
    area.style.setProperty('--fan-height', `${cardWidth * 1.42 + (rows - 1) * rowStep + 20}px`);
    items.forEach((item, index) => {
        const row = Math.floor(index / perRow);
        const pos = index % perRow;
        const count = Math.min(perRow, items.length - row * perRow);
        const spread = Math.min(width - cardWidth - 16, (count - 1) * (stacked ? 36 : 34));
        const step = count > 1 ? spread / (count - 1) : 0;
        const centered = count > 1 ? pos / (count - 1) * 2 - 1 : 0;
        item.style.setProperty('--fan-x', `${(width - cardWidth - spread) / 2 + pos * step}px`);
        item.style.setProperty('--fan-y', `${row * rowStep + Math.abs(centered) * (stacked ? 3 : 12)}px`);
        item.style.setProperty('--fan-angle', `${centered * (stacked ? 6 : 13)}deg`);
        item.style.setProperty('--fan-width', `${cardWidth}px`);
        item.style.zIndex = String(row * 100 + pos + 1);
        const face = item.matches('.card') ? item : item.querySelector('.card');
        if (face && !face.querySelector('.card-index')) {
            const value = face.querySelector('strong')?.textContent;
            if (value) {
                const corner = document.createElement('span');
                corner.className = 'card-index';
                corner.textContent = value;
                corner.setAttribute('aria-hidden', 'true');
                face.append(corner);
            }
        }
    });
}
let frame;
function relayout() {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => { layoutFan(hand); layoutFan(trick, true); });
}
for (const area of [hand, trick]) if (area) {
    new MutationObserver(relayout).observe(area, { childList: true });
    new ResizeObserver(relayout).observe(area);
}
window.addEventListener('resize', relayout);
relayout();
// Browse an arbitrary number of rooms in pages, not a scrolling document.
const roomList = document.getElementById('availableRoomList');
if (roomList) {
    let page = 0;
    const nav = document.createElement('div'); nav.className = 'room-pagination'; nav.hidden = true;
    const previous = document.createElement('button'); previous.textContent = '‹'; previous.setAttribute('aria-label','Vorherige Spielräume');
    const label = document.createElement('span');
    const next = document.createElement('button'); next.textContent = '›'; next.setAttribute('aria-label','Weitere Spielräume');
    nav.append(previous,label,next); roomList.after(nav);
    function paginate() {
        const entries = Array.from(roomList.children);
        const count = Math.max(1,Math.ceil(entries.length / 3)); page = Math.min(page,count-1);
        entries.forEach((entry,index) => { entry.hidden = Math.floor(index/3) !== page; });
        nav.hidden = count <= 1; label.textContent = `${page+1} / ${count}`;
        previous.disabled = page===0; next.disabled = page===count-1;
    }
    previous.onclick=()=>{page--;paginate()}; next.onclick=()=>{page++;paginate()};
    new MutationObserver(paginate).observe(roomList,{childList:true}); paginate();
}
