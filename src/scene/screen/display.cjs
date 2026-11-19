// Pure multi-display geometry for the float window; no Electron import.
function centerInside(bounds, displays) {
  const cx = bounds.x + bounds.width / 2;
  const cy = bounds.y + bounds.height / 2;
  return displays.some((display) => {
    const a = display.bounds || display;
    return cx >= a.x && cx < a.x + a.width && cy >= a.y && cy < a.y + a.height;
  });
}

function parkOnPrimary(bounds, primary) {
  return {
    x: primary.x + primary.width - bounds.width - 24,
    y: primary.y + primary.height - bounds.height - 24,
  };
}

module.exports = { centerInside, parkOnPrimary };
