const spriteFright = {
  title: 'Sprite Fright',
  file: './media/sprite-fright.mp4',
  poster: './media/sprite-fright-poster.jpg',
  subtitles: './media/sprite-fright.en.vtt',
  subtitleCredits: 'https://commons.wikimedia.org/w/index.php?oldid=1067494470',
  duration: 629.84,
  start: 16,
  reencoded: true,
};

export async function getShowcaseFilm(localCandidate, signal) {
  if (localCandidate) {
    const response = await fetch('./media/local-film/index.json', { signal }).catch(() => null);
    const receipt = response?.ok ? await response.json().catch(() => null) : null;
    if (receipt?.localOnly === true && receipt.file === 'sprite-fright.mp4') {
      return {
        ...spriteFright,
        file: './media/local-film/sprite-fright.mp4',
        poster: './media/local-film/poster.jpg',
        reencoded: false,
      };
    }
  }
  return spriteFright;
}

export function filmTime(seconds) {
  const whole = Math.max(0, Math.floor(seconds || 0));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}
