const originalFilm = {
  title: 'Light Study',
  file: './media/light-study.mp4',
  poster: './media/light-study-poster.jpg',
  duration: 16,
  start: 0,
};

export async function getShowcaseFilm(localCandidate, signal) {
  if (localCandidate) {
    const response = await fetch('./media/local-film/index.json', { signal }).catch(() => null);
    const receipt = response?.ok ? await response.json().catch(() => null) : null;
    if (receipt?.localOnly === true && receipt.file === 'sprite-fright.mp4') {
      return {
        title: 'Sprite Fright',
        file: './media/local-film/sprite-fright.mp4',
        poster: './media/local-film/poster.jpg',
        duration: 629.84,
        start: 16,
        supplied: true,
      };
    }
  }
  return originalFilm;
}

export function filmTime(seconds) {
  const whole = Math.max(0, Math.floor(seconds || 0));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}
