// The demo site's reaction to an unlock. The Threshold only emits the event: every
// visible thing here belongs to the site, including `data` keys it chose to invent.
// To add a new reaction, add a key to a door in doors.json and read it here.

/** A route must stay on this site, whatever a bundle says. */
export function safeRoute(route, origin = location.origin) {
  if (typeof route !== "string") return null;
  try {
    const url = new URL(route, origin);
    return url.origin === origin ? url.href : null;
  } catch {
    return null;
  }
}

export async function applyUnlock(detail, page) {
  const data = detail.data ?? {};
  page.tier.textContent = detail.tier;

  if (typeof data.theme === "string") page.root.dataset.theme = data.theme;
  // Each door starts clean: nothing from the last door carries over.
  page.message.textContent = typeof data.message === "string" ? data.message : "";
  page.reveal.textContent = "";
  page.reveal.hidden = true;
  if (typeof data.sound === "string") page.sound(data.sound);

  for (const name of detail.names) {
    const blob = await detail.open(name);
    // textContent, never innerHTML: sealed text and data stay text.
    page.reveal.textContent = await blob.text();
    page.reveal.hidden = false;
  }

  const route = safeRoute(data.route);
  if (route && !detail.replayed) page.go(route);
}
