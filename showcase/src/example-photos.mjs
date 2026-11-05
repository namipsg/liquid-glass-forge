export const landscapePhotos = [
  { name: 'Pacific coast', file: './media/pacific-coast.jpg', description: 'Surf around dark rocks on a Pacific coastline' },
  { name: 'Sandstone trail', file: './media/sandstone-trail.jpg', description: 'A trail through layered sandstone at sunset' },
  { name: 'Alpine blue hour', file: './media/alpine-blue-hour.jpg', description: 'Mountains reflected in an alpine lake at blue hour' },
];

export async function loadLandscapePhotos() {
  return Promise.all(landscapePhotos.map(async photo => {
    const image = new Image();
    image.src = photo.file;
    await image.decode();
    return image;
  }));
}
