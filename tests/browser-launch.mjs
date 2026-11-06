export function browserLaunchOptions(engine) {
  if (engine !== 'firefox' || process.platform !== 'linux' || process.env.LGF_FIREFOX_XVFB !== '1') {
    return {};
  }
  if (!process.env.DISPLAY) throw Error('Run the Firefox WebGL checks under xvfb-run');
  return {
    headless: false,
    env: { ...process.env, LIBGL_ALWAYS_SOFTWARE: '1', MOZ_ENABLE_WAYLAND: '0' },
    firefoxUserPrefs: { 'webgl.force-enabled': true },
  };
}
