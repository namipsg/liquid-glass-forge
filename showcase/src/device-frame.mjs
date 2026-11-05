const screens = {
  iphone: { width: 440, height: 956, radius: 62 },
  ipad: { width: 1032, height: 1376, radius: 24 },
};

export async function loadDeviceFrame(device, signal) {
  const response = await fetch('./devices/frames.json', { signal });
  if (!response.ok) throw Error('Device frame unavailable.');
  const frames = await response.json();
  const frame = frames[device];
  const screen = screens[device];
  const sx = screen.width / frame.opening.width;
  const sy = screen.height / frame.opening.height;
  return {
    file: frame.file,
    opening: frame.opening,
    width: frame.width * sx,
    height: frame.height * sy,
    screen: { ...screen, x: frame.opening.x * sx, y: frame.opening.y * sy },
  };
}
